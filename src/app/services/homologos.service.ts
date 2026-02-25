import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { HomologoDTO } from '../models/homologos/HomologoDto';

@Injectable({ providedIn: 'root' })
export class HomologosService {
  private http = inject(HttpClient);

  // cache simple por fingerprint de claves
  private cache = new Map<string, Observable<Map<string, HomologoDTO[]>>>();
  private cacheForward = new Map<string, Observable<Map<string, HomologoDTO[]>>>();

  batch(claves: string[]): Observable<Map<string, HomologoDTO[]>> {
    const uniq = Array.from(new Set((claves ?? []).map(c => (c || '').trim().toUpperCase()).filter(Boolean)));
    if (!uniq.length) return of(new Map());

    const fingerprint = uniq.slice().sort().join('|');
    const cached = this.cache.get(fingerprint);
    if (cached) return cached;

    const url = environment.apiUrl + `/homologos/batch`;
    const req$ = this.http.post<{ rows: HomologoDTO[] }>(url, { claves: uniq }, { headers: { 'X-Skip-Loader': '1' } }).pipe(
      map(resp => {
        const byClave = new Map<string, HomologoDTO[]>();
        for (const r of (resp.rows ?? [])) {
          const k = (r.claveConsultada || '').trim().toUpperCase();
          if (!k) continue;
          const arr = byClave.get(k) ?? [];
          arr.push({ ...r, claveConsultada: k,
            candidato: (r.candidato || '').trim().toUpperCase() });
          byClave.set(k, arr);
        }
        return byClave;
      }),
      catchError(err => {
        console.error('❌ homologos.batch', err);
        return of(new Map());
      }),
      shareReplay(1)
    );

    this.cache.set(fingerprint, req$);
    return req$;
  }

  batchForward(claves: string[]): Observable<Map<string, HomologoDTO[]>> {
    const uniq = Array.from(new Set((claves ?? []).map(c => (c || '').trim().toUpperCase()).filter(Boolean)));
    if (!uniq.length) return of(new Map());

    const fingerprint = uniq.slice().sort().join('|');
    const cached = this.cacheForward.get(fingerprint);
    if (cached) return cached;

    const url = environment.apiUrl + `/homologos/batch-forward`;
    const req$ = this.http.post<{ rows: HomologoDTO[] }>(url, { claves: uniq }, { headers: { 'X-Skip-Loader': '1' } }).pipe(
      map(resp => {
        const byClave = new Map<string, HomologoDTO[]>();
        for (const r of (resp.rows ?? [])) {
          const k = (r.claveConsultada || '').trim().toUpperCase();
          if (!k) continue;
          const arr = byClave.get(k) ?? [];
          arr.push({
            ...r,
            claveConsultada: k,
            candidato: (r.candidato || '').trim().toUpperCase(),
          });
          byClave.set(k, arr);
        }
        return byClave;
      }),
      catchError(err => {
        console.error('homologos.batchForward', err);
        return of(new Map());
      }),
      shareReplay(1)
    );

    this.cacheForward.set(fingerprint, req$);
    return req$;
  }
}
