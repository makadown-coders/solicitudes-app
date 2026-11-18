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

export interface TiRoleCreatePayload {
  code: string;
  description: string;
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

export type TiUsuarioStatus = 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';

export interface TiUsuarioStatusUpdateResult {
  ok: true;
  id: string;
  status: TiUsuarioStatus;
  revoked_sessions: number;
}

export interface TiUsuarioPasswordResetResult {
  ok: true;
  id: string;
  revoked_sessions: number;
}

export interface TiUsuarioRolesUpdateResult {
  ok: true;
  id: string;
  roles: TiUsuarioRoleAssignment[];
}

export interface TiUsuarioCreatePayload {
  persona_id: number;
  email: string;
  name?: string;
  password: string;
  status?: TiUsuarioStatus;
}

export interface TiUsuarioCreateResult {
  id: string;
  email: string;
  name: string;
  status: TiUsuarioStatus;
  persona_id: number;
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

  /**
   * Cambia el estado de una cuenta SSO (`PATCH /api/ti/usuarios/:id/status`).
   */
  async cambiarEstado(id: string, status: TiUsuarioStatus): Promise<TiUsuarioStatusUpdateResult> {
    return await firstValueFrom(
      this.http.patch<TiUsuarioStatusUpdateResult>(`${this.baseUrl}/usuarios/${id}/status`, {
        status,
      })
    );
  }

  /**
   * Restablece la contraseña de una cuenta SSO (`PUT /api/ti/usuarios/:id/password`).
   * Nunca registra ni persiste la contraseña.
   */
  async restablecerContrasena(id: string, password: string): Promise<TiUsuarioPasswordResetResult> {
    return await firstValueFrom(
      this.http.put<TiUsuarioPasswordResetResult>(`${this.baseUrl}/usuarios/${id}/password`, {
        password,
      })
    );
  }

  /**
   * Reemplaza el conjunto completo de roles y alcances de una cuenta SSO (`PUT /api/ti/usuarios/:id/roles`).
   */
  async actualizarRoles(
    id: string,
    roles: TiUsuarioRoleAssignment[]
  ): Promise<TiUsuarioRolesUpdateResult> {
    return await firstValueFrom(
      this.http.put<TiUsuarioRolesUpdateResult>(`${this.baseUrl}/usuarios/${id}/roles`, {
        roles,
      })
    );
  }

  /**
   * Crea una nueva cuenta SSO vinculada a una persona existente (`POST /api/ti/usuarios`).
   */
  async crearUsuario(payload: TiUsuarioCreatePayload): Promise<TiUsuarioCreateResult> {
    return await firstValueFrom(
      this.http.post<TiUsuarioCreateResult>(`${this.baseUrl}/usuarios`, payload)
    );
  }

  /**
   * Crea un nuevo rol en el catálogo (`POST /api/ti/roles`).
   */
  async crearRol(payload: TiRoleCreatePayload): Promise<TiRoleCatalogItem> {
    return await firstValueFrom(
      this.http.post<TiRoleCatalogItem>(`${this.baseUrl}/roles`, payload)
    );
  }
}
