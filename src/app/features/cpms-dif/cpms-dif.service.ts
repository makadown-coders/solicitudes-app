import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { CpmsDifIndicadoresResponse, CpmsDifObservacion, CpmsDifResponse, CpmsDifRow, CpmsDifResumenRow } from './models';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CpmsDifService {
  private baseUrl = `${environment.apiUrl}/cpms-dif`;

  constructor(private http: HttpClient) {}

  getDetalle(params: {
    page?: number;
    limit?: number;
    observacion?: CpmsDifObservacion | '';
    search?: string;
    cluesimb?: string;
  }) {
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== '' && value !== undefined && value !== null)
    );

    return this.http.get<CpmsDifResponse<CpmsDifRow>>(this.baseUrl, {
      params: cleanParams as any
    });
  }

  getResumen(params: { page?: number; limit?: number }) {
    return this.http.get<CpmsDifResponse<CpmsDifResumenRow>>(
      `${this.baseUrl}/resumen`,
      { params: params as any }
    );
  }

  getIndicadores() {
    return this.http.get<CpmsDifIndicadoresResponse>(`${this.baseUrl}/indicadores`);
  }
}
