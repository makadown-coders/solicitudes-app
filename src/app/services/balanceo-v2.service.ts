import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  BalanceoV2ApiResponse,
  BalanceoV2Apartado,
  BalanceoV2Detalle,
  BalanceoV2EjecutarResponse,
  BalanceoV2Ejecucion,
  BalanceoV2Resultado,
  BalanceoV2ResumenJurisdiccional,
} from '../models/balanceo-v2';

@Injectable({
  providedIn: 'root',
})
export class BalanceoV2Service {
  private baseUrl = `${environment.apiUrl}/balanceo-v2`;

  constructor(private http: HttpClient) {}

  ejecutarBalanceoV2(): Observable<BalanceoV2EjecutarResponse> {
    return this.http.post<BalanceoV2EjecutarResponse>(
      `${this.baseUrl}/ejecutar`,
      {}
    );
  }

  obtenerEjecuciones(): Observable<BalanceoV2ApiResponse<BalanceoV2Ejecucion[]>> {
    return this.http.get<BalanceoV2ApiResponse<BalanceoV2Ejecucion[]>>(
      `${this.baseUrl}/ejecuciones`
    );
  }

  obtenerUltimaEjecucion(): Observable<BalanceoV2ApiResponse<BalanceoV2Ejecucion | null>> {
    return this.http.get<BalanceoV2ApiResponse<BalanceoV2Ejecucion | null>>(
      `${this.baseUrl}/ejecuciones/ultima`
    );
  }

  obtenerResumenJurisdiccional(
    ejecucionId: number
  ): Observable<BalanceoV2ApiResponse<BalanceoV2ResumenJurisdiccional[]>> {
    return this.http.get<BalanceoV2ApiResponse<BalanceoV2ResumenJurisdiccional[]>>(
      `${this.baseUrl}/ejecuciones/${ejecucionId}/resumen-jurisdiccional`
    );
  }

  obtenerDetallePorEjecucion(
    ejecucionId: number,
    params?: {
      clave_cnis?: string;
      jurisdiccion_almacen?: string;
      jurisdiccion_destino?: string;
    }
  ): Observable<BalanceoV2ApiResponse<BalanceoV2Detalle[]>> {
    let httpParams = new HttpParams();
    if (params?.clave_cnis) {
      httpParams = httpParams.set('clave_cnis', params.clave_cnis);
    }
    if (params?.jurisdiccion_almacen) {
      httpParams = httpParams.set('jurisdiccion_almacen', params.jurisdiccion_almacen);
    }
    if (params?.jurisdiccion_destino) {
      httpParams = httpParams.set('jurisdiccion_destino', params.jurisdiccion_destino);
    }

    return this.http.get<BalanceoV2ApiResponse<BalanceoV2Detalle[]>>(
      `${this.baseUrl}/ejecuciones/${ejecucionId}/detalle`,
      { params: httpParams }
    );
  }

  obtenerApartadosPorEjecucion(
    ejecucionId: number,
    params?: {
      clave_cnis?: string;
      jurisdiccion?: string;
    }
  ): Observable<BalanceoV2ApiResponse<BalanceoV2Apartado[]>> {
    let httpParams = new HttpParams();
    if (params?.clave_cnis) {
      httpParams = httpParams.set('clave_cnis', params.clave_cnis);
    }
    if (params?.jurisdiccion) {
      httpParams = httpParams.set('jurisdiccion', params.jurisdiccion);
    }

    return this.http.get<BalanceoV2ApiResponse<BalanceoV2Apartado[]>>(
      `${this.baseUrl}/ejecuciones/${ejecucionId}/apartados`,
      { params: httpParams }
    );
  }

  obtenerResultadosPorEjecucion(
    ejecucionId: number
  ): Observable<BalanceoV2ApiResponse<BalanceoV2Resultado[]>> {
    return this.http.get<BalanceoV2ApiResponse<BalanceoV2Resultado[]>>(
      `${this.baseUrl}/ejecuciones/${ejecucionId}/resultados`
    );
  }
}
