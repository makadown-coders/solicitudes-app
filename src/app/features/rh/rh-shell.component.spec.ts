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
import {
  RhPersonaCandidataItem,
  RhPersonalUnidadItem,
  RhService,
  RhTrabajadorFichaResponse,
  RhUnidadAutorizada,
} from '../../services/rh.service';
import { RhShellComponent } from './rh-shell.component';

function buildJwtWithExp(expSeconds: number, sub = 'u-rh-test'): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub, exp: expSeconds }));
  return `${header}.${payload}.sig`;
}

describe('RhShellComponent & rhAccessGuard (Microintervenciones RH-2A, RH-2B.2, RH-2B.4B, RH-2B.4D y RH-2B.4F)', () => {
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
  const rhPersonalUrl = (unidadId: number) => `${apiBase}/rh/unidades/${unidadId}/personal`;
  const rhFichaUrl = (unidadId: number, adscripcionId: number) =>
    `${apiBase}/rh/unidades/${unidadId}/personal/${adscripcionId}`;
  const rhFichaLaboralPatchUrl = (unidadId: number, adscripcionId: number) =>
    `${apiBase}/rh/unidades/${unidadId}/personal/${adscripcionId}/laboral`;
  const rhCandidatasUrl = (unidadId: number) =>
    `${apiBase}/rh/unidades/${unidadId}/personas-candidatas`;
  const rhAdscripcionesUrl = (unidadId: number) =>
    `${apiBase}/rh/unidades/${unidadId}/adscripciones`;

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

  const mockPersonalUnidad10: RhPersonalUnidadItem[] = [
    {
      persona_id: 101,
      nombre_completo: 'Dra. Ana Gómez',
      adscripcion_laboral_id: 5001,
      unidad_medica_id: 10,
      matricula: 'MAT-1001',
      puesto: 'Médico Especialista A',
      turno: 'MATUTINO',
      jornada: '8 HORAS',
      horario: '07:00 - 15:00',
      vigente_desde: '2026-01-01',
      vigente_hasta: null,
      activo: true,
    },
    {
      persona_id: 102,
      nombre_completo: 'Enf. Luis Pérez',
      adscripcion_laboral_id: 5002,
      unidad_medica_id: 10,
      matricula: null,
      puesto: null,
      turno: 'VESPERTINO',
      jornada: '8 HORAS',
      horario: '14:00 - 21:30',
      vigente_desde: '2026-02-01',
      vigente_hasta: '2026-12-31',
      activo: false,
    },
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
    // Asegurar que nunca se creen personas nuevas ni se emitan PUT/DELETE a /api/rh
    httpMock.expectNone(
      (r) =>
        r.url.includes('/api/rh/') &&
        (r.method === 'PUT' || r.method === 'DELETE')
    );
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
  // SUITE RH-2A (PRESERVACIÓN ÍNTEGRA DE SELECCIÓN DE UNIDAD Y GUARD)
  // =========================================================================

  it('1 (RH-2A). Usuario sin sesión: navegar a /rh redirige a /login?returnUrl=%2Frh', async () => {
    await router.navigateByUrl('/rh');
    expect(location.path()).toBe('/login?returnUrl=%2Frh');
  });

  it('2 (RH-2A). Usuario autenticado sin rol RH ni ADMIN_TIC GLOBAL: acceso denegado redirigiendo a /home', async () => {
    expect(hasRhAccessRole(unauthorizedAbastoUser)).toBeFalse();
    setupSession(unauthorizedAbastoUser);
    await router.navigateByUrl('/rh');

    expect(location.path()).toBe('/home');
    expect(sessionStore.currentUser).toEqual(unauthorizedAbastoUser);
  });

  it('3, 4, 5 y 6 (RH-2A). RECURSOS_HUMANOS GLOBAL, RECURSOS_HUMANOS CLUES, ADMIN_TIC GLOBAL e hidratación asíncrona funcionan correctamente', async () => {
    expect(resolveRhRoleContext(rhGlobalUser)?.badgeLabel).toBe('RECURSOS_HUMANOS GLOBAL');
    setupSession(rhGlobalUser);
    expect(await runRhAccessGuard('/rh')).toBeTrue();

    expect(resolveRhRoleContext(rhCluesSingleUser)?.badgeLabel).toBe('RECURSOS_HUMANOS CLUES');
    setupSession(rhCluesSingleUser);
    expect(await runRhAccessGuard('/rh')).toBeTrue();

    expect(resolveRhRoleContext(adminTicGlobalUser)?.badgeLabel).toBe('ADMIN_TIC GLOBAL');
    setupSession(adminTicGlobalUser);
    expect(await runRhAccessGuard('/rh')).toBeTrue();

    // Hidratación asíncrona
    const validAt = buildJwtWithExp(Math.floor(Date.now() / 1000) + 600);
    sessionStore.clear();
    tokenStore.set(validAt, 'rt-hydrate');
    const guardPromise = runRhAccessGuard('/rh');
    const meReq = httpMock.expectOne(`${authBase}/me`);
    meReq.flush({
      auth_user_id: rhCluesSingleUser.id,
      email: rhCluesSingleUser.email,
      profile: rhCluesSingleUser,
    } satisfies MeResponse);
    expect(await guardPromise).toBeTrue();
  });

  it('10, 13, 14, 15, 16 y 17 (RH-2A + RH-2B.2 #1, #2, #3, #4, #14, #15). Sin unidad seleccionada NO consulta padrón; al seleccionar OFICINA CENTRAL por teclado consulta su padrón con id=177 y muestra mensaje de padrón vacío', async () => {
    setupSession(rhGlobalUser);
    createComponent();

    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'GLOBAL',
      unidades: mockUnidadesGlobal,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    // 1 (RH-2B.2): Sin unidad seleccionada no existe solicitud de padrón y muestra invitación a seleccionar unidad
    expect(component.selectedUnidadId()).toBeNull();
    httpMock.expectNone((r) => r.url.includes('/personal'));
    expect(fixture.nativeElement.querySelector('#rh-personal-invite-select-unit')).not.toBeNull();

    // Buscar OFICINA CENTRAL por nombre parcial y seleccionar con teclado (ArrowDown + Enter)
    component.onUnidadSearchInput('central');
    fixture.detectChanges();
    expect(component.filteredUnidades().length).toBe(1);
    expect(component.filteredUnidades()[0].id).toBe(177);

    component.onUnidadSearchKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    component.onUnidadSearchKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();

    // 2 y 3 (RH-2B.2): Al seleccionar unidad se consulta su personal usando el ID real (177)
    expect(component.selectedUnidadId()).toBe(177);
    const reqPersonal = httpMock.expectOne(
      (r) =>
        r.url === rhPersonalUrl(177) &&
        r.method === 'GET' &&
        r.params.get('page') === '1' &&
        r.params.get('pageSize') === '20'
    );
    reqPersonal.flush({
      unidad: { id: 177, nombre: 'OFICINA CENTRAL', cluesimb: 'N/A' },
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    // 4 (RH-2B.2): Padrón vacío sin búsqueda activa muestra «Esta unidad no tiene personal adscrito registrado en RH»
    const emptyUnitEl = fixture.nativeElement.querySelector(
      '#rh-personal-unit-empty'
    ) as HTMLElement | null;
    expect(emptyUnitEl).not.toBeNull();
    expect(emptyUnitEl?.textContent).toContain(
      'Esta unidad no tiene personal adscrito registrado en RH'
    );
    expect(fixture.nativeElement.querySelector('#rh-personal-search-empty')).toBeNull();
  });

  it('11 (RH-2A) + 13 (RH-2B.2). CLUES con una sola unidad autoselecciona la unidad, consulta automáticamente su padrón y renderiza todos los campos reales del contrato (incluyendo valores ausentes)', async () => {
    setupSession(rhCluesSingleUser);
    createComponent();

    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'CLUES',
      unidades: [{ id: 10, nombre: 'HOSPITAL GENERAL MEXICALI', cluesimb: 'BCIMB000001' }],
    });
    await Promise.resolve();
    await Promise.resolve();

    // Al autoseleccionar unidad 10, se dispara automáticamente GET /api/rh/unidades/10/personal
    const reqPersonal = httpMock.expectOne((r) => r.url === rhPersonalUrl(10) && r.method === 'GET');
    reqPersonal.flush({
      unidad: { id: 10, nombre: 'HOSPITAL GENERAL MEXICALI', cluesimb: 'BCIMB000001' },
      items: mockPersonalUnidad10,
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.selectedUnidadId()).toBe(10);
    expect(component.personalItems().length).toBe(2);
    expect(component.personalTotal()).toBe(2);

    const tableText =
      (fixture.nativeElement.querySelector('#rh-personal-table') as HTMLElement | null)
        ?.textContent ?? '';
    expect(tableText).toContain('Dra. Ana Gómez');
    expect(tableText).toContain('MAT-1001');
    expect(tableText).toContain('Médico Especialista A');
    expect(tableText).toContain('MATUTINO');
    expect(tableText).toContain('8 HORAS');
    expect(tableText).toContain('07:00 - 15:00');
    expect(tableText).toContain('2026-01-01');
    expect(tableText).toContain('Indefinida');
    expect(tableText).toContain('Activa');

    // Segundo registro con matrícula y puesto nulos e inactivo
    expect(tableText).toContain('Enf. Luis Pérez');
    expect(tableText).toContain('Sin matrícula');
    expect(tableText).toContain('Sin especificar');
    expect(tableText).toContain('2026-12-31');
    expect(tableText).toContain('Inactiva');
  });

  // =========================================================================
  // SUITE RH-2B.2 (BÚSQUEDA, PAGINACIÓN, CAMBIO DE UNIDAD, RESPUESTAS OBSOLETAS Y ERRORES)
  // =========================================================================

  it('5, 6, 7 y 8 (RH-2B.2). Búsqueda por nombre, búsqueda por matrícula, búsqueda sin resultados («No se encontraron coincidencias para la búsqueda») y paginación en servidor', async () => {
    setupSession(rhGlobalUser);
    createComponent();

    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'GLOBAL',
      unidades: mockUnidadesGlobal,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    // Seleccionar unidad 10 (HOSPITAL GENERAL MEXICALI)
    component.selectUnidad(mockUnidadesGlobal[0]);
    const reqInit = httpMock.expectOne(
      (r) =>
        r.url === rhPersonalUrl(10) &&
        r.params.get('page') === '1' &&
        r.params.get('pageSize') === '20' &&
        !r.params.has('q')
    );
    reqInit.flush({
      unidad: mockUnidadesGlobal[0],
      items: mockPersonalUnidad10,
      page: 1,
      pageSize: 20,
      total: 45,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    // 8. Paginación: total = 45, pageSize = 20 -> totalPages = 3. Avanzar a página 2
    expect(component.personalTotalPages()).toBe(3);
    expect(component.canPersonalGoNext()).toBeTrue();
    component.goToNextPersonalPage();

    const reqPage2 = httpMock.expectOne(
      (r) =>
        r.url === rhPersonalUrl(10) &&
        r.params.get('page') === '2' &&
        r.params.get('pageSize') === '20'
    );
    reqPage2.flush({
      unidad: mockUnidadesGlobal[0],
      items: [mockPersonalUnidad10[0]],
      page: 2,
      pageSize: 20,
      total: 45,
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.personalPage()).toBe(2);

    // 5. Búsqueda por nombre ("Ana") -> reinicia a página 1 y envía parámetro q al backend
    component.personalSearchDraft.set('  Ana  ');
    component.onPersonalSearchSubmit();

    const reqByName = httpMock.expectOne(
      (r) =>
        r.url === rhPersonalUrl(10) &&
        r.params.get('q') === 'Ana' &&
        r.params.get('page') === '1'
    );
    reqByName.flush({
      unidad: mockUnidadesGlobal[0],
      items: [mockPersonalUnidad10[0]],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.personalPage()).toBe(1);
    expect(component.personalItems().length).toBe(1);

    // 6. Búsqueda por matrícula ("MAT-1001")
    component.personalSearchDraft.set('MAT-1001');
    component.onPersonalSearchSubmit();

    const reqByMat = httpMock.expectOne(
      (r) =>
        r.url === rhPersonalUrl(10) &&
        r.params.get('q') === 'MAT-1001' &&
        r.params.get('page') === '1'
    );
    reqByMat.flush({
      unidad: mockUnidadesGlobal[0],
      items: [mockPersonalUnidad10[0]],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.personalItems()[0].matricula).toBe('MAT-1001');

    // 7. Búsqueda sin resultados -> distingue el mensaje «No se encontraron coincidencias para la búsqueda»
    component.personalSearchDraft.set('INEXISTENTE-999');
    component.onPersonalSearchSubmit();

    const reqNoMatch = httpMock.expectOne(
      (r) => r.url === rhPersonalUrl(10) && r.params.get('q') === 'INEXISTENTE-999'
    );
    reqNoMatch.flush({
      unidad: mockUnidadesGlobal[0],
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const searchEmptyEl = fixture.nativeElement.querySelector(
      '#rh-personal-search-empty'
    ) as HTMLElement | null;
    expect(searchEmptyEl).not.toBeNull();
    expect(searchEmptyEl?.textContent).toContain(
      'No se encontraron coincidencias para la búsqueda'
    );
    expect(fixture.nativeElement.querySelector('#rh-personal-unit-empty')).toBeNull();

    // Limpiar búsqueda vuelve a consultar página 1 sin parámetro q
    component.onClearPersonalSearch();
    const reqCleared = httpMock.expectOne(
      (r) => r.url === rhPersonalUrl(10) && !r.params.has('q') && r.params.get('page') === '1'
    );
    reqCleared.flush({
      unidad: mockUnidadesGlobal[0],
      items: mockPersonalUnidad10,
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.personalItems().length).toBe(2);
  });

  it('9 y 10 (RH-2B.2). Cambio de unidad limpia inmediatamente los resultados anteriores e impide que respuestas HTTP obsoletas sobrescriban los datos de la nueva unidad', async () => {
    setupSession(rhGlobalUser);
    createComponent();

    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'GLOBAL',
      unidades: mockUnidadesGlobal,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    // 1) Seleccionar unidad 10 y cargar su personal
    component.selectUnidad(mockUnidadesGlobal[0]);
    httpMock.expectOne((r) => r.url === rhPersonalUrl(10)).flush({
      unidad: mockUnidadesGlobal[0],
      items: mockPersonalUnidad10,
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.personalItems().length).toBe(2);

    // 2) Iniciar una recarga lenta de unidad 10 (que quedará obsoleta)
    component.personalSearchDraft.set('lenta');
    component.onPersonalSearchSubmit();
    const staleReqUnit10 = httpMock.expectOne(
      (r) => r.url === rhPersonalUrl(10) && r.params.get('q') === 'lenta'
    );

    // 3) Antes de que responda la petición de unidad 10, el usuario cambia a unidad 20 (HOSPITAL GENERAL TIJUANA)
    component.selectUnidad(mockUnidadesGlobal[1]);

    // 9. Inmediatamente al cambiar de unidad se limpian los resultados anteriores, el filtro de búsqueda y la página
    expect(component.selectedUnidadId()).toBe(20);
    expect(component.personalItems().length).toBe(0);
    expect(component.personalSearchDraft()).toBe('');
    expect(component.personalAppliedSearch()).toBe('');
    expect(component.personalPage()).toBe(1);

    const freshReqUnit20 = httpMock.expectOne(
      (r) => r.url === rhPersonalUrl(20) && !r.params.has('q')
    );

    const personalUnidad20: RhPersonalUnidadItem[] = [
      {
        persona_id: 204,
        nombre_completo: 'Dr. Carlos Ruiz',
        adscripcion_laboral_id: 6001,
        unidad_medica_id: 20,
        matricula: 'MAT-2004',
        puesto: 'Urgenciólogo',
        turno: 'NOCTURNO',
        jornada: 'ACUMULADA',
        horario: '20:00 - 08:00',
        vigente_desde: '2026-01-15',
        vigente_hasta: null,
        activo: true,
      },
    ];

    // Responde primero la unidad 20 (nueva)
    freshReqUnit20.flush({
      unidad: mockUnidadesGlobal[1],
      items: personalUnidad20,
      page: 1,
      pageSize: 20,
      total: 1,
    });
    await Promise.resolve();
    await Promise.resolve();

    // 10. Ahora responde tardíamente la petición antigua de la unidad 10
    staleReqUnit10.flush({
      unidad: mockUnidadesGlobal[0],
      items: mockPersonalUnidad10,
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    // Los datos visibles deben seguir siendo exclusivamente los de la unidad 20
    expect(component.personalItems().length).toBe(1);
    expect(component.personalItems()[0].nombre_completo).toBe('Dr. Carlos Ruiz');
    expect(component.personalItems()[0].unidad_medica_id).toBe(20);
  });

  it('11 y 12 (RH-2B.2). Manejo de HTTP 500 (con opción de reintento), HTTP 403 (limpiando datos visibles) y HTTP 401 en la consulta del padrón', async () => {
    setupSession(rhGlobalUser);
    createComponent();

    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'GLOBAL',
      unidades: mockUnidadesGlobal,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    // Seleccionar unidad 10 -> falla con HTTP 500
    component.selectUnidad(mockUnidadesGlobal[0]);
    httpMock
      .expectOne((r) => r.url === rhPersonalUrl(10))
      .flush({ error: 'DB error' }, { status: 500, statusText: 'Internal Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();

    // 12. Muestra alerta de error recuperable con botón Reintentar
    expect(component.errorPersonal()).toContain('No fue posible consultar el personal adscrito');
    const retryBtn = fixture.nativeElement.querySelector(
      '#rh-personal-retry-btn'
    ) as HTMLButtonElement | null;
    expect(retryBtn).not.toBeNull();

    // Al pulsar Reintentar vuelve a consultar y carga los datos
    retryBtn!.click();
    httpMock.expectOne((r) => r.url === rhPersonalUrl(10)).flush({
      unidad: mockUnidadesGlobal[0],
      items: mockPersonalUnidad10,
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.errorPersonal()).toBeNull();
    expect(component.personalItems().length).toBe(2);

    // 11a. Si en una recarga posterior recibe HTTP 403 -> limpia personal y unidad seleccionada y muestra acceso restringido
    const reload403 = component.cargarPersonalUnidad();
    httpMock
      .expectOne((r) => r.url === rhPersonalUrl(10))
      .flush({ error: 'No autorizado' }, { status: 403, statusText: 'Forbidden' });
    await reload403;
    fixture.detectChanges();

    expect(component.personalItems().length).toBe(0);
    expect(component.selectedUnidadId()).toBeNull();
    expect(component.accessDeniedError()).toContain('403');
  });

  it('17 (RH-2B.2). Conserva el enlace a cambio de contraseña y el cierre de sesión sin regresiones', async () => {
    setupSession(adminTicGlobalUser);
    createComponent();

    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'GLOBAL',
      unidades: mockUnidadesGlobal,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const changePwdLink = fixture.nativeElement.querySelector(
      '#rh-shell-change-password-link'
    ) as HTMLAnchorElement | null;
    expect(changePwdLink).not.toBeNull();
    expect(changePwdLink?.getAttribute('href')).toBe('/mi-cuenta/cambiar-password');

    const logoutPromise = component.onLogout();
    httpMock.expectOne(`${authBase}/logout`).flush({ ok: true });
    await logoutPromise;

    expect(tokenStore.access).toBeNull();
    expect(sessionStore.currentUser).toBeNull();
    expect(location.path()).toBe('/login');
  });

  // =========================================================================
  // SUITE RH-2B.4B (VINCULACIÓN DE TRABAJADOR AL PADRÓN LABORAL)
  // =========================================================================

  const mockCandidataDisponible: RhPersonaCandidataItem = {
    persona_id: 103,
    nombre_completo: 'Lic. Sofía Ramírez',
    cargo_directorio: 'Analista RH',
    unidad_medica_id_directorio: 10,
    unidad_medica_directorio: 'HOSPITAL GENERAL MEXICALI',
    coincide_unidad_directorio: true,
    tiene_adscripcion_rh_en_unidad: false,
    tiene_adscripcion_rh_activa_en_otra_unidad: false,
    requiere_validacion_previa: false,
    situacion_rh: 'DISPONIBLE_DIRECTORIO',
  };

  const mockCandidataYaAdscrita: RhPersonaCandidataItem = {
    persona_id: 101,
    nombre_completo: 'Dra. Ana Gómez',
    cargo_directorio: 'Médico Especialista',
    unidad_medica_id_directorio: 10,
    unidad_medica_directorio: 'HOSPITAL GENERAL MEXICALI',
    coincide_unidad_directorio: true,
    tiene_adscripcion_rh_en_unidad: true,
    tiene_adscripcion_rh_activa_en_otra_unidad: false,
    requiere_validacion_previa: false,
    situacion_rh: 'YA_ADSCRITA_EN_UNIDAD',
  };

  const mockCandidataRequiereValidacion: RhPersonaCandidataItem = {
    persona_id: 104,
    nombre_completo: 'Dr. Carlos Ruiz',
    cargo_directorio: 'Urgenciólogo',
    unidad_medica_id_directorio: 20,
    unidad_medica_directorio: 'HOSPITAL GENERAL TIJUANA',
    coincide_unidad_directorio: false,
    tiene_adscripcion_rh_en_unidad: false,
    tiene_adscripcion_rh_activa_en_otra_unidad: true,
    requiere_validacion_previa: true,
    situacion_rh: 'REQUIERE_VALIDACION_OTRA_ADSCRIPCION',
  };

  it('18 (RH-2B.4B #1, #2, #3, #4). Disponibilidad del botón «Vincular trabajador»: visible para RECURSOS_HUMANOS GLOBAL y RECURSOS_HUMANOS CLUES con unidad seleccionada; no disponible sin unidad seleccionada ni para ADMIN_TIC GLOBAL sin rol RH', async () => {
    // A) RECURSOS_HUMANOS GLOBAL: sin unidad seleccionada -> no permite vincular; al seleccionar unidad -> botón visible
    setupSession(rhGlobalUser);
    createComponent();

    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'GLOBAL',
      unidades: mockUnidadesGlobal,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.canVincularTrabajador()).toBeFalse();
    expect(fixture.nativeElement.querySelector('#rh-open-vincular-btn')).toBeNull();
    component.openVincularDialog();
    expect(component.vincularOpen()).toBeFalse();

    // Seleccionar unidad 10
    component.selectUnidad(mockUnidadesGlobal[0]);
    httpMock.expectOne((r) => r.url === rhPersonalUrl(10)).flush({
      unidad: mockUnidadesGlobal[0],
      items: mockPersonalUnidad10,
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.canVincularTrabajador()).toBeTrue();
    const btnGlobal = fixture.nativeElement.querySelector('#rh-open-vincular-btn') as HTMLButtonElement | null;
    expect(btnGlobal).not.toBeNull();
    expect(btnGlobal?.textContent).toContain('Vincular trabajador');

    // B) RECURSOS_HUMANOS CLUES: botón visible en su unidad autorizada
    setupSession(rhCluesSingleUser);
    const loadCluesPromise = component.cargarUnidadesAutorizadas();
    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'CLUES',
      unidades: [mockUnidadesGlobal[0]],
    });
    await Promise.resolve();
    await Promise.resolve();
    httpMock.expectOne((r) => r.url === rhPersonalUrl(10)).flush({
      unidad: mockUnidadesGlobal[0],
      items: mockPersonalUnidad10,
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await loadCluesPromise;
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.canVincularTrabajador()).toBeTrue();
    expect(fixture.nativeElement.querySelector('#rh-open-vincular-btn')).not.toBeNull();

    // C) ADMIN_TIC GLOBAL sin rol RECURSOS_HUMANOS: no muestra el botón ni permite abrir el diálogo aunque tenga unidad 10 seleccionada
    setupSession(adminTicGlobalUser);
    const loadAdminPromise = component.cargarUnidadesAutorizadas();
    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'GLOBAL',
      unidades: mockUnidadesGlobal,
    });
    await Promise.resolve();
    await Promise.resolve();
    httpMock.expectOne((r) => r.url === rhPersonalUrl(10)).flush({
      unidad: mockUnidadesGlobal[0],
      items: mockPersonalUnidad10,
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await loadAdminPromise;
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.selectedUnidadId()).toBe(10);
    expect(component.canVincularTrabajador()).toBeFalse();
    expect(fixture.nativeElement.querySelector('#rh-open-vincular-btn')).toBeNull();
    component.openVincularDialog();
    expect(component.vincularOpen()).toBeFalse();
  });

  it('19 (RH-2B.4B #5, #6, #7, #8, #20). Autocompletado remoto de personas candidatas: búsqueda por nombre, búsqueda por matrícula, navegación por teclado (ArrowDown, Enter, Escape) y protección contra respuestas obsoletas', async () => {
    setupSession(rhGlobalUser);
    createComponent();

    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'GLOBAL',
      unidades: mockUnidadesGlobal,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    component.selectUnidad(mockUnidadesGlobal[0]);
    httpMock.expectOne((r) => r.url === rhPersonalUrl(10)).flush({
      unidad: mockUnidadesGlobal[0],
      items: mockPersonalUnidad10,
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    // Abrir diálogo «Vincular trabajador a la unidad» -> no dispara consulta permanente de personas al abrir
    component.openVincularDialog();
    fixture.detectChanges();
    expect(component.vincularOpen()).toBeTrue();
    httpMock.expectNone((r) => r.url.includes('/personas-candidatas'));
    expect(
      (fixture.nativeElement.querySelector('#rh-vincular-dialog-title') as HTMLElement | null)?.textContent
    ).toContain('Vincular trabajador a la unidad');
    expect(
      (fixture.nativeElement.querySelector('#rh-vincular-dialog-unidad') as HTMLElement | null)?.textContent
    ).toContain('HOSPITAL GENERAL MEXICALI');

    // 1) Iniciar una búsqueda por nombre ("Ana") que quedará obsoleta
    component.candidataSearchDraft.set('Ana');
    const staleSearchPromise = component.ejecutarBusquedaCandidatas('Ana');
    const staleCandReq = httpMock.expectOne(
      (r) =>
        r.url === rhCandidatasUrl(10) &&
        r.params.get('q') === 'Ana' &&
        r.params.get('page') === '1' &&
        r.params.get('pageSize') === '15'
    );

    // 2) Antes de que responda "Ana", el operador busca por matrícula ("MAT-1003")
    component.candidataSearchDraft.set('MAT-1003');
    const freshSearchPromise = component.ejecutarBusquedaCandidatas('MAT-1003');
    const freshCandReq = httpMock.expectOne(
      (r) => r.url === rhCandidatasUrl(10) && r.params.get('q') === 'MAT-1003'
    );

    freshCandReq.flush({
      unidad: mockUnidadesGlobal[0],
      items: [mockCandidataDisponible],
      page: 1,
      pageSize: 15,
      total: 1,
    });
    await freshSearchPromise;

    // Responde tardíamente la petición antigua ("Ana") -> debe ser ignorada
    staleCandReq.flush({
      unidad: mockUnidadesGlobal[0],
      items: [mockCandidataYaAdscrita],
      page: 1,
      pageSize: 15,
      total: 1,
    });
    await staleSearchPromise;
    fixture.detectChanges();

    expect(component.candidataItems().length).toBe(1);
    expect(component.candidataItems()[0].persona_id).toBe(103);

    // Probar Escape para cerrar desplegable, ArrowDown para reabrir y Enter para seleccionar
    component.onCandidataSearchKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.candidataSuggestOpen()).toBeFalse();

    component.onCandidataSearchKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(component.candidataSuggestOpen()).toBeTrue();
    expect(component.candidataSuggestIndex()).toBe(0);

    component.onCandidataSearchKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();

    expect(component.selectedCandidata()?.persona_id).toBe(103);
    expect(component.candidataSearchDraft()).toBe('Lic. Sofía Ramírez');
    expect(component.candidataSuggestOpen()).toBeFalse();
  });

  it('20 (RH-2B.4B #10, #11, #12, #14, #15). Validación de situaciones de la persona candidata (YA_ADSCRITA_EN_UNIDAD y REQUIERE_VALIDACION_OTRA_ADSCRIPCION no permiten POST), fecha inicial obligatoria, orden de fechas y longitudes máximas', async () => {
    setupSession(rhGlobalUser);
    createComponent();

    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'GLOBAL',
      unidades: mockUnidadesGlobal,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    component.selectUnidad(mockUnidadesGlobal[0]);
    httpMock.expectOne((r) => r.url === rhPersonalUrl(10)).flush({
      unidad: mockUnidadesGlobal[0],
      items: mockPersonalUnidad10,
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    component.openVincularDialog();
    fixture.detectChanges();

    // A) Seleccionar persona YA_ADSCRITA_EN_UNIDAD -> muestra aviso y bloquea envío POST
    component.selectCandidata(mockCandidataYaAdscrita);
    component.vincularVigenteDesde.set('2026-11-01');
    fixture.detectChanges();

    expect(component.selectedCandidataBloqueadaEnUnidad()).toBeTrue();
    expect(component.canSubmitVincular()).toBeFalse();
    expect(fixture.nativeElement.querySelector('#rh-vincular-alert-ya-adscrita')).not.toBeNull();
    await component.onSubmitVincular();
    httpMock.expectNone((r) => r.url === rhAdscripcionesUrl(10));
    expect(component.vincularError()).toContain('ya tiene una adscripción RH');

    // B) Seleccionar persona REQUIERE_VALIDACION_OTRA_ADSCRIPCION -> muestra aviso y bloquea envío POST
    component.selectCandidata(mockCandidataRequiereValidacion);
    fixture.detectChanges();

    expect(component.selectedCandidataRequiereValidacion()).toBeTrue();
    expect(component.canSubmitVincular()).toBeFalse();
    expect(fixture.nativeElement.querySelector('#rh-vincular-alert-requiere-validacion')).not.toBeNull();
    await component.onSubmitVincular();
    httpMock.expectNone((r) => r.url === rhAdscripcionesUrl(10));
    expect(component.vincularError()).toContain('revisión administrativa');

    // C) Seleccionar persona DISPONIBLE_DIRECTORIO -> exige fecha inicial obligatoria (no asigna fecha silenciosamente)
    component.clearSelectedCandidata();
    component.selectCandidata(mockCandidataDisponible);
    component.vincularVigenteDesde.set('');
    fixture.detectChanges();

    expect(component.vincularVigenteDesde()).toBe('');
    expect(component.canSubmitVincular()).toBeFalse();
    await component.onSubmitVincular();
    httpMock.expectNone((r) => r.url === rhAdscripcionesUrl(10));
    expect(component.vincularError()).toContain('obligatoria');

    // D) Validar que vigente_hasta < vigente_desde muestra error y bloquea envío
    component.vincularVigenteDesde.set('2026-11-15');
    component.vincularVigenteHasta.set('2026-11-01');
    fixture.detectChanges();

    expect(component.vincularDatesOrderInvalid()).toBeTrue();
    expect(component.canSubmitVincular()).toBeFalse();
    expect(fixture.nativeElement.querySelector('#rh-vincular-dates-error')).not.toBeNull();
    await component.onSubmitVincular();
    httpMock.expectNone((r) => r.url === rhAdscripcionesUrl(10));

    // E) Validar longitudes máximas (matricula > 64)
    component.vincularVigenteHasta.set('2026-12-31');
    component.vincularMatricula.set('M'.repeat(65));
    fixture.detectChanges();

    expect(component.vincularFieldLengthError()).toContain('64');
    expect(component.canSubmitVincular()).toBeFalse();
    await component.onSubmitVincular();
    httpMock.expectNone((r) => r.url === rhAdscripcionesUrl(10));
  });

  it('21 (RH-2B.4B #9, #13, #16, #21, #22). Envío POST exitoso (HTTP 201): payload estricto sin RFC/CURP ni campos prohibidos, prevención de doble envío, cierre del formulario, banner de éxito y refresco automático del padrón', async () => {
    setupSession(rhGlobalUser);
    createComponent();

    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'GLOBAL',
      unidades: mockUnidadesGlobal,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    component.selectUnidad(mockUnidadesGlobal[0]);
    httpMock.expectOne((r) => r.url === rhPersonalUrl(10)).flush({
      unidad: mockUnidadesGlobal[0],
      items: mockPersonalUnidad10,
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    component.openVincularDialog();
    component.selectCandidata(mockCandidataDisponible);
    component.vincularMatricula.set('  MAT-1003  ');
    component.vincularPuesto.set('  Analista Administrativo  ');
    component.vincularTurno.set('  MATUTINO  ');
    component.vincularJornada.set('  8 HORAS  ');
    component.vincularHorario.set('  08:00 - 16:00  ');
    component.vincularVigenteDesde.set('2026-11-01');
    component.vincularVigenteHasta.set('');
    fixture.detectChanges();

    expect(component.canSubmitVincular()).toBeTrue();

    // Disparar submit y probar doble clic inmediato (prevención de doble envío)
    const submitPromise1 = component.onSubmitVincular();
    const submitPromise2 = component.onSubmitVincular();
    expect(component.vincularSubmitting()).toBeTrue();

    const postReq = httpMock.expectOne(
      (r) => r.url === rhAdscripcionesUrl(10) && r.method === 'POST'
    );

    // Verificar payload exacto (solo las 8 propiedades permitidas, sin rfc, curp, unidad_medica_id, activo ni nombre_completo)
    expect(postReq.request.body).toEqual({
      persona_id: 103,
      matricula: 'MAT-1003',
      puesto: 'Analista Administrativo',
      turno: 'MATUTINO',
      jornada: '8 HORAS',
      horario: '08:00 - 16:00',
      vigente_desde: '2026-11-01',
      vigente_hasta: null,
    });
    expect(Object.keys(postReq.request.body).sort()).toEqual([
      'horario',
      'jornada',
      'matricula',
      'persona_id',
      'puesto',
      'turno',
      'vigente_desde',
      'vigente_hasta',
    ]);

    // Responder HTTP 201 Created
    postReq.flush(
      {
        adscripcion_laboral_id: 7001,
        persona_id: 103,
        nombre_completo: 'Lic. Sofía Ramírez',
        unidad: mockUnidadesGlobal[0],
        unidad_medica_id: 10,
        matricula: 'MAT-1003',
        puesto: 'Analista Administrativo',
        turno: 'MATUTINO',
        jornada: '8 HORAS',
        horario: '08:00 - 16:00',
        vigente_desde: '2026-11-01',
        vigente_hasta: null,
        activo: true,
      },
      { status: 201, statusText: 'Created' }
    );

    // Al recibir 201 se dispara automáticamente el refresco del padrón de la unidad 10
    await Promise.resolve();
    await Promise.resolve();
    const refreshReq = httpMock.expectOne(
      (r) => r.url === rhPersonalUrl(10) && r.method === 'GET'
    );
    const updatedPersonal: RhPersonalUnidadItem[] = [
      ...mockPersonalUnidad10,
      {
        persona_id: 103,
        nombre_completo: 'Lic. Sofía Ramírez',
        adscripcion_laboral_id: 7001,
        unidad_medica_id: 10,
        matricula: 'MAT-1003',
        puesto: 'Analista Administrativo',
        turno: 'MATUTINO',
        jornada: '8 HORAS',
        horario: '08:00 - 16:00',
        vigente_desde: '2026-11-01',
        vigente_hasta: null,
        activo: true,
      },
    ];
    refreshReq.flush({
      unidad: mockUnidadesGlobal[0],
      items: updatedPersonal,
      page: 1,
      pageSize: 20,
      total: 3,
    });

    await submitPromise1;
    await submitPromise2;
    await fixture.whenStable();
    fixture.detectChanges();

    // Verificar estado posterior a HTTP 201
    expect(component.vincularOpen()).toBeFalse();
    expect(component.selectedCandidata()).toBeNull();
    expect(component.selectedUnidadId()).toBe(10);
    expect(component.vincularSuccessBanner()).toBe(
      'Trabajador vinculado correctamente al padrón laboral'
    );
    expect(component.personalTotal()).toBe(3);
    expect(component.personalItems().length).toBe(3);
    expect(
      (fixture.nativeElement.querySelector('#rh-vincular-success-banner') as HTMLElement | null)
        ?.textContent
    ).toContain('Trabajador vinculado correctamente al padrón laboral');
  });

  it('22 (RH-2B.4B #17, #18, #19). Manejo de HTTP 409 (conflicto sin reenvío automático), HTTP 403/401 al guardar, e invalidación del formulario al cambiar o limpiar la unidad seleccionada', async () => {
    setupSession(rhGlobalUser);
    createComponent();

    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'GLOBAL',
      unidades: mockUnidadesGlobal,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    component.selectUnidad(mockUnidadesGlobal[0]);
    httpMock.expectOne((r) => r.url === rhPersonalUrl(10)).flush({
      unidad: mockUnidadesGlobal[0],
      items: mockPersonalUnidad10,
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    // A) HTTP 409 muestra mensaje comprensible en el formulario sin cerrarlo ni reenviar automáticamente
    component.openVincularDialog();
    component.selectCandidata(mockCandidataDisponible);
    component.vincularVigenteDesde.set('2026-11-01');
    fixture.detectChanges();

    const submit409 = component.onSubmitVincular();
    httpMock
      .expectOne((r) => r.url === rhAdscripcionesUrl(10) && r.method === 'POST')
      .flush(
        { error: 'La persona seleccionada ya cuenta con una adscripción activa en esta unidad' },
        { status: 409, statusText: 'Conflict' }
      );
    await submit409;
    fixture.detectChanges();

    expect(component.vincularOpen()).toBeTrue();
    expect(component.vincularError()).toContain(
      'La persona seleccionada ya cuenta con una adscripción activa en esta unidad'
    );
    expect(component.vincularSuccessBanner()).toBeNull();

    // B) Cambiar de unidad mientras el diálogo está abierto invalida la persona seleccionada y cierra el formulario
    component.selectUnidad(mockUnidadesGlobal[1]); // Cambia a unidad 20
    httpMock.expectOne((r) => r.url === rhPersonalUrl(20)).flush({
      unidad: mockUnidadesGlobal[1],
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.vincularOpen()).toBeFalse();
    expect(component.selectedCandidata()).toBeNull();
    expect(component.vincularTargetUnidadId()).toBeNull();

    // C) HTTP 403 al guardar limpia el formulario y la unidad seleccionada conforme al flujo actual
    component.openVincularDialog();
    component.selectCandidata(mockCandidataDisponible);
    component.vincularVigenteDesde.set('2026-11-01');
    const submit403 = component.onSubmitVincular();
    httpMock
      .expectOne((r) => r.url === rhAdscripcionesUrl(20) && r.method === 'POST')
      .flush({ error: 'Unidad no autorizada' }, { status: 403, statusText: 'Forbidden' });
    await submit403;
    fixture.detectChanges();

    expect(component.vincularOpen()).toBeFalse();
    expect(component.selectedCandidata()).toBeNull();
    expect(component.selectedUnidadId()).toBeNull();
    expect(component.accessDeniedError()).toContain('Unidad no autorizada');
  });

  // =========================================================================
  // SUITE RH-2B.4D (FICHA INDIVIDUAL PROTEGIDA DEL TRABAJADOR - SOLO LECTURA)
  // =========================================================================

  const mockFichaAna5001: RhTrabajadorFichaResponse = {
    unidad: {
      id: 10,
      nombre: 'HOSPITAL GENERAL MEXICALI',
      cluesimb: 'BCIMB000001',
    },
    personal: {
      persona_id: 101,
      nombre_completo: 'Dra. Ana Gómez',
      nombres: 'Ana',
      apellidos: 'Gómez',
      tiene_rfc: true,
      rfc_masked: '**********ABC',
      tiene_curp: true,
      curp_masked: '****************01',
      activo: true,
    },
    laboral: {
      adscripcion_laboral_id: 5001,
      unidad_medica_id: 10,
      matricula: 'MAT-1001',
      puesto: 'Médico Especialista A',
      turno: 'MATUTINO',
      jornada: '8 HORAS',
      horario: '07:00 - 15:00',
      vigente_desde: '2026-01-01',
      vigente_hasta: null,
      activo: true,
      observaciones: 'Base federalizada',
    },
    permisos: {
      puede_editar_laboral: true,
      puede_revelar_sensibles: true,
      puede_editar_identificacion: true,
    },
  };

  const mockFichaLuis5002: RhTrabajadorFichaResponse = {
    unidad: {
      id: 10,
      nombre: 'HOSPITAL GENERAL MEXICALI',
      cluesimb: 'BCIMB000001',
    },
    personal: {
      persona_id: 102,
      nombre_completo: 'Enf. Luis Pérez',
      nombres: null,
      apellidos: null,
      tiene_rfc: false,
      rfc_masked: null,
      tiene_curp: false,
      curp_masked: null,
      activo: false,
    },
    laboral: {
      adscripcion_laboral_id: 5002,
      unidad_medica_id: 10,
      matricula: null,
      puesto: null,
      turno: null,
      jornada: null,
      horario: null,
      vigente_desde: '2026-02-01',
      vigente_hasta: '2026-12-31',
      activo: false,
      observaciones: null,
    },
    permisos: {
      puede_editar_laboral: true,
      puede_revelar_sensibles: false,
      puede_editar_identificacion: false,
    },
  };

  it('23 (RH-2B.4D #1, #2, #3, #4, #5, #6, #7, #8, #9, #10, #11, #12, #19). Acción «Ver ficha» usa unidadId y adscripcion_laboral_id reales (no persona_id), muestra estado de carga, renderiza RFC/CURP enmascarados o «No registrado», datos laborales y permisos informativos sin habilitar edición ni revelación', async () => {
    setupSession(rhGlobalUser);
    createComponent();

    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'GLOBAL',
      unidades: mockUnidadesGlobal,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    component.selectUnidad(mockUnidadesGlobal[0]);
    httpMock.expectOne((r) => r.url === rhPersonalUrl(10)).flush({
      unidad: mockUnidadesGlobal[0],
      items: mockPersonalUnidad10,
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    // 1. Verificar que los botones «Ver ficha» existen en tabla y tarjetas móviles para cada adscripcion_laboral_id (5001 y 5002)
    const btnVerFicha5001 = fixture.nativeElement.querySelector(
      '#rh-ver-ficha-btn-5001'
    ) as HTMLButtonElement | null;
    const btnVerFichaMobile5001 = fixture.nativeElement.querySelector(
      '#rh-ver-ficha-mobile-btn-5001'
    ) as HTMLButtonElement | null;
    const btnVerFicha5002 = fixture.nativeElement.querySelector(
      '#rh-ver-ficha-btn-5002'
    ) as HTMLButtonElement | null;
    expect(btnVerFicha5001).not.toBeNull();
    expect(btnVerFichaMobile5001).not.toBeNull();
    expect(btnVerFicha5002).not.toBeNull();
    expect(btnVerFicha5001?.textContent).toContain('Ver ficha');

    // 2, 3, 4 y 5. Al hacer clic en «Ver ficha» del registro 5001 (cuyo persona_id es 101):
    // abre el diálogo en estado de carga y consulta GET /api/rh/unidades/10/personal/5001 (nunca /personal/101)
    btnVerFicha5001!.click();
    fixture.detectChanges();

    expect(component.fichaOpen()).toBeTrue();
    expect(component.fichaLoading()).toBeTrue();
    expect(fixture.nativeElement.querySelector('#rh-ficha-loading')).not.toBeNull();
    httpMock.expectNone((r) => r.url === rhFichaUrl(10, 101));

    const reqFicha5001 = httpMock.expectOne(
      (r) => r.url === rhFichaUrl(10, 5001) && r.method === 'GET'
    );
    reqFicha5001.flush(mockFichaAna5001);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.fichaLoading()).toBeFalse();
    expect(component.fichaData()).toEqual(mockFichaAna5001);

    // 6, 7 y 8. Verificar renderizado de identificación personal, RFC/CURP enmascarados y datos laborales
    const dialogEl = fixture.nativeElement.querySelector('#rh-ficha-dialog') as HTMLElement | null;
    expect(dialogEl).not.toBeNull();
    const dialogText = dialogEl?.textContent ?? '';

    expect(dialogText).toContain('Ficha del trabajador');
    expect(dialogText).toContain('Dra. Ana Gómez');
    expect(dialogText).toContain('HOSPITAL GENERAL MEXICALI');
    expect(dialogText).toContain('Ana');
    expect(dialogText).toContain('Gómez');
    expect(dialogText).toContain('Persona activa');

    const rfcEl = fixture.nativeElement.querySelector('#rh-ficha-rfc-masked') as HTMLElement | null;
    const curpEl = fixture.nativeElement.querySelector('#rh-ficha-curp-masked') as HTMLElement | null;
    expect(rfcEl?.textContent?.trim()).toBe('**********ABC');
    expect(curpEl?.textContent?.trim()).toBe('****************01');

    // 10. Ningún RFC o CURP completo aparece en el DOM ni en almacenamiento local
    expect(dialogText).not.toContain('GOMA800101');
    expect(localStorage.getItem('ficha')).toBeNull();

    // Datos laborales y fechas formateadas sin desplazamiento de zona horaria
    expect(dialogText).toContain('MAT-1001');
    expect(dialogText).toContain('Médico Especialista A');
    expect(dialogText).toContain('MATUTINO');
    expect(dialogText).toContain('8 HORAS');
    expect(dialogText).toContain('07:00 - 15:00');
    expect(dialogText).toContain('01/01/2026 (2026-01-01)');
    expect(dialogText).toContain('Indefinida');
    expect(dialogText).toContain('Adscripción activa');
    expect(dialogText).toContain('Base federalizada');

    // 11, 12 y 19. Permisos informativos renderizados sin inputs ni botones de edición o revelación
    expect(dialogText).toContain('Autorizada por rol');
    expect(dialogText).toContain('Nivel estatal RH');
    expect(dialogEl?.querySelectorAll('input, select, textarea').length).toBe(0);
    expect(dialogText).not.toContain('Mostrar RFC');
    expect(dialogText).not.toContain('Mostrar CURP');
    expect(dialogText).not.toContain('Guardar');

    // 9. Ahora abrir la ficha 5002 (Enf. Luis Pérez) con RFC/CURP nulos y campos opcionales nulos
    btnVerFicha5002!.click();
    fixture.detectChanges();

    const reqFicha5002 = httpMock.expectOne(
      (r) => r.url === rhFichaUrl(10, 5002) && r.method === 'GET'
    );
    reqFicha5002.flush(mockFichaLuis5002);
    await fixture.whenStable();
    fixture.detectChanges();

    const rfcNullEl = fixture.nativeElement.querySelector('#rh-ficha-rfc-masked') as HTMLElement | null;
    const curpNullEl = fixture.nativeElement.querySelector('#rh-ficha-curp-masked') as HTMLElement | null;
    expect(rfcNullEl?.textContent?.trim()).toBe('No registrado');
    expect(curpNullEl?.textContent?.trim()).toBe('No registrado');

    const dialogText5002 =
      (fixture.nativeElement.querySelector('#rh-ficha-dialog') as HTMLElement | null)?.textContent ?? '';
    expect(dialogText5002).toContain('Persona inactiva');
    expect(dialogText5002).toContain('Adscripción inactiva');
    expect(dialogText5002).toContain('Sin registrar');
    expect(dialogText5002).toContain('No especificado');
    expect(dialogText5002).toContain('01/02/2026 (2026-02-01)');
    expect(dialogText5002).toContain('31/12/2026 (2026-12-31)');
    expect(dialogText5002).toContain('Sin observaciones registradas');
    expect(dialogText5002).toContain('Enmascarado');
    expect(dialogText5002).toContain('Restringida');
  });

  it('24 (RH-2B.4D #13, #14, #15). Protección de información: cerrar la ficha limpia su estado, cambiar de unidad cierra y limpia la ficha inmediatamente, y respuestas HTTP obsoletas no sobrescriben la ficha actual', async () => {
    setupSession(rhGlobalUser);
    createComponent();

    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'GLOBAL',
      unidades: mockUnidadesGlobal,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    component.selectUnidad(mockUnidadesGlobal[0]);
    httpMock.expectOne((r) => r.url === rhPersonalUrl(10)).flush({
      unidad: mockUnidadesGlobal[0],
      items: mockPersonalUnidad10,
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    // 15. Abrir ficha 5001 (petición lenta) y enseguida abrir ficha 5002 antes de que responda 5001
    component.openFichaTrabajador(mockPersonalUnidad10[0]); // 5001
    const staleFichaReq = httpMock.expectOne((r) => r.url === rhFichaUrl(10, 5001));

    component.openFichaTrabajador(mockPersonalUnidad10[1]); // 5002
    const freshFichaReq = httpMock.expectOne((r) => r.url === rhFichaUrl(10, 5002));

    freshFichaReq.flush(mockFichaLuis5002);
    await Promise.resolve();
    await Promise.resolve();

    // Responde tardíamente 5001 -> debe ser ignorada
    staleFichaReq.flush(mockFichaAna5001);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.fichaData()?.laboral.adscripcion_laboral_id).toBe(5002);
    expect(component.fichaData()?.personal.nombre_completo).toBe('Enf. Luis Pérez');

    // 13. Cerrar la ficha limpia completamente el estado y retira el diálogo del DOM
    component.closeFichaTrabajador();
    fixture.detectChanges();

    expect(component.fichaOpen()).toBeFalse();
    expect(component.fichaData()).toBeNull();
    expect(component.fichaTargetAdscripcionId()).toBeNull();
    expect(fixture.nativeElement.querySelector('#rh-ficha-dialog')).toBeNull();

    // 14. Reabrir ficha y cambiar de unidad -> cierra y limpia inmediatamente la ficha e ignora peticiones pendientes
    component.openFichaTrabajador(mockPersonalUnidad10[0]);
    const pendingBeforeUnitChange = httpMock.expectOne((r) => r.url === rhFichaUrl(10, 5001));
    expect(component.fichaOpen()).toBeTrue();

    component.selectUnidad(mockUnidadesGlobal[1]); // Cambia a unidad 20
    expect(component.fichaOpen()).toBeFalse();
    expect(component.fichaData()).toBeNull();
    expect(component.fichaTargetUnidadId()).toBeNull();

    httpMock.expectOne((r) => r.url === rhPersonalUrl(20)).flush({
      unidad: mockUnidadesGlobal[1],
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });

    // Aunque la petición pendiente de la unidad 10 responda después, no reabre ni contamina el estado
    pendingBeforeUnitChange.flush(mockFichaAna5001);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.fichaOpen()).toBeFalse();
    expect(component.fichaData()).toBeNull();
  });

  it('25 (RH-2B.4D #16, #17, #18). Manejo de errores en la ficha: HTTP 500 con botón Reintentar funcional, HTTP 404 sin reintento y HTTP 403/401 limpiando estado y sesión según corresponda', async () => {
    setupSession(rhGlobalUser);
    createComponent();

    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'GLOBAL',
      unidades: mockUnidadesGlobal,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    component.selectUnidad(mockUnidadesGlobal[0]);
    httpMock.expectOne((r) => r.url === rhPersonalUrl(10)).flush({
      unidad: mockUnidadesGlobal[0],
      items: mockPersonalUnidad10,
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    // A) HTTP 500 muestra error recuperable y permite reintentar con éxito
    component.openFichaTrabajador(mockPersonalUnidad10[0]);
    httpMock
      .expectOne((r) => r.url === rhFichaUrl(10, 5001))
      .flush({ error: 'DB timeout' }, { status: 500, statusText: 'Internal Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.fichaError()).toContain('No fue posible consultar la ficha del trabajador');
    expect(component.fichaCanRetry()).toBeTrue();
    const retryBtn = fixture.nativeElement.querySelector(
      '#rh-ficha-retry-btn'
    ) as HTMLButtonElement | null;
    expect(retryBtn).not.toBeNull();

    retryBtn!.click();
    httpMock.expectOne((r) => r.url === rhFichaUrl(10, 5001)).flush(mockFichaAna5001);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.fichaError()).toBeNull();
    expect(component.fichaData()?.personal.nombre_completo).toBe('Dra. Ana Gómez');

    // B) HTTP 404 muestra mensaje comprensible sin botón de reintento
    component.openFichaTrabajador(mockPersonalUnidad10[1]);
    httpMock
      .expectOne((r) => r.url === rhFichaUrl(10, 5002))
      .flush({ error: 'No encontrada' }, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.fichaError()).toContain('HTTP 404');
    expect(component.fichaCanRetry()).toBeFalse();
    expect(fixture.nativeElement.querySelector('#rh-ficha-retry-btn')).toBeNull();

    // C) HTTP 403 cierra y limpia la ficha, limpia la unidad seleccionada y muestra alerta de acceso restringido
    component.openFichaTrabajador(mockPersonalUnidad10[0]);
    httpMock
      .expectOne((r) => r.url === rhFichaUrl(10, 5001))
      .flush({ error: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.fichaOpen()).toBeFalse();
    expect(component.fichaData()).toBeNull();
    expect(component.selectedUnidadId()).toBeNull();
    expect(component.accessDeniedError()).toContain('403');
  });

  // =========================================================================
  // SUITE RH-2B.4F (EDICIÓN LABORAL DESDE LA FICHA DEL TRABAJADOR)
  // =========================================================================

  it('26 (RH-2B.4F #1, #2, #3, #4, #5, #19). Botón «Editar información laboral» visible solo cuando puede_editar_laboral=true; inicializa campos desde data.laboral, mantiene identificación personal y RFC/CURP en modo lectura, deshabilita Guardar sin cambios y Cancelar descarta cambios sin emitir PATCH', async () => {
    setupSession(rhGlobalUser);
    createComponent();

    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'GLOBAL',
      unidades: mockUnidadesGlobal,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    component.selectUnidad(mockUnidadesGlobal[0]);
    httpMock.expectOne((r) => r.url === rhPersonalUrl(10)).flush({
      unidad: mockUnidadesGlobal[0],
      items: mockPersonalUnidad10,
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    // A) Cuando puede_editar_laboral = false (ej. ADMIN_TIC GLOBAL), el botón «Editar información laboral» NO aparece
    component.openFichaTrabajador(mockPersonalUnidad10[0]);
    httpMock.expectOne((r) => r.url === rhFichaUrl(10, 5001)).flush({
      ...mockFichaAna5001,
      permisos: {
        puede_editar_laboral: false,
        puede_revelar_sensibles: false,
        puede_editar_identificacion: false,
      },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#rh-ficha-edit-laboral-btn')).toBeNull();

    // B) Cuando puede_editar_laboral = true, el botón aparece y al pulsarlo convierte solo la sección laboral en formulario editable
    component.closeFichaTrabajador();
    component.openFichaTrabajador(mockPersonalUnidad10[0]);
    httpMock.expectOne((r) => r.url === rhFichaUrl(10, 5001)).flush(mockFichaAna5001);
    await fixture.whenStable();
    fixture.detectChanges();

    const editBtn = fixture.nativeElement.querySelector(
      '#rh-ficha-edit-laboral-btn'
    ) as HTMLButtonElement | null;
    expect(editBtn).not.toBeNull();
    expect(editBtn?.textContent).toContain('Editar información laboral');

    editBtn!.click();
    fixture.detectChanges();

    // Verificar que la sección A (Identificación personal) sigue exclusivamente en modo lectura con RFC/CURP enmascarados
    const personalSection = fixture.nativeElement.querySelector(
      '#rh-ficha-personal-section'
    ) as HTMLElement | null;
    expect(personalSection?.querySelectorAll('input, select, textarea').length).toBe(0);
    expect(
      (fixture.nativeElement.querySelector('#rh-ficha-rfc-masked') as HTMLElement | null)
        ?.textContent?.trim()
    ).toBe('**********ABC');

    // Verificar inicialización exacta de los controles laborales
    const matInput = fixture.nativeElement.querySelector(
      '#rh-ficha-edit-matricula'
    ) as HTMLInputElement;
    const puestoInput = fixture.nativeElement.querySelector(
      '#rh-ficha-edit-puesto'
    ) as HTMLInputElement;
    const desdeInput = fixture.nativeElement.querySelector(
      '#rh-ficha-edit-vigente-desde'
    ) as HTMLInputElement;
    const saveBtn = fixture.nativeElement.querySelector(
      '#rh-ficha-save-edit-btn'
    ) as HTMLButtonElement;
    const cancelBtn = fixture.nativeElement.querySelector(
      '#rh-ficha-cancel-edit-btn'
    ) as HTMLButtonElement;

    expect(matInput.value).toBe('MAT-1001');
    expect(puestoInput.value).toBe('Médico Especialista A');
    expect(desdeInput.value).toBe('2026-01-01');

    // Sin modificaciones efectivas, «Guardar cambios» está deshabilitado
    expect(saveBtn.disabled).toBeTrue();

    // Modificar puesto y luego pulsar «Cancelar» -> descarta cambios, regresa a modo lectura y no envía PATCH
    puestoInput.value = 'Puesto Temporal Descartado';
    puestoInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(saveBtn.disabled).toBeFalse();

    cancelBtn.click();
    fixture.detectChanges();

    httpMock.expectNone((r) => r.method === 'PATCH');
    expect(fixture.nativeElement.querySelector('#rh-ficha-laboral-edit-form')).toBeNull();
    expect(
      (fixture.nativeElement.querySelector('#rh-ficha-puesto') as HTMLElement | null)?.textContent
    ).toContain('Médico Especialista A');
  });

  it('27 (RH-2B.4F #6, #7, #8, #9, #10, #11). Validaciones del formulario laboral (fecha inicial obligatoria, orden de fechas, longitudes máximas) y cálculo de payload PATCH parcial (un solo campo, limpieza a null y booleano de estado)', async () => {
    setupSession(rhGlobalUser);
    createComponent();

    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'GLOBAL',
      unidades: mockUnidadesGlobal,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    component.selectUnidad(mockUnidadesGlobal[0]);
    httpMock.expectOne((r) => r.url === rhPersonalUrl(10)).flush({
      unidad: mockUnidadesGlobal[0],
      items: mockPersonalUnidad10,
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    component.openFichaTrabajador(mockPersonalUnidad10[0]);
    httpMock.expectOne((r) => r.url === rhFichaUrl(10, 5001)).flush(mockFichaAna5001);
    await fixture.whenStable();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('#rh-ficha-edit-laboral-btn') as HTMLButtonElement).click();
    fixture.detectChanges();

    const desdeInput = fixture.nativeElement.querySelector(
      '#rh-ficha-edit-vigente-desde'
    ) as HTMLInputElement;
    const hastaInput = fixture.nativeElement.querySelector(
      '#rh-ficha-edit-vigente-hasta'
    ) as HTMLInputElement;
    const matInput = fixture.nativeElement.querySelector(
      '#rh-ficha-edit-matricula'
    ) as HTMLInputElement;
    const saveBtn = fixture.nativeElement.querySelector(
      '#rh-ficha-save-edit-btn'
    ) as HTMLButtonElement;

    // 8. Vigente desde vacío -> error y botón deshabilitado
    desdeInput.value = '';
    desdeInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(saveBtn.disabled).toBeTrue();
    expect(fixture.nativeElement.querySelector('#rh-ficha-edit-dates-error')?.textContent).toContain(
      'obligatoria'
    );

    // 9. Vigente hasta anterior a vigente desde -> error y botón deshabilitado
    desdeInput.value = '2026-06-10';
    desdeInput.dispatchEvent(new Event('input'));
    hastaInput.value = '2026-06-01';
    hastaInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(saveBtn.disabled).toBeTrue();
    expect(fixture.nativeElement.querySelector('#rh-ficha-edit-dates-error')?.textContent).toContain(
      'no puede ser anterior'
    );

    // 10. Longitud excedida -> error y botón deshabilitado
    hastaInput.value = '';
    hastaInput.dispatchEvent(new Event('input'));
    desdeInput.value = '2026-01-01';
    desdeInput.dispatchEvent(new Event('input'));
    matInput.value = 'X'.repeat(65);
    matInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(saveBtn.disabled).toBeTrue();
    expect(fixture.nativeElement.querySelector('#rh-ficha-edit-length-error')?.textContent).toContain(
      '64'
    );

    // 6. Cambio de un solo campo envía exclusivamente esa propiedad en el PATCH
    matInput.value = 'MAT-1001';
    matInput.dispatchEvent(new Event('input'));
    const puestoInput = fixture.nativeElement.querySelector(
      '#rh-ficha-edit-puesto'
    ) as HTMLInputElement;
    puestoInput.value = '  Médico Especialista B  ';
    puestoInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(saveBtn.disabled).toBeFalse();
    saveBtn.click();

    const patchReqSingle = httpMock.expectOne(
      (r) => r.url === rhFichaLaboralPatchUrl(10, 5001) && r.method === 'PATCH'
    );
    expect(patchReqSingle.request.body).toEqual({
      puesto: 'Médico Especialista B',
    });
    expect(Object.keys(patchReqSingle.request.body)).toEqual(['puesto']);

    patchReqSingle.flush({
      unidad: mockUnidadesGlobal[0],
      laboral: {
        ...mockFichaAna5001.laboral,
        puesto: 'Médico Especialista B',
      },
      campos_modificados: ['puesto'],
    });
    await Promise.resolve();
    await Promise.resolve();
    httpMock.expectOne((r) => r.url === rhPersonalUrl(10) && r.method === 'GET').flush({
      unidad: mockUnidadesGlobal[0],
      items: mockPersonalUnidad10,
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    // 7 y 11. Volver a abrir modo edición, limpiar `observaciones` (a null) y cambiar `activo` a false
    (fixture.nativeElement.querySelector('#rh-ficha-edit-laboral-btn') as HTMLButtonElement).click();
    fixture.detectChanges();

    const obsInput = fixture.nativeElement.querySelector(
      '#rh-ficha-edit-observaciones'
    ) as HTMLTextAreaElement;
    const activoCheckbox = fixture.nativeElement.querySelector(
      '#rh-ficha-edit-activo'
    ) as HTMLInputElement;

    obsInput.value = '   ';
    obsInput.dispatchEvent(new Event('input'));
    activoCheckbox.click();
    fixture.detectChanges();

    const saveBtn2 = fixture.nativeElement.querySelector(
      '#rh-ficha-save-edit-btn'
    ) as HTMLButtonElement;
    saveBtn2.click();

    const patchReqNullAndBool = httpMock.expectOne(
      (r) => r.url === rhFichaLaboralPatchUrl(10, 5001) && r.method === 'PATCH'
    );
    expect(patchReqNullAndBool.request.body).toEqual({
      activo: false,
      observaciones: null,
    });

    patchReqNullAndBool.flush({
      unidad: mockUnidadesGlobal[0],
      laboral: {
        ...mockFichaAna5001.laboral,
        puesto: 'Médico Especialista B',
        activo: false,
        observaciones: null,
      },
      campos_modificados: ['activo', 'observaciones'],
    });
    await Promise.resolve();
    await Promise.resolve();
    httpMock.expectOne((r) => r.url === rhPersonalUrl(10) && r.method === 'GET').flush({
      unidad: mockUnidadesGlobal[0],
      items: mockPersonalUnidad10,
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('28 (RH-2B.4F #12, #13, #14, #15, #16, #17, #18). Prevención de doble envío, éxito HTTP 200 (actualiza ficha abierta, muestra confirmación y refresca padrón), conflicto HTTP 409 (con opción de recargar ficha o cancelar), error 500, error 403 e invalidación al cambiar de unidad', async () => {
    setupSession(rhGlobalUser);
    createComponent();

    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'GLOBAL',
      unidades: mockUnidadesGlobal,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    component.selectUnidad(mockUnidadesGlobal[0]);
    httpMock.expectOne((r) => r.url === rhPersonalUrl(10)).flush({
      unidad: mockUnidadesGlobal[0],
      items: mockPersonalUnidad10,
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    component.openFichaTrabajador(mockPersonalUnidad10[0]);
    httpMock.expectOne((r) => r.url === rhFichaUrl(10, 5001)).flush(mockFichaAna5001);
    await fixture.whenStable();
    fixture.detectChanges();

    // 12, 13 y 14. Prevención de doble envío y flujo completo de HTTP 200
    (fixture.nativeElement.querySelector('#rh-ficha-edit-laboral-btn') as HTMLButtonElement).click();
    fixture.detectChanges();

    const horarioInput = fixture.nativeElement.querySelector(
      '#rh-ficha-edit-horario'
    ) as HTMLInputElement;
    horarioInput.value = '08:00 - 16:00';
    horarioInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const savePromise1 = component.onSaveFichaLaboral({ horario: '08:00 - 16:00' });
    const savePromise2 = component.onSaveFichaLaboral({ horario: '08:00 - 16:00' });
    expect(component.fichaSavingLaboral()).toBeTrue();

    const patchReq = httpMock.expectOne(
      (r) => r.url === rhFichaLaboralPatchUrl(10, 5001) && r.method === 'PATCH'
    );
    patchReq.flush({
      unidad: mockUnidadesGlobal[0],
      laboral: {
        ...mockFichaAna5001.laboral,
        horario: '08:00 - 16:00',
      },
      campos_modificados: ['horario'],
    });

    await Promise.resolve();
    await Promise.resolve();
    const refreshPersonalReq = httpMock.expectOne(
      (r) => r.url === rhPersonalUrl(10) && r.method === 'GET'
    );
    refreshPersonalReq.flush({
      unidad: mockUnidadesGlobal[0],
      items: [
        { ...mockPersonalUnidad10[0], horario: '08:00 - 16:00' },
        mockPersonalUnidad10[1],
      ],
      page: 1,
      pageSize: 20,
      total: 2,
    });

    await savePromise1;
    await savePromise2;
    await fixture.whenStable();
    fixture.detectChanges();

    // Ficha permanece abierta en modo consulta mostrando el horario actualizado y el banner de éxito
    expect(component.fichaOpen()).toBeTrue();
    expect(component.fichaData()?.laboral.horario).toBe('08:00 - 16:00');
    expect(component.personalItems()[0].horario).toBe('08:00 - 16:00');
    expect(fixture.nativeElement.querySelector('#rh-ficha-laboral-edit-form')).toBeNull();
    expect(
      (fixture.nativeElement.querySelector('#rh-ficha-laboral-success-banner') as HTMLElement | null)
        ?.textContent
    ).toContain('Información laboral actualizada correctamente');

    // 15. HTTP 409 mantiene el formulario visible, muestra el conflicto y ofrece «Recargar ficha» o «Cancelar edición»
    (fixture.nativeElement.querySelector('#rh-ficha-edit-laboral-btn') as HTMLButtonElement).click();
    fixture.detectChanges();

    const save409Promise = component.onSaveFichaLaboral({ vigente_desde: '2025-01-01' });
    httpMock
      .expectOne((r) => r.url === rhFichaLaboralPatchUrl(10, 5001) && r.method === 'PATCH')
      .flush(
        { error: 'El periodo de vigencia resultante se solapa con otra adscripción' },
        { status: 409, statusText: 'Conflict' }
      );
    await save409Promise;
    fixture.detectChanges();

    expect(component.fichaSaveLaboralIsConflict()).toBeTrue();
    expect(fixture.nativeElement.querySelector('#rh-ficha-laboral-edit-form')).not.toBeNull();
    expect(
      (fixture.nativeElement.querySelector('#rh-ficha-laboral-save-error') as HTMLElement | null)
        ?.textContent
    ).toContain('El periodo de vigencia resultante se solapa');
    const reloadConflictBtn = fixture.nativeElement.querySelector(
      '#rh-ficha-conflict-reload-btn'
    ) as HTMLButtonElement | null;
    expect(reloadConflictBtn).not.toBeNull();

    // Pulsar «Recargar ficha» tras conflicto recarga la ficha y sale de modo edición
    reloadConflictBtn!.click();
    httpMock.expectOne((r) => r.url === rhFichaUrl(10, 5001)).flush(mockFichaAna5001);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#rh-ficha-laboral-edit-form')).toBeNull();

    // 17. HTTP 500 mantiene el formulario visible con el error para permitir reintentar o cancelar
    (fixture.nativeElement.querySelector('#rh-ficha-edit-laboral-btn') as HTMLButtonElement).click();
    fixture.detectChanges();

    const save500Promise = component.onSaveFichaLaboral({ turno: 'NOCTURNO' });
    httpMock
      .expectOne((r) => r.url === rhFichaLaboralPatchUrl(10, 5001) && r.method === 'PATCH')
      .flush({ error: 'Error interno' }, { status: 500, statusText: 'Internal Server Error' });
    await save500Promise;
    fixture.detectChanges();

    expect(component.fichaSaveLaboralIsConflict()).toBeFalse();
    expect(component.fichaSaveLaboralError()).toContain('Error interno');

    // 18. Cambiar de unidad mientras la ficha está en edición cierra e invalida el borrador
    component.selectUnidad(mockUnidadesGlobal[1]); // Unidad 20
    httpMock.expectOne((r) => r.url === rhPersonalUrl(20)).flush({
      unidad: mockUnidadesGlobal[1],
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.fichaOpen()).toBeFalse();
    expect(component.fichaData()).toBeNull();

    // 16. HTTP 403 al guardar cierra y limpia la ficha y muestra acceso restringido
    component.selectUnidad(mockUnidadesGlobal[0]);
    httpMock.expectOne((r) => r.url === rhPersonalUrl(10)).flush({
      unidad: mockUnidadesGlobal[0],
      items: mockPersonalUnidad10,
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    component.openFichaTrabajador(mockPersonalUnidad10[0]);
    httpMock.expectOne((r) => r.url === rhFichaUrl(10, 5001)).flush(mockFichaAna5001);
    await fixture.whenStable();
    fixture.detectChanges();

    const save403Promise = component.onSaveFichaLaboral({ puesto: 'No autorizado' });
    httpMock
      .expectOne((r) => r.url === rhFichaLaboralPatchUrl(10, 5001) && r.method === 'PATCH')
      .flush({ error: 'Permiso revocado' }, { status: 403, statusText: 'Forbidden' });
    await save403Promise;
    fixture.detectChanges();

    expect(component.fichaOpen()).toBeFalse();
    expect(component.selectedUnidadId()).toBeNull();
    expect(component.accessDeniedError()).toContain('Permiso revocado');
  });
});
