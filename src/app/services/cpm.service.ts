// src/app/services/cpm.service.ts
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, finalize, forkJoin, map, Observable, of, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { CpmExpectedRow } from '../models/CpmExpectedRow';
import { CpmApiResponse } from '../models/CpmApiResponse';
import { CpmUnionRow } from '../models/CpmUnionRow';

@Injectable({ providedIn: 'root' })
export class CpmService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl; // ej: http://localhost:3000/api
  private expectedUrl = `${this.baseUrl}/cpms/expected-vs`;
  private unitCpmUrl = `${this.baseUrl}/cpms/by-unidad`;

  // Unión final (KIT ∪ CPM>0) para la CLUES actual
  private unionSubject = new BehaviorSubject<CpmUnionRow[]>([]);
  public cpms$ = this.unionSubject.asObservable();

  // índices auxiliares para el front
  private kitSet = new Set<string>();               // claves en KIT (normalizadas)
  private cpmIndex = new Map<string, number>();     // clave -> cpm (normalizada)

  private storageKeys(cluesimb: string) {
    const k = cluesimb.trim().toUpperCase();
    return {
      union: `cpm:union:${k}`,
      ts: `cpm:ts:${k}`,
    };
  }

  private normClave(c: string) { return (c || '').toUpperCase().trim(); }

  private hydrateUnion(cluesimb: string): CpmUnionRow[] {
    const { union } = this.storageKeys(cluesimb);
    try {
      const raw = localStorage.getItem(union);
      return raw ? (JSON.parse(raw) as CpmUnionRow[]) : [];
    } catch { return []; }
  }

  private persistUnion(cluesimb: string, rows: CpmUnionRow[]) {
    const { union, ts } = this.storageKeys(cluesimb);
    localStorage.setItem(union, JSON.stringify(rows));
    localStorage.setItem(ts, Date.now().toString());
  }

  private shouldRefresh(cluesimb: string): boolean {
    const { ts } = this.storageKeys(cluesimb);
    const last = Number(localStorage.getItem(ts) || 0);
    if (!last) return true;
    const a = new Date(last), b = new Date();
    const sameDay = a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
    return !sameDay; // refresco diario
  }

  public getKitCount(): number {
    return this.kitSet.size;
  }

  public getKitClaves(): string[] {
    return Array.from(this.kitSet);
  }

  /** Carga por cluesimb, usa caché y consolida “expected-vs ∪ by-unidad” */
  ensureForCluesimb(cluesimb: string, opts?: { force?: boolean }): Observable<CpmUnionRow[]> {
    const key = cluesimb?.trim().toUpperCase();
    if (!key) return of([]);

    const cached = this.hydrateUnion(key);
    if (cached.length) {
      this.unionSubject.next(cached);
      this.rebuildIndexes(cached);
    }

    if (!opts?.force && !this.shouldRefresh(key) && cached.length) {
      return of(cached);
    }

    return forkJoin({
      expected: this.http.get<CpmApiResponse>(`${this.expectedUrl}?cluesimb=${encodeURIComponent(key)}`)
        .pipe(map(r => Array.isArray(r) ? r as CpmExpectedRow[] : (r.rows ?? []) as CpmExpectedRow[])),
      unit: this.http.get<CpmApiResponse>(`${this.unitCpmUrl}?cluesimb=${encodeURIComponent(key)}`)
        .pipe(map(r => Array.isArray(r) ? r as any[] : (r.rows ?? []) as any[])),
    }).pipe(
      map(({ expected, unit }) => this.mergeExpectedAndUnit(key, expected, unit)),
      tap(union => {
        this.unionSubject.next(union);
        this.persistUnion(key, union);
        this.rebuildIndexes(union);
      })
    );
  }

  refreshForCluesimb(cluesimb: string): Observable<CpmUnionRow[]> {
    return this.ensureForCluesimb(cluesimb, { force: true });
  }

  // Helpers para el componente
  getCpmForClave(clave: string): number { return this.cpmIndex.get(this.normClave(clave)) ?? 0; }
  isClaveInKit(clave: string): boolean { return this.kitSet.has(this.normClave(clave)); }

  private mergeExpectedAndUnit(
    cluesimb: string,
    expected: CpmExpectedRow[],
    unit: any[], // { clave_cnis, cpm, ... }
  ): CpmUnionRow[] {
    const byClave = new Map<string, CpmUnionRow>();

    // expected -> en_kit=true (cpm puede ser 0/null)
    for (const e of expected) {
      const clave = this.normClave(e.clave_cnis);
      if (!clave) continue;
      const cpmVal = Number(e.cpm ?? 0);
      const prev = byClave.get(clave);
      if (!prev) {
        byClave.set(clave, { cluesimb, clave_cnis: clave, cpm: cpmVal, en_kit: true });
      } else {
        prev.cpm = Math.max(prev.cpm, cpmVal);
        prev.en_kit = true;
      }
    }

    // unit (CPM>0) -> puede traer claves fuera de KIT
    for (const u of unit) {
      const clave = this.normClave(u.clave_cnis ?? u.clave);
      if (!clave) continue;
      const cpmVal = Number(u.cpm ?? 0);
      const prev = byClave.get(clave);
      if (!prev) {
        byClave.set(clave, { cluesimb, clave_cnis: clave, cpm: cpmVal, en_kit: false });
      } else {
        prev.cpm = Math.max(prev.cpm, cpmVal);
      }
    }

    return Array.from(byClave.values()).sort((a, b) => a.clave_cnis.localeCompare(b.clave_cnis));
  }

  private rebuildIndexes(union: CpmUnionRow[]) {
    this.kitSet.clear();
    this.cpmIndex.clear();
    for (const r of union) {
      const clave = this.normClave(r.clave_cnis);
      if (r.en_kit) this.kitSet.add(clave);
      this.cpmIndex.set(clave, Number(r.cpm || 0));
    }
  }

}
