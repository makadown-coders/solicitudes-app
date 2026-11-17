import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { RhAccessScope } from '../core/auth/rh-access.guard';

/**
 * Representa una unidad de trabajo autorizada devuelta por `GET /api/rh/unidades-autorizadas`.
 * Respeta exactamente el contrato de `RhService` en `solicitudes-backend`.
 */
export interface RhUnidadAutorizada {
  id: number;
  nombre: string;
  cluesimb: string | null;
}

/**
 * Respuesta real de `GET /api/rh/unidades-autorizadas`.
 */
export interface RhUnidadesAutorizadasResponse {
  scope: RhAccessScope;
  unidades: RhUnidadAutorizada[];
}

@Injectable({ providedIn: 'root' })
export class RhService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl.replace(/\/+$/, '')}/rh`;

  /**
   * Consulta el universo de unidades de trabajo autorizadas para el operador actual
   * (`GET /api/rh/unidades-autorizadas`).
   * El header `Authorization: Bearer` es adjuntado automáticamente por `authInterceptor`.
   */
  async obtenerUnidadesAutorizadas(): Promise<RhUnidadesAutorizadasResponse> {
    return await firstValueFrom(
      this.http.get<RhUnidadesAutorizadasResponse>(`${this.baseUrl}/unidades-autorizadas`)
    );
  }
}
