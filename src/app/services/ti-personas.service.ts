import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface TiPersonaLite {
  id: number;
  nombre_completo: string;
  unidad_medica_id?: number | null;
  unidad_medica?: string | null;
  email_principal?: string | null;
  n_correos?: number | null;
}

export interface TiPersonasPagedResponse {
  items: TiPersonaLite[];
  page: number;
  pageSize: number;
  total: number;
}

export interface TiPersonaCorreoRow {
  id: number;
  correo: string;
  es_principal: boolean;
}

export interface TiPersonaDetalle {
  id: number;
  nombre_completo: string;
  unidad_medica_id: number | null;
  unidad_medica: string | null;
  correo: string | null;
  email_principal: string | null;
  correos: TiPersonaCorreoRow[];
}

export interface TiPersonaCreatePayload {
  nombre_completo: string;
  unidad_medica_id?: number | null;
  correo_principal?: string | null;
  correos_complementarios?: string[];
}

export interface TiPersonaUpdatePayload {
  nombre_completo?: string;
  unidad_medica_id?: number | null;
  correo_principal?: string | null;
  correos_complementarios?: string[];
}

export interface TiUnidadMedicaItem {
  id: number;
  nombre: string;
  cluessa?: string | null;
  cluesimb?: string | null;
}

export interface TiUnidadesPagedResponse {
  items: TiUnidadMedicaItem[];
  page: number;
  pageSize: number;
  total: number;
}

@Injectable({ providedIn: 'root' })
export class TiPersonasService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl.replace(/\/+$/, '')}/ti`;

  async listarPersonas(params: {
    q?: string;
    unidad_medica_id?: number | null;
    page?: number;
    pageSize?: number;
  } = {}): Promise<TiPersonasPagedResponse> {
    let httpParams = new HttpParams();

    const q = params.q?.trim();
    if (q) {
      httpParams = httpParams.set('q', q);
    }
    if (params.unidad_medica_id != null) {
      httpParams = httpParams.set('unidad_medica_id', String(params.unidad_medica_id));
    }
    if (params.page != null) {
      httpParams = httpParams.set('page', String(params.page));
    }
    if (params.pageSize != null) {
      httpParams = httpParams.set('pageSize', String(params.pageSize));
    }

    return await firstValueFrom(
      this.http.get<TiPersonasPagedResponse>(`${this.baseUrl}/personas`, { params: httpParams })
    );
  }

  async obtenerPersona(id: number): Promise<TiPersonaDetalle> {
    return await firstValueFrom(
      this.http.get<TiPersonaDetalle>(`${this.baseUrl}/personas/${id}`)
    );
  }

  async crearPersona(payload: TiPersonaCreatePayload): Promise<{ id: number }> {
    return await firstValueFrom(
      this.http.post<{ id: number }>(`${this.baseUrl}/personas`, payload)
    );
  }

  async actualizarPersona(id: number, payload: TiPersonaUpdatePayload): Promise<{ id: number }> {
    return await firstValueFrom(
      this.http.put<{ id: number }>(`${this.baseUrl}/personas/${id}`, payload)
    );
  }

  async bajaLogicaPersona(id: number): Promise<{ ok: boolean }> {
    return await firstValueFrom(
      this.http.delete<{ ok: boolean }>(`${this.baseUrl}/personas/${id}`)
    );
  }

  async buscarUnidades(params: { q?: string; page?: number; pageSize?: number } = {}): Promise<TiUnidadesPagedResponse> {
    let httpParams = new HttpParams();
    const q = params.q?.trim();
    if (q) {
      httpParams = httpParams.set('q', q);
    }
    if (params.page != null) {
      httpParams = httpParams.set('page', String(params.page));
    }
    if (params.pageSize != null) {
      httpParams = httpParams.set('pageSize', String(params.pageSize));
    }

    return await firstValueFrom(
      this.http.get<TiUnidadesPagedResponse>(`${this.baseUrl}/unidades`, { params: httpParams })
    );
  }
}
