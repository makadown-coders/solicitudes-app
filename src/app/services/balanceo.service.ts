import { HttpClient, HttpParams } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../environments/environment";
import { DetalleBalanceo } from "../models/balanceo/DetalleBalanceo";
import { ResumenBalanceo } from "../models/balanceo/ResumenBalanceo";
import { UltimaEjecucion } from "../models/balanceo/UltimaEjecucion";
import { BalanceoApiResponse } from "../models/balanceo/BalanceoApiResponse";

@Injectable({
  providedIn: 'root',
})
export class BalanceoService {
  private baseUrl = `${environment.apiUrl}/balanceo`;

  constructor(private http: HttpClient) { }

  ejecutarBalanceo(): Observable<{ ok: boolean; ejecucionId: number }> {
    return this.http.post<{ ok: boolean; ejecucionId: number }>(
      `${this.baseUrl}/ejecutar`,
      {}
    );
  }

  obtenerUltimaEjecucion(): Observable<BalanceoApiResponse<UltimaEjecucion>> {
    return this.http.get<BalanceoApiResponse<UltimaEjecucion>>(
      `${this.baseUrl}/ultima-ejecucion`
    );
  }

  obtenerResumenActual(): Observable<BalanceoApiResponse<ResumenBalanceo[]>> {
    return this.http.get<BalanceoApiResponse<ResumenBalanceo[]>>(
      `${this.baseUrl}/resumen-actual`
    );
  }

  obtenerDetalleActual(params?: {
    clave_cnis?: string;
    jurisdiccion_almacen?: string;
  }): Observable<BalanceoApiResponse<DetalleBalanceo[]>> {
    let httpParams = new HttpParams();
    if (params?.clave_cnis) {
      httpParams = httpParams.set('clave_cnis', params.clave_cnis);
    }
    if (params?.jurisdiccion_almacen) {
      httpParams = httpParams.set(
        'jurisdiccion_almacen',
        params.jurisdiccion_almacen
      );
    }

    return this.http.get<BalanceoApiResponse<DetalleBalanceo[]>>(
      `${this.baseUrl}/detalle-actual`,
      { params: httpParams }
    );
  }

  /** Detalle global de la última ejecución (sin filtros) */
  obtenerDetalleGlobalActual(): Observable<BalanceoApiResponse<DetalleBalanceo[]>> {
    return this.obtenerDetalleActual(); // sin params => trae TODO
  }

  // Opcionales para histórico:
  obtenerResumenPorEjecucion(
    ejecucionId: number
  ): Observable<BalanceoApiResponse<ResumenBalanceo[]>> {
    return this.http.get<BalanceoApiResponse<ResumenBalanceo[]>>(
      `${this.baseUrl}/${ejecucionId}/resumen`
    );
  }

  obtenerDetallePorEjecucion(
    ejecucionId: number,
    params?: { clave_cnis?: string; jurisdiccion_almacen?: string }
  ): Observable<BalanceoApiResponse<DetalleBalanceo[]>> {
    let httpParams = new HttpParams();
    if (params?.clave_cnis) {
      httpParams = httpParams.set('clave_cnis', params.clave_cnis);
    }
    if (params?.jurisdiccion_almacen) {
      httpParams = httpParams.set(
        'jurisdiccion_almacen',
        params.jurisdiccion_almacen
      );
    }

    return this.http.get<BalanceoApiResponse<DetalleBalanceo[]>>(
      `${this.baseUrl}/${ejecucionId}/detalle`,
      { params: httpParams }
    );
  }

  obtenerClavesRutasSalud(kit?: string) {
    const params: any = {};
    if (kit) {
      // el backend acepta ?kits=KIT_180,KIT_96,...; aquí usamos uno solo
      params.kits = kit;
    }

    return this.http.get<{ count: number; claves: string[] }>(
      `${environment.apiUrl}/cpms/rutas-salud-claves`,
      { params }
    );
  }
}
