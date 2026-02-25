import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  RadarCrearEventoPayload,
  RadarCrearEventoResponse,
  RadarEventoDetalle,
  RadarEstadoEvento,
  RadarListarEventosResponse,
  RadarRiesgoNivel
} from '../models/radar-abasto/RadarAbastoModels';

@Injectable({ providedIn: 'root' })
export class RadarAbastoService {
  private http = inject(HttpClient);

  async crearEvento(payload: RadarCrearEventoPayload): Promise<RadarCrearEventoResponse> {
    return await firstValueFrom(
      this.http.post<RadarCrearEventoResponse>(`${environment.apiUrl}/radar-abasto/eventos`, payload)
    );
  }

  async listarEventos(params: {
    desde?: string;
    hasta?: string;
    clues?: string;
    estado?: RadarEstadoEvento | '';
    riesgoMin?: RadarRiesgoNivel | '';
    page?: number;
    pageSize?: number;
  }): Promise<RadarListarEventosResponse> {
    let p = new HttpParams();
    if (params.desde) p = p.set('desde', params.desde);
    if (params.hasta) p = p.set('hasta', params.hasta);
    if (params.clues) p = p.set('clues', params.clues);
    if (params.estado) p = p.set('estado', params.estado);
    if (params.riesgoMin) p = p.set('riesgo_min', params.riesgoMin);
    if (params.page) p = p.set('page', String(params.page));
    if (params.pageSize) p = p.set('pageSize', String(params.pageSize));

    return await firstValueFrom(
      this.http.get<RadarListarEventosResponse>(`${environment.apiUrl}/radar-abasto/eventos`, { params: p })
    );
  }

  async detalleEvento(id: number): Promise<RadarEventoDetalle> {
    return await firstValueFrom(
      this.http.get<RadarEventoDetalle>(`${environment.apiUrl}/radar-abasto/eventos/${id}`)
    );
  }

  async patchEvento(id: number, patch: {
    estado?: RadarEstadoEvento;
    motivo?: string;
    observaciones?: string;
  }): Promise<{ ok: boolean }> {
    return await firstValueFrom(
      this.http.patch<{ ok: boolean }>(`${environment.apiUrl}/radar-abasto/eventos/${id}`, patch)
    );
  }

  async recalcularEvento(id: number): Promise<{ ok: boolean; recalculated_at: string }> {
    return await firstValueFrom(
      this.http.post<{ ok: boolean; recalculated_at: string }>(
        `${environment.apiUrl}/radar-abasto/eventos/${id}/recalcular`,
        {}
      )
    );
  }
}

