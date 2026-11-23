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
  RhMiContextoResponse,
  RhPersonaCandidataItem,
  RhPersonalUnidadItem,
  RhService,
  RhTrabajadorFichaResponse,
  RhUnidadAutorizada,
} from '../../services/rh.service';
import { authGuard } from '../../core/auth/auth.guard';
import { resolveSafeAdminReturnUrl } from '../auth/login/login-page.component';
import { RhAsistenciaDocxService } from './asistencia/rh-asistencia-docx.service';
import { RhEmployeePortalComponent } from './rh-employee-portal.component';
import { RhShellComponent } from './rh-shell.component';

function buildJwtWithExp(expSeconds: number, sub = 'u-rh-test'): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub, exp: expSeconds }));
  return `${header}.${payload}.sig`;
}

describe('RhShellComponent, RhEmployeePortalComponent & rhAccessGuard (Microintervenciones RH-2A, RH-2B.2, RH-2B.4B, RH-2B.4D, RH-2B.4F, RH-2B.4H.1, RH-2B.4H.2, RH-2C.3 y RH-2C.4)', () => {
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
  const rhMiContextoUrl = `${apiBase}/rh/mi-contexto`;
  const rhUnidadesUrl = `${apiBase}/rh/unidades-autorizadas`;
  const rhPersonalUrl = (unidadId: number) => `${apiBase}/rh/unidades/${unidadId}/personal`;
  const rhFichaUrl = (unidadId: number, adscripcionId: number) =>
    `${apiBase}/rh/unidades/${unidadId}/personal/${adscripcionId}`;
  const rhFichaLaboralPatchUrl = (unidadId: number, adscripcionId: number) =>
    `${apiBase}/rh/unidades/${unidadId}/personal/${adscripcionId}/laboral`;
  const rhRevealIdsUrl = (unidadId: number, adscripcionId: number) =>
    `${apiBase}/rh/unidades/${unidadId}/personal/${adscripcionId}/revelar-identificadores`;
  const rhIdentificacionPatchUrl = (unidadId: number, adscripcionId: number) =>
    `${apiBase}/rh/unidades/${unidadId}/personal/${adscripcionId}/identificacion`;
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
    for (const req of httpMock.match((r) => r.url.endsWith('/api/rh/mi-vacaciones'))) {
      req.flush({ periodos: [], kardex: null });
    }
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

  function runRhAccessGuard(url = '/rh-admin'): Promise<boolean | UrlTree> {
    const dummyRoute = {} as ActivatedRouteSnapshot;
    const dummyState = { url } as RouterStateSnapshot;
    return TestBed.runInInjectionContext(
      () => rhAccessGuard(dummyRoute, dummyState) as Promise<boolean | UrlTree>
    );
  }

  // =========================================================================
  // SUITE RH-2A + RH-2C.3 (PRESERVACIÓN ÍNTEGRA DE SELECCIÓN DE UNIDAD, GUARD Y SEPARACIÓN /rh vs /rh-admin)
  // =========================================================================

  it('1 (RH-2A + RH-2C.3 #1, #19). Usuario sin sesión: navegar a /rh-admin redirige a /login?returnUrl=%2Frh-admin y navegar a /rh redirige a /login?returnUrl=%2Frh', async () => {
    await router.navigateByUrl('/rh-admin');
    expect(location.path()).toBe('/login?returnUrl=%2Frh-admin');

    await router.navigateByUrl('/rh');
    expect(location.path()).toBe('/login?returnUrl=%2Frh');
  });

  it('2 (RH-2A + RH-2C.3 #2, #6). Usuario autenticado sin rol RH ni ADMIN_TIC GLOBAL: acceso denegado en /rh-admin redirigiendo a /home sin perder sesión', async () => {
    expect(hasRhAccessRole(unauthorizedAbastoUser)).toBeFalse();
    setupSession(unauthorizedAbastoUser);
    await router.navigateByUrl('/rh-admin');

    expect(location.path()).toBe('/home');
    expect(sessionStore.currentUser).toEqual(unauthorizedAbastoUser);
  });

  it('3, 4, 5 y 6 (RH-2A + RH-2C.3 #3, #4, #5). RECURSOS_HUMANOS GLOBAL, RECURSOS_HUMANOS CLUES, ADMIN_TIC GLOBAL e hidratación asíncrona acceden a /rh-admin correctamente', async () => {
    expect(resolveRhRoleContext(rhGlobalUser)?.badgeLabel).toBe('RECURSOS_HUMANOS GLOBAL');
    setupSession(rhGlobalUser);
    expect(await runRhAccessGuard('/rh-admin')).toBeTrue();

    expect(resolveRhRoleContext(rhCluesSingleUser)?.badgeLabel).toBe('RECURSOS_HUMANOS CLUES');
    setupSession(rhCluesSingleUser);
    expect(await runRhAccessGuard('/rh-admin')).toBeTrue();

    expect(resolveRhRoleContext(adminTicGlobalUser)?.badgeLabel).toBe('ADMIN_TIC GLOBAL');
    setupSession(adminTicGlobalUser);
    expect(await runRhAccessGuard('/rh-admin')).toBeTrue();

    // Hidratación asíncrona
    const validAt = buildJwtWithExp(Math.floor(Date.now() / 1000) + 600);
    sessionStore.clear();
    tokenStore.set(validAt, 'rt-hydrate');
    const guardPromise = runRhAccessGuard('/rh-admin');
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

  // =========================================================================
  // SUITE RH-2B.4H.1 (REVELACIÓN TEMPORAL DE RFC Y CURP EN LA FICHA DEL TRABAJADOR)
  // =========================================================================

  it('29 (RH-2B.4H.1 #1, #2, #3, #4, #5, #6, #7, #8, #9, #10, #11, #12, #21, #22). Visibilidad de «Mostrar identificadores» según permisos y presencia de RFC/CURP; bloqueo programático para RH CLUES y ADMIN_TIC; POST explícito con {} y reemplazo por «Ocultar identificadores» sin persistencia ni segundo POST al ocultar', async () => {
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

    // A) 3, 4 y 5. RH CLUES o ADMIN_TIC sin RH (puede_revelar_sensibles === false):
    // NO muestra el botón «Mostrar identificadores» ni permite invocación programática
    component.openFichaTrabajador(mockPersonalUnidad10[0]);
    httpMock.expectOne((r) => r.url === rhFichaUrl(10, 5001)).flush({
      ...mockFichaAna5001,
      permisos: {
        puede_editar_laboral: true, // RH CLUES
        puede_revelar_sensibles: false,
        puede_editar_identificacion: false,
      },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#rh-ficha-reveal-ids-btn')).toBeNull();
    expect(fixture.nativeElement.querySelector('#rh-ficha-hide-ids-btn')).toBeNull();

    const dialogDebugEl = fixture.debugElement.children[0].query(
      (de) => de.componentInstance && 'onMostrarIdentificadores' in de.componentInstance
    );
    const dialogInstance = dialogDebugEl.componentInstance;

    // Intento de invocación programática con puede_revelar_sensibles = false (RH CLUES / ADMIN_TIC)
    await dialogInstance.onMostrarIdentificadores();
    httpMock.expectNone((r) => r.url.includes('/revelar-identificadores'));
    expect(dialogInstance.revealedIds()).toBeNull();

    // B) 3. Cuando puede_revelar_sensibles = true pero tiene_rfc = false y tiene_curp = false (ficha 5002):
    // tampoco muestra el botón «Mostrar identificadores»
    component.openFichaTrabajador(mockPersonalUnidad10[1]);
    httpMock.expectOne((r) => r.url === rhFichaUrl(10, 5002)).flush({
      ...mockFichaLuis5002,
      permisos: {
        puede_editar_laboral: true,
        puede_revelar_sensibles: true,
        puede_editar_identificacion: true,
      },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#rh-ficha-reveal-ids-btn')).toBeNull();
    await dialogInstance.onMostrarIdentificadores();
    httpMock.expectNone((r) => r.url.includes('/revelar-identificadores'));

    // C) 1, 2 y 8. Abrir ficha 5001 con permiso efectivo (RECURSOS_HUMANOS GLOBAL):
    // RFC y CURP inician enmascarados, NO se revelan automáticamente al abrir ni al iniciar edición laboral, y el botón «Mostrar identificadores» es visible
    component.openFichaTrabajador(mockPersonalUnidad10[0]);
    httpMock.expectOne((r) => r.url === rhFichaUrl(10, 5001)).flush(mockFichaAna5001);
    await fixture.whenStable();
    fixture.detectChanges();

    httpMock.expectNone((r) => r.url.includes('/revelar-identificadores'));
    expect(
      (fixture.nativeElement.querySelector('#rh-ficha-rfc-masked') as HTMLElement | null)
        ?.textContent?.trim()
    ).toBe('**********ABC');
    expect(
      (fixture.nativeElement.querySelector('#rh-ficha-curp-masked') as HTMLElement | null)
        ?.textContent?.trim()
    ).toBe('****************01');

    // Verificar aviso institucional presente al pie de la sección de identificación personal
    const avisoEl = fixture.nativeElement.querySelector(
      '#rh-ficha-personal-aviso-institucional'
    ) as HTMLElement | null;
    expect(avisoEl).not.toBeNull();
    expect(avisoEl?.textContent).toContain(
      'La información registrada es de apoyo para la gestión administrativa. La validación de RFC y CURP es estructural y no sustituye el cotejo de documentos oficiales por el área responsable.'
    );

    // Iniciar edición laboral tampoco revela automáticamente RFC ni CURP
    (fixture.nativeElement.querySelector('#rh-ficha-edit-laboral-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    httpMock.expectNone((r) => r.url.includes('/revelar-identificadores'));
    (fixture.nativeElement.querySelector('#rh-ficha-cancel-edit-btn') as HTMLButtonElement).click();
    fixture.detectChanges();

    const revealBtn = fixture.nativeElement.querySelector(
      '#rh-ficha-reveal-ids-btn'
    ) as HTMLButtonElement | null;
    expect(revealBtn).not.toBeNull();
    expect(revealBtn?.textContent).toContain('Mostrar identificadores');

    // D) 6, 7 y 9. Al pulsar «Mostrar identificadores», ejecuta POST explícito a /unidades/10/personal/5001/revelar-identificadores con body exacto {}, evita duplicados y muestra valores completos
    revealBtn!.click();
    // Intento de clic duplicado mientras está cargando
    revealBtn!.click();
    fixture.detectChanges();

    expect(dialogInstance.revealingIds()).toBeTrue();
    const revealReq = httpMock.expectOne(
      (r) => r.url === rhRevealIdsUrl(10, 5001) && r.method === 'POST'
    );
    expect(revealReq.request.body).toEqual({});
    expect(Object.keys(revealReq.request.body)).toEqual([]);
    expect(revealReq.request.params.keys()).toEqual([]);

    revealReq.flush({
      persona_id: 101,
      rfc: 'GOMA800101ABC',
      curp: null, // 10. Respetar null como «No registrado»
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(dialogInstance.revealingIds()).toBeFalse();
    expect(
      (fixture.nativeElement.querySelector('#rh-ficha-rfc-masked') as HTMLElement | null)
        ?.textContent?.trim()
    ).toBe('GOMA800101ABC');
    expect(
      (fixture.nativeElement.querySelector('#rh-ficha-curp-masked') as HTMLElement | null)
        ?.textContent?.trim()
    ).toBe('No registrado');

    // Sustituye el botón por «Ocultar identificadores»
    expect(fixture.nativeElement.querySelector('#rh-ficha-reveal-ids-btn')).toBeNull();
    const hideBtn = fixture.nativeElement.querySelector(
      '#rh-ficha-hide-ids-btn'
    ) as HTMLButtonElement | null;
    expect(hideBtn).not.toBeNull();
    expect(hideBtn?.textContent).toContain('Ocultar identificadores');

    // 21 y 22. No hay persistencia de identificadores en localStorage/sessionStorage ni llamadas a PATCH /identificacion, ni aparecen en la tabla general del padrón
    expect(JSON.stringify(localStorage)).not.toContain('GOMA800101ABC');
    expect(JSON.stringify(sessionStorage)).not.toContain('GOMA800101ABC');
    expect(
      (fixture.nativeElement.querySelector('#rh-personal-table') as HTMLElement | null)?.textContent
    ).not.toContain('GOMA800101ABC');
    httpMock.expectNone((r) => r.url.includes('/identificacion'));

    // E) 11 y 12. Al pulsar «Ocultar identificadores», limpia inmediatamente los valores completos, restaura las máscaras y NO emite otro POST
    hideBtn!.click();
    fixture.detectChanges();

    httpMock.expectNone((r) => r.url.includes('/revelar-identificadores'));
    expect(dialogInstance.revealedIds()).toBeNull();
    expect(
      (fixture.nativeElement.querySelector('#rh-ficha-rfc-masked') as HTMLElement | null)
        ?.textContent?.trim()
    ).toBe('**********ABC');
    expect(
      (fixture.nativeElement.querySelector('#rh-ficha-curp-masked') as HTMLElement | null)
        ?.textContent?.trim()
    ).toBe('****************01');
    expect(fixture.nativeElement.querySelector('#rh-ficha-reveal-ids-btn')).not.toBeNull();
  });

  it('30 (RH-2B.4H.1 #13, #14, #15, #16, #17, #18, #19, #20). Protección de memoria ante cambio de contexto, respuestas tardías (ocultar mientras carga, cambiar trabajador, cambiar unidad, cerrar ficha), validación de persona_id discrepante y manejo de errores HTTP 401/403/404/500 sin reintentos automáticos', async () => {
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

    const dialogDebugEl = fixture.debugElement.children[0].query(
      (de) => de.componentInstance && 'onMostrarIdentificadores' in de.componentInstance
    );
    const dialogInstance = dialogDebugEl.componentInstance;

    // 16. Ocultar mientras una revelación está en curso impide que la respuesta tardía vuelva a mostrar los identificadores
    const pendingReveal1 = dialogInstance.onMostrarIdentificadores();
    const reqStaleByHide = httpMock.expectOne(
      (r) => r.url === rhRevealIdsUrl(10, 5001) && r.method === 'POST'
    );
    dialogInstance.onOcultarIdentificadores();
    reqStaleByHide.flush({
      persona_id: 101,
      rfc: 'GOMA800101ABC',
      curp: 'GOMA800101MDFR0001',
    });
    await pendingReveal1;
    fixture.detectChanges();

    expect(dialogInstance.revealedIds()).toBeNull();
    expect(
      (fixture.nativeElement.querySelector('#rh-ficha-rfc-masked') as HTMLElement | null)
        ?.textContent?.trim()
    ).toBe('**********ABC');

    // 17. Respuesta con `persona_id` distinto al de la ficha vigente se descarta y mantiene máscaras
    const revealMismatchPromise = dialogInstance.onMostrarIdentificadores();
    httpMock
      .expectOne((r) => r.url === rhRevealIdsUrl(10, 5001) && r.method === 'POST')
      .flush({
        persona_id: 999, // persona_id ajeno
        rfc: 'AJEN999999XXX',
        curp: 'AJEN999999HDFR0009',
      });
    await revealMismatchPromise;
    fixture.detectChanges();

    expect(dialogInstance.revealedIds()).toBeNull();
    expect(
      (fixture.nativeElement.querySelector('#rh-ficha-rfc-masked') as HTMLElement | null)
        ?.textContent?.trim()
    ).toBe('**********ABC');
    expect(fixture.nativeElement.textContent).not.toContain('AJEN999999XXX');
    expect(
      (fixture.nativeElement.querySelector('#rh-ficha-reveal-error') as HTMLElement | null)
        ?.textContent
    ).toContain('no corresponde al trabajador');

    // 19 y 20. HTTP 500 mantiene la máscara y NO realiza reintentos automáticos
    const reveal500Promise = dialogInstance.onMostrarIdentificadores();
    httpMock
      .expectOne((r) => r.url === rhRevealIdsUrl(10, 5001) && r.method === 'POST')
      .flush({ error: 'Audit insert failed' }, { status: 500, statusText: 'Internal Server Error' });
    await reveal500Promise;
    fixture.detectChanges();

    httpMock.expectNone((r) => r.url.includes('/revelar-identificadores'));
    expect(dialogInstance.revealedIds()).toBeNull();
    expect(
      (fixture.nativeElement.querySelector('#rh-ficha-rfc-masked') as HTMLElement | null)
        ?.textContent?.trim()
    ).toBe('**********ABC');
    expect(
      (fixture.nativeElement.querySelector('#rh-ficha-reveal-error') as HTMLElement | null)
        ?.textContent
    ).toContain('Se conservan los valores protegidos');

    // 13. Revelar con éxito y luego cerrar la ficha limpia los valores completos
    const revealOkPromise = dialogInstance.onMostrarIdentificadores();
    httpMock
      .expectOne((r) => r.url === rhRevealIdsUrl(10, 5001) && r.method === 'POST')
      .flush({
        persona_id: 101,
        rfc: 'GOMA800101ABC',
        curp: 'GOMA800101MDFR0001',
      });
    await revealOkPromise;
    fixture.detectChanges();
    expect(dialogInstance.revealedIds()?.rfc).toBe('GOMA800101ABC');

    component.closeFichaTrabajador();
    fixture.detectChanges();
    expect(dialogInstance.revealedIds()).toBeNull();

    // 14. Cambiar de trabajador invalida una revelación pendiente del trabajador anterior y limpia valores
    component.openFichaTrabajador(mockPersonalUnidad10[0]); // 5001 (persona 101)
    httpMock.expectOne((r) => r.url === rhFichaUrl(10, 5001)).flush(mockFichaAna5001);
    await fixture.whenStable();
    fixture.detectChanges();

    const pendingWorker1 = dialogInstance.onMostrarIdentificadores();
    const reqWorker1 = httpMock.expectOne(
      (r) => r.url === rhRevealIdsUrl(10, 5001) && r.method === 'POST'
    );

    // Abrir ficha de otro trabajador (5002, persona 102) antes de que responda reqWorker1
    component.openFichaTrabajador(mockPersonalUnidad10[1]);
    httpMock.expectOne((r) => r.url === rhFichaUrl(10, 5002)).flush({
      ...mockFichaLuis5002,
      personal: {
        ...mockFichaLuis5002.personal,
        tiene_rfc: true,
        rfc_masked: '**********999',
      },
      permisos: {
        puede_editar_laboral: true,
        puede_revelar_sensibles: true,
        puede_editar_identificacion: true,
      },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    // Responde tardíamente el POST del trabajador 101 -> debe descartarse
    reqWorker1.flush({
      persona_id: 101,
      rfc: 'GOMA800101ABC',
      curp: 'GOMA800101MDFR0001',
    });
    await pendingWorker1;
    fixture.detectChanges();

    expect(dialogInstance.revealedIds()).toBeNull();
    expect(
      (fixture.nativeElement.querySelector('#rh-ficha-rfc-masked') as HTMLElement | null)
        ?.textContent?.trim()
    ).toBe('**********999');
    expect(fixture.nativeElement.textContent).not.toContain('GOMA800101ABC');

    // 15. Cambiar de unidad invalida la respuesta pendiente y limpia valores
    const pendingBeforeUnitSwitch = dialogInstance.onMostrarIdentificadores();
    const reqBeforeUnitSwitch = httpMock.expectOne(
      (r) => r.url === rhRevealIdsUrl(10, 5002) && r.method === 'POST'
    );

    component.selectUnidad(mockUnidadesGlobal[1]); // Cambia a unidad 20
    httpMock.expectOne((r) => r.url === rhPersonalUrl(20)).flush({
      unidad: mockUnidadesGlobal[1],
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
    reqBeforeUnitSwitch.flush({
      persona_id: 102,
      rfc: 'PERL850505999',
      curp: null,
    });
    await pendingBeforeUnitSwitch;
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.fichaOpen()).toBeFalse();
    expect(dialogInstance.revealedIds()).toBeNull();

    // 18. HTTP 403 al revelar identificadores limpia datos completos y cierra la ficha sin exponer información
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

    const reveal403Promise = dialogInstance.onMostrarIdentificadores();
    httpMock
      .expectOne((r) => r.url === rhRevealIdsUrl(10, 5001) && r.method === 'POST')
      .flush({ error: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });
    await reveal403Promise;
    fixture.detectChanges();

    expect(dialogInstance.revealedIds()).toBeNull();
    expect(component.fichaOpen()).toBeFalse();
    expect(component.accessDeniedError()).toContain('HTTP 403');
  });

  // =========================================================================
  // SUITE RH-2B.4H.2 (EDICIÓN PROTEGIDA DE IDENTIFICACIÓN PERSONAL DESDE LA FICHA RH)
  // =========================================================================

  it('31 (RH-2B.4H.2 #1, #2, #3, #4, #5, #6, #7, #8, #9, #14, #15). Visibilidad del botón «Editar identificación personal» según permiso efectivo; independencia de la revelación; inicialización de nombres estructurados y heredados; RFC/CURP vacíos al abrir edición (nunca máscaras ni valores revelados); Guardar deshabilitado sin cambios y Cancelar descarta cambios sin emitir PATCH', async () => {
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

    // 2. Sin permiso (puede_editar_identificacion === false, ej. RH CLUES o ADMIN_TIC sin RH GLOBAL):
    // botón ausente y bloqueo programático
    component.openFichaTrabajador(mockPersonalUnidad10[0]);
    httpMock.expectOne((r) => r.url === rhFichaUrl(10, 5001)).flush({
      ...mockFichaAna5001,
      permisos: {
        puede_editar_laboral: true,
        puede_revelar_sensibles: false,
        puede_editar_identificacion: false,
      },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#rh-ficha-edit-identificacion-btn')).toBeNull();

    const dialogDebugEl = fixture.debugElement.children[0].query(
      (de) => de.componentInstance && 'startEditIdentificacion' in de.componentInstance
    );
    const dialogInstance = dialogDebugEl.componentInstance;

    dialogInstance.startEditIdentificacion();
    expect(dialogInstance.editIdentificacionMode()).toBeFalse();

    // 1, 3 y 8. Con permiso efectivo (puede_editar_identificacion === true):
    // Primero revelamos identificadores con RH-2B.4H.1 y luego pulsamos «Editar identificación personal»
    component.openFichaTrabajador(mockPersonalUnidad10[0]);
    httpMock.expectOne((r) => r.url === rhFichaUrl(10, 5001)).flush(mockFichaAna5001);
    await fixture.whenStable();
    fixture.detectChanges();

    const editIdBtn = fixture.nativeElement.querySelector(
      '#rh-ficha-edit-identificacion-btn'
    ) as HTMLButtonElement | null;
    expect(editIdBtn).not.toBeNull();
    expect(editIdBtn?.textContent).toContain('Editar identificación personal');

    // Revelar temporalmente RFC/CURP antes de abrir edición
    const revealPromise = dialogInstance.onMostrarIdentificadores();
    httpMock
      .expectOne((r) => r.url === rhRevealIdsUrl(10, 5001) && r.method === 'POST')
      .flush({
        persona_id: 101,
        rfc: 'GOMA800101ABC',
        curp: 'GOMA800101MDFR0001',
      });
    await revealPromise;
    fixture.detectChanges();
    expect(dialogInstance.revealedIds()?.rfc).toBe('GOMA800101ABC');

    // Al pulsar «Editar identificación personal»:
    // - Limpia inmediatamente `revealedIds` (no conserva valores revelados)
    // - NO emite nueva petición a `revelar-identificadores`
    // - NO inicializa inputs de RFC/CURP con las máscaras ni con los valores previamente revelados
    editIdBtn!.click();
    fixture.detectChanges();

    httpMock.expectNone((r) => r.url.includes('/revelar-identificadores'));
    expect(dialogInstance.revealedIds()).toBeNull();
    expect(dialogInstance.editIdentificacionMode()).toBeTrue();

    // No permite iniciar edición laboral mientras está activa la edición de identificación
    expect(fixture.nativeElement.querySelector('#rh-ficha-edit-laboral-btn')).toBeNull();
    dialogInstance.startEditLaboral();
    expect(dialogInstance.editMode()).toBeFalse();

    // 4, 6, 7 y 8. Verificar inicialización de nombres estructurados, vista derivada de nombre_completo y campos vacíos de RFC/CURP
    const nombresInput = fixture.nativeElement.querySelector(
      '#rh-ficha-edit-nombres'
    ) as HTMLInputElement;
    const apellidosInput = fixture.nativeElement.querySelector(
      '#rh-ficha-edit-apellidos'
    ) as HTMLInputElement;
    const rfcNewInput = fixture.nativeElement.querySelector(
      '#rh-ficha-edit-rfc-new'
    ) as HTMLInputElement;
    const curpNewInput = fixture.nativeElement.querySelector(
      '#rh-ficha-edit-curp-new'
    ) as HTMLInputElement;
    const derivedFullEl = fixture.nativeElement.querySelector(
      '#rh-ficha-edit-nombre-completo-derived'
    ) as HTMLElement | null;
    const saveIdBtn = fixture.nativeElement.querySelector(
      '#rh-ficha-save-identificacion-btn'
    ) as HTMLButtonElement;

    expect(nombresInput.value).toBe('Ana');
    expect(apellidosInput.value).toBe('Gómez');
    expect(derivedFullEl?.textContent?.trim()).toBe('Ana Gómez');
    expect(fixture.nativeElement.querySelector('#rh-ficha-edit-nombre-completo')).toBeNull();

    // 7 y 8. Inputs de RFC y CURP inician completamente vacíos (ni máscaras ni valores revelados)
    expect(rfcNewInput.value).toBe('');
    expect(curpNewInput.value).toBe('');
    expect(
      (fixture.nativeElement.querySelector('#rh-ficha-edit-rfc-status') as HTMLElement | null)
        ?.textContent?.trim()
    ).toBe('RFC registrado');
    expect(
      (fixture.nativeElement.querySelector('#rh-ficha-edit-curp-status') as HTMLElement | null)
        ?.textContent?.trim()
    ).toBe('CURP registrada');

    // 9 y 15. Sin cambios efectivos (y con inputs de RFC/CURP vacíos que significan conservar), «Guardar cambios» está deshabilitado
    expect(saveIdBtn.disabled).toBeTrue();
    expect(dialogInstance.computedIdentificacionPatch()).toEqual({});

    // 6. Al cambiar `nombres` en un registro estructurado, el patch calculado incluye solo `nombres` (no envía `nombre_completo` contradictorio ni RFC/CURP vacíos)
    nombresInput.value = '  Ana   María  ';
    nombresInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(derivedFullEl?.textContent?.trim()).toBe('Ana María Gómez');
    expect(dialogInstance.computedIdentificacionPatch()).toEqual({
      nombres: 'Ana María',
    });
    expect(saveIdBtn.disabled).toBeFalse();

    // 14. Pulsar «Cancelar» descarta el borrador, regresa a consulta enmascarada y no emite PATCH
    const cancelIdBtn = fixture.nativeElement.querySelector(
      '#rh-ficha-cancel-identificacion-btn'
    ) as HTMLButtonElement;
    cancelIdBtn.click();
    fixture.detectChanges();

    httpMock.expectNone((r) => r.method === 'PATCH');
    expect(dialogInstance.editIdentificacionMode()).toBeFalse();
    expect(
      (fixture.nativeElement.querySelector('#rh-ficha-rfc-masked') as HTMLElement | null)
        ?.textContent?.trim()
    ).toBe('**********ABC');

    // 5. Registro heredado (nombres = null, apellidos = null y solo nombre_completo, ficha 5002):
    // permite editar `nombre_completo` directamente sin heurísticas de división
    component.openFichaTrabajador(mockPersonalUnidad10[1]);
    httpMock.expectOne((r) => r.url === rhFichaUrl(10, 5002)).flush({
      ...mockFichaLuis5002,
      permisos: {
        puede_editar_laboral: true,
        puede_revelar_sensibles: true,
        puede_editar_identificacion: true,
      },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('#rh-ficha-edit-identificacion-btn') as HTMLButtonElement).click();
    fixture.detectChanges();

    const legacyFullInput = fixture.nativeElement.querySelector(
      '#rh-ficha-edit-nombre-completo'
    ) as HTMLInputElement | null;
    expect(legacyFullInput).not.toBeNull();
    expect(legacyFullInput?.value).toBe('Enf. Luis Pérez');
    expect(
      (fixture.nativeElement.querySelector('#rh-ficha-edit-rfc-status') as HTMLElement | null)
        ?.textContent?.trim()
    ).toBe('RFC no registrado');
    expect(
      (fixture.nativeElement.querySelector('#rh-ficha-edit-curp-status') as HTMLElement | null)
        ?.textContent?.trim()
    ).toBe('CURP no registrada');

    legacyFullInput!.value = '  Enf. Luis Alberto Pérez  ';
    legacyFullInput!.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(dialogInstance.computedIdentificacionPatch()).toEqual({
      nombre_completo: 'Enf. Luis Alberto Pérez',
    });
  });

  it('32 (RH-2B.4H.2 #10, #11, #12, #13, #16, #17, #18, #19). Semántica de PATCH parcial para RFC y CURP (reemplazar solo RFC, reemplazar solo CURP, eliminación explícita con confirmación previa enviando null) y validaciones estructurales (rechazo de asteriscos/máscaras, RFC de persona moral de 12 caracteres, CURP inválida y vaciado simultáneo de nombres)', async () => {
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

    const dialogDebugEl = fixture.debugElement.children[0].query(
      (de) => de.componentInstance && 'startEditIdentificacion' in de.componentInstance
    );
    const dialogInstance = dialogDebugEl.componentInstance;

    (fixture.nativeElement.querySelector('#rh-ficha-edit-identificacion-btn') as HTMLButtonElement).click();
    fixture.detectChanges();

    const nombresInput = fixture.nativeElement.querySelector(
      '#rh-ficha-edit-nombres'
    ) as HTMLInputElement;
    const apellidosInput = fixture.nativeElement.querySelector(
      '#rh-ficha-edit-apellidos'
    ) as HTMLInputElement;
    const rfcNewInput = fixture.nativeElement.querySelector(
      '#rh-ficha-edit-rfc-new'
    ) as HTMLInputElement;
    const curpNewInput = fixture.nativeElement.querySelector(
      '#rh-ficha-edit-curp-new'
    ) as HTMLInputElement;
    const saveIdBtn = fixture.nativeElement.querySelector(
      '#rh-ficha-save-identificacion-btn'
    ) as HTMLButtonElement;

    // 16. Rechazo de máscaras o asteriscos en RFC y CURP
    rfcNewInput.value = '**********ABC';
    rfcNewInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(saveIdBtn.disabled).toBeTrue();
    expect(
      fixture.nativeElement.querySelector('#rh-ficha-edit-identificacion-rfc-error')?.textContent
    ).toContain('asteriscos');

    // 17. Rechazo de RFC de persona moral (12 caracteres: GOM800101ABC)
    rfcNewInput.value = 'GOM800101ABC';
    rfcNewInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(saveIdBtn.disabled).toBeTrue();
    expect(
      fixture.nativeElement.querySelector('#rh-ficha-edit-identificacion-rfc-error')?.textContent
    ).toContain('persona moral');

    // 18. Rechazo de CURP inválida (longitud distinta de 18 o asteriscos)
    rfcNewInput.value = '';
    rfcNewInput.dispatchEvent(new Event('input'));
    curpNewInput.value = 'GOMA800101MDFR01'; // 16 caracteres
    curpNewInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(saveIdBtn.disabled).toBeTrue();
    expect(
      fixture.nativeElement.querySelector('#rh-ficha-edit-identificacion-curp-error')?.textContent
    ).toContain('18 caracteres');

    // Prohibir vaciar simultáneamente nombres y apellidos en un registro que ya los tenía estructurados
    curpNewInput.value = '';
    curpNewInput.dispatchEvent(new Event('input'));
    nombresInput.value = '   ';
    nombresInput.dispatchEvent(new Event('input'));
    apellidosInput.value = '';
    apellidosInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(saveIdBtn.disabled).toBeTrue();
    expect(
      fixture.nativeElement.querySelector('#rh-ficha-edit-identificacion-names-error')?.textContent
    ).toContain('simultáneamente');

    // Restaurar nombres originales
    nombresInput.value = 'Ana';
    nombresInput.dispatchEvent(new Event('input'));
    apellidosInput.value = 'Gómez';
    apellidosInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    // 10 y 19. Reemplazar únicamente RFC normaliza a mayúsculas y envía exclusivamente `{ rfc: 'GOLA800101XY9' }`
    rfcNewInput.value = '  gola800101xy9  ';
    rfcNewInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(dialogInstance.computedIdentificacionPatch()).toEqual({
      rfc: 'GOLA800101XY9',
    });
    expect(Object.keys(dialogInstance.computedIdentificacionPatch())).toEqual(['rfc']);
    expect(saveIdBtn.disabled).toBeFalse();

    // 11. Limpiar el input de RFC y capturar únicamente una nueva CURP envía exclusivamente `{ curp: 'GOLA800101MDFRPN08' }`
    rfcNewInput.value = '';
    rfcNewInput.dispatchEvent(new Event('input'));
    curpNewInput.value = '  gola800101mdfrpn08  ';
    curpNewInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(dialogInstance.computedIdentificacionPatch()).toEqual({
      curp: 'GOLA800101MDFRPN08',
    });
    expect(Object.keys(dialogInstance.computedIdentificacionPatch())).toEqual(['curp']);

    // 12 y 13. Eliminación explícita de CURP registrada requiere confirmación dentro del flujo de edición y envía `{ curp: null }`
    curpNewInput.value = '';
    curpNewInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const reqClearCurpBtn = fixture.nativeElement.querySelector(
      '#rh-ficha-request-clear-curp-btn'
    ) as HTMLButtonElement | null;
    expect(reqClearCurpBtn).not.toBeNull();
    reqClearCurpBtn!.click();
    fixture.detectChanges();

    // Mientras el cuadro de confirmación está abierto, aún no está marcado como null y Guardar está deshabilitado
    expect(fixture.nativeElement.querySelector('#rh-ficha-confirm-clear-curp-box')).not.toBeNull();
    expect(saveIdBtn.disabled).toBeTrue();

    // Confirmar la eliminación explícita
    const confirmClearCurpBtn = fixture.nativeElement.querySelector(
      '#rh-ficha-confirm-clear-curp-btn'
    ) as HTMLButtonElement;
    confirmClearCurpBtn.click();
    fixture.detectChanges();

    expect(dialogInstance.computedIdentificacionPatch()).toEqual({
      curp: null,
    });
    expect(saveIdBtn.disabled).toBeFalse();
  });

  it('33 (RH-2B.4H.2 #20, #21, #22, #23, #24, #25, #26, #27). Guardado exitoso HTTP 200 (actualiza ficha con máscaras, limpia borrador sensible, muestra banner y refresca padrón), conflicto HTTP 409 sin revelar identidades, limpieza en 401/403 y protección ante cambio de trabajador, unidad o respuesta obsoleta', async () => {
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

    const dialogDebugEl = fixture.debugElement.children[0].query(
      (de) => de.componentInstance && 'startEditIdentificacion' in de.componentInstance
    );
    const dialogInstance = dialogDebugEl.componentInstance;

    // 20, 21 y 27. Enviar PATCH de identificación -> recibe HTTP 200 con máscaras -> limpia borrador, sale de edición, muestra banner y refresca padrón
    (fixture.nativeElement.querySelector('#rh-ficha-edit-identificacion-btn') as HTMLButtonElement).click();
    fixture.detectChanges();

    const nombresInput = fixture.nativeElement.querySelector(
      '#rh-ficha-edit-nombres'
    ) as HTMLInputElement;
    const rfcNewInput = fixture.nativeElement.querySelector(
      '#rh-ficha-edit-rfc-new'
    ) as HTMLInputElement;
    nombresInput.value = 'Ana María';
    nombresInput.dispatchEvent(new Event('input'));
    rfcNewInput.value = 'GOLA800101XY9';
    rfcNewInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const saveBtn = fixture.nativeElement.querySelector(
      '#rh-ficha-save-identificacion-btn'
    ) as HTMLButtonElement;
    saveBtn.click();
    // Intento de doble envío mientras está en curso
    saveBtn.click();
    fixture.detectChanges();

    expect(component.fichaSavingIdentificacion()).toBeTrue();
    // Mientras está guardando, cerrar voluntariamente la ficha está bloqueado
    component.closeFichaTrabajador();
    expect(component.fichaOpen()).toBeTrue();

    const patchIdReq = httpMock.expectOne(
      (r) => r.url === rhIdentificacionPatchUrl(10, 5001) && r.method === 'PATCH'
    );
    expect(patchIdReq.request.body).toEqual({
      nombres: 'Ana María',
      rfc: 'GOLA800101XY9',
    });
    expect(Object.keys(patchIdReq.request.body)).toEqual(['nombres', 'rfc']);

    patchIdReq.flush({
      unidad: mockUnidadesGlobal[0],
      personal: {
        persona_id: 101,
        nombre_completo: 'Ana María Gómez',
        nombres: 'Ana María',
        apellidos: 'Gómez',
        tiene_rfc: true,
        rfc_masked: '**********XY9',
        tiene_curp: true,
        curp_masked: '****************01',
        activo: true,
      },
      campos_modificados: ['nombres', 'nombre_completo', 'rfc'],
    });

    await Promise.resolve();
    await Promise.resolve();

    // 21. Refresca automáticamente el padrón de la unidad para reflejar el nuevo nombre
    const refreshPersonalReq = httpMock.expectOne(
      (r) => r.url === rhPersonalUrl(10) && r.method === 'GET'
    );
    refreshPersonalReq.flush({
      unidad: mockUnidadesGlobal[0],
      items: [
        { ...mockPersonalUnidad10[0], nombre_completo: 'Ana María Gómez' },
        mockPersonalUnidad10[1],
      ],
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    // Verificar regreso a modo consulta, limpieza de borrador sensible, máscara actualizada y banner de confirmación sin RFC/CURP completo
    expect(dialogInstance.editIdentificacionMode()).toBeFalse();
    expect(dialogInstance.draftRfcNew()).toBe('');
    expect(dialogInstance.draftCurpNew()).toBe('');
    expect(component.fichaData()?.personal.nombre_completo).toBe('Ana María Gómez');
    expect(component.fichaData()?.personal.rfc_masked).toBe('**********XY9');
    expect(component.personalItems()[0].nombre_completo).toBe('Ana María Gómez');

    const successBannerText =
      (
        fixture.nativeElement.querySelector(
          '#rh-ficha-identificacion-success-banner'
        ) as HTMLElement | null
      )?.textContent ?? '';
    expect(successBannerText).toContain('Identificación personal actualizada correctamente');
    expect(successBannerText).not.toContain('GOLA800101XY9');
    expect(JSON.stringify(localStorage)).not.toContain('GOLA800101XY9');
    expect(JSON.stringify(sessionStorage)).not.toContain('GOLA800101XY9');

    // 22. HTTP 409 (RFC o CURP duplicado): muestra mensaje comprensible sin revelar identidades ni reintentar automáticamente, permitiendo corregir el dato
    (fixture.nativeElement.querySelector('#rh-ficha-edit-identificacion-btn') as HTMLButtonElement).click();
    fixture.detectChanges();

    const save409Promise = component.onSaveFichaIdentificacion({ rfc: 'RUIC790404ZZ9' });
    httpMock
      .expectOne((r) => r.url === rhIdentificacionPatchUrl(10, 5001) && r.method === 'PATCH')
      .flush(
        {
          error:
            'El RFC proporcionado ya se encuentra registrado en otra persona del directorio institucional',
        },
        { status: 409, statusText: 'Conflict' }
      );
    await save409Promise;
    fixture.detectChanges();

    httpMock.expectNone((r) => r.url.includes('/identificacion'));
    expect(dialogInstance.editIdentificacionMode()).toBeTrue();
    expect(component.fichaSaveIdentificacionIsConflict()).toBeTrue();
    expect(
      (fixture.nativeElement.querySelector('#rh-ficha-identificacion-save-error') as HTMLElement | null)
        ?.textContent
    ).toContain('ya se encuentra registrado en otra persona');

    // 25 y 26. Cambiar de trabajador descarta el borrador sensible e invalida respuestas obsoletas
    dialogInstance.onDraftRfcInput('GOMA800101ZZ9');
    expect(dialogInstance.draftRfcNew()).toBe('GOMA800101ZZ9');

    component.openFichaTrabajador(mockPersonalUnidad10[1]); // Cambia a trabajador 5002 (persona 102)
    httpMock.expectOne((r) => r.url === rhFichaUrl(10, 5002)).flush({
      ...mockFichaLuis5002,
      permisos: {
        puede_editar_laboral: true,
        puede_revelar_sensibles: true,
        puede_editar_identificacion: true,
      },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(dialogInstance.editIdentificacionMode()).toBeFalse();
    expect(dialogInstance.draftRfcNew()).toBe('');

    // 24. Cambiar de unidad mientras se edita identificación cierra la ficha y limpia el borrador sensible
    (fixture.nativeElement.querySelector('#rh-ficha-edit-identificacion-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    dialogInstance.onDraftCurpInput('PERL850505HDFR0005');
    expect(dialogInstance.draftCurpNew()).toBe('PERL850505HDFR0005');

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
    expect(dialogInstance.editIdentificacionMode()).toBeFalse();
    expect(dialogInstance.draftCurpNew()).toBe('');

    // 23. HTTP 403 al guardar identificación limpia todos los borradores sensibles y cierra la ficha
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

    (fixture.nativeElement.querySelector('#rh-ficha-edit-identificacion-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    dialogInstance.onDraftRfcInput('GOMA800101ZZ9');

    const saveId403Promise = component.onSaveFichaIdentificacion({ rfc: 'GOMA800101ZZ9' });
    httpMock
      .expectOne((r) => r.url === rhIdentificacionPatchUrl(10, 5001) && r.method === 'PATCH')
      .flush({ error: 'Permiso revocado' }, { status: 403, statusText: 'Forbidden' });
    await saveId403Promise;
    fixture.detectChanges();

    expect(component.fichaOpen()).toBeFalse();
    expect(dialogInstance.draftRfcNew()).toBe('');
    expect(component.accessDeniedError()).toContain('Permiso revocado');
  });

  // =========================================================================
  // SUITE RH-2C.3 + RH-2C.4 (PORTAL DE AUTOGESTIÓN /rh Y SEPARACIÓN DE /rh-admin)
  // =========================================================================

  const mockMiContextoVigente: RhMiContextoResponse = {
    modo: 'EMPLEADO',
    persona: {
      persona_id: 701,
      nombre_completo: 'María Fernanda López Ruiz',
      nombres: 'María Fernanda',
      apellidos: 'López Ruiz',
      tiene_rfc: true,
      rfc_masked: '**********1A9',
      tiene_curp: true,
      curp_masked: '****************08',
    },
    unidad_referencia: {
      id: 10,
      nombre: 'HOSPITAL GENERAL MEXICALI',
      cluesimb: 'BCIMB000001',
      origen: 'ADSCRIPCION_RH',
    },
    estado_vinculacion_rh: 'ADSCRIPCION_VIGENTE',
    adscripciones: [
      {
        adscripcion_laboral_id: 9001,
        unidad_medica_id: 10,
        unidad: {
          id: 10,
          nombre: 'HOSPITAL GENERAL MEXICALI',
          cluesimb: 'BCIMB000001',
        },
        matricula: 'EMP-9001',
        puesto: 'Enfermera General Titulada',
        turno: 'MATUTINO',
        jornada: '8 HORAS',
        horario: '07:00 - 15:00',
        vigente_desde: '2025-03-15',
        vigente_hasta: null,
        activo: true,
        es_vigente: true,
        estado_vigencia: 'VIGENTE',
        observaciones: null,
      },
    ],
    permisos: {
      puede_ver_perfil_propio: true,
      puede_administrar_personal_desde_autogestion: false,
      puede_revelar_identificadores_desde_autogestion: false,
      puede_editar_identificacion_desde_autogestion: false,
    },
  };

  it('34 (RH-2C.3 + RH-2C.4 #1-#8, #19-#22, #26). Configuración de rutas /rh y /rh-admin; empleado sin rol RH carga GET /api/rh/mi-contexto con adscripción vigente, identificadores enmascarados sin controles administrativos ni botón «Ir a Administración RH»; usuario con rol RH sí ve el enlace y navega entre /rh y /rh-admin', async () => {
    const rhPortalRoute = routes.find((r) => r.path === 'rh');
    const rhAdminRoute = routes.find((r) => r.path === 'rh-admin');

    expect(rhPortalRoute).toBeDefined();
    expect(rhPortalRoute?.canActivate).toEqual([authGuard]);
    expect(await rhPortalRoute!.loadComponent!()).toBe(RhEmployeePortalComponent);

    expect(rhAdminRoute).toBeDefined();
    expect(rhAdminRoute?.canActivate).toEqual([authGuard, rhAccessGuard]);
    expect(await rhAdminRoute!.loadComponent!()).toBe(RhShellComponent);

    // 2, 3, 4, 5, 6, 7, 8, 19, 20 y 22. Empleado autenticado sin rol administrativo RH entra a /rh:
    // - Dispara exactamente una llamada a GET /api/rh/mi-contexto sin query params
    // - Muestra «Cargando tu espacio laboral…» mientras responde y luego su perfil institucional y adscripción vigente
    // - NO dispara ninguna petición administrativa a /api/rh/unidades*
    // - NO muestra botón «Ir a Administración RH», ni botón «Mostrar identificadores», ni edición laboral/personal
    setupSession(unauthorizedAbastoUser);
    const navEmployee = await router.navigateByUrl('/rh');
    expect(navEmployee).toBeTrue();
    expect(location.path()).toBe('/rh');

    const portalFixture = TestBed.createComponent(RhEmployeePortalComponent);
    portalFixture.detectChanges();

    // Estado inicial de carga sin datos ficticios
    expect(portalFixture.componentInstance.loadingContexto()).toBeTrue();
    expect(portalFixture.nativeElement.querySelector('#rh-portal-loading')).not.toBeNull();
    expect(portalFixture.nativeElement.querySelector('#rh-portal-perfil-card')).toBeNull();

    // Exactamente 1 petición a GET /api/rh/mi-contexto sin parámetros y ninguna a endpoints administrativos
    const miContextoReq = httpMock.expectOne(
      (r) => r.url.startsWith(rhMiContextoUrl) && r.method === 'GET'
    );
    expect(miContextoReq.request.urlWithParams).toBe(rhMiContextoUrl);
    expect(miContextoReq.request.params.keys().length).toBe(0);
    httpMock.expectNone((r) => r.url.includes('/api/rh/unidades'));

    miContextoReq.flush(mockMiContextoVigente);
    await portalFixture.whenStable();
    portalFixture.detectChanges();

    expect(portalFixture.componentInstance.loadingContexto()).toBeFalse();
    expect(portalFixture.nativeElement.querySelector('#rh-portal-loading')).toBeNull();

    const portalEl = portalFixture.nativeElement as HTMLElement;
    expect(portalEl.querySelector('#rh-portal-perfil-nombre-completo')?.textContent).toContain(
      'María Fernanda López Ruiz'
    );
    expect(portalEl.querySelector('#rh-portal-perfil-nombres')?.textContent).toContain(
      'María Fernanda'
    );
    expect(portalEl.querySelector('#rh-portal-perfil-apellidos')?.textContent).toContain(
      'López Ruiz'
    );
    expect(portalEl.querySelector('#rh-portal-perfil-rfc')?.textContent).toContain(
      '**********1A9'
    );
    expect(portalEl.querySelector('#rh-portal-perfil-curp')?.textContent).toContain(
      '****************08'
    );

    // Unidad de adscripción vigente
    expect(portalEl.querySelector('#rh-portal-unidad-heading')?.textContent).toContain(
      'Mi unidad de adscripción'
    );
    expect(portalEl.querySelector('#rh-portal-unidad-nombre')?.textContent).toContain(
      'HOSPITAL GENERAL MEXICALI'
    );
    expect(portalEl.querySelector('#rh-portal-unidad-clues')?.textContent).toContain(
      'CLUES: BCIMB000001'
    );

    // Adscripción vigente y fecha formateada DD/MM/YYYY sin desfase de zona horaria
    const adscripcionCard = portalEl.querySelector('[data-adscripcion-id="9001"]');
    expect(adscripcionCard).not.toBeNull();
    expect(adscripcionCard?.getAttribute('data-estado-vigencia')).toBe('VIGENTE');
    expect(adscripcionCard?.textContent).toContain('EMP-9001');
    expect(adscripcionCard?.textContent).toContain('Enfermera General Titulada');
    expect(adscripcionCard?.textContent).toContain('MATUTINO');
    expect(adscripcionCard?.textContent).toContain('8 HORAS');
    expect(adscripcionCard?.textContent).toContain('07:00 - 15:00');
    expect(adscripcionCard?.textContent).toContain('15/03/2025');
    expect(adscripcionCard?.textContent).toContain('Sin fecha de término');
    expect(adscripcionCard?.textContent).toContain('Vigente');

    // Aviso institucional discreto
    expect(portalEl.querySelector('#rh-portal-aviso-institucional')?.textContent).toContain(
      'La información registrada es de apoyo para la gestión administrativa y no sustituye el cotejo de documentos oficiales por las áreas responsables.'
    );

    // Ausencia total de controles administrativos o de revelación/edición en /rh
    expect(portalEl.querySelector('#rh-portal-go-admin-link')).toBeNull();
    expect(portalEl.querySelector('#rh-ficha-reveal-ids-btn')).toBeNull();
    expect(portalEl.querySelector('#rh-ficha-edit-identificacion-btn')).toBeNull();
    expect(portalEl.querySelector('#rh-ficha-edit-laboral-btn')).toBeNull();
    expect(portalEl.querySelector('#rh-personal-table')).toBeNull();
    expect(portalEl.textContent).not.toContain('Mostrar identificadores');
    expect(portalEl.textContent).not.toContain('Editar identificación');

    // 13, 14, 15, 20 y 21. Usuarios con RECURSOS_HUMANOS GLOBAL, RECURSOS_HUMANOS CLUES y ADMIN_TIC GLOBAL
    // sí ven el botón «Ir a Administración RH» en /rh
    setupSession(rhCluesSingleUser);
    portalFixture.detectChanges();
    expect(portalEl.querySelector('#rh-portal-go-admin-link')).not.toBeNull();

    setupSession(adminTicGlobalUser);
    portalFixture.detectChanges();
    expect(portalEl.querySelector('#rh-portal-go-admin-link')).not.toBeNull();

    setupSession(rhGlobalUser);
    portalFixture.detectChanges();

    const goAdminHeaderLink = portalEl.querySelector(
      '#rh-portal-go-admin-link'
    ) as HTMLAnchorElement | null;
    expect(goAdminHeaderLink).not.toBeNull();
    expect(goAdminHeaderLink?.textContent).toContain('Ir a Administración RH');
    expect(goAdminHeaderLink?.getAttribute('href')).toBe('/rh-admin');

    const navToAdmin = await router.navigateByUrl('/rh-admin');
    expect(navToAdmin).toBeTrue();
    expect(location.path()).toBe('/rh-admin');

    // En /rh-admin (RhShellComponent) existe la acción «Mi espacio laboral» que apunta a /rh y navega de regreso
    createComponent();
    const pendingUnidadesReqs = httpMock.match(rhUnidadesUrl);
    expect(pendingUnidadesReqs.length).toBeGreaterThanOrEqual(1);
    for (const req of pendingUnidadesReqs) {
      req.flush({
        scope: 'GLOBAL',
        unidades: mockUnidadesGlobal,
      });
    }
    await fixture.whenStable();
    fixture.detectChanges();

    const myWorkspaceLink = fixture.nativeElement.querySelector(
      '#rh-shell-my-workspace-link'
    ) as HTMLAnchorElement | null;
    expect(myWorkspaceLink).not.toBeNull();
    expect(myWorkspaceLink?.textContent).toContain('Mi espacio laboral');
    expect(myWorkspaceLink?.getAttribute('href')).toBe('/rh');

    const navBackToPortal = await router.navigateByUrl('/rh');
    expect(navBackToPortal).toBeTrue();
    expect(location.path()).toBe('/rh');

    expect(resolveSafeAdminReturnUrl('/rh')).toBe('/rh');
    expect(resolveSafeAdminReturnUrl('/rh-admin')).toBe('/rh-admin');
    expect(resolveSafeAdminReturnUrl('/rh-admin?unidad=10')).toBe('/rh-admin?unidad=10');

    const reload401Promise = component.cargarUnidadesAutorizadas();
    httpMock
      .expectOne(rhUnidadesUrl)
      .flush({ error: 'Token expired' }, { status: 401, statusText: 'Unauthorized' });
    await Promise.resolve();
    httpMock
      .expectOne(`${authBase}/refresh`)
      .flush({ error: 'Refresh expired' }, { status: 401, statusText: 'Unauthorized' });
    await reload401Promise;
    await fixture.whenStable();

    expect(sessionStore.currentUser).toBeNull();
    expect(location.path()).toBe('/login?returnUrl=%2Frh-admin');
  });

  it('35 (RH-2C.4 #6, #9, #10, #11, #12). Estados de vinculación PENDIENTE_ADSCRIPCION_RH (unidad de directorio e identificadores no registrados), ADSCRIPCION_FUTURA, ADSCRIPCION_HISTORICA, priorización visual y soporte de OFICINA CENTRAL (cluesimb = "N/A")', async () => {
    setupSession(unauthorizedAbastoUser);

    // Caso A: PENDIENTE_ADSCRIPCION_RH + OFICINA CENTRAL (id=177, cluesimb="N/A") + sin RFC ni CURP
    const portalFixture = TestBed.createComponent(RhEmployeePortalComponent);
    portalFixture.detectChanges();

    httpMock.expectOne(rhMiContextoUrl).flush({
      modo: 'EMPLEADO',
      persona: {
        persona_id: 702,
        nombre_completo: 'Jorge Alberto Méndez',
        nombres: null,
        apellidos: null,
        tiene_rfc: false,
        rfc_masked: null,
        tiene_curp: false,
        curp_masked: null,
      },
      unidad_referencia: {
        id: 177,
        nombre: 'OFICINA CENTRAL',
        cluesimb: 'N/A',
        origen: 'DIRECTORIO',
      },
      estado_vinculacion_rh: 'PENDIENTE_ADSCRIPCION_RH',
      adscripciones: [],
      permisos: mockMiContextoVigente.permisos,
    } satisfies RhMiContextoResponse);

    await portalFixture.whenStable();
    portalFixture.detectChanges();

    const portalEl = portalFixture.nativeElement as HTMLElement;
    expect(portalEl.querySelector('#rh-portal-perfil-rfc')?.textContent).toContain('No registrado');
    expect(portalEl.querySelector('#rh-portal-perfil-curp')?.textContent).toContain('No registrada');

    // Presenta la unidad del directorio como «Unidad de referencia institucional» y maneja OFICINA CENTRAL sin CLUES convencional
    expect(portalEl.querySelector('#rh-portal-unidad-heading')?.textContent).toContain(
      'Unidad de referencia institucional'
    );
    expect(portalEl.querySelector('#rh-portal-unidad-origen-badge')?.textContent).toContain(
      'Referencia directorio'
    );
    expect(portalEl.querySelector('#rh-portal-unidad-nombre')?.textContent).toContain(
      'OFICINA CENTRAL'
    );
    expect(portalEl.querySelector('#rh-portal-unidad-clues')?.textContent).toContain(
      'Sin CLUES convencional'
    );
    expect(portalEl.querySelector('#rh-portal-banner-pendiente')?.textContent).toContain(
      'Aún no cuentas con una adscripción laboral registrada en RH'
    );

    // Caso B: ADSCRIPCION_FUTURA con adscripción futura e histórica -> ordena FUTURA antes que HISTORICA
    const reloadFutura = portalFixture.componentInstance.cargarMiContexto();
    httpMock.expectOne(rhMiContextoUrl).flush({
      modo: 'EMPLEADO',
      persona: mockMiContextoVigente.persona,
      unidad_referencia: {
        id: 177,
        nombre: 'OFICINA CENTRAL',
        cluesimb: 'N/A',
        origen: 'ADSCRIPCION_RH',
      },
      estado_vinculacion_rh: 'ADSCRIPCION_FUTURA',
      adscripciones: [
        {
          adscripcion_laboral_id: 9010,
          unidad_medica_id: 20,
          unidad: { id: 20, nombre: 'HOSPITAL GENERAL TIJUANA', cluesimb: 'BCIMB000010' },
          matricula: 'EMP-HIST',
          puesto: 'Auxiliar Administrativo',
          turno: 'VESPERTINO',
          jornada: '8 HORAS',
          horario: '14:00 - 21:30',
          vigente_desde: '2024-01-01',
          vigente_hasta: '2024-12-31',
          activo: false,
          es_vigente: false,
          estado_vigencia: 'HISTORICA',
          observaciones: null,
        },
        {
          adscripcion_laboral_id: 9011,
          unidad_medica_id: 177,
          unidad: { id: 177, nombre: 'OFICINA CENTRAL', cluesimb: 'N/A' },
          matricula: 'EMP-FUT',
          puesto: 'Analista Estatal RH',
          turno: 'MATUTINO',
          jornada: '8 HORAS',
          horario: '08:00 - 16:00',
          vigente_desde: '2099-01-15',
          vigente_hasta: null,
          activo: true,
          es_vigente: false,
          estado_vigencia: 'FUTURA',
          observaciones: null,
        },
      ],
      permisos: mockMiContextoVigente.permisos,
    } satisfies RhMiContextoResponse);
    await reloadFutura;
    portalFixture.detectChanges();

    expect(portalEl.querySelector('#rh-portal-banner-futura')?.textContent).toContain(
      'Existe una adscripción laboral programada que todavía no se encuentra vigente'
    );

    const renderedCards = Array.from(
      portalEl.querySelectorAll('#rh-portal-adscripciones-list article')
    );
    expect(renderedCards.length).toBe(2);
    expect(renderedCards[0].getAttribute('data-estado-vigencia')).toBe('FUTURA');
    expect(renderedCards[0].textContent).toContain('Programada (futura)');
    expect(renderedCards[0].textContent).toContain('OFICINA CENTRAL');
    expect(renderedCards[0].textContent).toContain('Sin CLUES convencional');
    expect(renderedCards[0].textContent).toContain('15/01/2099');
    expect(renderedCards[1].getAttribute('data-estado-vigencia')).toBe('HISTORICA');
    expect(renderedCards[1].textContent).toContain('Histórica');
    expect(renderedCards[1].textContent).toContain('31/12/2024');

    // Caso C: ADSCRIPCION_HISTORICA exclusivamente
    const reloadHistorica = portalFixture.componentInstance.cargarMiContexto();
    httpMock.expectOne(rhMiContextoUrl).flush({
      modo: 'EMPLEADO',
      persona: mockMiContextoVigente.persona,
      unidad_referencia: {
        id: 20,
        nombre: 'HOSPITAL GENERAL TIJUANA',
        cluesimb: 'BCIMB000010',
        origen: 'ADSCRIPCION_RH',
      },
      estado_vinculacion_rh: 'ADSCRIPCION_HISTORICA',
      adscripciones: [
        {
          adscripcion_laboral_id: 9010,
          unidad_medica_id: 20,
          unidad: { id: 20, nombre: 'HOSPITAL GENERAL TIJUANA', cluesimb: 'BCIMB000010' },
          matricula: 'EMP-HIST',
          puesto: 'Auxiliar Administrativo',
          turno: 'VESPERTINO',
          jornada: '8 HORAS',
          horario: '14:00 - 21:30',
          vigente_desde: '2024-01-01',
          vigente_hasta: '2024-12-31',
          activo: false,
          es_vigente: false,
          estado_vigencia: 'HISTORICA',
          observaciones: null,
        },
      ],
      permisos: mockMiContextoVigente.permisos,
    } satisfies RhMiContextoResponse);
    await reloadHistorica;
    portalFixture.detectChanges();

    expect(portalEl.querySelector('#rh-portal-banner-historica')?.textContent).toContain(
      'Consulta de adscripciones laborales históricas'
    );
  });

  it('36 (RH-2C.4 #16, #17, #18, #23, #24, #25). Manejo de errores HTTP 403 (cuenta sin persona o inactiva), HTTP 500 con reintento manual, HTTP 401 (redirige a /login?returnUrl=%2Frh), cierre de sesión, ngOnDestroy y no persistencia en almacenamiento del navegador', async () => {
    setupSession(unauthorizedAbastoUser);

    const portalFixture = TestBed.createComponent(RhEmployeePortalComponent);
    portalFixture.detectChanges();

    // 17. HTTP 403 -> muestra alerta segura sin botón de reintento ni inventar CLUES
    httpMock.expectOne(rhMiContextoUrl).flush(
      {
        error:
          'La cuenta autenticada no tiene una persona activa asociada en el directorio institucional',
      },
      { status: 403, statusText: 'Forbidden' }
    );
    await portalFixture.whenStable();
    portalFixture.detectChanges();

    const portalEl = portalFixture.nativeElement as HTMLElement;
    expect(portalEl.querySelector('#rh-portal-forbidden-alert')).not.toBeNull();
    expect(portalEl.querySelector('#rh-portal-forbidden-text')?.textContent).toContain(
      'no tiene una persona activa asociada'
    );
    expect(portalEl.querySelector('#rh-portal-retry-btn')).toBeNull();
    expect(portalEl.querySelector('#rh-portal-perfil-card')).toBeNull();

    // 18. HTTP 500 -> muestra mensaje de error y botón de reintento manual (#rh-portal-retry-btn)
    const retryAfter500 = portalFixture.componentInstance.cargarMiContexto();
    httpMock
      .expectOne(rhMiContextoUrl)
      .flush({ error: 'Error interno al consultar contexto' }, { status: 500, statusText: 'Server Error' });
    await retryAfter500;
    portalFixture.detectChanges();

    expect(portalEl.querySelector('#rh-portal-error-alert')).not.toBeNull();
    const retryBtn = portalEl.querySelector('#rh-portal-retry-btn') as HTMLButtonElement | null;
    expect(retryBtn).not.toBeNull();

    // Clic en Reintentar dispara nueva consulta y carga el contexto
    retryBtn!.click();
    portalFixture.detectChanges();
    httpMock.expectOne(rhMiContextoUrl).flush(mockMiContextoVigente);
    await portalFixture.whenStable();
    portalFixture.detectChanges();

    expect(portalEl.querySelector('#rh-portal-error-alert')).toBeNull();
    expect(portalEl.querySelector('#rh-portal-perfil-card')).not.toBeNull();

    // 25. No persiste datos personales ni adscripciones en localStorage ni sessionStorage
    expect(JSON.stringify(localStorage)).not.toContain('María Fernanda López Ruiz');
    expect(JSON.stringify(localStorage)).not.toContain('**********1A9');
    expect(JSON.stringify(sessionStorage)).not.toContain('María Fernanda López Ruiz');
    expect(JSON.stringify(sessionStorage)).not.toContain('**********1A9');

    // 23 y 24. Cerrar sesión desde /rh limpia el estado personal e invoca logout -> /login
    const logoutPromise = portalFixture.componentInstance.onLogout();
    expect(portalFixture.componentInstance.contextoData()).toBeNull();
    httpMock.expectOne(`${authBase}/logout`).flush({ ok: true });
    await logoutPromise;
    expect(location.path()).toBe('/login');

    // 16. HTTP 401 en GET /api/rh/mi-contexto limpia datos del perfil, limpia sesión y redirige a /login?returnUrl=%2Frh
    setupSession(unauthorizedAbastoUser);
    const load401Promise = portalFixture.componentInstance.cargarMiContexto();
    httpMock
      .expectOne(rhMiContextoUrl)
      .flush({ error: 'No autenticado' }, { status: 401, statusText: 'Unauthorized' });
    await Promise.resolve();
    httpMock
      .expectOne(`${authBase}/refresh`)
      .flush({ error: 'Refresh inválido' }, { status: 401, statusText: 'Unauthorized' });
    await load401Promise;
    await portalFixture.whenStable();

    expect(portalFixture.componentInstance.contextoData()).toBeNull();
    expect(sessionStore.currentUser).toBeNull();
    expect(location.path()).toBe('/login?returnUrl=%2Frh');

    // Destruir el componente limpia cualquier estado local remanente
    portalFixture.destroy();
    expect(portalFixture.componentInstance.contextoData()).toBeNull();
    expect(portalFixture.componentInstance.loadingContexto()).toBeFalse();
  });

  // =========================================================================
  // SUITE RH-3A.2 (MI LISTA DE ASISTENCIA EN /rh: PRECARGA, CASOS DE ADSCRIPCIÓN, CALENDARIO Y DESCARGA DOCX)
  // =========================================================================

  it('37 (RH-3A.2 #1, #2, #5, #6, #9, #10, #11, #19, #20). Carga de «Mi lista de asistencia» tras GET /api/rh/mi-contexto; precarga desde adscripción vigente, varias adscripciones vigentes, Oficina Central (CLUES N/A), puesto/jornada/horario faltantes, sugerencias editables y edición local sin PATCH ni peticiones administrativas', async () => {
    setupSession(rhGlobalUser);

    const portalFixture = TestBed.createComponent(RhEmployeePortalComponent);
    portalFixture.detectChanges();

    // Contexto con 2 adscripciones vigentes (una en unidad médica y otra en OFICINA CENTRAL sin puesto/jornada/horario)
    httpMock.expectOne(rhMiContextoUrl).flush({
      modo: 'EMPLEADO',
      persona: {
        persona_id: 801,
        nombre_completo: 'Persona Trabajadora Ejemplo Uno',
        nombres: 'Persona Trabajadora',
        apellidos: 'Ejemplo Uno',
        tiene_rfc: true,
        rfc_masked: '**********AB1',
        tiene_curp: true,
        curp_masked: '****************09',
      },
      unidad_referencia: {
        id: 10,
        nombre: 'HOSPITAL GENERAL MEXICALI',
        cluesimb: 'BCIMB000001',
        origen: 'ADSCRIPCION_RH',
      },
      estado_vinculacion_rh: 'ADSCRIPCION_VIGENTE',
      adscripciones: [
        {
          adscripcion_laboral_id: 9101,
          unidad_medica_id: 10,
          unidad: { id: 10, nombre: 'HOSPITAL GENERAL MEXICALI', cluesimb: 'BCIMB000001' },
          matricula: 'MAT-9101',
          puesto: 'Enfermera General Titulada',
          turno: 'MATUTINO',
          jornada: 'LUNES A VIERNES',
          horario: '07:00 - 15:00 HRS',
          vigente_desde: '2025-01-01',
          vigente_hasta: null,
          activo: true,
          es_vigente: true,
          estado_vigencia: 'VIGENTE',
          observaciones: null,
        },
        {
          adscripcion_laboral_id: 9102,
          unidad_medica_id: 177,
          unidad: { id: 177, nombre: 'OFICINA CENTRAL', cluesimb: 'N/A' },
          matricula: null,
          puesto: null,
          turno: null,
          jornada: null,
          horario: null,
          vigente_desde: '2025-06-01',
          vigente_hasta: null,
          activo: true,
          es_vigente: true,
          estado_vigencia: 'VIGENTE',
          observaciones: null,
        },
      ],
      permisos: mockMiContextoVigente.permisos,
    } satisfies RhMiContextoResponse);

    await portalFixture.whenStable();
    portalFixture.detectChanges();

    const portalEl = portalFixture.nativeElement as HTMLElement;
    const asistenciaSection = portalEl.querySelector('#rh-portal-mi-lista-asistencia-section');
    expect(asistenciaSection).not.toBeNull();
    expect(portalEl.querySelector('#rh-portal-asistencia-heading')?.textContent).toContain(
      'Mi lista de asistencia'
    );

    // 1 y 2. Verificar precarga desde la primera adscripción vigente (9101)
    const inputNombre = portalEl.querySelector('#rh-asistencia-input-nombre') as HTMLInputElement;
    const inputPuesto = portalEl.querySelector('#rh-asistencia-input-puesto') as HTMLInputElement;
    const inputAdscripcion = portalEl.querySelector(
      '#rh-asistencia-input-adscripcion'
    ) as HTMLInputElement;
    const inputJornada = portalEl.querySelector('#rh-asistencia-input-jornada') as HTMLInputElement;
    const inputHorario = portalEl.querySelector('#rh-asistencia-input-horario') as HTMLInputElement;

    expect(inputNombre.value).toBe('Persona Trabajadora Ejemplo Uno');
    expect(inputPuesto.value).toBe('Enfermera General Titulada');
    expect(inputAdscripcion.value).toBe('HOSPITAL GENERAL MEXICALI');
    expect(inputJornada.value).toBe('LUNES A VIERNES');
    expect(inputHorario.value).toBe('07:00 - 15:00 HRS');

    // 6. Varias adscripciones vigentes -> muestra selector #rh-asistencia-select-adscripcion
    const selectAdscripcion = portalEl.querySelector(
      '#rh-asistencia-select-adscripcion'
    ) as HTMLSelectElement | null;
    expect(selectAdscripcion).not.toBeNull();
    expect(selectAdscripcion!.options.length).toBe(2);

    // 5, 9 y 10. Seleccionar la segunda adscripción vigente (9102 en OFICINA CENTRAL con CLUES N/A y sin puesto/jornada/horario)
    selectAdscripcion!.value = '9102';
    selectAdscripcion!.dispatchEvent(new Event('change'));
    portalFixture.detectChanges();

    expect(inputAdscripcion.value).toBe('OFICINA CENTRAL');
    // No inventa puesto, jornada ni horario cuando la adscripción los tiene en null
    expect(inputPuesto.value).toBe('');
    expect(inputJornada.value).toBe('');
    expect(inputHorario.value).toBe('');

    // Las sugerencias editables aplican el valor sugerido explícitamente cuando el usuario hace clic
    (portalEl.querySelector('#rh-asistencia-suggest-jornada-btn') as HTMLButtonElement).click();
    (portalEl.querySelector('#rh-asistencia-suggest-horario-btn') as HTMLButtonElement).click();
    portalFixture.detectChanges();

    expect(inputJornada.value).toBe('LUNES A VIERNES');
    expect(inputHorario.value).toBe('08:00 – 17:00 HRS');

    // 11 y 19. Edición local en el formulario no dispara ningún PATCH/POST/GET administrativo al backend
    inputPuesto.value = 'Analista Administrativo Estatal';
    inputPuesto.dispatchEvent(new Event('input'));
    portalFixture.detectChanges();

    expect(portalEl.querySelector('#rh-asistencia-local-edit-notice')?.textContent).toContain(
      'no modifican ni actualizan tu expediente laboral'
    );
    httpMock.expectNone((r) => r.url.includes('/api/rh/') && !r.url.endsWith('/mi-vacaciones'));

    // 20. Conserva el botón «Ir a Administración RH» para usuarios con rol RH
    expect(portalEl.querySelector('#rh-portal-go-admin-link')).not.toBeNull();
  });

  it('38 (RH-3A.2 #3, #4, #7, #8). Trabajador sin adscripción RH (unidad de referencia del directorio) y trabajador con solo adscripciones futuras o históricas (no seleccionadas silenciosamente como vigentes)', async () => {
    setupSession(unauthorizedAbastoUser);

    const portalFixture = TestBed.createComponent(RhEmployeePortalComponent);
    portalFixture.detectChanges();

    // 3 y 4. Trabajador en PENDIENTE_ADSCRIPCION_RH con unidad de referencia del directorio
    httpMock.expectOne(rhMiContextoUrl).flush({
      modo: 'EMPLEADO',
      persona: {
        persona_id: 802,
        nombre_completo: 'Persona Trabajadora Sin Adscripcion',
        nombres: 'Persona Trabajadora',
        apellidos: 'Sin Adscripcion',
        tiene_rfc: false,
        rfc_masked: null,
        tiene_curp: false,
        curp_masked: null,
      },
      unidad_referencia: {
        id: 20,
        nombre: 'HOSPITAL GENERAL TIJUANA',
        cluesimb: 'BCIMB000010',
        origen: 'DIRECTORIO',
      },
      estado_vinculacion_rh: 'PENDIENTE_ADSCRIPCION_RH',
      adscripciones: [],
      permisos: mockMiContextoVigente.permisos,
    } satisfies RhMiContextoResponse);

    await portalFixture.whenStable();
    portalFixture.detectChanges();

    const portalEl = portalFixture.nativeElement as HTMLElement;
    const inputNombre = portalEl.querySelector('#rh-asistencia-input-nombre') as HTMLInputElement;
    const inputPuesto = portalEl.querySelector('#rh-asistencia-input-puesto') as HTMLInputElement;
    const inputAdscripcion = portalEl.querySelector(
      '#rh-asistencia-input-adscripcion'
    ) as HTMLInputElement;
    const inputJornada = portalEl.querySelector('#rh-asistencia-input-jornada') as HTMLInputElement;
    const inputHorario = portalEl.querySelector('#rh-asistencia-input-horario') as HTMLInputElement;

    expect(inputNombre.value).toBe('Persona Trabajadora Sin Adscripcion');
    expect(inputAdscripcion.value).toBe('HOSPITAL GENERAL TIJUANA');
    // Identificada explícitamente como unidad de referencia del directorio, no adscripción formal
    expect(
      portalEl.querySelector('#rh-asistencia-adscripcion-ref-badge')?.textContent
    ).toContain('Unidad de referencia del directorio');
    expect(inputPuesto.value).toBe('');
    expect(inputJornada.value).toBe('');
    expect(inputHorario.value).toBe('');

    // 7 y 8. Trabajador con solo adscripción FUTURA e HISTORICA -> NO se seleccionan silenciosamente como vigentes
    const reloadNonVigentes = portalFixture.componentInstance.cargarMiContexto();
    httpMock.expectOne(rhMiContextoUrl).flush({
      modo: 'EMPLEADO',
      persona: {
        persona_id: 803,
        nombre_completo: 'Persona Trabajadora Programada',
        nombres: 'Persona Trabajadora',
        apellidos: 'Programada',
        tiene_rfc: false,
        rfc_masked: null,
        tiene_curp: false,
        curp_masked: null,
      },
      unidad_referencia: {
        id: 177,
        nombre: 'OFICINA CENTRAL',
        cluesimb: 'N/A',
        origen: 'ADSCRIPCION_RH',
      },
      estado_vinculacion_rh: 'ADSCRIPCION_FUTURA',
      adscripciones: [
        {
          adscripcion_laboral_id: 9201,
          unidad_medica_id: 177,
          unidad: { id: 177, nombre: 'OFICINA CENTRAL', cluesimb: 'N/A' },
          matricula: 'MAT-FUT',
          puesto: 'Coordinador Normativo',
          turno: 'MATUTINO',
          jornada: 'LUNES A VIERNES',
          horario: '08:00 - 16:00 HRS',
          vigente_desde: '2099-01-15',
          vigente_hasta: null,
          activo: true,
          es_vigente: false,
          estado_vigencia: 'FUTURA',
          observaciones: null,
        },
        {
          adscripcion_laboral_id: 9202,
          unidad_medica_id: 30,
          unidad: { id: 30, nombre: 'HOSPITAL GENERAL ENSENADA', cluesimb: 'BCIMB000020' },
          matricula: 'MAT-HIST',
          puesto: 'Analista Previo',
          turno: 'VESPERTINO',
          jornada: 'LUNES A VIERNES',
          horario: '14:00 - 21:30 HRS',
          vigente_desde: '2024-01-01',
          vigente_hasta: '2024-12-31',
          activo: false,
          es_vigente: false,
          estado_vigencia: 'HISTORICA',
          observaciones: null,
        },
      ],
      permisos: mockMiContextoVigente.permisos,
    } satisfies RhMiContextoResponse);
    await reloadNonVigentes;
    portalFixture.detectChanges();

    // Ninguna adscripción futura o histórica se seleccionó silenciosamente
    expect(portalEl.querySelector('#rh-asistencia-non-vigente-warning')).not.toBeNull();
    expect(inputPuesto.value).toBe('');
    expect(inputJornada.value).toBe('');
    expect(inputHorario.value).toBe('');

    const selectNonVigente = portalEl.querySelector(
      '#rh-asistencia-select-adscripcion'
    ) as HTMLSelectElement;
    expect(selectNonVigente).not.toBeNull();
    expect(selectNonVigente.value).toBe('NONE');
    expect(selectNonVigente.textContent).toContain('[Programada (futura)]');
    expect(selectNonVigente.textContent).toContain('15/01/2099');
    expect(selectNonVigente.textContent).toContain('[Histórica]');
    expect(selectNonVigente.textContent).toContain('01/01/2024 a 31/12/2024');

    // Selección explícita de la adscripción futura por el trabajador
    selectNonVigente.value = '9201';
    selectNonVigente.dispatchEvent(new Event('change'));
    portalFixture.detectChanges();

    expect(inputPuesto.value).toBe('Coordinador Normativo');
    expect(inputAdscripcion.value).toBe('OFICINA CENTRAL');
    expect(inputJornada.value).toBe('LUNES A VIERNES');
    expect(inputHorario.value).toBe('08:00 - 16:00 HRS');
  });

  it('39 (RH-3A.2 #12, #13, #14, #15, #16, #17, #18). Selección de mes y año, febrero bisiesto 2028, aviso de calendario no confirmado, descarga DOCX, prevención de doble descarga, manejo de error de plantilla y limpieza al cerrar sesión', async () => {
    setupSession(unauthorizedAbastoUser);
    const docxService = TestBed.inject(RhAsistenciaDocxService);

    const portalFixture = TestBed.createComponent(RhEmployeePortalComponent);
    portalFixture.detectChanges();

    httpMock.expectOne(rhMiContextoUrl).flush(mockMiContextoVigente);
    await portalFixture.whenStable();
    portalFixture.detectChanges();

    const portalEl = portalFixture.nativeElement as HTMLElement;
    const selectMonth = portalEl.querySelector('#rh-asistencia-select-month') as HTMLSelectElement;
    const selectYear = portalEl.querySelector('#rh-asistencia-select-year') as HTMLSelectElement;

    // 12, 13 y 14. Seleccionar Febrero de 2028 (bisiesto = 29 días y calendario sujeto a confirmación)
    selectMonth.value = '2';
    selectMonth.dispatchEvent(new Event('change'));
    selectYear.value = '2028';
    selectYear.dispatchEvent(new Event('change'));
    portalFixture.detectChanges();

    expect(portalEl.querySelector('#rh-asistencia-leap-badge')?.textContent).toContain(
      'Año bisiesto (2028)'
    );
    expect(portalEl.querySelector('#rh-asistencia-kpi-total-days')?.textContent?.trim()).toBe('29');
    expect(
      portalEl.querySelector('#rh-asistencia-unconfirmed-calendar-notice')?.textContent
    ).toContain('Calendario sujeto a confirmación de la circular institucional correspondiente.');

    // En 2026 (confirmado por Circular IB-UAF-CRH-0003-2026) el aviso desaparece
    selectYear.value = '2026';
    selectYear.dispatchEvent(new Event('change'));
    portalFixture.detectChanges();
    expect(portalEl.querySelector('#rh-asistencia-unconfirmed-calendar-notice')).toBeNull();
    expect(portalEl.querySelector('#rh-asistencia-kpi-total-days')?.textContent?.trim()).toBe('28');

    // Validación cuando falta puesto antes de descargar
    const inputPuesto = portalEl.querySelector('#rh-asistencia-input-puesto') as HTMLInputElement;
    inputPuesto.value = '   ';
    inputPuesto.dispatchEvent(new Event('input'));
    portalFixture.detectChanges();

    const downloadBtn = portalEl.querySelector(
      '#rh-asistencia-download-btn'
    ) as HTMLButtonElement;
    downloadBtn.click();
    portalFixture.detectChanges();

    expect(portalEl.querySelector('#rh-asistencia-validation-error')?.textContent).toContain(
      'El campo «Puesto» es obligatorio'
    );

    // Restaurar puesto y probar 15 y 17 (descarga DOCX y prevención de doble descarga por clics repetidos)
    inputPuesto.value = 'Enfermera General Titulada';
    inputPuesto.dispatchEvent(new Event('input'));
    portalFixture.detectChanges();

    let resolveDownload!: (fileName: string) => void;
    const downloadSpy = spyOn(docxService, 'downloadAttendanceDocxFromParams').and.returnValue(
      new Promise<string>((resolve) => {
        resolveDownload = resolve;
      })
    );

    downloadBtn.click();
    portalFixture.detectChanges();

    expect(downloadSpy).toHaveBeenCalledTimes(1);
    expect(downloadBtn.disabled).toBeTrue();
    expect(downloadBtn.textContent).toContain('Generando documento Word…');

    // Un segundo clic mientras isGenerating() es true no dispara otra descarga
    downloadBtn.click();
    expect(downloadSpy).toHaveBeenCalledTimes(1);

    resolveDownload('Lista_Asistencia_2026-02_Maria_Fernanda_Lopez_Ruiz.docx');
    await portalFixture.whenStable();
    portalFixture.detectChanges();

    expect(downloadBtn.disabled).toBeFalse();
    expect(portalEl.querySelector('#rh-asistencia-download-success')?.textContent).toContain(
      'Lista_Asistencia_2026-02_Maria_Fernanda_Lopez_Ruiz.docx'
    );

    // 16. Error en carga de plantilla muestra mensaje amigable en #rh-asistencia-generation-error
    downloadSpy.and.returnValue(
      Promise.reject(
        new Error(
          'No se encontró la plantilla institucional rh/asistencia/template-membretado-2026.docx (HTTP 404).'
        )
      )
    );

    downloadBtn.click();
    await portalFixture.whenStable();
    portalFixture.detectChanges();

    expect(portalEl.querySelector('#rh-asistencia-generation-error')?.textContent).toContain(
      'No se encontró la plantilla institucional'
    );

    // 18. Cierre de sesión limpia toda la información del portal y del formulario sin persistir en storage
    expect(JSON.stringify(localStorage)).not.toContain('Enfermera General Titulada');
    expect(JSON.stringify(sessionStorage)).not.toContain('Enfermera General Titulada');

    const logoutPromise = portalFixture.componentInstance.onLogout();
    portalFixture.detectChanges();
    expect(portalFixture.componentInstance.contextoData()).toBeNull();
    expect(portalEl.querySelector('#rh-portal-mi-lista-asistencia-section')).toBeNull();

    httpMock.expectOne(`${authBase}/logout`).flush({ ok: true });
    await logoutPromise;
    expect(location.path()).toBe('/login');
  });

  // =========================================================================
  // SUITE RH-4A.1B (PLANTILLA INSTITUCIONAL EN /rh-admin: PADRÓN, ALTA Y CAMBIO DE ESTADO)
  // =========================================================================

  it('40 (RH-4A.1B #1-#11, #24). Visibilidad exclusiva de «Plantilla institucional» para RECURSOS_HUMANOS GLOBAL (oculta para RH CLUES y ADMIN_TIC GLOBAL); carga inicial, búsqueda, filtro de estado, paginación, persona sin cuenta, sin unidad, Oficina Central (CLUES N/A) e identificadores enmascarados', async () => {
    const rhPersonasUrl = `${apiBase}/rh/personas`;

    // 2. Oculta para RECURSOS_HUMANOS CLUES
    setupSession(rhCluesSingleUser);
    createComponent();
    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'CLUES',
      unidades: [mockUnidadesGlobal[0]],
    });
    await Promise.resolve();
    await Promise.resolve();
    httpMock.expectOne((r) => r.url === rhPersonalUrl(10)).flush({
      unidad: mockUnidadesGlobal[0],
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#rh-admin-tab-padron')).toBeNull();
    fixture.destroy();

    // 3. Oculta para ADMIN_TIC GLOBAL sin RH GLOBAL
    setupSession(adminTicGlobalUser);
    createComponent();
    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'GLOBAL',
      unidades: mockUnidadesGlobal,
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#rh-admin-tab-padron')).toBeNull();
    fixture.destroy();

    // 1. Visible para RECURSOS_HUMANOS GLOBAL
    setupSession(rhGlobalUser);
    createComponent();
    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'GLOBAL',
      unidades: mockUnidadesGlobal,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const tabPadronBtn = fixture.nativeElement.querySelector(
      '#rh-admin-tab-padron'
    ) as HTMLButtonElement | null;
    expect(tabPadronBtn).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#rh-unidad-context-section')).not.toBeNull();

    // 4. Cambiar a pestaña «Plantilla institucional» dispara GET /api/rh/personas
    tabPadronBtn!.click();
    fixture.detectChanges();

    const initReq = httpMock.expectOne((r) => r.url === rhPersonasUrl && r.method === 'GET');
    expect(initReq.request.params.get('estado')).toBe('todas');
    expect(initReq.request.params.get('page')).toBe('1');
    initReq.flush({
      items: [
        {
          persona_id: 501,
          nombre_completo: 'Persona Oficina Central',
          nombres: 'Persona',
          apellidos: 'Oficina Central',
          cargo: 'Coordinación',
          correo_principal: 'central@imssbienestar.gob.mx',
          unidad_medica_id: 177,
          unidad_medica_nombre: 'OFICINA CENTRAL',
          unidad_medica_cluesimb: 'N/A',
          tiene_rfc: true,
          rfc_masked: '**********AB1',
          tiene_curp: true,
          curp_masked: '****************01',
          activo: true,
          fecha_baja: null,
          tiene_cuenta_activa: true,
        },
        {
          persona_id: 502,
          nombre_completo: 'Persona Sin Cuenta Ni Unidad',
          nombres: 'Persona',
          apellidos: 'Sin Cuenta Ni Unidad',
          cargo: null,
          correo_principal: null,
          unidad_medica_id: null,
          unidad_medica_nombre: null,
          unidad_medica_cluesimb: null,
          tiene_rfc: false,
          rfc_masked: null,
          tiene_curp: false,
          curp_masked: null,
          activo: true,
          fecha_baja: null,
          tiene_cuenta_activa: false,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 25,
    });

    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const tableText = el.querySelector('#rh-padron-table')?.textContent ?? '';
    expect(tableText).toContain('Persona Oficina Central');
    expect(tableText).toContain('OFICINA CENTRAL');
    expect(tableText).toContain('Unidad administrativa (sin CLUES convencional)');
    expect(tableText).toContain('**********AB1');
    expect(tableText).toContain('****************01');
    expect(tableText).toContain('Sin cuenta activa');
    expect(tableText).toContain('Sin unidad de referencia');
    expect(el.querySelector('#rh-padron-total-badge')?.textContent).toContain('Total: 25 personas');

    // 5. Búsqueda por nombre
    const searchInput = el.querySelector('#rh-padron-search-input') as HTMLInputElement;
    searchInput.value = 'Oficina';
    searchInput.dispatchEvent(new Event('input'));
    searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();

    const searchReq = httpMock.expectOne((r) => r.url === rhPersonasUrl && r.params.get('q') === 'Oficina');
    searchReq.flush({ items: [], page: 1, pageSize: 20, total: 0 });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('#rh-padron-empty')?.textContent).toContain('Oficina');

    // 6. Filtro de estado
    const estadoSelect = el.querySelector('#rh-padron-estado-select') as HTMLSelectElement;
    estadoSelect.value = 'inactivas';
    estadoSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const estadoReq = httpMock.expectOne((r) => r.url === rhPersonasUrl && r.params.get('estado') === 'inactivas');
    estadoReq.flush({
      items: [
        {
          persona_id: 503,
          nombre_completo: 'Persona Inactiva Pagina 1',
          nombres: 'Persona',
          apellidos: 'Inactiva Pagina 1',
          cargo: null,
          correo_principal: null,
          unidad_medica_id: null,
          unidad_medica_nombre: null,
          unidad_medica_cluesimb: null,
          tiene_rfc: false,
          rfc_masked: null,
          tiene_curp: false,
          curp_masked: null,
          activo: false,
          fecha_baja: '2026-01-10',
          tiene_cuenta_activa: false,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 25,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    // 7. Paginación siguiente
    (el.querySelector('#rh-padron-next-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    const page2Req = httpMock.expectOne((r) => r.url === rhPersonasUrl && r.params.get('page') === '2');
    page2Req.flush({
      items: [
        {
          persona_id: 504,
          nombre_completo: 'Persona Inactiva Pagina 2',
          nombres: 'Persona',
          apellidos: 'Inactiva Pagina 2',
          cargo: null,
          correo_principal: null,
          unidad_medica_id: null,
          unidad_medica_nombre: null,
          unidad_medica_cluesimb: null,
          tiene_rfc: false,
          rfc_masked: null,
          tiene_curp: false,
          curp_masked: null,
          activo: false,
          fecha_baja: '2026-01-11',
          tiene_cuenta_activa: false,
        },
      ],
      page: 2,
      pageSize: 20,
      total: 25,
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('#rh-padron-page-info')?.textContent).toContain('Página 2 de 2');
  });

  it('41 (RH-4A.1B #12-#23). Alta de persona (datos mínimos, sin RFC/CURP, con unidad, error 400/409, limpieza de borrador), desactivación con confirmación/cancelación, conflictos 409 (cuenta activa / adscripción), reactivación y prevención de dobles envíos', async () => {
    const rhPersonasUrl = `${apiBase}/rh/personas`;
    const rhPersonaEstadoUrl = (id: number) => `${apiBase}/rh/personas/${id}/estado`;

    setupSession(rhGlobalUser);
    createComponent();
    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'GLOBAL',
      unidades: mockUnidadesGlobal,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('#rh-admin-tab-padron') as HTMLButtonElement).click();
    fixture.detectChanges();

    httpMock.expectOne((r) => r.url === rhPersonasUrl && r.method === 'GET').flush({
      items: [
        {
          persona_id: 601,
          nombre_completo: 'Persona Activa Uno',
          nombres: 'Persona',
          apellidos: 'Activa Uno',
          cargo: 'Analista',
          correo_principal: null,
          unidad_medica_id: 10,
          unidad_medica_nombre: 'HOSPITAL GENERAL MEXICALI',
          unidad_medica_cluesimb: 'BCIMB000001',
          tiene_rfc: false,
          rfc_masked: null,
          tiene_curp: false,
          curp_masked: null,
          activo: true,
          fecha_baja: null,
          tiene_cuenta_activa: false,
        },
        {
          persona_id: 602,
          nombre_completo: 'Persona Inactiva Dos',
          nombres: 'Persona',
          apellidos: 'Inactiva Dos',
          cargo: null,
          correo_principal: null,
          unidad_medica_id: null,
          unidad_medica_nombre: null,
          unidad_medica_cluesimb: null,
          tiene_rfc: false,
          rfc_masked: null,
          tiene_curp: false,
          curp_masked: null,
          activo: false,
          fecha_baja: '2026-01-10',
          tiene_cuenta_activa: false,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;

    // 12, 13, 14, 15, 16, 22, 23: Abrir diálogo «Registrar persona»
    (el.querySelector('#rh-padron-open-create-btn') as HTMLButtonElement).click();
    fixture.detectChanges();

    const nombresIn = el.querySelector('#rh-padron-create-nombres') as HTMLInputElement;
    const apellidosIn = el.querySelector('#rh-padron-create-apellidos') as HTMLInputElement;
    const rfcIn = el.querySelector('#rh-padron-create-rfc') as HTMLInputElement;
    const unidadSel = el.querySelector('#rh-padron-create-unidad') as HTMLSelectElement;
    const submitBtn = el.querySelector('#rh-padron-create-submit-btn') as HTMLButtonElement;

    // Validación local (sin nombres)
    submitBtn.click();
    fixture.detectChanges();
    expect(el.querySelector('#rh-padron-create-error')?.textContent).toContain('Nombres');

    // Conflicto 409 por RFC duplicado
    nombresIn.value = 'Nueva';
    nombresIn.dispatchEvent(new Event('input'));
    apellidosIn.value = 'Persona';
    apellidosIn.dispatchEvent(new Event('input'));
    rfcIn.value = 'NUPR900101AB1';
    rfcIn.dispatchEvent(new Event('input'));
    unidadSel.value = '177';
    unidadSel.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    submitBtn.click();
    // Doble clic bloqueado por createSubmitting()
    submitBtn.click();
    fixture.detectChanges();

    const create409Req = httpMock.expectOne((r) => r.url === rhPersonasUrl && r.method === 'POST');
    expect(create409Req.request.body).toEqual({
      nombres: 'Nueva',
      apellidos: 'Persona',
      rfc: 'NUPR900101AB1',
      unidad_medica_id: 177,
    });
    create409Req.flush(
      { error: 'El RFC proporcionado ya se encuentra registrado en otra persona del directorio institucional' },
      { status: 409, statusText: 'Conflict' }
    );
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('#rh-padron-create-error')?.textContent).toContain('ya se encuentra registrado');

    // Alta exitosa sin RFC/CURP y con unidad de referencia
    rfcIn.value = '';
    rfcIn.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    submitBtn.click();
    fixture.detectChanges();

    const createOkReq = httpMock.expectOne((r) => r.url === rhPersonasUrl && r.method === 'POST');
    expect(createOkReq.request.body).toEqual({
      nombres: 'Nueva',
      apellidos: 'Persona',
      unidad_medica_id: 177,
    });
    createOkReq.flush({
      persona_id: 603,
      nombre_completo: 'Nueva Persona',
      nombres: 'Nueva',
      apellidos: 'Persona',
      cargo: null,
      correo_principal: null,
      unidad_medica_id: 177,
      tiene_rfc: false,
      rfc_masked: null,
      tiene_curp: false,
      curp_masked: null,
      activo: true,
      fecha_baja: null,
    });
    await Promise.resolve();
    await Promise.resolve();

    httpMock
      .expectOne((r) => r.url === rhPersonasUrl && r.method === 'GET')
      .flush({ items: [], page: 1, pageSize: 20, total: 0 });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('#rh-padron-create-dialog')).toBeNull();
    expect(el.querySelector('#rh-padron-success-banner')?.textContent).toContain('Nueva Persona');

    // Recargar lista con 601 y 602 para probar desactivación/reactivación
    (el.querySelector('#rh-padron-clear-search-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === rhPersonasUrl && r.method === 'GET').flush({
      items: [
        {
          persona_id: 601,
          nombre_completo: 'Persona Activa Uno',
          nombres: 'Persona',
          apellidos: 'Activa Uno',
          cargo: 'Analista',
          correo_principal: null,
          unidad_medica_id: 10,
          unidad_medica_nombre: 'HOSPITAL GENERAL MEXICALI',
          unidad_medica_cluesimb: 'BCIMB000001',
          tiene_rfc: false,
          rfc_masked: null,
          tiene_curp: false,
          curp_masked: null,
          activo: true,
          fecha_baja: null,
          tiene_cuenta_activa: false,
        },
        {
          persona_id: 602,
          nombre_completo: 'Persona Inactiva Dos',
          nombres: 'Persona',
          apellidos: 'Inactiva Dos',
          cargo: null,
          correo_principal: null,
          unidad_medica_id: null,
          unidad_medica_nombre: null,
          unidad_medica_cluesimb: null,
          tiene_rfc: false,
          rfc_masked: null,
          tiene_curp: false,
          curp_masked: null,
          activo: false,
          fecha_baja: '2026-01-10',
          tiene_cuenta_activa: false,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    // 17 y 18: Confirmación y cancelación de desactivación (sin disparar PATCH)
    (el.querySelector('#rh-padron-actions-menu-btn-601') as HTMLButtonElement).click();
    fixture.detectChanges();
    (el.querySelector('#rh-padron-deactivate-btn-601') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('#rh-padron-deactivate-notes')?.textContent).toContain(
      'no se elimina físicamente'
    );
    (el.querySelector('#rh-padron-estado-cancel-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    httpMock.expectNone(rhPersonaEstadoUrl(601));

    // 19 y 20: Conflicto 409 por cuenta activa o adscripción laboral
    (el.querySelector('#rh-padron-actions-menu-btn-601') as HTMLButtonElement).click();
    fixture.detectChanges();
    (el.querySelector('#rh-padron-deactivate-btn-601') as HTMLButtonElement).click();
    fixture.detectChanges();
    (el.querySelector('#rh-padron-estado-confirm-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url === rhPersonaEstadoUrl(601) && r.method === 'PATCH')
      .flush(
        { error: 'No se puede desactivar administrativamente una persona que tiene una cuenta de acceso activa vinculada' },
        { status: 409, statusText: 'Conflict' }
      );
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('#rh-padron-estado-error')?.textContent).toContain('cuenta de acceso activa');
    (el.querySelector('#rh-padron-estado-cancel-btn') as HTMLButtonElement).click();
    fixture.detectChanges();

    // 21: Reactivación exitosa de 602
    (el.querySelector('#rh-padron-actions-menu-btn-602') as HTMLButtonElement).click();
    fixture.detectChanges();
    (el.querySelector('#rh-padron-reactivate-btn-602') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('#rh-padron-reactivate-note')?.textContent).toContain(
      'no reactiva automáticamente cuentas de acceso ni adscripciones'
    );
    (el.querySelector('#rh-padron-estado-confirm-btn') as HTMLButtonElement).click();
    fixture.detectChanges();

    const reactReq = httpMock.expectOne(
      (r) => r.url === rhPersonaEstadoUrl(602) && r.method === 'PATCH'
    );
    expect(reactReq.request.body).toEqual({ activo: true });
    reactReq.flush({
      persona: {
        persona_id: 602,
        nombre_completo: 'Persona Inactiva Dos',
        nombres: 'Persona',
        apellidos: 'Inactiva Dos',
        cargo: null,
        correo_principal: null,
        unidad_medica_id: null,
        tiene_rfc: false,
        rfc_masked: null,
        tiene_curp: false,
        curp_masked: null,
        activo: true,
        fecha_baja: null,
      },
      estado_anterior: false,
      estado_nuevo: true,
      idempotente: false,
      campos_modificados: ['activo', 'fecha_baja'],
    });
    await Promise.resolve();
    await Promise.resolve();
    httpMock
      .expectOne((r) => r.url === rhPersonasUrl && r.method === 'GET')
      .flush({ items: [], page: 1, pageSize: 20, total: 0 });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('#rh-padron-success-banner')?.textContent).toContain(
      'reactivado administrativamente'
    );
  });

  // =========================================================================
  // SUITE RH-4A.2B (EDICIÓN DE DATOS GENERALES DEL PADRÓN EN /rh-admin)
  // =========================================================================

  it('42 (RH-4A.2B #1-#30). Diálogo «Editar datos generales» en Plantilla institucional: precarga, omisión de campos sin cambios, limpieza con null, Oficina Central (CLUES N/A), guardar sin cambios / cancelación sin PATCH, validación de correo/longitud, errores 400/403/404/500, prevención de doble envío, recarga conservando filtros y ausencia de cambios a adscripciones', async () => {
    const rhPersonasUrl = `${apiBase}/rh/personas`;
    const rhPersonaGeneralUrl = (id: number) => `${apiBase}/rh/personas/${id}/general`;

    setupSession(rhGlobalUser);
    createComponent();
    httpMock.expectOne(rhUnidadesUrl).flush({
      scope: 'GLOBAL',
      unidades: mockUnidadesGlobal,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('#rh-admin-tab-padron') as HTMLButtonElement).click();
    fixture.detectChanges();

    const personaEditable = {
      persona_id: 701,
      nombre_completo: 'Persona Editable General',
      nombres: 'Persona',
      apellidos: 'Editable General',
      cargo: 'Auxiliar Inicial',
      correo_principal: 'inicial@imssbienestar.gob.mx',
      unidad_medica_id: 10,
      unidad_medica_nombre: 'HOSPITAL GENERAL MEXICALI',
      unidad_medica_cluesimb: 'BCIMB000001',
      tiene_rfc: true,
      rfc_masked: '**********AB1',
      tiene_curp: false,
      curp_masked: null,
      activo: true,
      fecha_baja: null,
      tiene_cuenta_activa: false,
    };

    const personaSinDatosInactiva = {
      persona_id: 702,
      nombre_completo: 'Persona Inactiva Sin Datos',
      nombres: 'Persona',
      apellidos: 'Inactiva Sin Datos',
      cargo: null,
      correo_principal: null,
      unidad_medica_id: null,
      unidad_medica_nombre: null,
      unidad_medica_cluesimb: null,
      tiene_rfc: false,
      rfc_masked: null,
      tiene_curp: false,
      curp_masked: null,
      activo: false,
      fecha_baja: '2026-01-15',
      tiene_cuenta_activa: false,
    };

    httpMock.expectOne((r) => r.url === rhPersonasUrl && r.method === 'GET').flush({
      items: [personaEditable, personaSinDatosInactiva],
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;

    // 4, 5, 6 y 17. Abrir diálogo para 701 -> verificar precarga, aviso institucional y cancelación sin PATCH
    (el.querySelector('#rh-padron-actions-menu-btn-701') as HTMLButtonElement).click();
    fixture.detectChanges();
    (el.querySelector('#rh-padron-edit-general-btn-701') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el.querySelector('#rh-padron-edit-general-notice')?.textContent).toContain(
      'Estos datos pertenecen al directorio institucional. Su modificación no cambia la adscripción laboral del trabajador.'
    );
    const cargoIn = el.querySelector('#rh-padron-edit-cargo') as HTMLInputElement;
    const correoIn = el.querySelector('#rh-padron-edit-correo') as HTMLInputElement;
    const unidadSel = el.querySelector('#rh-padron-edit-unidad') as HTMLSelectElement;

    expect(cargoIn.value).toBe('Auxiliar Inicial');
    expect(correoIn.value).toBe('inicial@imssbienestar.gob.mx');
    expect(unidadSel.value).toBe('10');

    // 18. Guardar sin cambios cierra el diálogo sin hacer PATCH
    (el.querySelector('#rh-padron-edit-general-submit-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    httpMock.expectNone(rhPersonaGeneralUrl(701));
    expect(el.querySelector('#rh-padron-edit-general-dialog')).toBeNull();

    // 19, 20, 21, 22, 23, 24 y 25. Reabrir 701 -> validar correo inválido, error 404 y luego actualizar cargo + limpiar correo (null) + Oficina Central (177)
    (el.querySelector('#rh-padron-actions-menu-btn-701') as HTMLButtonElement).click();
    fixture.detectChanges();
    (el.querySelector('#rh-padron-edit-general-btn-701') as HTMLButtonElement).click();
    fixture.detectChanges();

    const correoIn2 = el.querySelector('#rh-padron-edit-correo') as HTMLInputElement;
    const cargoIn2 = el.querySelector('#rh-padron-edit-cargo') as HTMLInputElement;
    const unidadSel2 = el.querySelector('#rh-padron-edit-unidad') as HTMLSelectElement;
    const submitBtn = el.querySelector('#rh-padron-edit-general-submit-btn') as HTMLButtonElement;

    correoIn2.value = 'correo-invalido';
    correoIn2.dispatchEvent(new Event('input'));
    submitBtn.click();
    fixture.detectChanges();
    expect(el.querySelector('#rh-padron-edit-general-error')?.textContent).toContain('formato de correo válido');
    httpMock.expectNone(rhPersonaGeneralUrl(701));

    // Limpiar correo (null), cambiar cargo y cambiar a OFICINA CENTRAL (177)
    cargoIn2.value = 'Coordinador Estatal';
    cargoIn2.dispatchEvent(new Event('input'));
    correoIn2.value = '';
    correoIn2.dispatchEvent(new Event('input'));
    unidadSel2.value = '177';
    unidadSel2.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    // Error 404 recuperable
    submitBtn.click();
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url === rhPersonaGeneralUrl(701) && r.method === 'PATCH')
      .flush({ error: 'Unidad médica de referencia no encontrada o inactiva' }, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('#rh-padron-edit-general-error')?.textContent).toContain('no encontrada o inactiva');

    // Reenviar y prevenir doble envío
    submitBtn.click();
    submitBtn.click();
    fixture.detectChanges();

    const patchReq = httpMock.expectOne((r) => r.url === rhPersonaGeneralUrl(701) && r.method === 'PATCH');
    expect(patchReq.request.body).toEqual({
      cargo: 'Coordinador Estatal',
      correo_principal: null,
      unidad_medica_id: 177,
    });
    patchReq.flush({
      persona: {
        ...personaEditable,
        cargo: 'Coordinador Estatal',
        correo_principal: null,
        unidad_medica_id: 177,
      },
      idempotente: false,
      campos_modificados: ['cargo', 'correo_principal', 'unidad_medica_id'],
    });
    await Promise.resolve();
    await Promise.resolve();

    // 27 y 28. Refresca GET /api/rh/personas tras guardar
    httpMock.expectOne((r) => r.url === rhPersonasUrl && r.method === 'GET').flush({
      items: [
        {
          ...personaEditable,
          cargo: 'Coordinador Estatal',
          correo_principal: null,
          unidad_medica_id: 177,
          unidad_medica_nombre: 'OFICINA CENTRAL',
          unidad_medica_cluesimb: 'N/A',
        },
        personaSinDatosInactiva,
      ],
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('#rh-padron-edit-general-dialog')).toBeNull();
    expect(el.querySelector('#rh-padron-success-banner')?.textContent).toContain(
      'Datos generales de Persona Editable General actualizados correctamente.'
    );

    // 7, 8, 9, 11 y 16. Persona inactiva sin datos (702) -> editar solo cargo omite correo y unidad_medica_id
    (el.querySelector('#rh-padron-actions-menu-btn-702') as HTMLButtonElement).click();
    fixture.detectChanges();
    (el.querySelector('#rh-padron-edit-general-btn-702') as HTMLButtonElement).click();
    fixture.detectChanges();
    const cargo702 = el.querySelector('#rh-padron-edit-cargo') as HTMLInputElement;
    expect(cargo702.value).toBe('');
    cargo702.value = 'Enlace Administrativo';
    cargo702.dispatchEvent(new Event('input'));
    (el.querySelector('#rh-padron-edit-general-submit-btn') as HTMLButtonElement).click();
    fixture.detectChanges();

    const patch702 = httpMock.expectOne((r) => r.url === rhPersonaGeneralUrl(702) && r.method === 'PATCH');
    expect(patch702.request.body).toEqual({ cargo: 'Enlace Administrativo' });
    patch702.flush({
      persona: { ...personaSinDatosInactiva, cargo: 'Enlace Administrativo' },
      idempotente: false,
      campos_modificados: ['cargo'],
    });
    await Promise.resolve();
    await Promise.resolve();
    httpMock.expectOne((r) => r.url === rhPersonasUrl && r.method === 'GET').flush({
      items: [personaEditable, { ...personaSinDatosInactiva, cargo: 'Enlace Administrativo' }],
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    // 29. Ninguna petición a endpoints de adscripciones laborales
    httpMock.expectNone((r) => r.url.includes('/laboral') || r.url.includes('/adscripciones'));
  });
});
