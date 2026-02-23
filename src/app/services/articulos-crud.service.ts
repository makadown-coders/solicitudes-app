import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ArticuloCrudRow {
  id: number;
  clave: string | null;
  descripcion: string | null;
  presentacion: string | null;
}

export interface ArticuloCrudPage {
  items: ArticuloCrudRow[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ArticuloCrudSummary {
  total: number;
  con_clave: number;
  con_descripcion: number;
  con_presentacion: number;
  sin_clave: number;
  sin_descripcion: number;
  sin_presentacion: number;
  prefijos_clave_top: Array<{ prefijo: string; total: number }>;
  claves_duplicadas_top: Array<{ clave: string; total: number }>;
}

@Injectable({ providedIn: 'root' })
export class ArticulosCrudService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/articulos/crud`;

  list(params: {
    q?: string;
    page?: number;
    pageSize?: number;
    sortBy?: 'id' | 'clave' | 'descripcion' | 'presentacion';
    sortOrder?: 'ASC' | 'DESC';
  }): Observable<ArticuloCrudPage> {
    let hp = new HttpParams();
    if (params.q?.trim()) hp = hp.set('q', params.q.trim());
    if (params.page) hp = hp.set('page', String(params.page));
    if (params.pageSize) hp = hp.set('pageSize', String(params.pageSize));
    if (params.sortBy) hp = hp.set('sortBy', params.sortBy);
    if (params.sortOrder) hp = hp.set('sortOrder', params.sortOrder);
    return this.http.get<ArticuloCrudPage>(this.baseUrl, { params: hp });
  }

  getById(id: number): Observable<ArticuloCrudRow> {
    return this.http.get<ArticuloCrudRow>(`${this.baseUrl}/${id}`);
  }

  create(payload: { clave: string; descripcion: string; presentacion?: string | null }): Observable<ArticuloCrudRow> {
    return this.http.post<ArticuloCrudRow>(this.baseUrl, payload);
  }

  update(id: number, payload: { clave?: string; descripcion?: string; presentacion?: string | null }): Observable<ArticuloCrudRow> {
    return this.http.put<ArticuloCrudRow>(`${this.baseUrl}/${id}`, payload);
  }

  delete(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.baseUrl}/${id}`);
  }

  getSummary(q?: string): Observable<ArticuloCrudSummary> {
    let hp = new HttpParams();
    if (q?.trim()) hp = hp.set('q', q.trim());
    return this.http.get<ArticuloCrudSummary>(`${this.baseUrl}/reportes/resumen`, { params: hp });
  }
}
