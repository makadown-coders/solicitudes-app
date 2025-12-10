// src/app/services/cpm.service.ts
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  BehaviorSubject,
  finalize,
  firstValueFrom,
  forkJoin,
  map,
  Observable,
  of,
  shareReplay,
  tap,
  withLatestFrom
} from 'rxjs';
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

  // =========================
  //   ESTADO "GLOBAL" LEGACY
  // =========================
  // Unión final (KIT ∪ CPM>0) de la *última* unidad cargada explícitamente
  private unionSubject = new BehaviorSubject<CpmUnionRow[]>([]);
  public cpms$ = this.unionSubject.asObservable();

  // índices auxiliares "globales" (última unidad)
  private kitSet = new Set<string>();               // claves en KIT (normalizadas)
  private cpmIndex = new Map<string, number>();     // clave -> cpm (normalizada)

  private importRestrictToKit$ = new BehaviorSubject<boolean>(false);

  // =========================
  //   ESTADO POR UNIDAD 🆕
  // =========================
  private unionsByUnit = new Map<string, BehaviorSubject<CpmUnionRow[]>>(); // cluesimb -> subject
  private inflightByUnit = new Map<string, Observable<CpmUnionRow[]>>();    // evitar duplicar fetches
  private kitSetByUnit = new Map<string, Set<string>>();                    // cluesimb -> Set(claves)
  private cpmIndexByUnit = new Map<string, Map<string, number>>();          // cluesimb -> Map(clave,cpm)
  private restrictByUnit = new Map<string, BehaviorSubject<boolean>>();     // cluesimb -> flag subject

  // =========================
  //   UTILS
  // =========================
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

  private subjectForUnit(key: string): BehaviorSubject<CpmUnionRow[]> { // 🆕
    let subj = this.unionsByUnit.get(key);
    if (!subj) {
      subj = new BehaviorSubject<CpmUnionRow[]>([]);
      this.unionsByUnit.set(key, subj);
    }
    return subj;
  }

  private restrictFlagForUnit(key: string): BehaviorSubject<boolean> { // 🆕
    let f = this.restrictByUnit.get(key);
    if (!f) {
      f = new BehaviorSubject<boolean>(false);
      this.restrictByUnit.set(key, f);
      // primer fetch async de la flag
      this.flags.getEffective({ cluesimb: key })
        .then(eff => f!.next(!!(eff as any)?.IMPORT_LIMIT_TO_KIT))
        .catch(() => f!.next(false));
    }
    return f;
  }

  // =========================
  //   API LEGACY (se mantiene)
  // =========================
