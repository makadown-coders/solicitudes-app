import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';
import { ArticulosService } from './articulos.service';

export interface HomologoCrudRow {
  id: number;
  clave: string;
  sustituto: string;
  factor: string;
}

export interface HomologoCrudUiRow extends HomologoCrudRow {
  claveDescripcion: string | null;
  sustitutoDescripcion: string | null;
}

@Injectable({ providedIn: 'root' })
export class HomologosCrudService {
  private http = inject(HttpClient);
  private articulosService = inject(ArticulosService);
  private baseUrl = `${environment.apiUrl}/homologos/crud`;

  listAllEnriched(): Observable<HomologoCrudUiRow[]> {
    return this.http.get<{ rows: HomologoCrudRow[] }>(this.baseUrl).pipe(
      map(resp => resp?.rows ?? []),
      switchMap(rows =>
        this.articulosService.getArticulosMapa().pipe(
          map(mapa => this.enrich(rows, mapa)),
        ),
      ),
    );
  }

  create(payload: { clave: string; sustituto: string; factor: string | number }): Observable<HomologoCrudRow> {
    return this.http
      .post<{ row: HomologoCrudRow }>(this.baseUrl, payload)
      .pipe(map(resp => resp.row));
  }

  update(id: number, payload: { clave?: string; sustituto?: string; factor?: string | number }): Observable<HomologoCrudRow> {
    return this.http
      .put<{ row: HomologoCrudRow }>(`${this.baseUrl}/${id}`, payload)
      .pipe(map(resp => resp.row));
  }

  delete(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.baseUrl}/${id}`);
  }

  private enrich(rows: HomologoCrudRow[], mapa: Record<string, any> | null | undefined): HomologoCrudUiRow[] {
    const mapSafe = mapa ?? {};
    return rows.map((r) => {
      const clave = String(r.clave ?? '').trim().toUpperCase();
      const sustituto = String(r.sustituto ?? '').trim().toUpperCase();
      return {
        id: Number(r.id),
        clave,
        sustituto,
        factor: String(r.factor ?? ''),
        claveDescripcion: mapSafe[clave]?.descripcion ?? null,
        sustitutoDescripcion: mapSafe[sustituto]?.descripcion ?? null,
      };
    });
  }
}
