// src/app/services/cpm.service.ts
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, finalize, firstValueFrom, forkJoin, map, Observable, of, shareReplay, tap, withLatestFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { CpmExpectedRow } from '../models/CpmExpectedRow';
import { CpmApiResponse } from '../models/CpmApiResponse';
import { CpmUnionRow } from '../models/CpmUnionRow';
import { FeatureFlagsService } from './feature-flags.service';

@Injectable({ providedIn: 'root' })
export class CpmService {
  private http = inject(HttpClient);
  private flags = inject(FeatureFlagsService);
  private baseUrl = environment.apiUrl; // ej: http://localhost:3000/api
  private expectedUrl = `${this.baseUrl}/cpms/expected-vs`;
  private unitCpmUrl = `${this.baseUrl}/cpms/by-unidad`;

  // Unión final (KIT ∪ CPM>0) para la CLUES actual
  private unionSubject = new BehaviorSubject<CpmUnionRow[]>([]);
  public cpms$ = this.unionSubject.asObservable();

  // índices auxiliares para el front
  private kitSet = new Set<string>();               // claves en KIT (normalizadas)
  private cpmIndex = new Map<string, number>();     // clave -> cpm (normalizada)

  private importRestrictToKit$ = new BehaviorSubject<boolean>(false);

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
    if (!key) {
      this.unionSubject.next([]);
      this.kitSet.clear();
      this.cpmIndex.clear();
      this.importRestrictToKit$.next(false);
      return of([]);
    }

    // reset inmediato
    this.unionSubject.next([]);
    this.kitSet.clear();
    this.cpmIndex.clear();

    // ⬇️ Cargar la flag efectiva (global / nivel / clues) para ESTA unidad
    // Si no pasas nivel, el backend resolverá global/clues (y tú ya usas Promises aquí).
    this.flags.getEffective({ cluesimb: key })
      .then(eff => {
        const on = !!(eff as any)?.IMPORT_LIMIT_TO_KIT;
        this.importRestrictToKit$.next(on);
      })
      .catch(() => this.importRestrictToKit$.next(false));

    const cached = this.hydrateUnion(key);

    if (!opts?.force && !this.shouldRefresh(key) && cached.length) {
      this.unionSubject.next(cached);
      this.rebuildIndexes(cached);
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

  /**
  * Salida derivada para la pantalla de importación:
  * - flag ON  -> solo claves del KIT (en_kit === true)
  * - flag OFF -> mismas filas que cpms$ (sin filtrar)
  */
  public cpmsForImport$ = this.cpms$.pipe(
    withLatestFrom(this.importRestrictToKit$),
    map(([rows, restrict]) => restrict ? rows.filter(r => r.en_kit === true) : rows),
    shareReplay(1)
  );

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

  /** ¿Puedo usar esta clave (capturar/importar/exportar) con la unidad actual? */
  public canUseClave(clave: string): Observable<boolean> {
    const cn = this.normClave(clave);
    return this.importRestrictToKit$.pipe(
      withLatestFrom(this.cpms$),
      map(([restrict, union]) => {
        if (!restrict) return true;                // flag OFF -> permitido
        // flag ON -> solo si está en KIT (en_kit=true) para la CLUES actual
        return union.some(r => r.en_kit && this.normClave(r.clave_cnis) === cn);
      })
    );
  }

  /** Filtra un lote (importación): separa permitidas vs bloqueadas */
  public filterImportables(claves: string[]): Observable<{ allowed: string[]; blocked: string[] }> {
    const normed = (claves || []).map(c => this.normClave(c)).filter(Boolean);
    return this.importRestrictToKit$.pipe(
      withLatestFrom(this.cpms$),
      map(([restrict, union]) => {
        if (!restrict) return { allowed: normed, blocked: [] };
        const kit = new Set(union.filter(r => r.en_kit).map(r => this.normClave(r.clave_cnis)));
        const allowed = normed.filter(c => kit.has(c));
        const blocked = normed.filter(c => !kit.has(c));
        return { allowed, blocked };
      })
    );
  }

  /** Helper sync-friendly para componentes (si prefieres await en vez de .subscribe) */
  public async ensureAllowedOrThrow(clave: string): Promise<void> {
    const ok = await firstValueFrom(this.canUseClave(clave));
    if (!ok) throw new Error('CLAVE_FUERA_DE_KIT');
  }

}
