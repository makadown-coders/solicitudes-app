// src/app/services/trazabilidad.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { firstValueFrom } from 'rxjs';
import { FactoresResponse, FactorConversion, FactorUnidad } from '../models/factor-unidad';
import { MovimientoTrazabilidad } from '../models';

type RawFactor = { en_dispensacion: number | boolean; cantidad_fc: number };
type CachedFactor = RawFactor & { ts: number };

@Injectable({ providedIn: 'root' })
export class TrazabilidadService {
  private memCache = new Map<string, FactorUnidad>();
  private pending = new Map<string, Promise<FactorUnidad>>();
  private readonly STORAGE_KEY = 'TRAZA_FACTOR_CACHE_V2';
  private readonly TTL_MS = 24 * 60 * 60 * 1000;
  private allFactoresPromise: Promise<void>;

  constructor(private http: HttpClient) {
    this.restoreFromStorage();
    this.pruneExpiredInStorage();
    this.allFactoresPromise = this.cargarAllFactoresConversion();
  }

  obtenerPorClaveYClues(clave: string, cluesimb: string) {
    return firstValueFrom(
      this.http.get<MovimientoTrazabilidad[]>(
        `${environment.apiUrl}/trazabilidad`,
        { params: new HttpParams().set('clave', clave).set('cluesimb', cluesimb) }
      )
    );
  }

  getFactorConversion(clave: string) {
    return this.http.get<{ clave: string; en_dispensacion: boolean; cantidad_fc: number }>(
      `${environment.apiUrl}/factores/${encodeURIComponent(clave)}`
    );
  }

  async getFactorConversionPorUnidadLegacy(clave: string, cluesimb: string): Promise<FactorUnidad> {
    const key = this.getFactorKey(clave, cluesimb);

    const hitMem = this.memCache.get(key);
    if (hitMem) return hitMem;

    const hitStore = this.getFromStorage(key);
    if (hitStore) {
      this.memCache.set(key, hitStore);
      return hitStore;
    }

    const pendingHit = this.pending.get(key);
    if (pendingHit) return pendingHit;

    const p = (async () => {
      try {
        const params = new HttpParams().set('clave', clave).set('clues', cluesimb);
        let raw = await firstValueFrom(
          this.http.get<RawFactor>(`${environment.apiUrl}/factores/factor`, { params })
        );

        if (!raw) raw = { en_dispensacion: 0, cantidad_fc: 1 };

        const factor: FactorUnidad = {
          clave,
          cluesimb,
          en_dispensacion: this.toDispensacionFlag(raw.en_dispensacion),
          cantidad_fc: Math.max(1, Number(raw.cantidad_fc ?? 1))
        };

        this.memCache.set(key, factor);
        this.saveToStorage(key, { en_dispensacion: factor.en_dispensacion, cantidad_fc: factor.cantidad_fc, ts: Date.now() });
        return factor;
      } catch {
        const fallback: FactorUnidad = { clave, cluesimb, en_dispensacion: 0, cantidad_fc: 1 };
        this.memCache.set(key, fallback);
        this.saveToStorage(key, { en_dispensacion: 0, cantidad_fc: 1, ts: Date.now() });
        return fallback;
      } finally {
        this.pending.delete(key);
      }
    })();

    this.pending.set(key, p);
    return p;
  }

  async getFactorConversionPorUnidad(clave: string, cluesimb: string): Promise<FactorUnidad> {
    const key = this.getFactorKey(clave, cluesimb);

    const hitMem = this.memCache.get(key);
    if (hitMem) return hitMem;

    const hitStore = this.getFromStorage(key);
    if (hitStore) {
      this.memCache.set(key, hitStore);
      return hitStore;
    }

    await this.allFactoresPromise;

    const hitPostLoad = this.memCache.get(key);
    if (hitPostLoad) return hitPostLoad;

    return { clave, cluesimb, en_dispensacion: 0, cantidad_fc: 1 };
  }

