import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  IbOncoAbastoCpmParams,
  IbOncoAbastoCpmRow,
  IbOncoCitaPendiente,
  IbOncoCitasPendientesParams,
  IbOncoClave,
  IbOncoListResponse,
  IbOncoPaginatedResponse,
  IbOncoResumenUnidad,
  IbOncoUnidad,
} from '../models/ib-onco';

@Injectable({
  providedIn: 'root',
})
export class IbOncoService {
  private baseUrl = `${environment.apiUrl}/ib-onco`;

  constructor(private http: HttpClient) {}

  obtenerUnidades(): Observable<IbOncoListResponse<IbOncoUnidad>> {
    return this.http.get<IbOncoListResponse<IbOncoUnidad>>(`${this.baseUrl}/unidades`);
  }

  obtenerClaves(cluesimb?: string): Observable<IbOncoListResponse<IbOncoClave>> {
    return this.http.get<IbOncoListResponse<IbOncoClave>>(`${this.baseUrl}/claves`, {
      params: this.toParams({ cluesimb }),
    });
  }

  obtenerAbastoCpm(
    params: IbOncoAbastoCpmParams
  ): Observable<IbOncoPaginatedResponse<IbOncoAbastoCpmRow>> {
    return this.http.get<IbOncoPaginatedResponse<IbOncoAbastoCpmRow>>(
      `${this.baseUrl}/abasto-cpm`,
      { params: this.toParams(params) }
    );
  }

  obtenerCitasPendientes(
    params: IbOncoCitasPendientesParams
  ): Observable<IbOncoPaginatedResponse<IbOncoCitaPendiente>> {
    return this.http.get<IbOncoPaginatedResponse<IbOncoCitaPendiente>>(
      `${this.baseUrl}/citas-pendientes`,
      { params: this.toParams(params) }
    );
  }

  obtenerResumen(windowDays = 15): Observable<IbOncoListResponse<IbOncoResumenUnidad>> {
    return this.http.get<IbOncoListResponse<IbOncoResumenUnidad>>(`${this.baseUrl}/resumen`, {
      params: this.toParams({ window_days: windowDays }),
    });
  }

  private toParams(params: object): HttpParams {
    let httpParams = new HttpParams();

    for (const [key, value] of Object.entries(params) as [string, string | number | boolean | null | undefined][]) {
      if (value === undefined || value === null || value === '') {
        continue;
      }

      httpParams = httpParams.set(key, String(value));
    }

    return httpParams;
  }
}

