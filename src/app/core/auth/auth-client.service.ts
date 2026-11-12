import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoginResponse, MeResponse, RefreshResponse } from './auth.models';
import { SessionStore } from './session-store.service';
import { TokenStore } from './token-store.service';

const SKIP_LOADER_HEADERS = new HttpHeaders({ 'X-Skip-Loader': '1' });

/**
 * Cliente HTTP de autenticación para `solicitudes-app`.
 *
 * Responsabilidades:
 * - Ejecutar login, refresh (single-flight), consulta de perfil (/auth/me) y logout.
 * - Coordinar la actualización y limpieza de `TokenStore` y `SessionStore`.
 * - Proteger contra respuestas asíncronas obsoletas (p. ej. un refresh o /me que resuelve
 *   después de un logout o de un cambio de sesión).
 * - Distinguir rechazos definitivos de credenciales (400/401/403) frente a fallos
 *   transitorios de red o servidor (0, 5xx) para no destruir sesiones válidas por cortes de red.
 */
@Injectable({ providedIn: 'root' })
export class AuthClient {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenStore);
  private readonly session = inject(SessionStore);
  private readonly authBaseUrl = `${environment.apiUrl.replace(/\/+$/, '')}/auth`;

  /**
   * Promesa en vuelo para garantizar single-flight en `refresh()` y la época
   * en la que fue iniciada.
   */
  private refreshInFlight: { promise: Promise<RefreshResponse>; epoch: number } | null = null;

  /**
   * Promesa en vuelo para evitar llamadas redundantes simultáneas a `me()` / `hydrate()`.
   */
  private meInFlight: { promise: Promise<MeResponse>; epoch: number } | null = null;

  /**
   * Inicia sesión con correo y contraseña.
   * Limpia cualquier sesión previa para evitar mezcla de tokens/perfiles si el intento falla,
   * guarda access_token y refresh_token en `TokenStore` y publica inmediatamente el
   * `user` devuelto por el backend en `SessionStore` sin realizar una llamada extra a `/auth/me`.
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    // Limpiar sesión previa e incrementar época al iniciar un nuevo flujo de login:
    // 1) Invalida cualquier refresh/me/logout previo en vuelo.
    // 2) Evita dejar una sesión anterior a medias o mezclada si este login falla.
    this.session.clear();
    const loginEpoch = this.session.currentEpoch;
    this.refreshInFlight = null;
    this.meInFlight = null;

    const res = await firstValueFrom(
      this.http.post<LoginResponse>(`${this.authBaseUrl}/login`, { email, password })
    );

    // Si durante el await de login ocurrió un logout u otro login, descartar respuesta obsoleta
    if (this.session.currentEpoch !== loginEpoch) {
      throw new Error('Operación de inicio de sesión cancelada por cambio de estado de sesión.');
    }

    this.tokens.set(res?.access_token, res?.refresh_token);
    this.session.setUser(res?.user ?? null);
    this.session.setError(null);
    return res;
  }

  /**
   * Renueva el par de tokens usando el `refresh_token` rotatorio actual.
   *
   * Garantías:
   * - Single-flight: llamadas concurrentes comparten una única petición `POST /auth/refresh`.
   * - Protección contra respuestas tardías: si ocurre `logout()` o un nuevo `login()` mientras
   *   el refresh está en vuelo, la respuesta tardía se descarta y nunca restaura tokens ni perfil.
   * - Diferenciación de errores: solo invalida la sesión local ante rechazo explícito del
   *   servidor (400/401/403), preservando los tokens ante errores transitorios de red (status 0 / 5xx).
   */
  refresh(): Promise<RefreshResponse> {
    const currentEpoch = this.session.currentEpoch;

    if (this.refreshInFlight && this.refreshInFlight.epoch === currentEpoch) {
      return this.refreshInFlight.promise;
    }

    const promise = this.executeRefresh(currentEpoch).finally(() => {
      if (this.refreshInFlight?.promise === promise) {
        this.refreshInFlight = null;
      }
    });

    this.refreshInFlight = { promise, epoch: currentEpoch };
    return promise;
  }

  /**
   * Consulta `GET /auth/me` en el backend (con `X-Skip-Loader: 1`) y sincroniza el perfil
   * en `SessionStore` únicamente si la respuesta sigue correspondiendo a la sesión activa.
   *
   * Nota: El contenido del JWT decodificado en cliente nunca sustituye esta validación del backend.
   */
  me(): Promise<MeResponse> {
    const currentEpoch = this.session.currentEpoch;

    if (this.meInFlight && this.meInFlight.epoch === currentEpoch) {
      return this.meInFlight.promise;
    }

    const promise = this.executeMe(currentEpoch).finally(() => {
      if (this.meInFlight?.promise === promise) {
        this.meInFlight = null;
      }
    });

    this.meInFlight = { promise, epoch: currentEpoch };
    return promise;
  }

  /**
   * Coordina la hidratación reactiva del perfil de usuario en `SessionStore` usando `/auth/me`.
   * Evita peticiones duplicadas si ya existe un usuario verificado en la sesión activa o si
   * hay una hidratación en curso.
   */
  async hydrateSession(force = false): Promise<void> {
    if (!this.tokens.access && !this.tokens.refresh) {
      return;
    }
    if (!force && this.session.isHydrated && this.session.currentUser) {
      return;
    }
    await this.me();
  }

  /**
   * Cierra la sesión actual:
   * - Limpia sincrónicamente `TokenStore` y `SessionStore` e incrementa la época de sesión
   *   antes del `await` de red para que cualquier `refresh()` o `me()` pendiente quede invalidado
   *   y ningún `finally` tardío pueda borrar una sesión nueva iniciada posteriormente.
   * - Solicita al backend revocar el `refresh_token` capturado (`POST /auth/logout`).
   */
  async logout(): Promise<void> {
    const refreshTokenToRevoke = this.tokens.refresh;

    // Limpieza sincrónica inmediata: incrementa epoch, borra tokens y perfil local
    this.session.clear();
    const logoutEpoch = this.session.currentEpoch;
    this.refreshInFlight = null;
    this.meInFlight = null;

    try {
      if (refreshTokenToRevoke) {
        await firstValueFrom(
          this.http.post<{ ok: boolean }>(`${this.authBaseUrl}/logout`, {
            refresh_token: refreshTokenToRevoke,
          })
        );
      }
    } catch {
      // Ignoramos errores de red o backend al cerrar sesión; la limpieza local ya se aplicó
    } finally {
      // Solo aseguramos limpieza si no se inició ninguna sesión nueva durante el await HTTP
      if (this.session.currentEpoch === logoutEpoch) {
        this.tokens.clear();
        this.session.setUser(null);
        this.session.setLoading(false);
        this.session.setError(null);
      }
    }
  }

  private async executeRefresh(expectedEpoch: number): Promise<RefreshResponse> {
    const refreshToken = this.tokens.refresh;
    if (!refreshToken) {
      this.session.clear();
      throw new Error('No existe refresh_token disponible.');
    }

    try {
      const res = await firstValueFrom(
        this.http.post<RefreshResponse>(
          `${this.authBaseUrl}/refresh`,
          { refresh_token: refreshToken },
          { headers: SKIP_LOADER_HEADERS }
        )
      );

      // Verificar que la sesión no haya sido cerrada o reemplazada ni el refresh token cambiado
      if (this.session.currentEpoch !== expectedEpoch || this.tokens.refresh !== refreshToken) {
        throw new Error('Respuesta de refresh descartada por cambio o cierre de sesión.');
      }

      this.tokens.set(res?.access_token, res?.refresh_token);
      if (res?.user) {
        this.session.setUser(res.user);
      }
      this.session.setError(null);
      return res;
    } catch (err: unknown) {
      // Solo invalidamos la sesión si sigue siendo la misma época y el servidor rechazó el token
      if (this.session.currentEpoch === expectedEpoch && this.isDefinitiveAuthRejection(err)) {
        this.session.clear();
      }
      throw err;
    }
  }

  private async executeMe(expectedEpoch: number): Promise<MeResponse> {
    const accessSnapshot = this.tokens.access;
    this.session.setLoading(true);
    this.session.setError(null);

    try {
      const res = await firstValueFrom(
        this.http.get<MeResponse>(`${this.authBaseUrl}/me`, {
          headers: SKIP_LOADER_HEADERS,
        })
      );

      // No publicar el perfil si la sesión cambió o se cerró mientras `/auth/me` estaba en vuelo
      if (
        this.session.currentEpoch !== expectedEpoch ||
        !this.tokens.access ||
        (accessSnapshot !== null && this.tokens.access !== accessSnapshot)
      ) {
        throw new Error('Respuesta de /auth/me descartada por cambio o cierre de sesión.');
      }

      this.session.setUser(res?.profile ?? null);
      return res;
    } catch (err: unknown) {
      if (this.session.currentEpoch === expectedEpoch) {
        const message = this.extractErrorMessage(err, 'No se pudo obtener el perfil de sesión');
        this.session.setError(message);
      }
      throw err;
    } finally {
      if (this.session.currentEpoch === expectedEpoch) {
        this.session.setLoading(false);
      }
    }
  }

  /**
   * Determina si el error proviene de un rechazo definitivo de credenciales/token en el servidor
   * (400 Bad Request por falta de token, 401 Unauthorized por token inválido/expirado/usado,
   * o 403 Forbidden), distinguiéndolo de errores de red (status 0) o caídas temporales (5xx).
   */
  private isDefinitiveAuthRejection(err: unknown): boolean {
    if (err instanceof HttpErrorResponse) {
      return err.status === 400 || err.status === 401 || err.status === 403;
    }
    if (typeof err === 'object' && err !== null && 'status' in err) {
      const status = (err as { status?: unknown }).status;
      return status === 400 || status === 401 || status === 403;
    }
    return false;
  }

  private extractErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const serverError =
        typeof err.error === 'object' && err.error !== null && 'error' in err.error
          ? (err.error as { error?: unknown }).error
          : undefined;
      if (typeof serverError === 'string' && serverError.trim().length > 0) {
        return serverError;
      }
      if (typeof err.message === 'string' && err.message.trim().length > 0) {
        return err.message;
      }
    } else if (err instanceof Error && err.message.trim().length > 0) {
      return err.message;
    }
    return fallback;
  }
}
