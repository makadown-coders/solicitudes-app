import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Location } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { environment } from '../../environments/environment';
import { routes } from '../app.routes';
import { AuthClient } from '../core/auth/auth-client.service';
import { authGuard } from '../core/auth/auth.guard';
import { authInterceptor } from '../core/auth/auth.interceptor';
import { UserProfile } from '../core/auth/auth.models';
import { SessionStore } from '../core/auth/session-store.service';
import { hasTiAdminGlobalRole, tiAdminGlobalGuard } from '../core/auth/ti-admin-global.guard';
import { TokenStore } from '../core/auth/token-store.service';
import { resolveSafeAdminReturnUrl } from './auth/login/login-page.component';
import { TiRoleCatalogItem, TiUsuariosPagedResponse, TiUsuariosService } from '../services/ti-usuarios.service';
import { TiShellComponent } from './ti/ti-shell.component';
import { TiUsuariosPageComponent } from './ti/usuarios/ti-usuarios-page.component';

function buildJwtWithExp(expSeconds: number, sub = 'u-ti-1'): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub, exp: expSeconds }));
  return `${header}.${payload}.sig`;
}

describe('Módulo Administración TI (Microintervención TI-2B)', () => {
  const apiBase = environment.apiUrl.replace(/\/+$/, '');

  const adminTiGlobalUser: UserProfile = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'admin.ti@imssbienestar.gob.mx',
    name: 'Carlos Admin TIC',
    roles: [{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }],
  };

  const rhUser: UserProfile = {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'rh@imssbienestar.gob.mx',
    name: 'Coordinación RH',
    roles: [{ code: 'RECURSOS_HUMANOS', scope: 'GLOBAL', id: null }],
  };

  const nonGlobalAdminTicClues: UserProfile = {
    id: '33333333-3333-3333-3333-333333333333',
    email: 'tic.clues@imssbienestar.gob.mx',
    name: 'TIC Unidad',
    roles: [{ code: 'ADMIN_TIC', scope: 'CLUES', id: 'BCIMB000010' }],
  };

  const nonGlobalAdminTicDepto: UserProfile = {
    id: '44444444-4444-4444-4444-444444444444',
    email: 'tic.depto@imssbienestar.gob.mx',
    name: 'TIC Depto',
    roles: [{ code: 'ADMIN_TIC', scope: 'DEPTO', id: 'SISTEMAS' }],
  };

  const nonGlobalAdminTicInvalidId: UserProfile = {
    id: '55555555-5555-5555-5555-555555555555',
    email: 'tic.wildcard@imssbienestar.gob.mx',
    name: 'TIC Wildcard',
    roles: [{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: '*' }],
  };

  const mockRolesCatalog: TiRoleCatalogItem[] = [
    { id: 'r-1', code: 'ADMIN_TIC', description: 'Administrador Global TIC' },
    { id: 'r-2', code: 'CONSULTA_TIC', description: 'Consulta TIC' },
    { id: 'r-3', code: 'OPER_TIC', description: null },
    { id: 'r-4', code: 'RECURSOS_HUMANOS', description: 'Gestión de Personal RH' },
  ];

  const mockUsuariosResponse: TiUsuariosPagedResponse = {
    items: [
      {
        id: 'u-1',
        email: 'admin.ti@imssbienestar.gob.mx',
        name: 'Carlos Admin TIC',
        status: 'ACTIVE',
        persona_id: 101,
        nombre_completo: 'Carlos Administrador TIC',
        unidad_medica_id: 10,
        unidad_medica: 'Hospital General Tijuana',
        roles: [{ code: 'ADMIN_TIC', scope_type: 'GLOBAL', scope_id: '*' }],
      },
      {
        id: 'u-2',
        email: 'multi.rol@imssbienestar.gob.mx',
        name: 'María Multi Rol',
        status: 'ACTIVE',
        persona_id: 102,
        nombre_completo: 'María López Multi Rol',
        unidad_medica_id: null,
        unidad_medica: null,
        roles: [
          { code: 'CONSULTA_TIC', scope_type: 'CLUES', scope_id: 'BCIMB000010' },
          { code: 'OPER_TIC', scope_type: 'CLUES', scope_id: 'BCIMB000020' },
          { code: 'RECURSOS_HUMANOS', scope_type: 'GLOBAL', scope_id: '*' },
        ],
      },
      {
        id: 'u-3',
        email: 'sin.persona@imssbienestar.gob.mx',
        name: 'Cuenta Sin Persona',
        status: 'SUSPENDED',
        persona_id: null,
        nombre_completo: null,
        unidad_medica_id: null,
        unidad_medica: null,
        roles: [],
      },
    ],
    page: 1,
    pageSize: 20,
    total: 45,
  };

  // =========================================================================
  // 1, 2, 3, 4 y 5. SEGURIDAD DE NAVEGACIÓN, GUARD Y REDIRECCIÓN
  // =========================================================================
  describe('Guards, rutas /ti y preservación de /rh', () => {
    let router: Router;
    let location: Location;
    let tokenStore: TokenStore;
    let sessionStore: SessionStore;
    let httpMock: HttpTestingController;

    beforeEach(() => {
      localStorage.clear();
      TestBed.configureTestingModule({
        providers: [
          provideRouter(routes),
          provideHttpClient(withInterceptors([authInterceptor])),
          provideHttpClientTesting(),
          TokenStore,
          SessionStore,
          AuthClient,
        ],
      });

      router = TestBed.inject(Router);
      location = TestBed.inject(Location);
      tokenStore = TestBed.inject(TokenStore);
      sessionStore = TestBed.inject(SessionStore);
      httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
      httpMock.verify();
      localStorage.clear();
    });

    function runTiGuard(url = '/ti/usuarios'): boolean | UrlTree {
      const dummyRoute = {} as ActivatedRouteSnapshot;
      const dummyState = { url } as RouterStateSnapshot;
      return TestBed.runInInjectionContext(() =>
        tiAdminGlobalGuard(dummyRoute, dummyState) as boolean | UrlTree
      );
    }

    it('1. Acceso permitido a /ti con ADMIN_TIC GLOBAL ({ code: "ADMIN_TIC", scope: "GLOBAL", id: null })', async () => {
      expect(hasTiAdminGlobalRole(adminTiGlobalUser)).toBeTrue();

      const validAt = buildJwtWithExp(Math.floor(Date.now() / 1000) + 600);
      tokenStore.set(validAt, 'valid-rt');
      sessionStore.setUser(adminTiGlobalUser);

      const guardResult = runTiGuard('/ti/usuarios');
      expect(guardResult).toBeTrue();

      const tiRoute = routes.find(r => r.path === 'ti');
      expect(tiRoute).toBeDefined();
      expect(tiRoute?.canActivate).toEqual([authGuard, tiAdminGlobalGuard]);
      const loadedShell = await tiRoute!.loadComponent!();
      expect(loadedShell).toBe(TiShellComponent);
    });

    it('2. Acceso rechazado a /ti con usuario RH (RECURSOS_HUMANOS), redirigiendo a /home sin romper su sesión', async () => {
      expect(hasTiAdminGlobalRole(rhUser)).toBeFalse();

      const validAt = buildJwtWithExp(Math.floor(Date.now() / 1000) + 600);
      tokenStore.set(validAt, 'valid-rt');
      sessionStore.setUser(rhUser);

      await router.navigateByUrl('/ti');
      expect(location.path()).toBe('/home');
      // Su sesión sigue intacta para navegar a /rh
      expect(sessionStore.currentUser).toEqual(rhUser);
    });

    it('3. Acceso rechazado a /ti con ADMIN_TIC no global (CLUES, DEPTO o id != null)', async () => {
      const invalidUsers = [
        nonGlobalAdminTicClues,
        nonGlobalAdminTicDepto,
        nonGlobalAdminTicInvalidId,
      ];

      for (const user of invalidUsers) {
        expect(hasTiAdminGlobalRole(user)).toBeFalse();

        const validAt = buildJwtWithExp(Math.floor(Date.now() / 1000) + 600);
        tokenStore.set(validAt, 'valid-rt');
        sessionStore.setUser(user);

        const guardResult = runTiGuard('/ti/usuarios');
        expect(guardResult instanceof UrlTree).toBeTrue();
        expect(router.serializeUrl(guardResult as UrlTree)).toBe('/home');
      }
    });

    it('4. Redirección segura hacia /ti y /ti/* tras login y bloqueo de returnUrl externos', async () => {
      // Sin sesión, navegar a /ti resuelve su ruta hija por defecto (/ti/usuarios) y redirige a /login?returnUrl=%2Fti%2Fusuarios
      await router.navigateByUrl('/ti');
      expect(location.path()).toBe('/login?returnUrl=%2Fti%2Fusuarios');

      // resolveSafeAdminReturnUrl permite /ti y /ti/*
      expect(resolveSafeAdminReturnUrl('/ti')).toBe('/ti');
      expect(resolveSafeAdminReturnUrl('/ti/usuarios')).toBe('/ti/usuarios');
      expect(resolveSafeAdminReturnUrl('/ti/usuarios?q=carlos&page=2')).toBe('/ti/usuarios?q=carlos&page=2');
      expect(resolveSafeAdminReturnUrl('/ti/personas')).toBe('/ti/personas');

      // Rechaza falsos prefijos como /ti-otro o URLs externas
      expect(resolveSafeAdminReturnUrl('/ti-otro')).toBe('/rh');
      expect(resolveSafeAdminReturnUrl('https://evil.com/ti')).toBe('/rh');
      expect(resolveSafeAdminReturnUrl('//evil.com/ti')).toBe('/rh');
      expect(resolveSafeAdminReturnUrl('/\\evil.com/ti')).toBe('/rh');
    });

    it('5. Preservación intacta de /rh para usuarios autenticados (incluyendo usuarios RH)', async () => {
      const validAt = buildJwtWithExp(Math.floor(Date.now() / 1000) + 600);
      tokenStore.set(validAt, 'valid-rt');
      sessionStore.setUser(rhUser);

      const navRh = await router.navigateByUrl('/rh');
      expect(navRh).toBeTrue();
      expect(location.path()).toBe('/rh');
      expect(resolveSafeAdminReturnUrl('/rh')).toBe('/rh');
      expect(resolveSafeAdminReturnUrl('/rh/plantilla')).toBe('/rh/plantilla');
    });
  });

  // =========================================================================
  // SERVICIO HTTP TI-USUARIOS
  // =========================================================================
  describe('TiUsuariosService (GET /api/ti/roles y GET /api/ti/usuarios)', () => {
    let service: TiUsuariosService;
    let httpMock: HttpTestingController;
    let tokenStore: TokenStore;

    beforeEach(() => {
      localStorage.clear();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(withInterceptors([authInterceptor])),
          provideHttpClientTesting(),
          TokenStore,
          SessionStore,
          AuthClient,
          TiUsuariosService,
        ],
      });

      service = TestBed.inject(TiUsuariosService);
      httpMock = TestBed.inject(HttpTestingController);
      tokenStore = TestBed.inject(TokenStore);
    });

    afterEach(() => {
      httpMock.verify();
      localStorage.clear();
    });

    it('Envía Authorization Bearer automáticamente mediante authInterceptor a /api/ti/roles y /api/ti/usuarios con parámetros de paginación y filtros', async () => {
      const validAt = buildJwtWithExp(Math.floor(Date.now() / 1000) + 600);
      tokenStore.set(validAt, 'rt-1');

      const rolesPromise = service.listarRoles();
      const usersPromise = service.listarUsuarios({
        q: '  carlos  ',
        status: 'ACTIVE',
        page: 2,
        pageSize: 50,
      });

      const reqRoles = httpMock.expectOne(`${apiBase}/ti/roles`);
      expect(reqRoles.request.method).toBe('GET');
      expect(reqRoles.request.headers.get('Authorization')).toBe(`Bearer ${validAt}`);
      reqRoles.flush(mockRolesCatalog);

      const reqUsers = httpMock.expectOne(
        r => r.url === `${apiBase}/ti/usuarios` &&
             r.params.get('q') === 'carlos' &&
             r.params.get('status') === 'ACTIVE' &&
             r.params.get('page') === '2' &&
             r.params.get('pageSize') === '50'
      );
      expect(reqUsers.request.method).toBe('GET');
      expect(reqUsers.request.headers.get('Authorization')).toBe(`Bearer ${validAt}`);
      reqUsers.flush({ ...mockUsuariosResponse, page: 2, pageSize: 50 });

      const [rolesRes, usersRes] = await Promise.all([rolesPromise, usersPromise]);
      expect(rolesRes.length).toBe(4);
      expect(usersRes.page).toBe(2);
      expect(usersRes.pageSize).toBe(50);
    });
  });

  // =========================================================================
  // 6, 7, 8 y 9. COMPONENTE DE CONSULTA DE USUARIOS Y CATÁLOGO DE ROLES
  // =========================================================================
  describe('TiUsuariosPageComponent (UI, paginación, filtros, roles y 401/403)', () => {
    let fixture: ComponentFixture<TiUsuariosPageComponent>;
    let component: TiUsuariosPageComponent;
    let tiServiceSpy: jasmine.SpyObj<TiUsuariosService>;
    let router: Router;

    beforeEach(async () => {
      tiServiceSpy = jasmine.createSpyObj<TiUsuariosService>('TiUsuariosService', [
        'listarRoles',
        'listarUsuarios',
      ]);
      tiServiceSpy.listarRoles.and.resolveTo(mockRolesCatalog);
      tiServiceSpy.listarUsuarios.and.resolveTo(mockUsuariosResponse);

      await TestBed.configureTestingModule({
        imports: [TiUsuariosPageComponent],
        providers: [
          provideRouter([]),
          { provide: TiUsuariosService, useValue: tiServiceSpy },
        ],
      }).compileComponents();

      router = TestBed.inject(Router);
      spyOn(router, 'navigate').and.resolveTo(true);

      fixture = TestBed.createComponent(TiUsuariosPageComponent);
      component = fixture.componentInstance;
    });

    it('7, 8 y 9. Renderiza catálogo de roles, usuarios con múltiples roles (scope_type/scope_id) y usuarios sin persona o sin unidad médica', async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(tiServiceSpy.listarRoles).toHaveBeenCalledTimes(1);
      expect(tiServiceSpy.listarUsuarios).toHaveBeenCalledWith({
        q: undefined,
        status: undefined,
        page: 1,
        pageSize: 20,
      });

      const nativeEl = fixture.nativeElement as HTMLElement;
      const text = nativeEl.textContent ?? '';

      // Catálogo de roles visible
      const roleCards = nativeEl.querySelectorAll('.ti-role-catalog-card');
      expect(roleCards.length).toBe(4);
      expect(text).toContain('Administrador Global TIC');
      expect(text).toContain('Gestión de Personal RH');

      // Filas de usuarios renderizadas
      const rows = nativeEl.querySelectorAll('.ti-usuario-row');
      expect(rows.length).toBe(3);

      // Usuario 1: con persona y unidad médica
      expect(text).toContain('Carlos Admin TIC');
      expect(text).toContain('Carlos Administrador TIC');
      expect(text).toContain('Hospital General Tijuana');
      expect(text).toContain('GLOBAL (*)');

      // Usuario 2: múltiples roles con distintos alcances (CLUES y GLOBAL), sin unidad médica
      expect(text).toContain('María Multi Rol');
      expect(text).toContain('CLUES: BCIMB000010');
      expect(text).toContain('CLUES: BCIMB000020');
      expect(text).toContain('Sin unidad médica asignada');

      // Usuario 3: sin persona vinculada y sin roles
      expect(text).toContain('Cuenta Sin Persona');
      expect(text).toContain('Sin persona vinculada');
      expect(text).toContain('Sin roles asignados');
    });

    it('7. Ejecuta búsqueda por nombre/correo, filtro por estado y cambio de página reiniciando a página 1 cuando cambian filtros', async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      // Avanzar a la página 2 (total es 45, pageSize 20 -> totalPages = 3)
      expect(component.totalPages()).toBe(3);
      expect(component.canGoNext()).toBeTrue();

      tiServiceSpy.listarUsuarios.and.resolveTo({
        ...mockUsuariosResponse,
        page: 2,
      });
      component.goToNextPage();
      await fixture.whenStable();

      expect(tiServiceSpy.listarUsuarios).toHaveBeenCalledWith({
        q: undefined,
        status: undefined,
        page: 2,
        pageSize: 20,
      });
      expect(component.page()).toBe(2);

      // Aplicar búsqueda por correo/nombre -> debe volver a page 1
      tiServiceSpy.listarUsuarios.and.resolveTo({
        items: [mockUsuariosResponse.items[0]],
        page: 1,
        pageSize: 20,
        total: 1,
      });
      component.searchDraft.set('  carlos@imssb  ');
      component.onSearchSubmit();
      await fixture.whenStable();

      expect(component.page()).toBe(1);
      expect(tiServiceSpy.listarUsuarios).toHaveBeenCalledWith({
        q: 'carlos@imssb',
        status: undefined,
        page: 1,
        pageSize: 20,
      });

      // Filtrar por estado SUSPENDED
      component.onStatusChange('SUSPENDED');
      await fixture.whenStable();

      expect(tiServiceSpy.listarUsuarios).toHaveBeenCalledWith({
        q: 'carlos@imssb',
        status: 'SUSPENDED',
        page: 1,
        pageSize: 20,
      });
    });

    it('6. Manejo seguro de respuestas 403 y 401 del backend: limpia datos protegidos y no muestra filas en pantalla', async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.usuarios().length).toBe(3);

      // Si el backend responde 403 en una consulta posterior
      tiServiceSpy.listarUsuarios.and.rejectWith(
        new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })
      );

      await component.cargarUsuarios();
      fixture.detectChanges();

      expect(component.usuarios().length).toBe(0);
      expect(component.rolesCatalog().length).toBe(0);
      expect(component.accessDeniedError()).toContain('Permiso insuficiente (403)');
      const deniedAlert = fixture.nativeElement.querySelector('#ti-usuarios-access-denied');
      expect(deniedAlert).not.toBeNull();
      expect(fixture.nativeElement.querySelectorAll('.ti-usuario-row').length).toBe(0);

      // Si el backend responde 401 Unauthorized -> limpia datos y redirige a /login
      tiServiceSpy.listarUsuarios.and.rejectWith(
        new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' })
      );

      await component.cargarUsuarios();
      fixture.detectChanges();

      expect(component.usuarios().length).toBe(0);
      expect(router.navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { returnUrl: '/ti/usuarios' },
      });
    });
  });
});
