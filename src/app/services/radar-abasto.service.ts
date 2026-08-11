import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  RadarCrearEventoPayload,
  RadarCrearEventoResponse,
  RadarEventoDetalle,
  RadarEstadoEvento,
  RadarGlobalClavesRiesgoResponse,
  RadarGlobalSnapshotResponse,
  RadarGlobalTimelineResponse,
  RadarGlobalV2Response,
  RadarGlobalV2Segmento,
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

  async listarGlobalSnapshot(params: {
    search?: string;
    clues?: string;
    tipo_pedido?: string;
    tipos_insumo?: string;
    page?: number;
    pageSize?: number;
  }): Promise<RadarGlobalSnapshotResponse> {
    let p = new HttpParams();
    if (params.search) p = p.set('search', params.search);
    if (params.clues) p = p.set('clues', params.clues);
    if (params.tipo_pedido) p = p.set('tipo_pedido', params.tipo_pedido);
    if (params.tipos_insumo) p = p.set('tipos_insumo', params.tipos_insumo);
    if (params.page) p = p.set('page', String(params.page));
    if (params.pageSize) p = p.set('pageSize', String(params.pageSize));

    return await firstValueFrom(
      this.http.get<RadarGlobalSnapshotResponse>(`${environment.apiUrl}/radar-abasto/global/snapshot`, { params: p })
    );
  }

  async listarGlobalTimeline(params: {
    search?: string;
    clues?: string;
    tipo_pedido?: string;
    tipos_insumo?: string;
    months?: number;
    page?: number;
    pageSize?: number;
  }): Promise<RadarGlobalTimelineResponse> {
    let p = new HttpParams();
    if (params.search) p = p.set('search', params.search);
    if (params.clues) p = p.set('clues', params.clues);
    if (params.tipo_pedido) p = p.set('tipo_pedido', params.tipo_pedido);
    if (params.tipos_insumo) p = p.set('tipos_insumo', params.tipos_insumo);
    if (params.months) p = p.set('months', String(params.months));
    if (params.page) p = p.set('page', String(params.page));
    if (params.pageSize) p = p.set('pageSize', String(params.pageSize));

    return await firstValueFrom(
      this.http.get<RadarGlobalTimelineResponse>(`${environment.apiUrl}/radar-abasto/global/timeline`, { params: p })
    );
  }

  async listarGlobalClavesRiesgo(params: {
    search?: string;
    clues?: string;
    tipo_pedido?: string;
    tipos_insumo?: string;
    months?: number;
    minSolicitado?: number;
    page?: number;
    pageSize?: number;
  }): Promise<RadarGlobalClavesRiesgoResponse> {
    let p = new HttpParams();
    if (params.search) p = p.set('search', params.search);
    if (params.clues) p = p.set('clues', params.clues);
    if (params.tipo_pedido) p = p.set('tipo_pedido', params.tipo_pedido);
    if (params.tipos_insumo) p = p.set('tipos_insumo', params.tipos_insumo);
    if (params.months) p = p.set('months', String(params.months));
    if (params.minSolicitado != null) p = p.set('minSolicitado', String(params.minSolicitado));
    if (params.page) p = p.set('page', String(params.page));
    if (params.pageSize) p = p.set('pageSize', String(params.pageSize));

    return await firstValueFrom(
      this.http.get<RadarGlobalClavesRiesgoResponse>(`${environment.apiUrl}/radar-abasto/global/claves-riesgo`, { params: p })
    );
  }

  async listarGlobalV2(params: {
    search?: string;
    clues?: string;
    segmento?: RadarGlobalV2Segmento | '';
    months?: number;
    page?: number;
    pageSize?: number;
  }): Promise<RadarGlobalV2Response> {
    let p = new HttpParams();
    if (params.search) p = p.set('search', params.search);
    if (params.clues) p = p.set('clues', params.clues);
    if (params.segmento) p = p.set('segmento', params.segmento);
    if (params.months) p = p.set('months', String(params.months));
    if (params.page) p = p.set('page', String(params.page));
    if (params.pageSize) p = p.set('pageSize', String(params.pageSize));
    return await firstValueFrom(
      this.http.get<RadarGlobalV2Response>(`${environment.apiUrl}/radar-abasto/v2/claves`, { params: p })
    );
  }
}

