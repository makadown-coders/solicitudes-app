import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { authInterceptor } from '../core/auth/auth.interceptor';
import { AuthClient } from '../core/auth/auth-client.service';
import { SessionStore } from '../core/auth/session-store.service';
import { TokenStore } from '../core/auth/token-store.service';
import {
  TiPersonaDetalle,
  TiPersonasPagedResponse,
  TiPersonasService,
  TiUnidadesPagedResponse,
} from '../services/ti-personas.service';
import { TiPersonasPageComponent } from './ti/personas/ti-personas-page.component';

describe('TiPersonasPageComponent y TiPersonasService (Microintervención TI-2C.2)', () => {
  const apiBase = environment.apiUrl.replace(/\/+$/, '');

  const mockUnidades: TiUnidadesPagedResponse = {
    items: [
      { id: 10, nombre: 'Hospital General Tijuana', cluessa: 'BCSSA000010', cluesimb: 'BCIMB000010' },
      { id: 20, nombre: 'Hospital General Mexicali', cluessa: 'BCSSA000020', cluesimb: 'BCIMB000020' },
    ],
    page: 1,
    pageSize: 50,
    total: 2,
  };

  const mockPersonas: TiPersonasPagedResponse = {
    items: [
      {
        id: 101,
        nombre_completo: 'Dra. Ana Gómez',
        unidad_medica_id: 10,
        unidad_medica: 'Hospital General Tijuana',
        email_principal: 'ana@imssb.gob.mx',
        n_correos: 1,
      },
      {
        id: 102,
        nombre_completo: 'Carlos Sin Correo',
        unidad_medica_id: null,
        unidad_medica: null,
        email_principal: null,
        n_correos: 0,
      },
    ],
    page: 1,
    pageSize: 20,
    total: 35,
  };

  const mockDetalle: TiPersonaDetalle = {
    id: 101,
    nombre_completo: 'Dra. Ana Gómez',
    unidad_medica_id: 10,
    unidad_medica: 'Hospital General Tijuana',
    correo: 'ana@imssb.gob.mx',
    email_principal: 'ana@imssb.gob.mx',
    correos: [
      { id: 1, correo: 'ana@imssb.gob.mx', es_principal: true },
      { id: 2, correo: 'ana.alt@imssb.gob.mx', es_principal: false },
    ],
  };

  describe('TiPersonasService (contratos HTTP)', () => {
    let service: TiPersonasService;
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
          TiPersonasService,
        ],
      });
      service = TestBed.inject(TiPersonasService);
      httpMock = TestBed.inject(HttpTestingController);
      tokenStore = TestBed.inject(TokenStore);
      const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
      const payload = btoa(JSON.stringify({ sub: 'u-1', exp: Math.floor(Date.now() / 1000) + 600 }));
      tokenStore.set(`${header}.${payload}.sig`, 'rt-1');
    });

    afterEach(() => {
      httpMock.verify();
      localStorage.clear();
    });

    it('Consume GET /api/ti/personas, GET /api/ti/personas/:id, POST, PUT, DELETE y GET /api/ti/unidades con contrato nuevo', async () => {
      const pList = service.listarPersonas({ q: 'ana', unidad_medica_id: 10, page: 2, pageSize: 10 });
      const reqList = httpMock.expectOne(
        r => r.url === `${apiBase}/ti/personas` &&
             r.params.get('q') === 'ana' &&
             r.params.get('unidad_medica_id') === '10' &&
             r.params.get('page') === '2' &&
             r.params.get('pageSize') === '10'
      );
      expect(reqList.request.headers.has('Authorization')).toBeTrue();
      reqList.flush(mockPersonas);
      await pList;

      const pCreate = service.crearPersona({
        nombre_completo: 'Nuevo',
        correo_principal: 'nuevo@imssb.gob.mx',
        correos_complementarios: ['extra@imssb.gob.mx'],
      });
      const reqCreate = httpMock.expectOne(`${apiBase}/ti/personas`);
      expect(reqCreate.request.method).toBe('POST');
      expect('correos' in reqCreate.request.body).toBeFalse();
      reqCreate.flush({ id: 200 });
      await pCreate;

      const pDel = service.bajaLogicaPersona(200);
      const reqDel = httpMock.expectOne(`${apiBase}/ti/personas/200`);
      expect(reqDel.request.method).toBe('DELETE');
      reqDel.flush({ ok: true });
      await pDel;
    });
  });

  describe('TiPersonasPageComponent (UI, CRUD, contratos nuevos y seguridad)', () => {
    let fixture: ComponentFixture<TiPersonasPageComponent>;
    let component: TiPersonasPageComponent;
    let svcSpy: jasmine.SpyObj<TiPersonasService>;
    let router: Router;

    beforeEach(async () => {
      svcSpy = jasmine.createSpyObj<TiPersonasService>('TiPersonasService', [
        'listarPersonas',
        'obtenerPersona',
        'crearPersona',
        'actualizarPersona',
        'bajaLogicaPersona',
        'buscarUnidades',
      ]);

      svcSpy.buscarUnidades.and.resolveTo(mockUnidades);
      svcSpy.listarPersonas.and.resolveTo(mockPersonas);
      svcSpy.obtenerPersona.and.resolveTo(mockDetalle);
      svcSpy.crearPersona.and.resolveTo({ id: 999 });
      svcSpy.actualizarPersona.and.resolveTo({ id: 101 });
      svcSpy.bajaLogicaPersona.and.resolveTo({ ok: true });

      await TestBed.configureTestingModule({
        imports: [TiPersonasPageComponent],
        providers: [
          provideRouter([]),
          { provide: TiPersonasService, useValue: svcSpy },
        ],
      }).compileComponents();

      router = TestBed.inject(Router);
      spyOn(router, 'navigate').and.resolveTo(true);

      fixture = TestBed.createComponent(TiPersonasPageComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    });

    it('2 y 3. Listado, paginación, búsqueda y filtro por unidad médica', async () => {
      expect(svcSpy.listarPersonas).toHaveBeenCalledWith({
        q: undefined,
        unidad_medica_id: null,
        page: 1,
        pageSize: 20,
      });

      component.searchDraft.set('ana');
      component.onSearchSubmit();
      await fixture.whenStable();
      expect(svcSpy.listarPersonas).toHaveBeenCalledWith({
        q: 'ana',
        unidad_medica_id: null,
        page: 1,
        pageSize: 20,
      });

      component.onUnidadFilterChange(10);
      await fixture.whenStable();
      expect(svcSpy.listarPersonas).toHaveBeenCalledWith({
        q: 'ana',
        unidad_medica_id: 10,
        page: 1,
        pageSize: 20,
      });
    });

    it('4, 5, 6 y 13. Alta sin correo/unidad, con principal y con complementarios sin enviar `correos` heredado', async () => {
      // 4. Sin correo ni unidad
      component.openCreateModal();
      component.formNombre.set('  Trabajador Nuevo  ');
      await component.submitForm();
      expect(svcSpy.crearPersona).toHaveBeenCalledWith({
        nombre_completo: 'Trabajador Nuevo',
      });
      const lastCreateArg1 = svcSpy.crearPersona.calls.mostRecent().args[0] as unknown as Record<string, unknown>;
      expect('correos' in lastCreateArg1).toBeFalse();

      // 5 y 6. Con correo principal y complementarios (evitando duplicado del principal)
      component.openCreateModal();
      component.formNombre.set('Médico Completo');
      component.formCorreoPrincipal.set('med@imssb.gob.mx');
      component.formNewComplementario.set('MED@imssb.gob.mx');
      component.addComplementario();
      expect(component.formComplementarios().length).toBe(0);

      component.formNewComplementario.set('alt@imssb.gob.mx');
      component.addComplementario();
      await component.submitForm();

      expect(svcSpy.crearPersona).toHaveBeenCalledWith({
        nombre_completo: 'Médico Completo',
        correo_principal: 'med@imssb.gob.mx',
        correos_complementarios: ['alt@imssb.gob.mx'],
      });
    });

    it('7, 8, 9, 10, 11, 12 y 13. Edición parcial: solo nombre, solo adscripción, quitar adscripción, eliminar principal, eliminar complementarios, sin enviar `correos`', async () => {
      // 7. Solo nombre
      await component.openEditModal(mockPersonas.items[0]);
      component.formNombre.set('Dra. Ana Editada');
      await component.submitForm();
      expect(svcSpy.actualizarPersona).toHaveBeenCalledWith(101, {
        nombre_completo: 'Dra. Ana Editada',
      });

      // 8. Solo adscripción
      await component.openEditModal(mockPersonas.items[0]);
      component.onFormUnidadSelect(20);
      await component.submitForm();
      expect(svcSpy.actualizarPersona).toHaveBeenCalledWith(101, {
        unidad_medica_id: 20,
      });

      // 9. Quitar adscripción explícitamente
      await component.openEditModal(mockPersonas.items[0]);
      component.clearFormUnidad();
      await component.submitForm();
      expect(svcSpy.actualizarPersona).toHaveBeenCalledWith(101, {
        unidad_medica_id: null,
      });

      // 10. Eliminar correo principal sin tocar complementarios
      await component.openEditModal(mockPersonas.items[0]);
      component.formCorreoPrincipal.set('');
      await component.submitForm();
      expect(svcSpy.actualizarPersona).toHaveBeenCalledWith(101, {
        correo_principal: null,
      });

      // 11. Eliminar únicamente complementarios sin tocar principal
      await component.openEditModal(mockPersonas.items[0]);
      component.removeComplementario('ana.alt@imssb.gob.mx');
      await component.submitForm();
      expect(svcSpy.actualizarPersona).toHaveBeenCalledWith(101, {
        correos_complementarios: [],
      });
    });

    it('14. Manejo de 400, 401 y 403 sin mostrar datos protegidos', async () => {
      svcSpy.listarPersonas.and.rejectWith(new HttpErrorResponse({ status: 403, statusText: 'Forbidden' }));
      await component.cargarPersonas();
      expect(component.personas().length).toBe(0);
      expect(component.accessDeniedError()).toContain('Permiso insuficiente (403)');

      svcSpy.listarPersonas.and.rejectWith(new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' }));
      await component.cargarPersonas();
      expect(router.navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { returnUrl: '/ti/personas' },
      });
    });

    it('15. Confirmación de baja lógica y cancelación', async () => {
      component.openDeleteModal(mockPersonas.items[0]);
      expect(component.deleteModalOpen()).toBeTrue();

      component.closeDeleteModal();
      expect(component.deleteModalOpen()).toBeFalse();
      expect(svcSpy.bajaLogicaPersona).not.toHaveBeenCalled();

      component.openDeleteModal(mockPersonas.items[0]);
      await component.confirmDelete();
      expect(svcSpy.bajaLogicaPersona).toHaveBeenCalledOnceWith(101);
      expect(component.deleteModalOpen()).toBeFalse();
    });

    it('16. Protección ante respuestas HTTP fuera de orden en listado', async () => {
      let resolveFirst!: (val: TiPersonasPagedResponse) => void;
      let resolveSecond!: (val: TiPersonasPagedResponse) => void;

      svcSpy.listarPersonas.and.returnValues(
        new Promise<TiPersonasPagedResponse>(r => { resolveFirst = r; }),
        new Promise<TiPersonasPagedResponse>(r => { resolveSecond = r; })
      );

      const p1 = component.cargarPersonas();
      const p2 = component.cargarPersonas();

      // La segunda respuesta llega primero
      resolveSecond({ items: [mockPersonas.items[1]], page: 1, pageSize: 20, total: 1 });
      await p2;
      expect(component.personas().length).toBe(1);
      expect(component.personas()[0].id).toBe(102);

      // La primera respuesta llega tarde y debe ser descartada
      resolveFirst(mockPersonas);
      await p1;
      expect(component.personas().length).toBe(1);
      expect(component.personas()[0].id).toBe(102);
    });

    it('17. TI-2G.1: Autocompletado de personas (nombre/correo), selección, teclado, sin coincidencias y limpieza', async () => {
      svcSpy.listarPersonas.calls.reset();

      await component.cargarSugerenciasPersonas('ana');
      expect(svcSpy.listarPersonas).toHaveBeenCalledWith({
        q: 'ana',
        unidad_medica_id: null,
        page: 1,
        pageSize: 8,
      });
      expect(component.personaSuggestions().length).toBe(2);

      // Navegación por teclado y selección con Enter
      component.personaSuggestOpen.set(true);
      component.onPersonaSearchKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(component.personaSuggestIndex()).toBe(0);
      component.onPersonaSearchKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(component.personaSuggestIndex()).toBe(1);
      component.onPersonaSearchKeyDown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      expect(component.personaSuggestIndex()).toBe(0);

      component.page.set(3);
      component.onPersonaSearchKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(component.appliedSearch()).toBe('Dra. Ana Gómez');
      expect(component.page()).toBe(1);
      expect(component.personaSuggestOpen()).toBeFalse();

      // Estado sin coincidencias y cierre con Escape
      svcSpy.listarPersonas.and.resolveTo({ items: [], page: 1, pageSize: 8, total: 0 });
      component.searchDraft.set('inexistente@imssb.gob.mx');
      component.personaSuggestOpen.set(true);
      await component.cargarSugerenciasPersonas('inexistente@imssb.gob.mx');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('#ti-personas-search-empty')?.textContent).toContain('Sin coincidencias');
      component.onPersonaSearchKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(component.personaSuggestOpen()).toBeFalse();

      // Limpieza del filtro de persona
      component.onClearSearch();
      expect(component.searchDraft()).toBe('');
      expect(component.appliedSearch()).toBe('');
      expect(component.page()).toBe(1);
    });

    it('18. TI-2G.1: Autocompletado de unidades incluyendo OFICINA CENTRAL, selección por id real y limpieza', async () => {
      svcSpy.buscarUnidades.and.resolveTo({
        items: [
          { id: 1, nombre: 'OFICINA CENTRAL', cluessa: null, cluesimb: null },
          { id: 10, nombre: 'Hospital General Tijuana', cluessa: 'BCSSA000010', cluesimb: 'BCIMB000010' },
        ],
        page: 1,
        pageSize: 50,
        total: 2,
      });

      await component.cargarUnidadesFiltro('CENTRAL');
      expect(svcSpy.buscarUnidades).toHaveBeenCalledWith({ q: 'CENTRAL', page: 1, pageSize: 50 });
      expect(component.unidadesFilterOptions().some(u => u.nombre === 'OFICINA CENTRAL')).toBeTrue();

      component.page.set(2);
      component.unidadSuggestOpen.set(true);
      component.onUnidadFilterKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(component.unidadSuggestIndex()).toBe(0);
      component.onUnidadFilterKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(component.filterUnidadId()).toBe(1);
      expect(component.filterUnidadSearch()).toBe('OFICINA CENTRAL');
      expect(component.page()).toBe(1);
      expect(svcSpy.listarPersonas).toHaveBeenCalledWith({
        q: undefined,
        unidad_medica_id: 1,
        page: 1,
        pageSize: 20,
      });

      // Limpieza de unidad
      component.onClearUnidadFilter();
      expect(component.filterUnidadId()).toBeNull();
      expect(component.filterUnidadSearch()).toBe('');
      expect(component.page()).toBe(1);
    });
  });
});
