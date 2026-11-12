/**
 * Representa un rol asignado a un usuario según el contrato real de solicitudes-backend.
 * En LocalAuthService.getUserWithRoles:
 * { code: r.code, scope: r.scope_type, id: r.scope_id === '*' ? null : r.scope_id }
 */
export interface UserRole {
  code: string;
  scope: string;
  id: string | null;
}

/**
 * Perfil de usuario devuelto en login, refresh y /api/auth/me.
 * El campo status es opcional porque LocalAuthService.me lo referencia pero no siempre
 * es proyectado por la consulta SQL base.
 */
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  roles: UserRole[];
  status?: string;
}

/**
 * Respuesta real de POST /api/auth/login
 */
export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: UserProfile;
}

/**
 * Respuesta real de POST /api/auth/refresh
 */
export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  user: UserProfile;
}

/**
 * Respuesta real de GET /api/auth/me
 */
export interface MeResponse {
  auth_user_id: string;
  email?: string;
  profile: UserProfile;
}
