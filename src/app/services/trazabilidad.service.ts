// src/app/services/trazabilidad.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { firstValueFrom } from 'rxjs';
import { FactorUnidad } from '../models/factor-unidad';
import { MovimientoTrazabilidad } from '../models';

type RawFactor = { en_dispensacion: number | boolean; cantidad_fc: number };
type CachedFactor = RawFactor & { ts: number }; // timestamp guardado

@Injectable({ providedIn: 'root' })
export class TrazabilidadService {
  private memCache = new Map<string, FactorUnidad>();              // caché en memoria (rápida)
  private pending = new Map<string, Promise<FactorUnidad>>();       // de-dup de llamadas concurrentes
  private readonly STORAGE_KEY = 'TRAZA_FACTOR_CACHE_V1';           // nombre en localStorage
  private readonly TTL_MS = 24 * 60 * 60 * 1000;                    // 24h; ajústalo si quieres

  constructor(private http: HttpClient) {
    this.restoreFromStorage();     // precarga a memCache desde localStorage
    this.pruneExpiredInStorage();  // limpia expirados (no bloqueante)
  }

  obtenerPorClaveYClues(clave: string, cluesimb: string) {
    return firstValueFrom(
      this.http.get<MovimientoTrazabilidad[]>(
        `${environment.apiUrl}/trazabilidad`,
        { params: new HttpParams().set('clave', clave).set('cluesimb', cluesimb) }
      )
    );
  }

  // (LEGACY) — lo mantienes igual
  getFactorConversion(clave: string) {
    return this.http.get<{ clave: string; en_dispensacion: boolean; cantidad_fc: number }>(
      `${environment.apiUrl}/factores/${encodeURIComponent(clave)}`
    );
  }

  // **NUEVO**: con caché persistente + de-dup
  async getFactorConversionPorUnidad(clave: string, cluesimb: string): Promise<FactorUnidad> {
    const key = `${clave}|${cluesimb}`;

    // 1) Mem cache
    const hitMem = this.memCache.get(key);
    if (hitMem) return hitMem;

    // 2) Storage cache (con TTL)
    const hitStore = this.getFromStorage(key);
    if (hitStore) {
      this.memCache.set(key, hitStore);
      return hitStore;
    }

    // 3) De-dupe si ya hay una llamada en progreso para el mismo key
    const pendingHit = this.pending.get(key);
    if (pendingHit) return pendingHit;

    // 4) Llamada al backend (y guardar en memoria + storage)
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
          en_dispensacion: typeof raw.en_dispensacion === 'boolean' ? (raw.en_dispensacion ? 1 : 0)
                              : (raw.en_dispensacion ?? 0),
          cantidad_fc: raw.cantidad_fc ?? 1
        };

        this.memCache.set(key, factor);
        this.saveToStorage(key, { en_dispensacion: factor.en_dispensacion, cantidad_fc: factor.cantidad_fc, ts: Date.now() });
        return factor;
      } catch {
        // Fallback suave + TTL corto (evita loops si el backend está caído)
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

  // ---------- Helpers de caché persistente ----------
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
            en_dispensacion: typeof v.en_dispensacion === 'boolean' ? (v.en_dispensacion ? 1 : 0) : v.en_dispensacion,
            cantidad_fc: v.cantidad_fc ?? 1
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
        en_dispensacion: typeof item.en_dispensacion === 'boolean' ? (item.en_dispensacion ? 1 : 0) : item.en_dispensacion,
        cantidad_fc: item.cantidad_fc ?? 1
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
      // (Opcional) límite de tamaño simple: si supera 10k entradas, purga por antigüedad
      const MAX = 10000;
      const keys = Object.keys(obj);
      if (keys.length > MAX) {
        keys
          .map(k => [k, obj[k]?.ts ?? 0] as const)
          .sort((a, b) => a[1] - b[1])
          .slice(0, keys.length - MAX + 100) // purga un colchón
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
}
