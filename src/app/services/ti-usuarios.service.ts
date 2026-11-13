import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Representa un rol existente en `public.app_roles` devuelto por `GET /api/ti/roles`.
 */
export interface TiRoleCatalogItem {
  id: string;
  code: string;
  description: string | null;
}

/**
 * Representa una asignación de rol y alcance devuelta por `GET /api/ti/usuarios`.
 *
 * Nota de contrato:
 * - La API administrativa `GET /api/ti/usuarios` expone `scope_type` y `scope_id`
 *   (donde el alcance global en BD se almacena con `scope_id = '*'`).
 * - Esto difiere del claim `roles` del JWT y `GET /api/auth/me`, que utiliza `scope` e `id`
 *   (donde `id` es `null` cuando `scope === 'GLOBAL'`).
 */
export interface TiUsuarioRoleAssignment {
  code: string;
  scope_type: string;
  scope_id: string;
}

/**
 * Representa una cuenta SSO devuelta por `GET /api/ti/usuarios`.
 */
export interface TiUsuarioItem {
  id: string;
  email: string;
  name: string;
  status: string;
  persona_id: number | null;
  nombre_completo: string | null;
  unidad_medica_id: number | null;
  unidad_medica: string | null;
  roles: TiUsuarioRoleAssignment[];
}

/**
 * Parámetros de consulta para `GET /api/ti/usuarios`.
 */
export interface TiUsuariosQueryParams {
  q?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Respuesta paginada real de `GET /api/ti/usuarios`.
 */
export interface TiUsuariosPagedResponse {
  items: TiUsuarioItem[];
  page: number;
  pageSize: number;
  total: number;
}

@Injectable({ providedIn: 'root' })
export class TiUsuariosService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl.replace(/\/+$/, '')}/ti`;

  /**
   * Consulta el catálogo de roles disponibles en el sistema (`GET /api/ti/roles`).
   * Operación estrictamente de solo lectura.
   */
  async listarRoles(): Promise<TiRoleCatalogItem[]> {
    return await firstValueFrom(
      this.http.get<TiRoleCatalogItem[]>(`${this.baseUrl}/roles`)
    );
  }

  /**
   * Consulta paginada de cuentas SSO y sus roles vinculados (`GET /api/ti/usuarios`).
   * Operación estrictamente de solo lectura.
   */
  async listarUsuarios(params: TiUsuariosQueryParams = {}): Promise<TiUsuariosPagedResponse> {
    let httpParams = new HttpParams();

    const q = params.q?.trim();
    if (q) {
      httpParams = httpParams.set('q', q);
    }

    const status = params.status?.trim();
    if (status) {
      httpParams = httpParams.set('status', status);
    }

    if (params.page != null) {
      httpParams = httpParams.set('page', String(params.page));
    }

    if (params.pageSize != null) {
      httpParams = httpParams.set('pageSize', String(params.pageSize));
    }

    return await firstValueFrom(
      this.http.get<TiUsuariosPagedResponse>(`${this.baseUrl}/usuarios`, {
        params: httpParams,
      })
    );
  }
}
