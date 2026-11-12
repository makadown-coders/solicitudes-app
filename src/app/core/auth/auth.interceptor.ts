import {
  HttpContextToken,
  HttpErrorResponse,
  HttpEvent,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { from, Observable, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthClient } from './auth-client.service';
import { SessionStore } from './session-store.service';
import { TokenStore } from './token-store.service';

/**
 * Marca en `HttpContext` para garantizar como máximo un único reintento tras un refresh 401
 * y evitar cualquier posibilidad de bucle infinito.
 */
const AUTH_RETRY_ATTEMPTED = new HttpContextToken<boolean>(() => false);

interface ParsedApiBase {
  origin: string;
  basePath: string;
}

/**
 * Parsea de forma estructurada `environment.apiUrl` (p. ej. `http://localhost:3000/api`
 * o `https://xxxx.koyeb.app/api`).
 */
function parseApiBase(rawApiUrl: string): ParsedApiBase | null {
  try {
    const fallbackOrigin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost';
    const parsed = new URL(rawApiUrl, fallbackOrigin);
    const normalizedPath = parsed.pathname.replace(/\/+$/, '');
    return {
      origin: parsed.origin,
      basePath: normalizedPath,
    };
  } catch {
    return null;
  }
}

/**
 * Extrae la subruta relativa a `environment.apiUrl` únicamente si la URL de la petición:
 * 1) Es una URL válida (sin esquemas malformados ni dominios distintos).
 * 2) Coincide exactamente en `origin` con `environment.apiUrl`.
 * 3) Su `pathname` inicia exactamente con el segmento `basePath` de `environment.apiUrl`
 *    seguido de `/` (evitando falsos positivos como `/api-otra/ti` o parámetros query
 *    externos como `https://externo.com/search?q=/api/ti`).
 */
export function extractProtectedSubpath(
  requestUrl: string,
  rawApiUrl: string = environment.apiUrl
): string | null {
  if (!requestUrl || typeof requestUrl !== 'string') {
    return null;
  }

  const trimmed = requestUrl.trim();
  if (!trimmed) {
    return null;
  }

  const apiBase = parseApiBase(rawApiUrl);
  if (!apiBase) {
    return null;
  }

  try {
    let targetUrl: URL;
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) {
      // URL con esquema explícito (http:, https:, etc.)
      targetUrl = new URL(trimmed);
    } else if (trimmed.startsWith('//')) {
      // Protocol-relative URL hacia otro host
      targetUrl = new URL(`https:${trimmed}`);
    } else if (trimmed.startsWith('/')) {
      // Ruta absoluta en el mismo origen que la aplicación; solo coincide si apiBase tiene el mismo origen
      const appOrigin =
        typeof window !== 'undefined' && window.location?.origin
          ? window.location.origin
          : apiBase.origin;
      targetUrl = new URL(trimmed, appOrigin);
    } else {
      return null;
    }

    if (targetUrl.origin !== apiBase.origin) {
      return null;
    }

    const pathname = targetUrl.pathname;
    if (apiBase.basePath) {
      if (pathname !== apiBase.basePath && !pathname.startsWith(`${apiBase.basePath}/`)) {
        return null;
      }
      const subPath = pathname.slice(apiBase.basePath.length);
      return subPath.startsWith('/') ? subPath : `/${subPath}`;
    }

    return pathname.startsWith('/') ? pathname : `/${pathname}`;
  } catch {
    return null;
  }
}

/**
 * Verifica si una subruta coincide con un prefijo de segmento completo
 * (p. ej. `/dispositivos` coincide con `/dispositivos` y `/dispositivos/123`,
 * pero NO con `/dispositivos-publicos`).
 */
function matchesSegmentPrefix(subPath: string, prefix: string): boolean {
  return subPath === prefix || subPath.startsWith(`${prefix}/`);
}

