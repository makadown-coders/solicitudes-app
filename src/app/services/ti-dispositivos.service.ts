import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AsignacionBitacoraRow,
  CambiarAsignacionPayload,
  DispositivoCreate,
  DispositivoDetail,
  DispositivoRowEx,
  DispositivoUpdateBasicPayload,
  Monitor,
  Page,
  Periferico,
} from '../models/ti-inventario.models';

@Injectable({ providedIn: 'root' })
export class TiDispositivosService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  list(opts: {
    unidad_medica_id?: number | null;
    tipo_dispositivo_id?: number | null;
    estado_dispositivo_id?: number | null;
    q?: string | null;
    page?: number;
    pageSize?: number;
  }): Observable<Page<DispositivoRowEx>> {
    let params = new HttpParams()
      .set('page', String(opts.page ?? 1))
      .set('pageSize', String(opts.pageSize ?? 20));

    if (opts.unidad_medica_id) params = params.set('unidad_medica_id', String(opts.unidad_medica_id));
    if (opts.tipo_dispositivo_id) params = params.set('tipo_dispositivo_id', String(opts.tipo_dispositivo_id));
    if (opts.estado_dispositivo_id) params = params.set('estado_dispositivo_id', String(opts.estado_dispositivo_id));
    if (opts.q?.trim()) params = params.set('q', opts.q.trim());

    return this.http.get<Page<DispositivoRowEx>>(`${this.base}/dispositivos`, { params });
  }

  getById(id: number): Observable<DispositivoDetail> {
    return this.http.get<DispositivoDetail>(`${this.base}/dispositivos/${id}`);
  }

  create(body: DispositivoCreate): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.base}/dispositivos`, body);
  }

  updateBasic(id: number, body: DispositivoUpdateBasicPayload): Observable<{ ok: boolean; id: number }> {
    return this.http.put<{ ok: boolean; id: number }>(`${this.base}/dispositivos/${id}`, body);
  }

  cambiarAsignacion(id: number, body: CambiarAsignacionPayload): Observable<{ ok: boolean; asignacion_id: number }> {
    return this.http.post<{ ok: boolean; asignacion_id: number }>(`${this.base}/dispositivos/${id}/asignacion`, body);
  }

  saveMonitor(dispositivoId: number, monitor: Monitor): Observable<{ ok: boolean; id: number }> {
    return monitor?.id
      ? this.http.put<{ ok: boolean; id: number }>(`${this.base}/dispositivos/${dispositivoId}/monitores/${monitor.id}`, monitor)
      : this.http.post<{ ok: boolean; id: number }>(`${this.base}/dispositivos/${dispositivoId}/monitores`, monitor);
  }

  deleteMonitor(dispositivoId: number, monitorId: number): Observable<{ ok: boolean; id?: number }> {
    return this.http.delete<{ ok: boolean; id?: number }>(
      `${this.base}/dispositivos/${dispositivoId}/monitores/${monitorId}`
    );
  }

  savePeriferico(dispositivoId: number, periferico: Periferico): Observable<{ ok: boolean; id: number }> {
    return periferico?.id
      ? this.http.put<{ ok: boolean; id: number }>(`${this.base}/dispositivos/${dispositivoId}/perifericos/${periferico.id}`, periferico)
      : this.http.post<{ ok: boolean; id: number }>(`${this.base}/dispositivos/${dispositivoId}/perifericos`, periferico);
  }

  deletePeriferico(dispositivoId: number, perifericoId: number): Observable<{ ok: boolean; id?: number }> {
    return this.http.delete<{ ok: boolean; id?: number }>(
      `${this.base}/dispositivos/${dispositivoId}/perifericos/${perifericoId}`
    );
  }

  listAsignaciones(
    dispositivoId: number,
    opts: {
      from?: string | null;
      to?: string | null;
      page?: number;
      pageSize?: number;
    } = {}
  ): Observable<Page<AsignacionBitacoraRow>> {
    let params = new HttpParams()
      .set('page', String(opts.page ?? 1))
      .set('pageSize', String(opts.pageSize ?? 10));

    if (opts.from) params = params.set('from', opts.from);
    if (opts.to) params = params.set('to', opts.to);

    return this.http.get<Page<AsignacionBitacoraRow>>(
      `${this.base}/dispositivos/${dispositivoId}/asignaciones`,
      { params }
    );
  }

  revertAsignacion(dispositivoId: number, asignacionId: number): Observable<{ ok: boolean; asignacion_id: number }> {
    return this.http.post<{ ok: boolean; asignacion_id: number }>(
      `${this.base}/dispositivos/${dispositivoId}/asignaciones/${asignacionId}/revert`,
      {}
    );
  }
}
