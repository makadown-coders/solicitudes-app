import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { ActualizarActivoResponse, CatalogoClavesResponse, IncorporarClaveResponse, UniversoClavesResponse, UniversoUnidad } from '../models/universos-abasto.model';

@Injectable({ providedIn: 'root' })
export class UniversosAbastoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/abasto/universos`;

  listarUnidades() {
    return this.http.get<{ data: UniversoUnidad[] }>(`${this.baseUrl}/unidades`);
  }

  listarClaves(
    unidadId: number,
    query: { page: number; pageSize: number; search?: string; tipoInsumo?: string; activo?: boolean },
  ) {
    let params = new HttpParams()
      .set('page', query.page)
      .set('pageSize', query.pageSize);
    if (query.search) params = params.set('search', query.search);
    if (query.tipoInsumo) params = params.set('tipoInsumo', query.tipoInsumo);
    if (query.activo !== undefined) params = params.set('activo', query.activo);
    return this.http.get<UniversoClavesResponse>(
      `${this.baseUrl}/unidades/${unidadId}/claves`,
      { params },
    );
  }

  buscarClavesCandidatas(unidadId: number, search: string, page: number, pageSize = 10) {
    const params = new HttpParams()
      .set('unidadId', unidadId)
      .set('search', search)
      .set('page', page)
      .set('pageSize', pageSize);
    return this.http.get<CatalogoClavesResponse>(`${this.baseUrl}/catalogo/buscar`, { params });
  }

  incorporarClave(unidadId: number, clave: string, tipoInsumoManual?: string) {
    return this.http.post<IncorporarClaveResponse>(
      `${this.baseUrl}/unidades/${unidadId}/claves`,
      { clave, ...(tipoInsumoManual ? { tipoInsumoManual } : {}) },
    );
  }

  actualizarActivo(unidadId: number, clave: string, activo: boolean) {
    return this.http.patch<ActualizarActivoResponse>(
      `${this.baseUrl}/unidades/${unidadId}/claves/${encodeURIComponent(clave)}/activo`,
      { activo },
    );
  }
}
