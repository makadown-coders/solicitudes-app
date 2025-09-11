import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { map, Observable, of, tap } from 'rxjs';

export type Fuente = 'SAS' | 'SALUS';
export type TempRow = {
  fuente: Fuente;
  alias_sas?: string | null;
  cluessa?: string | null;
  cluesimb?: string | null;
  clave_cnis: string;
  lote?: string | null;
  fecha_caducidad?: string | null;
  existencia: number;
};

export interface ExistUnidadRow {
  clave_cnis: string;
  existencia_total: number;
}
interface ExistUnidadResp { rows: ExistUnidadRow[]; }

@Injectable({ providedIn: 'root' })
export class ExistenciasTempService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/existencias-temp`;

  // cache diario por unidad (memoria)
  private cache = new Map<string, { ts: number; rows: ExistUnidadRow[] }>();

  init(reset = true) {
    return this.http.post<{ ok: true }>(`${this.baseUrl}/init?reset=${reset}`, {});
  }

  batch(rows: TempRow[]) {
    return this.http.post<{ inserted: number }>(`${this.baseUrl}/batch`, { rows });
  }

  byUnidad(cluesimb: string, opts?: { force?: boolean }): Observable<ExistUnidadRow[]> {
    const key = (cluesimb || '').trim().toUpperCase();
    if (!key) return of([]);

    const now = Date.now();
    const hit = this.cache.get(key);
    const sameDay = hit && new Date(hit.ts).toDateString() === new Date(now).toDateString();

    if (!opts?.force && hit && sameDay) return of(hit.rows);

    return this.http
      .get<ExistUnidadResp>(`${this.baseUrl}/by-unidad?cluesimb=${encodeURIComponent(key)}`)
      .pipe(
        map(r => r?.rows ?? []),
        tap(rows => this.cache.set(key, { ts: now, rows }))
      );
  }
}
