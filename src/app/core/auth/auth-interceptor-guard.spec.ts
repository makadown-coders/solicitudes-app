import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthClient } from './auth-client.service';
import { authGuard } from './auth.guard';
import { authInterceptor } from './auth.interceptor';
import { LoginResponse, MeResponse, RefreshResponse, UserProfile } from './auth.models';
import { SessionStore } from './session-store.service';
import { TokenStore } from './token-store.service';

function buildJwtWithExp(expSeconds: number, sub = 'u-1'): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub, exp: expSeconds }));
  return `${header}.${payload}.sig`;
}

describe('authInterceptor & authGuard (Microintervención 3)', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let tokenStore: TokenStore;
  let sessionStore: SessionStore;
  let authClient: AuthClient;
  let router: Router;

  const apiBase = environment.apiUrl.replace(/\/+$/, '');
  const authBase = `${apiBase}/auth`;

  const userA: UserProfile = {
    id: 'user-a',
    email: 'a@imssb.gob.mx',
    name: 'Usuario A',
    roles: [{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }],
  };

  const userB: UserProfile = {
    id: 'user-b',
    email: 'b@imssb.gob.mx',
    name: 'Usuario B',
    roles: [{ code: 'OPER_TIC', scope: 'UNIDAD', id: '12' }],
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        TokenStore,
        SessionStore,
        AuthClient,
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    tokenStore = TestBed.inject(TokenStore);
    sessionStore = TestBed.inject(SessionStore);
    authClient = TestBed.inject(AuthClient);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  // =========================================================================
  // PRUEBAS DE SELECCIÓN DE ENDPOINTS Y LISTA BLANCA (Casos 1 a 7)
  // =========================================================================

  it('1. Endpoint público de Abasto (/api/radar-abasto, /api/inventario, /api/catalogos, /api/unidades): NO recibe Bearer', async () => {
    const validToken = buildJwtWithExp(Math.floor(Date.now() / 1000) + 600);
    tokenStore.set(validToken, 'rt-1');

    const pRadar = firstValueFrom(http.get(`${apiBase}/radar-abasto/v2/resumen`));
    const pCatalogos = firstValueFrom(http.get(`${apiBase}/catalogos/municipios`));
    const pUnidades = firstValueFrom(http.get(`${apiBase}/unidades`));
    const pFalsoPrefijo = firstValueFrom(http.get(`${apiBase}/dispositivos-publicos`));

    const reqRadar = httpMock.expectOne(`${apiBase}/radar-abasto/v2/resumen`);
    const reqCat = httpMock.expectOne(`${apiBase}/catalogos/municipios`);
    const reqUni = httpMock.expectOne(`${apiBase}/unidades`);
    const reqFalso = httpMock.expectOne(`${apiBase}/dispositivos-publicos`);

    expect(reqRadar.request.headers.has('Authorization')).toBeFalse();
    expect(reqCat.request.headers.has('Authorization')).toBeFalse();
    expect(reqUni.request.headers.has('Authorization')).toBeFalse();
    expect(reqFalso.request.headers.has('Authorization')).toBeFalse();

    reqRadar.flush({ ok: true });
    reqCat.flush([]);
    reqUni.flush([]);
    reqFalso.flush([]);

    await Promise.all([pRadar, pCatalogos, pUnidades, pFalsoPrefijo]);
  });

  it('2. Endpoint público IB-ONCO (/api/ib-onco): NO recibe Bearer', async () => {
    const validToken = buildJwtWithExp(Math.floor(Date.now() / 1000) + 600);
    tokenStore.set(validToken, 'rt-1');

    const p = firstValueFrom(http.get(`${apiBase}/ib-onco/resumen`));
    const req = httpMock.expectOne(`${apiBase}/ib-onco/resumen`);
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({ items: [] });
    await p;
  });

  it('3. API externa (incluyendo engaños con /api/ti en query o dominio similar): NO recibe Bearer', async () => {
    const validToken = buildJwtWithExp(Math.floor(Date.now() / 1000) + 600);
    tokenStore.set(validToken, 'rt-1');

    const extUrl1 = 'https://api.externa.gob.mx/api/ti/personas';
    const extUrl2 = 'https://otro-sitio.com/search?redirect=/api/ti/unidades';

    const p1 = firstValueFrom(http.get(extUrl1));
    const p2 = firstValueFrom(http.get(extUrl2));

    const req1 = httpMock.expectOne(extUrl1);
    const req2 = httpMock.expectOne(extUrl2);

    expect(req1.request.headers.has('Authorization')).toBeFalse();
    expect(req2.request.headers.has('Authorization')).toBeFalse();

    req1.flush({});
    req2.flush({});
    await Promise.all([p1, p2]);
  });

  it('4. /auth/login: NO recibe Bearer ni dispara refresh automático ante 401', async () => {
    tokenStore.set('old-access', 'old-refresh');

    const loginPromise = authClient.login('user@imssb.gob.mx', 'bad-password');
    const req = httpMock.expectOne(`${authBase}/login`);

    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({ error: 'Invalid credentials' }, { status: 401, statusText: 'Unauthorized' });

    await expectAsync(loginPromise).toBeRejected();
    // Verificar que no se intentó ningún /auth/refresh
    httpMock.expectNone(`${authBase}/refresh`);
  });

  it('5. /auth/refresh: NO recibe Bearer ni dispara refresh recursivo ante 401', async () => {
    tokenStore.set('expired-access', 'invalid-refresh');

    const refreshPromise = authClient.refresh();
    const req = httpMock.expectOne(`${authBase}/refresh`);

    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({ error: 'invalid refresh' }, { status: 401, statusText: 'Unauthorized' });

    await expectAsync(refreshPromise).toBeRejected();
    // No debe haber un segundo intento recursivo a /auth/refresh
    httpMock.expectNone(`${authBase}/refresh`);
  });

  it('6. GET /auth/me: recibe Authorization Bearer cuando existe access token', async () => {
    const validToken = buildJwtWithExp(Math.floor(Date.now() / 1000) + 600);
    tokenStore.set(validToken, 'rt-1');

    const mePromise = authClient.me();
    const req = httpMock.expectOne(`${authBase}/me`);

    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${validToken}`);
    expect(req.request.headers.get('X-Skip-Loader')).toBe('1');

    req.flush({
      auth_user_id: userA.id,
      email: userA.email,
      profile: userA,
    } satisfies MeResponse);

    const res = await mePromise;
    expect(res.profile).toEqual(userA);
  });

  it('7. Endpoints protegidos (/ti/*, /dispositivos, /rh/*) con token válido: reciben Bearer', async () => {
    const validToken = buildJwtWithExp(Math.floor(Date.now() / 1000) + 600);
    tokenStore.set(validToken, 'rt-1');

    const pTi = firstValueFrom(http.get(`${apiBase}/ti/unidades`));
    const pDisp = firstValueFrom(http.get(`${apiBase}/dispositivos`));
    const pDispSub = firstValueFrom(http.get(`${apiBase}/dispositivos/42/asignaciones`));
    const pRh = firstValueFrom(http.get(`${apiBase}/rh/plantilla`));

    const reqTi = httpMock.expectOne(`${apiBase}/ti/unidades`);
    const reqDisp = httpMock.expectOne(`${apiBase}/dispositivos`);
    const reqDispSub = httpMock.expectOne(`${apiBase}/dispositivos/42/asignaciones`);
    const reqRh = httpMock.expectOne(`${apiBase}/rh/plantilla`);

    expect(reqTi.request.headers.get('Authorization')).toBe(`Bearer ${validToken}`);
    expect(reqDisp.request.headers.get('Authorization')).toBe(`Bearer ${validToken}`);
    expect(reqDispSub.request.headers.get('Authorization')).toBe(`Bearer ${validToken}`);
    expect(reqRh.request.headers.get('Authorization')).toBe(`Bearer ${validToken}`);

    reqTi.flush({ items: [] });
    reqDisp.flush({ items: [] });
    reqDispSub.flush({ items: [] });
    reqRh.flush({ items: [] });

    await Promise.all([pTi, pDisp, pDispSub, pRh]);
  });

  // =========================================================================
  // PRUEBAS DE REFRESH, CONCURRENCIA Y MANEJO DE ERRORES (Casos 8 a 11 y 15)
  // =========================================================================

  it('8. Endpoint protegido responde 401: ejecuta un refresh y exactamente un reintento con el nuevo token', async () => {
    tokenStore.set('expired-at', 'valid-rt');

    const reqPromise = firstValueFrom(http.get<{ ok: boolean }>(`${apiBase}/rh/resumen`));

    // Primer intento falla con 401
    const initialReq = httpMock.expectOne(`${apiBase}/rh/resumen`);
    expect(initialReq.request.headers.get('Authorization')).toBe('Bearer expired-at');
    initialReq.flush({ error: 'Invalid/expired token' }, { status: 401, statusText: 'Unauthorized' });

    // Se dispara POST /auth/refresh
    const newAt = buildJwtWithExp(Math.floor(Date.now() / 1000) + 900);
    const refreshReq = httpMock.expectOne(`${authBase}/refresh`);
    expect(refreshReq.request.body).toEqual({ refresh_token: 'valid-rt' });
    refreshReq.flush({
      access_token: newAt,
      refresh_token: 'new-rt',
      user: userA,
    } satisfies RefreshResponse);

    // Esperar a que resuelva la cadena de promesas de executeRefresh -> refresh().finally -> from()
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    // Segundo intento con el nuevo token
    const retriedReq = httpMock.expectOne(`${apiBase}/rh/resumen`);
    expect(retriedReq.request.headers.get('Authorization')).toBe(`Bearer ${newAt}`);
    retriedReq.flush({ ok: true });

    const result = await reqPromise;
    expect(result).toEqual({ ok: true });
  });

  it('9. Dos endpoints protegidos responden 401 simultáneamente: producen una sola solicitud de refresh', async () => {
    tokenStore.set('expired-at', 'shared-rt');

    const p1 = firstValueFrom(http.get<{ id: number }>(`${apiBase}/ti/personas`));
    const p2 = firstValueFrom(http.get<{ id: number }>(`${apiBase}/dispositivos`));

    const req1 = httpMock.expectOne(`${apiBase}/ti/personas`);
    const req2 = httpMock.expectOne(`${apiBase}/dispositivos`);

    req1.flush({ error: 'expired' }, { status: 401, statusText: 'Unauthorized' });
    req2.flush({ error: 'expired' }, { status: 401, statusText: 'Unauthorized' });

    // Debe existir únicamente 1 llamada a /auth/refresh
    const refreshReqs = httpMock.match(`${authBase}/refresh`);
    expect(refreshReqs.length).toBe(1);

    const newAt = buildJwtWithExp(Math.floor(Date.now() / 1000) + 900);
    refreshReqs[0].flush({
      access_token: newAt,
      refresh_token: 'new-shared-rt',
      user: userA,
    } satisfies RefreshResponse);

    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const retry1 = httpMock.expectOne(`${apiBase}/ti/personas`);
    const retry2 = httpMock.expectOne(`${apiBase}/dispositivos`);
    expect(retry1.request.headers.get('Authorization')).toBe(`Bearer ${newAt}`);
    expect(retry2.request.headers.get('Authorization')).toBe(`Bearer ${newAt}`);

    retry1.flush({ id: 1 });
    retry2.flush({ id: 2 });

    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res1).toEqual({ id: 1 });
    expect(res2).toEqual({ id: 2 });
  });

  it('10. Refresh rechazado (o reintento vuelve a dar 401): no hay reintentos infinitos y limpia sesión', async () => {
    tokenStore.set('expired-at', 'revoked-rt');

    const p = firstValueFrom(http.get(`${apiBase}/rh/datos`));
    const req = httpMock.expectOne(`${apiBase}/rh/datos`);
    req.flush({ error: 'expired' }, { status: 401, statusText: 'Unauthorized' });

    const refreshReq = httpMock.expectOne(`${authBase}/refresh`);
    refreshReq.flush({ error: 'invalid refresh' }, { status: 401, statusText: 'Unauthorized' });

    await expectAsync(p).toBeRejected();
    expect(tokenStore.access).toBeNull();
    expect(tokenStore.refresh).toBeNull();
    httpMock.expectNone(`${apiBase}/rh/datos`);
    httpMock.expectNone(`${authBase}/refresh`);
  });

  it('11. Endpoint protegido devuelve 403 Forbidden: NO se ejecuta refresh ni se borra la sesión', async () => {
    const validAt = buildJwtWithExp(Math.floor(Date.now() / 1000) + 600);
    tokenStore.set(validAt, 'valid-rt');
    sessionStore.setUser(userA);

    const p = firstValueFrom(http.delete(`${apiBase}/ti/personas/99`));
    const req = httpMock.expectOne(`${apiBase}/ti/personas/99`);
    req.flush({ error: 'Permiso insuficiente' }, { status: 403, statusText: 'Forbidden' });

    let caughtError: unknown = null;
    try {
      await p;
    } catch (err) {
      caughtError = err;
    }
    expect(caughtError instanceof HttpErrorResponse).toBeTrue();
    expect((caughtError as HttpErrorResponse).status).toBe(403);

    httpMock.expectNone(`${authBase}/refresh`);
    expect(tokenStore.access).toBe(validAt);
    expect(sessionStore.currentUser).toEqual(userA);
  });

  it('15. Logout o cambio de sesión a usuario B durante un 401 pendiente de A: NO reintenta la petición de A con credenciales de B', async () => {
    tokenStore.set('at-a-expired', 'rt-a');
    sessionStore.setUser(userA);

    const requestAPromise = firstValueFrom(http.get(`${apiBase}/rh/nomina`));
    const reqA = httpMock.expectOne(`${apiBase}/rh/nomina`);
    expect(reqA.request.headers.get('Authorization')).toBe('Bearer at-a-expired');

    // Falla con 401 y comienza el refresh de A
    reqA.flush({ error: 'expired' }, { status: 401, statusText: 'Unauthorized' });
    const refreshReqA = httpMock.expectOne(`${authBase}/refresh`);

    // Mientras el refresh de A está en vuelo, inicia sesión el usuario B
    const loginBPromise = authClient.login('b@imssb.gob.mx', 'pass-b');
    const loginReqB = httpMock.expectOne(`${authBase}/login`);
    const atB = buildJwtWithExp(Math.floor(Date.now() / 1000) + 900, 'user-b');
    loginReqB.flush({
      access_token: atB,
      refresh_token: 'rt-b',
      user: userB,
    } satisfies LoginResponse);
    await loginBPromise;

    // Ahora responde el refresh antiguo de A
    refreshReqA.flush({
      access_token: 'at-a-renewed',
      refresh_token: 'rt-a-renewed',
      user: userA,
    } satisfies RefreshResponse);

    await expectAsync(requestAPromise).toBeRejected();

    // No debe haberse disparado un segundo GET /rh/nomina con el token de B ni con el de A
    httpMock.expectNone(`${apiBase}/rh/nomina`);
    expect(sessionStore.currentUser).toEqual(userB);
    expect(tokenStore.access).toBe(atB);
  });

  // =========================================================================
  // PRUEBAS DE AUTHGUARD (Casos 12, 13 y 14 + Fallos de red)
  // =========================================================================

  function runAuthGuard(url: string): Promise<boolean | UrlTree> {
    const dummyRoute = {} as ActivatedRouteSnapshot;
    const dummyState = { url } as RouterStateSnapshot;
    return TestBed.runInInjectionContext(() =>
      authGuard(dummyRoute, dummyState) as Promise<boolean | UrlTree>
    );
  }

  it('12. Ruta /rh sin sesión: devuelve UrlTree hacia /login?returnUrl=/rh', async () => {
    const result = await runAuthGuard('/rh');

    expect(result instanceof UrlTree).toBeTrue();
    expect(router.serializeUrl(result as UrlTree)).toBe('/login?returnUrl=%2Frh');
  });

  it('13. Ruta /rh con access expirado y refresh válido: recupera sesión mediante refresh y permite acceso', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const expiredAt = buildJwtWithExp(nowSec - 60);
    const freshAt = buildJwtWithExp(nowSec + 900);
    tokenStore.set(expiredAt, 'valid-rt');

    const guardPromise = runAuthGuard('/rh?tab=asistencia');

    const refreshReq = httpMock.expectOne(`${authBase}/refresh`);
    expect(refreshReq.request.body).toEqual({ refresh_token: 'valid-rt' });
    refreshReq.flush({
      access_token: freshAt,
      refresh_token: 'rotated-rt',
      user: userA,
    } satisfies RefreshResponse);

    const result = await guardPromise;
    expect(result).toBeTrue();
    expect(sessionStore.currentUser).toEqual(userA);
    expect(tokenStore.access).toBe(freshAt);
  });

  it('14. Ruta /rh con token persistido válido pero sesión sin hidratar: verifica /auth/me antes de permitir acceso', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const validAt = buildJwtWithExp(nowSec + 600);
    tokenStore.set(validAt, 'valid-rt');
    // Simulamos recarga de navegador (F5): hay token en localStorage pero SessionStore no está hidratado
    expect(sessionStore.isHydrated).toBeFalse();
    expect(sessionStore.currentUser).toBeNull();

    const guardPromise = runAuthGuard('/rh');

    const meReq = httpMock.expectOne(`${authBase}/me`);
    expect(meReq.request.headers.get('Authorization')).toBe(`Bearer ${validAt}`);
    meReq.flush({
      auth_user_id: userA.id,
      email: userA.email,
      profile: userA,
    } satisfies MeResponse);

    const result = await guardPromise;
    expect(result).toBeTrue();
    expect(sessionStore.isHydrated).toBeTrue();
    expect(sessionStore.currentUser).toEqual(userA);
  });

  it('14b. Ruta /rh cuando /auth/me falla por error de red transitorio: NO borra tokens pero bloquea acceso devolviendo UrlTree', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const validAt = buildJwtWithExp(nowSec + 600);
    tokenStore.set(validAt, 'valid-rt');

    const guardPromise = runAuthGuard('/rh');

    const meReq = httpMock.expectOne(`${authBase}/me`);
    meReq.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    const result = await guardPromise;
    expect(result instanceof UrlTree).toBeTrue();
    expect(router.serializeUrl(result as UrlTree)).toBe('/login?returnUrl=%2Frh');
    // Los tokens se conservan porque fue fallo de red transitorio, no rechazo 401
    expect(tokenStore.access).toBe(validAt);
    expect(tokenStore.refresh).toBe('valid-rt');
  });
});
