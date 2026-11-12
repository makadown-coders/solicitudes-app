import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AuthClient } from './auth-client.service';
import { LoginResponse, MeResponse, RefreshResponse, UserProfile } from './auth.models';
import { SessionStore } from './session-store.service';
import { TokenStore } from './token-store.service';

function buildJwtWithExp(expSeconds: number): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub: 'u-1', exp: expSeconds }));
  return `${header}.${payload}.sig`;
}

describe('AuthClient & SessionStore Concurrency and Session Safety', () => {
  let authClient: AuthClient;
  let sessionStore: SessionStore;
  let tokenStore: TokenStore;
  let httpMock: HttpTestingController;
  const authBase = `${environment.apiUrl.replace(/\/+$/, '')}/auth`;

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
    roles: [{ code: 'OPER_TIC', scope: 'UNIDAD', id: '10' }],
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), TokenStore, SessionStore, AuthClient],
    });

    tokenStore = TestBed.inject(TokenStore);
    sessionStore = TestBed.inject(SessionStore);
    authClient = TestBed.inject(AuthClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('Escenario A: logout de sesión A pendiente no debe borrar la nueva sesión B al finalizar', async () => {
    // 1. Sesión A activa
    tokenStore.set('at-a', 'rt-a');
    sessionStore.setUser(userA);

    // 2. Comienza logout() de A (queda pendiente en red)
    const logoutPromise = authClient.logout();

    // Inmediatamente al iniciar logout, la sesión A local ya debe haberse limpiado
    expect(tokenStore.access).toBeNull();
    expect(tokenStore.refresh).toBeNull();
    expect(sessionStore.currentUser).toBeNull();

    const logoutReq = httpMock.expectOne(`${authBase}/logout`);
    expect(logoutReq.request.body).toEqual({ refresh_token: 'rt-a' });

    // 3. Mientras el logout HTTP de A sigue en vuelo, comienza y finaliza login() de B
    const loginPromiseB = authClient.login('b@imssb.gob.mx', 'secret-b');
    const loginReqB = httpMock.expectOne(`${authBase}/login`);
    const loginResB: LoginResponse = {
      access_token: 'at-b',
      refresh_token: 'rt-b',
      user: userB,
    };
    loginReqB.flush(loginResB);
    await loginPromiseB;

    expect(tokenStore.access).toBe('at-b');
    expect(tokenStore.refresh).toBe('rt-b');
    expect(sessionStore.currentUser).toEqual(userB);

    // 4. Finaliza tardíamente el logout HTTP de A
    logoutReq.flush({ ok: true });
    await logoutPromise;

    // Resultado requerido: La sesión B permanece intacta
    expect(tokenStore.access).toBe('at-b');
    expect(tokenStore.refresh).toBe('rt-b');
    expect(sessionStore.currentUser).toEqual(userB);
  });

  it('Escenario B: dos logins concurrentes (responde B primero y A después) conservan únicamente B', async () => {
    const loginPromiseA = authClient.login('a@imssb.gob.mx', 'pass-a');
    const loginPromiseB = authClient.login('b@imssb.gob.mx', 'pass-b');

    const loginReqs = httpMock.match(`${authBase}/login`);
    expect(loginReqs.length).toBe(2);

    // Responde primero B
    loginReqs[1].flush({
      access_token: 'at-b',
      refresh_token: 'rt-b',
      user: userB,
    } satisfies LoginResponse);

    await loginPromiseB;
    expect(sessionStore.currentUser).toEqual(userB);
    expect(tokenStore.access).toBe('at-b');

    // Responde después A (obsoleto)
    loginReqs[0].flush({
      access_token: 'at-a',
      refresh_token: 'rt-a',
      user: userA,
    } satisfies LoginResponse);

    await expectAsync(loginPromiseA).toBeRejected();

    // Resultado requerido: Solo B permanece activo
    expect(sessionStore.currentUser).toEqual(userB);
    expect(tokenStore.access).toBe('at-b');
    expect(tokenStore.refresh).toBe('rt-b');
  });

  it('Escenario C: refresh en vuelo seguido de logout no debe restaurar tokens ni perfil', async () => {
    tokenStore.set('at-a-old', 'rt-a-old');
    sessionStore.setUser(userA);

    const refreshPromise = authClient.refresh();
    const refreshReq = httpMock.expectOne(`${authBase}/refresh`);
    expect(refreshReq.request.headers.get('X-Skip-Loader')).toBe('1');

    // El usuario cierra sesión mientras el refresh está en vuelo
    const logoutPromise = authClient.logout();
    const logoutReq = httpMock.expectOne(`${authBase}/logout`);
    logoutReq.flush({ ok: true });
    await logoutPromise;

    // Ahora responde el refresh anterior con nuevos tokens
    refreshReq.flush({
      access_token: 'at-a-new',
      refresh_token: 'rt-a-new',
      user: userA,
    } satisfies RefreshResponse);

    await expectAsync(refreshPromise).toBeRejected();

    // Resultado requerido: No se restauran tokens ni perfil
    expect(tokenStore.access).toBeNull();
    expect(tokenStore.refresh).toBeNull();
    expect(sessionStore.currentUser).toBeNull();
  });

  it('Escenario D: refresh de A seguido de login de B no debe sobrescribir la sesión B', async () => {
    tokenStore.set('at-a-old', 'rt-a-old');
    sessionStore.setUser(userA);

    const refreshPromiseA = authClient.refresh();
    const refreshReqA = httpMock.expectOne(`${authBase}/refresh`);

    // Comienza y completa login de B
    const loginPromiseB = authClient.login('b@imssb.gob.mx', 'pass-b');
    const loginReqB = httpMock.expectOne(`${authBase}/login`);
    loginReqB.flush({
      access_token: 'at-b',
      refresh_token: 'rt-b',
      user: userB,
    } satisfies LoginResponse);
    await loginPromiseB;

    // Responde tardíamente el refresh de A
    refreshReqA.flush({
      access_token: 'at-a-new',
      refresh_token: 'rt-a-new',
      user: userA,
    } satisfies RefreshResponse);

    await expectAsync(refreshPromiseA).toBeRejected();

    expect(tokenStore.access).toBe('at-b');
    expect(tokenStore.refresh).toBe('rt-b');
    expect(sessionStore.currentUser).toEqual(userB);
  });

  it('Escenario E: llamadas concurrentes a refresh producen una sola petición HTTP y comparten resultado', async () => {
    tokenStore.set('at-old', 'rt-old');

    const p1 = authClient.refresh();
    const p2 = authClient.refresh();

    const reqs = httpMock.match(`${authBase}/refresh`);
    expect(reqs.length).toBe(1);

    const refreshRes: RefreshResponse = {
      access_token: 'at-new',
      refresh_token: 'rt-new',
      user: userA,
    };
    reqs[0].flush(refreshRes);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(refreshRes);
    expect(r2).toEqual(refreshRes);
    expect(tokenStore.access).toBe('at-new');
    expect(tokenStore.refresh).toBe('rt-new');
    expect(sessionStore.currentUser).toEqual(userA);
  });

  it('Escenario F: respuesta tardía de /auth/me no publica perfil de una sesión anterior', async () => {
    tokenStore.set('at-a', 'rt-a');

    const hydratePromise = sessionStore.hydrate();
    const meReq = httpMock.expectOne(`${authBase}/me`);
    expect(meReq.request.headers.get('X-Skip-Loader')).toBe('1');

    // Se cierra la sesión antes de que /auth/me responda
    sessionStore.clear();

    meReq.flush({
      auth_user_id: userA.id,
      email: userA.email,
      profile: userA,
    } satisfies MeResponse);

    const result = await hydratePromise;
    expect(result).toBeNull();
    expect(sessionStore.currentUser).toBeNull();
  });

  it('Escenario G: error transitorio de red en refresh conserva tokens; error 401 limpia sesión', async () => {
    tokenStore.set('at-valid', 'rt-valid');
    sessionStore.setUser(userA);

    // 1) Fallo de red (status 0)
    const netPromise = authClient.refresh();
    const netReq = httpMock.expectOne(`${authBase}/refresh`);
    netReq.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    await expectAsync(netPromise).toBeRejected();
    expect(tokenStore.refresh).toBe('rt-valid');
    expect(sessionStore.currentUser).toEqual(userA);

    // 2) Rechazo definitivo 401 del servidor
    const authFailPromise = authClient.refresh();
    const authFailReq = httpMock.expectOne(`${authBase}/refresh`);
    authFailReq.flush({ error: 'expired refresh' }, { status: 401, statusText: 'Unauthorized' });

    await expectAsync(authFailPromise).toBeRejected();
    expect(tokenStore.access).toBeNull();
    expect(tokenStore.refresh).toBeNull();
    expect(sessionStore.currentUser).toBeNull();
  });

  it('Escenario H: un intento de login fallido limpia cualquier sesión previa sin mezclar estados', async () => {
    tokenStore.set('at-a', 'rt-a');
    sessionStore.setUser(userA);

    const failedLogin = authClient.login('b@imssb.gob.mx', 'wrong-pass');
    const req = httpMock.expectOne(`${authBase}/login`);
    req.flush({ error: 'Invalid credentials' }, { status: 401, statusText: 'Unauthorized' });

    await expectAsync(failedLogin).toBeRejected();

    expect(tokenStore.access).toBeNull();
    expect(tokenStore.refresh).toBeNull();
    expect(sessionStore.currentUser).toBeNull();
    expect(sessionStore.isHydrated).toBeFalse();
  });

  it('TokenStore valida expiración y tokens malformados defensivamente', () => {
    expect(tokenStore.hasValidAccessToken()).toBeFalse();
    expect(tokenStore.getAccessRemainingSeconds()).toBe(0);

    tokenStore.set('malformed.token', 'rt');
    expect(tokenStore.hasValidAccessToken()).toBeFalse();

    const nowSec = Math.floor(Date.now() / 1000);
    tokenStore.set(buildJwtWithExp(nowSec - 10), 'rt');
    expect(tokenStore.hasValidAccessToken()).toBeFalse();

    tokenStore.set(buildJwtWithExp(nowSec + 600), 'rt');
    expect(tokenStore.hasValidAccessToken()).toBeTrue();
    expect(tokenStore.getAccessRemainingSeconds()).toBeGreaterThan(500);
  });
});
