import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { routes } from '../../app.routes';
import { LoginPageComponent } from '../../features/auth/login/login-page.component';
import { RhShellComponent } from '../../features/rh/rh-shell.component';
import { LoaderService } from '../../services/loader.service';
import { loaderInterceptor } from '../loader/loader.interceptor';
import { AuthClient } from './auth-client.service';
import { authGuard } from './auth.guard';
import { authInterceptor } from './auth.interceptor';
import { MeResponse, UserProfile } from './auth.models';
import { SessionStore } from './session-store.service';
import { TokenStore } from './token-store.service';

function buildJwtWithExp(expSeconds: number): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub: 'u-1', exp: expSeconds }));
  return `${header}.${payload}.sig`;
}

describe('Integración de Rutas e Interceptores (Microintervención 5)', () => {
  let router: Router;
  let location: Location;
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let tokenStore: TokenStore;
  let sessionStore: SessionStore;
  let authClient: AuthClient;
  let loaderService: LoaderService;

  const apiBase = environment.apiUrl.replace(/\/+$/, '');
  const authBase = `${apiBase}/auth`;

  const mockUser: UserProfile = {
    id: 'user-rh-1',
    email: 'rh@imssbienestar.gob.mx',
    name: 'Personal RH',
    roles: [{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }],
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(withInterceptors([authInterceptor, loaderInterceptor])),
        provideHttpClientTesting(),
        TokenStore,
        SessionStore,
        AuthClient,
        LoaderService,
      ],
    });

    router = TestBed.inject(Router);
    location = TestBed.inject(Location);
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    tokenStore = TestBed.inject(TokenStore);
    sessionStore = TestBed.inject(SessionStore);
    authClient = TestBed.inject(AuthClient);
    loaderService = TestBed.inject(LoaderService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('1. /login es accesible sin autenticación y carga LoginPageComponent', async () => {
    const navigated = await router.navigateByUrl('/login');
    expect(navigated).toBeTrue();
    expect(location.path()).toBe('/login');

    const loginRoute = routes.find(r => r.path === 'login');
    expect(loginRoute).toBeDefined();
    expect(loginRoute?.canActivate).toBeUndefined();
    const loadedComponent = await loginRoute!.loadComponent!();
    expect(loadedComponent).toBe(LoginPageComponent);
  });

  it('2 y 3. /rh no es accesible sin sesión y redirige a /login?returnUrl=%2Frh', async () => {
    await router.navigateByUrl('/rh');
    expect(location.path()).toBe('/login?returnUrl=%2Frh');
  });

  it('4. Una sesión confirmada permite acceder a /rh y carga RhShellComponent', async () => {
    const validAt = buildJwtWithExp(Math.floor(Date.now() / 1000) + 600);
    tokenStore.set(validAt, 'valid-rt');
    sessionStore.setUser(mockUser);

    const navigated = await router.navigateByUrl('/rh');
    expect(navigated).toBeTrue();
    expect(location.path()).toBe('/rh');

    const rhRoute = routes.find(r => r.path === 'rh');
    expect(rhRoute?.canActivate).toEqual([authGuard]);
    const loadedComponent = await rhRoute!.loadComponent!();
    expect(loadedComponent).toBe(RhShellComponent);
  });

  it('5. La recarga de /rh con token persistido no hidratado exige verificación /auth/me contra backend', async () => {
    const validAt = buildJwtWithExp(Math.floor(Date.now() / 1000) + 600);
    tokenStore.set(validAt, 'valid-rt');
    expect(sessionStore.isHydrated).toBeFalse();

    const navPromise = router.navigateByUrl('/rh');
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const meReq = httpMock.expectOne(`${authBase}/me`);
    expect(meReq.request.headers.get('Authorization')).toBe(`Bearer ${validAt}`);
    meReq.flush({
      auth_user_id: mockUser.id,
      email: mockUser.email,
      profile: mockUser,
    } satisfies MeResponse);

    const navigated = await navPromise;
    expect(navigated).toBeTrue();
    expect(location.path()).toBe('/rh');
    expect(sessionStore.currentUser).toEqual(mockUser);
  });

  it('6. El logout limpia la sesión, revoca en backend y al navegar a /login queda en /login', async () => {
    const validAt = buildJwtWithExp(Math.floor(Date.now() / 1000) + 600);
    tokenStore.set(validAt, 'rt-logout');
    sessionStore.setUser(mockUser);

    await router.navigateByUrl('/rh');
    expect(location.path()).toBe('/rh');

    const logoutPromise = authClient.logout();
    const logoutReq = httpMock.expectOne(`${authBase}/logout`);
    logoutReq.flush({ ok: true });
    await logoutPromise;

    await router.navigate(['/login']);
    expect(location.path()).toBe('/login');
    expect(tokenStore.access).toBeNull();
    expect(sessionStore.currentUser).toBeNull();
  });

  it('7, 8, 9, 10 y 11. /home, /solicitudesv2, /ib-onco, /necesidades-unidad y el resto de rutas públicas conservan su configuración sin guards', async () => {
    const rhRoutes = routes.filter(r => r.path === 'rh');
    expect(rhRoutes.length).toBe(1);

    // Verificar que NINGUNA ruta distinta de 'rh' tenga canActivate o canActivateChild
    for (const route of routes) {
      if (route.path !== 'rh') {
        expect(route.canActivate)
          .withContext(`La ruta '${route.path}' no debe tener canActivate`)
          .toBeUndefined();
        expect(route.canActivateChild)
          .withContext(`La ruta '${route.path}' no debe tener canActivateChild`)
          .toBeUndefined();
      }
    }

    // Verificar configuraciones puntuales
    const homeRoute = routes.find(r => r.path === 'home');
    const sv2Route = routes.find(r => r.path === 'solicitudesv2');
    const ibOncoRoute = routes.find(r => r.path === 'ib-onco');
    const necRoute = routes.find(r => r.path === 'necesidades-unidad');
    const necCluesRoute = routes.find(r => r.path === 'necesidades-unidad/:cluesimb');

    expect(homeRoute).toBeDefined();
    expect(sv2Route?.title).toBe('Solicitudes V2 · Sandbox');
    expect(ibOncoRoute?.title).toBe('IB-ONCO');
    expect(necRoute?.title).toBe('Primer Nivel · Necesidades de mi unidad');
    expect(necCluesRoute?.title).toBe('Primer Nivel · Necesidades de mi unidad');

    // Navegar a /home sin sesión funciona normalmente
    const navHome = await router.navigateByUrl('/home');
    expect(navHome).toBeTrue();
    expect(location.path()).toBe('/home');
  });

  it('12 y 13. La cadena [authInterceptor, loaderInterceptor] no agrega Bearer a Abasto/IB-ONCO y conserva el funcionamiento de LoaderService y X-Skip-Loader', async () => {
    const validAt = buildJwtWithExp(Math.floor(Date.now() / 1000) + 600);
    tokenStore.set(validAt, 'rt-1');

    // A) Petición pública normal de Abasto -> activa loaderService.hasInFlight() y NO lleva Bearer
    const abastoPromise = firstValueFrom(http.get(`${apiBase}/radar-abasto/v2/resumen`));
    expect(loaderService.hasInFlight()).toBeTrue();

    const abastoReq = httpMock.expectOne(`${apiBase}/radar-abasto/v2/resumen`);
    expect(abastoReq.request.headers.has('Authorization')).toBeFalse();
    abastoReq.flush({ ok: true });
    await abastoPromise;
    expect(loaderService.hasInFlight()).toBeFalse();

    // B) Petición pública de IB-ONCO -> NO lleva Bearer
    const ibOncoPromise = firstValueFrom(http.get(`${apiBase}/ib-onco/resumen`));
    const ibOncoReq = httpMock.expectOne(`${apiBase}/ib-onco/resumen`);
    expect(ibOncoReq.request.headers.has('Authorization')).toBeFalse();
    ibOncoReq.flush({ ok: true });
    await ibOncoPromise;

    // C) Petición silenciosa de AuthClient.me() -> lleva Bearer, envía X-Skip-Loader (que loaderInterceptor consume y borra) y NO incrementa inFlight
    const mePromise = authClient.me();
    expect(loaderService.hasInFlight()).toBeFalse();

    const meReq = httpMock.expectOne(`${authBase}/me`);
    expect(meReq.request.headers.get('Authorization')).toBe(`Bearer ${validAt}`);
    // loaderInterceptor elimina la cabecera X-Skip-Loader antes de enviar a la red
    expect(meReq.request.headers.has('X-Skip-Loader')).toBeFalse();
    meReq.flush({
      auth_user_id: mockUser.id,
      email: mockUser.email,
      profile: mockUser,
    } satisfies MeResponse);
    await mePromise;
  });

  it('14. La ruta vacía ("") y la ruta desconocida ("**") conservan el fallback hacia /home', async () => {
    await router.navigateByUrl('');
    expect(location.path()).toBe('/home');

    await router.navigateByUrl('/ruta-inexistente-xyz');
    expect(location.path()).toBe('/home');
  });
});
