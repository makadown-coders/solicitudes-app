import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  DashboardEstatalClavesResponse,
  DashboardEstatalOrdenesPendientesResponse,
  DashboardEstatalResumenResponse,
  DashboardEstatalTopResponse,
} from '../models/dashboard-estatal';

@Injectable({
  providedIn: 'root',
})
export class DashboardEstatalService {
  private baseUrl = `${environment.apiUrl}/dashboard-estatal`;

  constructor(private http: HttpClient) {}

  buscarClaves(search: string, limit = 20): Observable<DashboardEstatalClavesResponse> {
    return this.http.get<DashboardEstatalClavesResponse>(`${this.baseUrl}/claves`, {
      params: this.toParams({ search, limit }),
    });
  }

  obtenerResumenClave(claveCnis: string, windowDays = 120): Observable<DashboardEstatalResumenResponse> {
    return this.http.get<DashboardEstatalResumenResponse>(`${this.baseUrl}/resumen-clave`, {
      params: this.toParams({ clave_cnis: claveCnis, window_days: windowDays }),
    });
  }

  obtenerTop(windowDays = 120, limit = 10): Observable<DashboardEstatalTopResponse> {
    return this.http.get<DashboardEstatalTopResponse>(`${this.baseUrl}/top`, {
      params: this.toParams({ window_days: windowDays, limit }),
    });
  }

  obtenerOrdenesPendientes(
    claveCnis: string,
    windowDays = 120,
    limit = 200
  ): Observable<DashboardEstatalOrdenesPendientesResponse> {
    return this.http.get<DashboardEstatalOrdenesPendientesResponse>(`${this.baseUrl}/ordenes-pendientes`, {
      params: this.toParams({ clave_cnis: claveCnis, window_days: windowDays, limit }),
    });
  }

  private toParams(params: Record<string, string | number | null | undefined>): HttpParams {
    let httpParams = new HttpParams();

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }
      httpParams = httpParams.set(key, String(value));
    }

    return httpParams;
  }
}