/*  public getKitCount(): number {
    return this.kitSet.size;
  }

  public getKitClaves(): string[] {
    return Array.from(this.kitSet);
  }*/

  /**
   * Carga por cluesimb, usa caché y consolida “expected-vs ∪ by-unidad”.
   * Mantiene el *estado global* (última unidad activa).
   */
  ensureForCluesimb(cluesimb: string, opts?: { force?: boolean }): Observable<CpmUnionRow[]> {
    const key = cluesimb?.trim().toUpperCase();
    if (!key) {
      this.unionSubject.next([]);
      this.kitSet.clear();
      this.cpmIndex.clear();
      this.importRestrictToKit$.next(false);
      return of([]);
    }

    // 🆕 ejecuta el flujo por-unidad y refleja en el global (compat)
    return this.ensureForUnit(key, opts).pipe(
      tap(union => {
        // copiar a estado global
        this.unionSubject.next(union);
        const set = this.kitSetByUnit.get(key) ?? new Set<string>();
        const idx = this.cpmIndexByUnit.get(key) ?? new Map<string, number>();
        this.kitSet = new Set(set);
        this.cpmIndex = new Map(idx);
        this.importRestrictToKit$.next(this.restrictFlagForUnit(key).value);
      })
    );
  }

  refreshForCluesimb(cluesimb: string): Observable<CpmUnionRow[]> {
    return this.ensureForCluesimb(cluesimb, { force: true });
  }

  // Helpers legacy (global)
  getCpmForClave(clave: string, cluesimb?: string): number {                 // 🆕 acepta cluesimb opcional
    if (cluesimb) {
      const m = this.cpmIndexByUnit.get(cluesimb.trim().toUpperCase());
      return m?.get(this.normClave(clave)) ?? 0;
    }
    return this.cpmIndex.get(this.normClave(clave)) ?? 0;
  }
  isClaveInKit(clave: string, cluesimb?: string): boolean {                  // 🆕 acepta cluesimb opcional
    if (cluesimb) {
      const s = this.kitSetByUnit.get(cluesimb.trim().toUpperCase());
      return s?.has(this.normClave(clave)) ?? false;
    }
    return this.kitSet.has(this.normClave(clave));
  }

  /**
  * Salida derivada global (LEGACY) para la pantalla de importación:
  * - flag ON  -> solo claves del KIT (en_kit === true)
  * - flag OFF -> mismas filas que cpms$ (sin filtrar)
  */
  public cpmsForImport$ = this.cpms$.pipe(
    withLatestFrom(this.importRestrictToKit$),
    map(([rows, restrict]) => restrict ? rows.filter(r => r.en_kit === true) : rows),
    shareReplay(1)
  );

  /** ¿Puedo usar esta clave con la unidad "global"? (LEGACY) */
  public canUseClave(clave: string): Observable<boolean> {
    const cn = this.normClave(clave);
    return this.importRestrictToKit$.pipe(
      withLatestFrom(this.cpms$),
      map(([restrict, union]) => {
        if (!restrict) return true; // flag OFF -> permitido
        return union.some(r => r.en_kit && this.normClave(r.clave_cnis) === cn);
      })
    );
  }

  /** Helper sync-friendly (LEGACY) */
  public async ensureAllowedOrThrow(clave: string): Promise<void> {
    const ok = await firstValueFrom(this.canUseClave(clave));
    if (!ok) throw new Error('CLAVE_FUERA_DE_KIT');
  }

  // =========================
  //   API POR UNIDAD 🆕
  // =========================

  /** Stream de la unión (KIT ∪ CPM>0) *para una unidad* */
  cpmsFor(cluesimb: string, opts?: { force?: boolean }): Observable<CpmUnionRow[]> {
    const key = (cluesimb || '').trim().toUpperCase();
    if (!key) return of([]);
    return this.ensureForUnit(key, opts);
  }

  /** Versión “import” *por unidad* respetando flag de esa unidad */
  cpmsForImport(cluesimb: string): Observable<CpmUnionRow[]> {
    const key = (cluesimb || '').trim().toUpperCase();
    if (!key) return of([]);
    return this.cpmsFor(key).pipe(
      withLatestFrom(this.restrictFlagForUnit(key)),
      map(([rows, restrict]) => restrict ? rows.filter(r => r.en_kit === true) : rows),
      shareReplay(1)
    );
  }

  /** Helpers por unidad */
  getKitCountFor(cluesimb: string): number {
    const set = this.kitSetByUnit.get((cluesimb || '').trim().toUpperCase());
    return set?.size ?? 0;
  }

  /** ¿Puedo usar clave X para *esta* unidad? */
  public canUseClaveFor(clave: string, cluesimb: string): Observable<boolean> {
    const key = (cluesimb || '').trim().toUpperCase();
    const cn = this.normClave(clave);
    return this.restrictFlagForUnit(key).pipe(
      withLatestFrom(this.cpmsFor(key)),
      map(([restrict, union]) => {
        if (!restrict) return true;
        return union.some(r => r.en_kit && this.normClave(r.clave_cnis) === cn);
      })
    );
  }

  // =========================
  //   Núcleo de carga 🧠 (reutiliza lo tuyo)
  // =========================

  /**
   * Carga por clave de unidad (semilla desde localStorage si ya fue cargado anteriormente)
   * y devuelve la unión (KIT ∪ CPM) *para esa unidad*.
   * Si ya hay fetch en curso para esta unidad, reusa.
   * @param key CLUES IMB de la unidad
   * @param opts Opciones extras; si { force: true } se fuerza la recarga
   * @returns Un Observable que emite la unión (KIT ∪ CPM) *para esa unidad*
   */
  private ensureForUnit(key: string, opts?: { force?: boolean }): Observable<CpmUnionRow[]> {
    const subj = this.subjectForUnit(key);

    // Semilla desde localStorage
    const cached = this.hydrateUnion(key);
    if (!opts?.force && cached.length && !this.shouldRefresh(key)) {
      // reconstruye índices por unidad y emite (si aún no está)
      if ((subj.value ?? []).length === 0) subj.next(cached);
      this.rebuildIndexesForUnit(key, cached);
      // flag ya está en restrictByUnit (lazy)
      return subj.asObservable();
    }

    // Si ya hay fetch en curso para esta unidad, reusa
    const inflight = this.inflightByUnit.get(key);
    if (inflight) return inflight;

    const req$ = forkJoin({
      expected: this.http.get<CpmApiResponse>(`${this.expectedUrl}?cluesimb=${encodeURIComponent(key)}`, {
        headers: { 'X-Skip-Loader': '1' }
      })
        .pipe(map(r => Array.isArray(r) ? r as CpmExpectedRow[] : (r.rows ?? []) as CpmExpectedRow[])),
      unit: this.http.get<CpmApiResponse>(`${this.unitCpmUrl}?cluesimb=${encodeURIComponent(key)}`, {
        headers: { 'X-Skip-Loader': '1' }
      })
        .pipe(map(r => Array.isArray(r) ? r as any[] : (r.rows ?? []) as any[])),
    }).pipe(
      map(({ expected, unit }) => this.mergeExpectedAndUnit(key, expected, unit)),
      tap(union => {
        this.persistUnion(key, union);
        this.rebuildIndexesForUnit(key, union);
        subj.next(union);
      }),
      shareReplay(1),
      finalize(() => this.inflightByUnit.delete(key))
    );

    this.inflightByUnit.set(key, req$);
    return req$;
  }

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

  private rebuildIndexesForUnit(cluesimb: string, union: CpmUnionRow[]) { // 🆕
    const key = (cluesimb || '').trim().toUpperCase();
    const kit = new Set<string>();
    const idx = new Map<string, number>();

    for (const r of union) {
      const clave = this.normClave(r.clave_cnis);
      if (r.en_kit) kit.add(clave);
      idx.set(clave, Number(r.cpm || 0));
    }

    this.kitSetByUnit.set(key, kit);
    this.cpmIndexByUnit.set(key, idx);
  }

}
