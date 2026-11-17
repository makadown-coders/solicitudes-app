import { Location } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { environment } from '../../../environments/environment';
import { routes } from '../../app.routes';
import { AuthClient } from '../../core/auth/auth-client.service';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { MeResponse, UserProfile } from '../../core/auth/auth.models';
import {
  hasRhAccessRole,
  resolveRhRoleContext,
  rhAccessGuard,
} from '../../core/auth/rh-access.guard';
import { SessionStore } from '../../core/auth/session-store.service';
import { TokenStore } from '../../core/auth/token-store.service';
import { RhService, RhUnidadAutorizada } from '../../services/rh.service';
import { RhShellComponent } from './rh-shell.component';

function buildJwtWithExp(expSeconds: number, sub = 'u-rh-test'): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub, exp: expSeconds }));
  return `${header}.${payload}.sig`;
}

describe('RhShellComponent & rhAccessGuard (Microintervención RH-2A)', () => {
  let fixture: ComponentFixture<RhShellComponent>;
  let component: RhShellComponent;
  let sessionStore: SessionStore;
  let tokenStore: TokenStore;
  let authClient: AuthClient;
  let rhService: RhService;
  let httpMock: HttpTestingController;
  let router: Router;
  let location: Location;

  const apiBase = environment.apiUrl.replace(/\/+$/, '');
  const authBase = `${apiBase}/auth`;
  const rhUnidadesUrl = `${apiBase}/rh/unidades-autorizadas`;

  const rhGlobalUser: UserProfile = {
    id: 'user-rh-global',
    email: 'rh.global@imssbienestar.gob.mx',
    name: 'Coordinación Estatal RH',
    roles: [{ code: 'RECURSOS_HUMANOS', scope: 'GLOBAL', id: null }],
  };

  const rhCluesSingleUser: UserProfile = {
    id: 'user-rh-clues-1',
    email: 'rh.hg.mxl@imssbienestar.gob.mx',
    name: 'Encargado RH Mexicali',
    roles: [{ code: 'RECURSOS_HUMANOS', scope: 'CLUES', id: 'BCIMB000001' }],
  };

  const rhCluesMultiUser: UserProfile = {
    id: 'user-rh-clues-multi',
    email: 'rh.zona@imssbienestar.gob.mx',
    name: 'Supervisor RH Zona Costa',
    roles: [
      { code: 'RECURSOS_HUMANOS', scope: 'CLUES', id: 'BCIMB000010' },
      { code: 'RECURSOS_HUMANOS', scope: 'CLUES', id: 'BCIMB000020' },
    ],
  };

  const adminTicGlobalUser: UserProfile = {
    id: 'user-admin-tic',
    email: 'admin.tic@imssbienestar.gob.mx',
    name: 'Carlos Admin TIC',
    roles: [{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }],
  };

  const unauthorizedAbastoUser: UserProfile = {
    id: 'user-abasto-only',
    email: 'abasto@imssbienestar.gob.mx',
    name: 'Operador Abasto',
    roles: [
      { code: 'ABASTO', scope: 'GLOBAL', id: null },
      { code: 'WISHLIST', scope: 'GLOBAL', id: null },
      { code: 'IB_ONCO', scope: 'GLOBAL', id: null },
    ],
  };

  const mockUnidadesGlobal: RhUnidadAutorizada[] = [
    { id: 10, nombre: 'HOSPITAL GENERAL MEXICALI', cluesimb: 'BCIMB000001' },
    { id: 20, nombre: 'HOSPITAL GENERAL TIJUANA', cluesimb: 'BCIMB000010' },
    { id: 30, nombre: 'HOSPITAL GENERAL ENSENADA', cluesimb: 'BCIMB000020' },
    { id: 177, nombre: 'OFICINA CENTRAL', cluesimb: 'N/A' },
  ];

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [RhShellComponent],
      providers: [
        provideRouter(routes),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        TokenStore,
        SessionStore,
        AuthClient,
        RhService,
      ],
    }).compileComponents();

    tokenStore = TestBed.inject(TokenStore);
    sessionStore = TestBed.inject(SessionStore);
    authClient = TestBed.inject(AuthClient);
    rhService = TestBed.inject(RhService);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    location = TestBed.inject(Location);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  function setupSession(user: UserProfile): string {
    const validAt = buildJwtWithExp(Math.floor(Date.now() / 1000) + 600, user.id);
    tokenStore.set(validAt, 'rt-valid-1');
    sessionStore.setUser(user);
    return validAt;
  }

  function createComponent(): void {
    fixture = TestBed.createComponent(RhShellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function runRhAccessGuard(url = '/rh'): Promise<boolean | UrlTree> {
    const dummyRoute = {} as ActivatedRouteSnapshot;
    const dummyState = { url } as RouterStateSnapshot;
    return TestBed.runInInjectionContext(
      () => rhAccessGuard(dummyRoute, dummyState) as Promise<boolean | UrlTree>
    );
  }

  // =========================================================================
  // 1 a 6. AUTORIZACIÓN DE RUTA (/rh) E HIDRATACIÓN ASÍNCRONA
  // =========================================================================

  it('1. Usuario sin sesión: navegar a /rh redirige a /login?returnUrl=%2Frh', async () => {
    await router.navigateByUrl('/rh');
    expect(location.path()).toBe('/login?returnUrl=%2Frh');
  });

  it('2. Usuario autenticado sin rol RH ni ADMIN_TIC GLOBAL (ABASTO, WISHLIST, IB_ONCO, ADMIN_TIC CLUES): acceso denegado redirigiendo a /home', async () => {
    expect(hasRhAccessRole(unauthorizedAbastoUser)).toBeFalse();
    expect(
      hasRhAccessRole({
        id: 'u-tic-clues',
        email: 'tic.clues@imssb.gob.mx',
        name: 'TIC Local',
        roles: [{ code: 'ADMIN_TIC', scope: 'CLUES', id: 'BCIMB000001' }],
      })
    ).toBeFalse();

    setupSession(unauthorizedAbastoUser);
    await router.navigateByUrl('/rh');

    expect(location.path()).toBe('/home');
    // Su sesión se mantiene activa para otros módulos públicos
    expect(sessionStore.currentUser).toEqual(unauthorizedAbastoUser);
  });

  it('3, 4 y 5. RECURSOS_HUMANOS GLOBAL, RECURSOS_HUMANOS CLUES y ADMIN_TIC GLOBAL tienen acceso permitido y prevalece GLOBAL si se combina con CLUES', async () => {
    // 3. RECURSOS_HUMANOS GLOBAL
    expect(resolveRhRoleContext(rhGlobalUser)?.badgeLabel).toBe('RECURSOS_HUMANOS GLOBAL');
    setupSession(rhGlobalUser);
    expect(await runRhAccessGuard('/rh')).toBeTrue();

    // 4. RECURSOS_HUMANOS CLUES
    expect(resolveRhRoleContext(rhCluesSingleUser)?.badgeLabel).toBe('RECURSOS_HUMANOS CLUES');
    setupSession(rhCluesSingleUser);
    expect(await runRhAccessGuard('/rh')).toBeTrue();

    // 5. ADMIN_TIC GLOBAL
    expect(resolveRhRoleContext(adminTicGlobalUser)?.badgeLabel).toBe('ADMIN_TIC GLOBAL');
    setupSession(adminTicGlobalUser);
    expect(await runRhAccessGuard('/rh')).toBeTrue();

    // Combinación RH GLOBAL + RH CLUES -> prevalece GLOBAL
    const combinedUser: UserProfile = {
      id: 'u-combo',
      email: 'combo@imssb.gob.mx',
      name: 'Combo RH',
      roles: [
        { code: 'RECURSOS_HUMANOS', scope: 'CLUES', id: 'BCIMB000001' },
        { code: 'RECURSOS_HUMANOS', scope: 'GLOBAL', id: null },
      ],
    };
    const comboCtx = resolveRhRoleContext(combinedUser);
    expect(comboCtx?.scope).toBe('GLOBAL');
    expect(comboCtx?.badgeLabel).toBe('RECURSOS_HUMANOS GLOBAL');
  });

  it('6. Sesión en proceso de hidratación asíncrona: rhAccessGuard espera a SessionStore.hydrate() antes de evaluar roles', async () => {
    const validAt = buildJwtWithExp(Math.floor(Date.now() / 1000) + 600);
    tokenStore.set(validAt, 'rt-hydrate');
    // Sesión aún no hidratada en memoria
    expect(sessionStore.isHydrated).toBeFalse();

    const guardPromise = runRhAccessGuard('/rh');

    const meReq = httpMock.expectOne(`${authBase}/me`);
    expect(meReq.request.headers.get('Authorization')).toBe(`Bearer ${validAt}`);
    meReq.flush({
      auth_user_id: rhCluesSingleUser.id,
      email: rhCluesSingleUser.email,
      profile: rhCluesSingleUser,
    } satisfies MeResponse);

    const result = await guardPromise;
    expect(result).toBeTrue();
    expect(sessionStore.currentUser).toEqual(rhCluesSingleUser);
  });

  // =========================================================================
  // 7, 8 y 9. SERVICIO HTTP, ESTADO DE CARGA Y ERRORES 403 / 500
  // =========================================================================

  it('7 y 8. Consume GET /api/rh/unidades-autorizadas con Bearer token y muestra indicador de carga mientras resuelve', async () => {
    const validToken = setupSession(rhGlobalUser);
    createComponent();

    // Mientras la petición está en vuelo, loadingUnidades es true y se muestra el indicador en DOM
    expect(component.loadingUnidades()).toBeTrue();
    expect(fixture.nativeElement.querySelector('#rh-unidades-loading')).not.toBeNull();

    const req = httpMock.expectOne(rhUnidadesUrl);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${validToken}`);

    req.flush({
      scope: 'GLOBAL',
      unidades: mockUnidadesGlobal,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.loadingUnidades()).toBeFalse();
    expect(component.unidadesAutorizadas().length).toBe(4);
    expect(component.activeScopeLabel()).toBe('RECURSOS_HUMANOS GLOBAL');
  });

  it('9. Maneja HTTP 403 (limpiando selección previa) y HTTP 500 (mostrando error con opción de reintentar)', async () => {
    setupSession(rhCluesSingleUser);
    createComponent();

    // Primero carga una unidad válida
    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'CLUES',
      unidades: [{ id: 10, nombre: 'HOSPITAL GENERAL MEXICALI', cluesimb: 'BCIMB000001' }],
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.selectedUnidadId()).toBe(10);

    // Ahora al recargar recibe HTTP 403 -> limpia unidades y selección anterior y muestra alerta de acceso restringido
    const reload403 = component.cargarUnidadesAutorizadas();
    httpMock
      .expectOne(rhUnidadesUrl)
      .flush({ error: 'Permiso insuficiente' }, { status: 403, statusText: 'Forbidden' });
    await reload403;
    fixture.detectChanges();

    expect(component.selectedUnidadId()).toBeNull();
    expect(component.selectedUnidad()).toBeNull();
    expect(component.unidadesAutorizadas().length).toBe(0);
    expect(component.accessDeniedError()).toContain('403');
    expect(fixture.nativeElement.querySelector('#rh-access-denied-alert')).not.toBeNull();

    // Ahora probamos HTTP 500 -> muestra mensaje de error y botón Reintentar
    const reload500 = component.cargarUnidadesAutorizadas();
    httpMock
      .expectOne(rhUnidadesUrl)
      .flush({ error: 'Error interno' }, { status: 500, statusText: 'Internal Server Error' });
    await reload500;
    fixture.detectChanges();

    expect(component.errorUnidades()).toContain('No fue posible cargar las unidades');
    expect(fixture.nativeElement.querySelector('#rh-unidades-error')).not.toBeNull();
  });

  // =========================================================================
  // 10 a 18. SELECTOR DE UNIDAD DE TRABAJO (GLOBAL, CLUES, OFICINA CENTRAL, TECLADO)
  // =========================================================================

  it('10, 13, 14, 15, 16 y 17. Alcance GLOBAL: no abre lista ni autoselecciona al inicio; incluye OFICINA CENTRAL (sin fabricar CLUES); filtra por nombre y CLUES; selecciona por teclado y conserva unidad_medica.id', async () => {
    setupSession(rhGlobalUser);
    createComponent();

    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'GLOBAL',
      unidades: mockUnidadesGlobal,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    // 10. En GLOBAL no hay selección automática inicial y el menú desplegable está cerrado
    expect(component.selectedUnidadId()).toBeNull();
    expect(component.selectedUnidad()).toBeNull();
    expect(component.unidadSuggestOpen()).toBeFalse();
    expect(fixture.nativeElement.querySelector('#rh-no-unidad-selected-state')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#rh-unidad-trabajo-dropdown')).toBeNull();

    // 13. OFICINA CENTRAL está disponible en unidadesAutorizadas con id = 177 y cluesimb = 'N/A'
    const oficinaCentral = component.unidadesAutorizadas().find((u) => u.id === 177);
    expect(oficinaCentral).toBeDefined();
    expect(oficinaCentral?.nombre).toBe('OFICINA CENTRAL');
    expect(component.hasDisplayableClues(oficinaCentral?.cluesimb)).toBeFalse();

    // 14. Búsqueda por nombre parcial ("central") -> abre sugerencias y filtra OFICINA CENTRAL
    component.onUnidadSearchInput('central');
    fixture.detectChanges();
    expect(component.unidadSuggestOpen()).toBeTrue();
    expect(component.filteredUnidades().length).toBe(1);
    expect(component.filteredUnidades()[0].id).toBe(177);
    // Verificar que en el DOM no se muestra "CLUES: N/A" para OFICINA CENTRAL
    const dropdownText =
      (fixture.nativeElement.querySelector('#rh-unidad-trabajo-dropdown') as HTMLElement | null)
        ?.textContent ?? '';
    expect(dropdownText).toContain('OFICINA CENTRAL');
    expect(dropdownText).not.toContain('N/A');

    // 16 y 17. Selección mediante teclado (ArrowDown + Enter) conserva unidad_medica.id (177)
    component.onUnidadSearchKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(component.unidadSuggestIndex()).toBe(0);
    component.onUnidadSearchKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();

    expect(component.selectedUnidadId()).toBe(177);
    expect(component.selectedUnidad()?.nombre).toBe('OFICINA CENTRAL');
    expect(component.unidadSuggestOpen()).toBeFalse();
    expect(
      fixture.nativeElement.querySelector('#rh-selected-unidad-name')?.textContent?.trim()
    ).toBe('OFICINA CENTRAL');

    // 15. Búsqueda por CLUES ("BCIMB000010") y cierre con Escape
    component.onUnidadSearchInput('BCIMB000010');
    fixture.detectChanges();
    expect(component.selectedUnidadId()).toBeNull(); // Al editar el texto se limpia la selección previa
    expect(component.filteredUnidades().length).toBe(1);
    expect(component.filteredUnidades()[0].id).toBe(20);
    expect(component.filteredUnidades()[0].nombre).toBe('HOSPITAL GENERAL TIJUANA');

    component.onUnidadSearchKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.unidadSuggestOpen()).toBeFalse();
  });

  it('11. Alcance CLUES con una sola unidad autorizada: la selecciona automáticamente y conserva unidad_medica.id', async () => {
    setupSession(rhCluesSingleUser);
    createComponent();

    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'CLUES',
      unidades: [{ id: 10, nombre: 'HOSPITAL GENERAL MEXICALI', cluesimb: 'BCIMB000001' }],
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.activeScopeLabel()).toBe('RECURSOS_HUMANOS CLUES');
    expect(component.selectedUnidadId()).toBe(10);
    expect(component.selectedUnidad()).toEqual({
      id: 10,
      nombre: 'HOSPITAL GENERAL MEXICALI',
      cluesimb: 'BCIMB000001',
    });
    expect(component.isSingleCluesUnitLocked()).toBeTrue();
    expect(
      fixture.nativeElement.querySelector('#rh-selected-unidad-name')?.textContent?.trim()
    ).toBe('HOSPITAL GENERAL MEXICALI');
    expect(
      fixture.nativeElement.querySelector('#rh-selected-unidad-clues')?.textContent?.trim()
    ).toContain('BCIMB000001');
  });

  it('12 y 18. Alcance CLUES con varias unidades autorizadas: permite elegir entre ellas y rechaza unidades no autorizadas', async () => {
    setupSession(rhCluesMultiUser);
    createComponent();

    const authorizedSubset: RhUnidadAutorizada[] = [
      { id: 20, nombre: 'HOSPITAL GENERAL TIJUANA', cluesimb: 'BCIMB000010' },
      { id: 30, nombre: 'HOSPITAL GENERAL ENSENADA', cluesimb: 'BCIMB000020' },
    ];

    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'CLUES',
      unidades: authorizedSubset,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    // Con 2 unidades no autoselecciona; permite elegir entre las 2 autorizadas
    expect(component.selectedUnidadId()).toBeNull();
    expect(component.isSingleCluesUnitLocked()).toBeFalse();
    expect(component.filteredUnidades().map((u) => u.id)).toEqual([20, 30]);

    // 18. Intentar seleccionar una unidad fuera del arreglo autorizado (p. ej. id 999) es ignorado
    component.selectUnidad({ id: 999, nombre: 'UNIDAD NO AUTORIZADA', cluesimb: 'BCIMB999999' });
    expect(component.selectedUnidadId()).toBeNull();

    // Seleccionar una de las autorizadas funciona y guarda unidad_medica.id = 30
    component.selectUnidad(authorizedSubset[1]);
    fixture.detectChanges();
    expect(component.selectedUnidadId()).toBe(30);
    expect(component.selectedUnidad()?.nombre).toBe('HOSPITAL GENERAL ENSENADA');
  });

  // =========================================================================
  // 19. PRESERVACIÓN DE ENCABEZADO, CAMBIO DE CONTRASEÑA Y LOGOUT
  // =========================================================================

  it('19. Conserva el nombre/correo del usuario, el enlace a /mi-cuenta/cambiar-password y el cierre de sesión seguro', async () => {
    setupSession(adminTicGlobalUser);
    createComponent();

    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'GLOBAL',
      unidades: mockUnidadesGlobal,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.activeScopeLabel()).toBe('ADMIN_TIC GLOBAL');
    expect(
      fixture.nativeElement.querySelector('#rh-shell-user-name')?.textContent?.trim()
    ).toBe('Carlos Admin TIC');
    expect(
      fixture.nativeElement.querySelector('#rh-shell-user-email')?.textContent?.trim()
    ).toBe('admin.tic@imssbienestar.gob.mx');

    const changePwdLink = fixture.nativeElement.querySelector(
      '#rh-shell-change-password-link'
    ) as HTMLAnchorElement | null;
    expect(changePwdLink).not.toBeNull();
    expect(changePwdLink?.getAttribute('href')).toBe('/mi-cuenta/cambiar-password');

    // Ejecutar logout
    const logoutPromise = component.onLogout();
    const logoutReq = httpMock.expectOne(`${authBase}/logout`);
    logoutReq.flush({ ok: true });
    await logoutPromise;

    expect(tokenStore.access).toBeNull();
    expect(sessionStore.currentUser).toBeNull();
    expect(location.path()).toBe('/login');
  });
});
