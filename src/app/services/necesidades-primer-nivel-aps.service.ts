import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ApsGrupo {
  numero: number;
  nombre: string;
}

export interface ApsEje {
  codigo: string;
  nombre: string;
}

export interface ApsEstructuraEje {
  ejeCodigo: string;
  ejeNombre: string;
  grupos: Array<ApsGrupo & { totalMedicamentos: number }>;
}

export interface ApsMedicamentoResumen {
  codigo: string;
  etiqueta: string;
  grupo: ApsGrupo;
  eje: ApsEje | null;
  numeroClavesPrincipales: number;
  numeroClavesCoincidentes: number;
  requiereSeleccionDeVariante: boolean;
}

export interface ApsVariante {
  id: string;
  clave: string;
  nombre: string | null;
  descripcion: string | null;
  origenCatalogo: string;
}

export interface ApsMedicamentoDetalle {
  codigo: string;
  etiqueta: string;
  grupo: ApsGrupo;
  eje: ApsEje | null;
  requiereSeleccionDeVariante: boolean;
  variantes: ApsVariante[];
}

export interface ApsMedicamentosResponse {
  items: ApsMedicamentoResumen[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ApsResolverResponse {
  resueltos: Array<{
    codigoMedicamento: string;
    etiqueta: string;
    clave: string;
    cantidad: number;
  }>;
  pendientes: Array<{
    codigoMedicamento: string;
    etiqueta: string;
    motivo: 'REQUIERE_VARIANTE';
    opciones: ApsVariante[];
  }>;
  listoParaEnviar: boolean;
}

@Injectable({ providedIn: 'root' })
export class NecesidadesPrimerNivelApsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/solicitudes/primer-nivel/aps`;
  private readonly opciones = { headers: { 'X-Skip-Loader': '1' } };

  obtenerEstructura(): Observable<ApsEstructuraEje[]> {
    return this.http.get<ApsEstructuraEje[]>(`${this.apiUrl}/estructura`, this.opciones);
  }

  buscar(params: { q?: string; grupo?: number; eje?: string; page?: number; pageSize?: number }): Observable<ApsMedicamentosResponse> {
    let httpParams = new HttpParams()
      .set('page', String(params.page ?? 1))
      .set('pageSize', String(params.pageSize ?? 30));
    if (params.q?.trim()) httpParams = httpParams.set('q', params.q.trim());
    if (params.grupo !== undefined) httpParams = httpParams.set('grupo', String(params.grupo));
    if (params.eje?.trim()) httpParams = httpParams.set('eje', params.eje.trim());
    return this.http.get<ApsMedicamentosResponse>(`${this.apiUrl}/medicamentos`, {
      params: httpParams,
    });
  }

  obtenerMedicamento(codigo: string): Observable<ApsMedicamentoDetalle> {
    return this.http.get<ApsMedicamentoDetalle>(
      `${this.apiUrl}/medicamentos/${encodeURIComponent(codigo)}`,
      this.opciones
    );
  }

  resolver(payload: {
    medicamentos: Array<{ codigo: string; cantidad: number; claveSeleccionada?: string }>;
  }): Observable<ApsResolverResponse> {
    return this.http.post<ApsResolverResponse>(`${this.apiUrl}/resolver`, payload, this.opciones);
  }
}
