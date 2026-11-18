import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthClient } from './auth-client.service';
import { SessionStore } from './session-store.service';
import { TokenStore } from './token-store.service';

/**
 * Sanitiza el `returnUrl` solicitado para garantizar que siempre sea una ruta interna
 * válida de la aplicación (comienza con `/` simple y no apunta a `/login`), previniendo
 * redirecciones abiertas.
 */
function normalizeReturnUrl(rawUrl: string | undefined): string {
  const candidate = (rawUrl ?? '').trim();
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) {
    return '/rh';
  }
  if (candidate === '/login' || candidate.startsWith('/login?')) {
    return '/rh';
  }
  return candidate;
}

/**
 *Construye el `UrlTree` de redirección hacia `/login` conservando `returnUrl`.
 */
function createLoginRedirectTree(router: Router, requestedUrl: string): UrlTree {
  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: normalizeReturnUrl(requestedUrl) },
  });
}

/**
 * Determina si un error HTTP corresponde a un rechazo definitivo de autenticación (401/403).
 */
function isUnauthorizedError(err: unknown): boolean {
  if (err instanceof HttpErrorResponse) {
    return err.status === 401 || err.status === 403;
  }
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const status = (err as { status?: unknown }).status;
    return status === 401 || status === 403;
  }
  return false;
}

/**
 * Guard funcional (`CanActivateFn`) para proteger exclusivamente las rutas administrativas
 * (como `/rh`).
 *
 * Comportamiento:
 * 1. Verifica vigencia temporal del `access_token` mediante `TokenStore.hasValidAccessToken()`.
 * 2. Si el `access_token` no existe o expiró pero existe `refresh_token`, ejecuta
 *    `AuthClient.refresh()` (single-flight).
 * 3. Si la sesión proviene de tokens persistidos en `localStorage` y aún no está hidratada
 *    (`!session.isHydrated || !session.currentUser`), confirma la sesión contra el backend
 *    mediante `AuthClient.me()` (y si `me()` responde 401 y hay refresh token, intenta
 *    una renovación antes de desistir).
 * 4. Solo permite activar la ruta (`return true`) cuando la sesión ha sido confirmada
 *    y la época de sesión (`currentEpoch`) no ha cambiado durante la validación.
 *
 * Diferenciación entre sesión inválida y fallo transitorio de red:
 * - **Sesión inválida (400/401/403)**: `AuthClient` o el guard limpian `SessionStore` y `TokenStore`
 *   y devuelven `UrlTree` hacia `/login?returnUrl=...`.
 * - **Sesión no verificable temporalmente por falta de conectividad (status 0 / 5xx)**:
 *   NO se borran los tokens de `TokenStore` (para que la sesión pueda recuperarse al volver
 *   la red), `SessionStore.error` conserva el diagnóstico del fallo, pero el guard NO permite
 *   activar la ruta protegida sin confirmación del servidor y redirige mediante `UrlTree` a
 *   `/login?returnUrl=...`.
 */
export const authGuard: CanActivateFn = async (_route, state): Promise<boolean | UrlTree> => {
  const tokens = inject(TokenStore);
  const authClient = inject(AuthClient);
  const session = inject(SessionStore);
  const router = inject(Router);

  const guardEpoch = session.currentEpoch;

  // 1) Asegurar un access token temporalmente vigente (o refrescar si hay refresh_token)
  if (!tokens.hasValidAccessToken()) {
    if (!tokens.refresh) {
      session.clear();
      return createLoginRedirectTree(router, state.url);
    }

    try {
      await authClient.refresh();
    } catch {
      // AuthClient.refresh() ya limpia la sesión si fue un rechazo definitivo (400/401/403)
      // y conserva tokens si fue un fallo transitorio de red. En ambos casos bloqueamos acceso.
      return createLoginRedirectTree(router, state.url);
    }

    // Si durante el refresh ocurrió un logout o cambio de sesión, abortar activación
    if (session.currentEpoch !== guardEpoch || !tokens.hasValidAccessToken()) {
      return createLoginRedirectTree(router, state.url);
    }
  }

  // 2) Si la sesión proviene de tokens persistidos y aún no ha sido confirmada por el backend,
  //    verificar contra GET /auth/me antes de permitir el acceso.
  if (!session.isHydrated || !session.currentUser) {
    try {
      await authClient.me();
    } catch (meErr: unknown) {
      if (session.currentEpoch !== guardEpoch) {
        return createLoginRedirectTree(router, state.url);
      }

      // Si /auth/me fue rechazado con 401 y tenemos refresh_token, intentamos refrescar una vez
      if (isUnauthorizedError(meErr)) {
        if (tokens.refresh) {
          try {
            await authClient.refresh();
          } catch {
            return createLoginRedirectTree(router, state.url);
          }
        } else {
          session.clear();
          return createLoginRedirectTree(router, state.url);
        }
      } else {
        // Error transitorio de red o 5xx: no borramos tokens, pero no permitimos entrar sin verificar
        return createLoginRedirectTree(router, state.url);
      }
    }
  }

  // 3) Verificación final de consistencia de época y perfil confirmado
  if (
    session.currentEpoch !== guardEpoch ||
    !tokens.hasValidAccessToken() ||
    !session.isHydrated ||
    !session.currentUser
  ) {
    return createLoginRedirectTree(router, state.url);
  }

  return true;
};