  private async cargarAllFactoresConversion() {
    try {
      const allFactores = await firstValueFrom(
        this.http.get<FactoresResponse>(`${environment.apiUrl}/trazabilidad/all-factores-conversion-v2`)
      );

      if (!allFactores.success || !Array.isArray(allFactores.data)) {
        this.memCache.clear();
        localStorage.removeItem(this.STORAGE_KEY);
        return;
      }

      this.saveAllToCache(allFactores.data);
    } catch {
      // Keep any restored localStorage cache; callers fall back to factor 1 if needed.
    }
  }

  private saveAllToCache(factores: FactorConversion[]) {
    const now = Date.now();
    const storage: Record<string, CachedFactor> = {};

    for (const factor of factores) {
      const factorUnidad = this.toFactorUnidad(factor);
      if (!factorUnidad) continue;

      const key = this.getFactorKey(factorUnidad.clave, factorUnidad.cluesimb);
      this.memCache.set(key, factorUnidad);
      storage[key] = {
        en_dispensacion: factorUnidad.en_dispensacion,
        cantidad_fc: factorUnidad.cantidad_fc,
        ts: now
      };
    }

    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(storage));
    } catch { /* noop */ }
  }

  private toFactorUnidad(factor: FactorConversion): FactorUnidad | null {
    const clave = `${factor?.clave ?? ''}`.trim();
    const cluesimb = `${factor?.cluesimb ?? ''}`.trim();
    const cantidadFc = Math.max(1, Number(factor?.factor ?? 1));

    if (!clave || !cluesimb || !Number.isFinite(cantidadFc)) return null;

    return {
      clave,
      cluesimb,
      en_dispensacion: cantidadFc > 1 ? 1 : 0,
      cantidad_fc: cantidadFc
    };
  }

  private restoreFromStorage() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return;
      const obj: Record<string, CachedFactor> = JSON.parse(raw);
      const now = Date.now();
      for (const [k, v] of Object.entries(obj)) {
        if (v && now - v.ts <= this.TTL_MS) {
          const [clave, cluesimb] = k.split('|');
          this.memCache.set(k, {
            clave,
            cluesimb,
            en_dispensacion: this.toDispensacionFlag(v.en_dispensacion),
            cantidad_fc: Math.max(1, Number(v.cantidad_fc ?? 1))
          });
        }
      }
    } catch { /* noop */ }
  }

  private getFromStorage(key: string): FactorUnidad | null {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return null;
      const obj: Record<string, CachedFactor> = JSON.parse(raw);
      const item = obj[key];
      if (!item) return null;
      if (Date.now() - item.ts > this.TTL_MS) return null;

      const [clave, cluesimb] = key.split('|');
      return {
        clave,
        cluesimb,
        en_dispensacion: this.toDispensacionFlag(item.en_dispensacion),
        cantidad_fc: Math.max(1, Number(item.cantidad_fc ?? 1))
      };
    } catch {
      return null;
    }
  }

  private saveToStorage(key: string, value: CachedFactor) {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      const obj: Record<string, CachedFactor> = raw ? JSON.parse(raw) : {};
      obj[key] = value;

      const MAX = 10000;
      const keys = Object.keys(obj);
      if (keys.length > MAX) {
        keys
          .map(k => [k, obj[k]?.ts ?? 0] as const)
          .sort((a, b) => a[1] - b[1])
          .slice(0, keys.length - MAX + 100)
          .forEach(([k]) => delete obj[k]);
      }
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(obj));
    } catch { /* noop */ }
  }

  private pruneExpiredInStorage() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return;
      const obj: Record<string, CachedFactor> = JSON.parse(raw);
      const now = Date.now();
      let changed = false;
      for (const [k, v] of Object.entries(obj)) {
        if (!v || now - v.ts > this.TTL_MS) {
          delete obj[k];
          changed = true;
        }
      }
      if (changed) localStorage.setItem(this.STORAGE_KEY, JSON.stringify(obj));
    } catch { /* noop */ }
  }

  private toDispensacionFlag(value: number | boolean | undefined | null) {
    if (typeof value === 'boolean') return value ? 1 : 0;
    return Number(value ?? 0) > 0 ? 1 : 0;
  }

  private getFactorKey(clave: string, cluesimb: string) {
    return `${clave}|${cluesimb}`;
  }
}