/**
 * Determina si una petición HTTP pertenece a la lista blanca estricta de recursos protegidos:
 * - `GET /auth/me`
 * - `/ti` y `/ti/*`
 * - `/dispositivos` y `/dispositivos/*`
 * - `/rh` y `/rh/*`
 *
 * Quedan explícitamente excluidos `/auth/login`, `/auth/refresh`, `/auth/logout`,
 * `/catalogos/*`, `/personas/*`, `/unidades/*`, todos los endpoints públicos de Abasto,
 * IB-ONCO, Solicitudes V1/V2, Radar, Citas, Primer Nivel y APIs externas.
 */
export function isWhitelistedProtectedRequest(
  req: Pick<HttpRequest<unknown>, 'url' | 'method'>,
  rawApiUrl: string = environment.apiUrl
): boolean {
  const subPath = extractProtectedSubpath(req.url, rawApiUrl);
  if (!subPath) {
    return false;
  }

  // Excluir explícitamente endpoints públicos/transaccionales de autenticación
  if (
    subPath === '/auth/login' ||
    subPath === '/auth/refresh' ||
    subPath === '/auth/logout'
  ) {
    return false;
  }

  // 1) GET /auth/me
  if (subPath === '/auth/me') {
    return req.method.toUpperCase() === 'GET';
  }

  // 2) Prefijos administrativos protegidos por segmento completo
  return (
    matchesSegmentPrefix(subPath, '/ti') ||
    matchesSegmentPrefix(subPath, '/dispositivos') ||
    matchesSegmentPrefix(subPath, '/rh')
  );
}

/**
 * Interceptor funcional de autenticación para Angular 21 (`solicitudes-app`).
 *
 * Compatibilidad con `loaderInterceptor`:
 * - Respeta los headers existentes de la petición (incluyendo `X-Skip-Loader` usado por `AuthClient`).
 * - Puede colocarse antes de `loaderInterceptor` (`withInterceptors([authInterceptor, loaderInterceptor])`):
 *   así la petición original activa el loader, y si ocurre un `401`, el `POST /auth/refresh` interno
 *   envía `X-Skip-Loader: 1` sin provocar parpadeos ni contadores desbalanceados en `LoaderService`.
 * - No realiza redirecciones ni navegación imperativa.
 */
export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next
): Observable<HttpEvent<unknown>> => {
  if (!isWhitelistedProtectedRequest(req)) {
    return next(req);
  }

  const tokens = inject(TokenStore);
  const authClient = inject(AuthClient);
  const session = inject(SessionStore);

  // Capturamos la época de sesión y el token con el que inicia esta solicitud
  const initialEpoch = session.currentEpoch;
  const initialAccess = tokens.access;

  const outgoingReq = initialAccess
    ? req.clone({ setHeaders: { Authorization: `Bearer ${initialAccess}` } })
    : req;

  return next(outgoingReq).pipe(
    catchError((err: unknown) => {
      // Solo interceptamos errores HTTP 401 en peticiones que aún no hayan sido reintentadas
      // (403 Forbidden u otros códigos se propagan directamente sin disparar refresh)
      if (
        !(err instanceof HttpErrorResponse) ||
        err.status !== 401 ||
        req.context.get(AUTH_RETRY_ATTEMPTED)
      ) {
        return throwError(() => err);
      }

      // Si no hay refresh token o si la sesión ya cambió/cerró mientras la petición estaba en vuelo,
      // no intentamos refrescar ni reintentar con otra sesión
      if (!tokens.refresh || session.currentEpoch !== initialEpoch) {
        return throwError(() => err);
      }

      return from(authClient.refresh()).pipe(
        switchMap(() => {
          const newAccess = tokens.access;

          // Verificar que la época de sesión siga siendo la misma (sin logout ni login de otro usuario)
          // y que tengamos un access token válido y distinto al token expirado original
          if (
            session.currentEpoch !== initialEpoch ||
            !newAccess ||
            newAccess === initialAccess
          ) {
            return throwError(() => err);
          }

          const retriedReq = req.clone({
            context: req.context.set(AUTH_RETRY_ATTEMPTED, true),
            setHeaders: { Authorization: `Bearer ${newAccess}` },
          });

          return next(retriedReq);
        }),
        catchError(() => throwError(() => err))
      );
    })
  );
};
