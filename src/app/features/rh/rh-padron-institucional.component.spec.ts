import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RhPadronInstitucionalComponent } from './rh-padron-institucional.component';

describe('RhPadronInstitucionalComponent — alta con fecha_ingreso (RH-4A.7D)', () => {
  let fixture: ComponentFixture<RhPadronInstitucionalComponent>;
  let component: RhPadronInstitucionalComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RhPadronInstitucionalComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(RhPadronInstitucionalComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    // Carga inicial del padrón
    const initReq = httpMock.expectOne((r) => r.url.endsWith('/api/rh/personas') && r.method === 'GET');
    initReq.flush({ items: [], page: 1, pageSize: 20, total: 0 });
    await new Promise((r) => setTimeout(r, 0));
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('muestra el control Fecha de ingreso institucional y envía fecha_ingreso en alta cuando se captura', async () => {
    component.openCreateDialog();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('#rh-padron-create-fecha-ingreso') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.min).toBe('1940-01-01');
    expect(input.max).toBe('2100-12-31');

    component.draftNombres.set('Laura');
    component.draftApellidos.set('Mendoza');
    component.draftFechaIngreso.set('2021-05-01');

    const submitPromise = component.onSubmitCreatePersona();
    const postReq = httpMock.expectOne((r) => r.url.endsWith('/api/rh/personas') && r.method === 'POST');
    expect(postReq.request.body.fecha_ingreso).toBe('2021-05-01');
    postReq.flush({
      persona_id: 950,
      nombre_completo: 'Laura Mendoza',
      nombres: 'Laura',
      apellidos: 'Mendoza',
      cargo: null,
      correo_principal: null,
      unidad_medica_id: null,
      tiene_rfc: false,
      rfc_masked: null,
      tiene_curp: false,
      curp_masked: null,
      activo: true,
      fecha_baja: null,
      fecha_ingreso: '2021-05-01',
    });

    await new Promise((r) => setTimeout(r, 0));
    const reloadReq = httpMock.expectOne((r) => r.url.endsWith('/api/rh/personas') && r.method === 'GET');
    reloadReq.flush({ items: [], page: 1, pageSize: 20, total: 0 });
    await submitPromise;
    expect(component.draftFechaIngreso()).toBe('');
  });

  it('omite fecha_ingreso cuando se deja vacío y limpia el campo al cancelar', async () => {
    component.openCreateDialog();
    component.draftFechaIngreso.set('2020-01-15');
    component.closeCreateDialog();
    expect(component.draftFechaIngreso()).toBe('');

    component.openCreateDialog();
    component.draftNombres.set('Pedro');
    component.draftApellidos.set('Castro');
    expect(component.draftFechaIngreso()).toBe('');

    const submitPromise = component.onSubmitCreatePersona();
    const postReq = httpMock.expectOne((r) => r.url.endsWith('/api/rh/personas') && r.method === 'POST');
    expect('fecha_ingreso' in postReq.request.body).toBeFalse();
    postReq.flush({
      persona_id: 951,
      nombre_completo: 'Pedro Castro',
      nombres: 'Pedro',
      apellidos: 'Castro',
      cargo: null,
      correo_principal: null,
      unidad_medica_id: null,
      tiene_rfc: false,
      rfc_masked: null,
      tiene_curp: false,
      curp_masked: null,
      activo: true,
      fecha_baja: null,
      fecha_ingreso: null,
    });

    await new Promise((r) => setTimeout(r, 0));
    const reloadReq = httpMock.expectOne((r) => r.url.endsWith('/api/rh/personas') && r.method === 'GET');
    reloadReq.flush({ items: [], page: 1, pageSize: 20, total: 0 });
    await submitPromise;
  });

  it('filtra por Unidad de referencia (OFICINA CENTRAL, CLUESIMB, Sin unidad, Todas) reiniciando paginación (RH-UX-01)', async () => {
    component.unidades = [
      { id: 177, nombre: 'OFICINA CENTRAL', cluesimb: 'N/A' },
      { id: 12, nombre: 'HOSPITAL GENERAL MEXICALI', cluesimb: 'BCIMB000012' },
    ];

    // Búsqueda parcial por nombre (insensible a mayúsculas) -> OFICINA CENTRAL
    component.onUnidadFilterInput('  oficina ');
    expect(component.unidadesFilterFiltered().length).toBe(1);
    expect(component.unidadesFilterFiltered()[0].id).toBe(177);

    // Búsqueda por CLUESIMB -> Hospital General Mexicali
    component.onUnidadFilterInput('bcimb000012');
    expect(component.unidadesFilterFiltered().length).toBe(1);
    expect(component.unidadesFilterFiltered()[0].id).toBe(12);

    // Seleccionar OFICINA CENTRAL -> reinicia page a 1 y consulta con unidadId=177
    component.page.set(3);
    component.selectUnidadFilter(177, 'OFICINA CENTRAL (N/A)');
    const reqOficina = httpMock.expectOne(
      (r) =>
        r.url.endsWith('/api/rh/personas') &&
        r.params.get('unidadId') === '177' &&
        r.params.get('page') === '1'
    );
    reqOficina.flush({ items: [], page: 1, pageSize: 20, total: 5 });
    await new Promise((r) => setTimeout(r, 0));
    expect(component.total()).toBe(5);

    // Seleccionar Sin unidad de referencia -> unidadId=sin_unidad
    component.selectUnidadFilter('sin_unidad', 'Sin unidad de referencia');
    const reqSin = httpMock.expectOne(
      (r) => r.url.endsWith('/api/rh/personas') && r.params.get('unidadId') === 'sin_unidad'
    );
    reqSin.flush({ items: [], page: 1, pageSize: 20, total: 2 });
    await new Promise((r) => setTimeout(r, 0));
    expect(component.total()).toBe(2);

    // Limpiar filtro -> omite unidadId
    component.clearUnidadFilter();
    const reqTodas = httpMock.expectOne(
      (r) => r.url.endsWith('/api/rh/personas') && !r.params.has('unidadId')
    );
    reqTodas.flush({ items: [], page: 1, pageSize: 20, total: 114 });
    await new Promise((r) => setTimeout(r, 0));
    expect(component.total()).toBe(114);
  });

  it('implementa paginación institucional Primero | Anterior | Página / Total | Siguiente | Último (UX-ESTANDAR-01)', async () => {
    // Total = 100, pageSize = 20 -> 5 páginas
    component.total.set(100);
    component.pageSize.set(20);
    component.page.set(1);
    expect(component.totalPages()).toBe(5);
    expect(component.canGoPrev()).toBeFalse();
    expect(component.canGoNext()).toBeTrue();

    // Ir a Último -> página 5
    component.goToLastPage();
    const reqLast = httpMock.expectOne(
      (r) => r.url.endsWith('/api/rh/personas') && r.params.get('page') === '5'
    );
    reqLast.flush({ items: [], page: 5, pageSize: 20, total: 100 });
    await new Promise((r) => setTimeout(r, 0));
    expect(component.page()).toBe(5);
    expect(component.canGoPrev()).toBeTrue();
    expect(component.canGoNext()).toBeFalse();

    // Ir a Anterior -> página 4
    component.goToPrevPage();
    const reqPrev = httpMock.expectOne(
      (r) => r.url.endsWith('/api/rh/personas') && r.params.get('page') === '4'
    );
    reqPrev.flush({ items: [], page: 4, pageSize: 20, total: 100 });
    await new Promise((r) => setTimeout(r, 0));
    expect(component.page()).toBe(4);

    // Ir a Primero -> página 1
    component.goToFirstPage();
    const reqFirst = httpMock.expectOne(
      (r) => r.url.endsWith('/api/rh/personas') && r.params.get('page') === '1'
    );
    reqFirst.flush({ items: [], page: 1, pageSize: 20, total: 100 });
    await new Promise((r) => setTimeout(r, 0));
    expect(component.page()).toBe(1);

    // Total 0 o menor que pageSize -> totalPages = 1 y ambos extremos deshabilitados
    component.total.set(0);
    expect(component.totalPages()).toBe(1);
    expect(component.canGoPrev()).toBeFalse();
    expect(component.canGoNext()).toBeFalse();
  });

  it('permite selección directa de página válida, ignora páginas inválidas y opera el menú de acciones con Escape (UX-ESTANDAR-02)', async () => {
    component.total.set(100);
    component.pageSize.set(20);
    component.page.set(1);
    expect(component.pageNumbers()).toEqual([1, 2, 3, 4, 5]);

    // Página inválida (0, 6, NaN) -> no dispara petición HTTP
    component.goToPage(0);
    component.goToPage(6);
    component.goToPage('abc');
    expect(component.page()).toBe(1);

    // Navegación directa a página intermedia 3
    component.goToPage(3);
    const reqP3 = httpMock.expectOne(
      (r) => r.url.endsWith('/api/rh/personas') && r.params.get('page') === '3'
    );
    reqP3.flush({ items: [], page: 3, pageSize: 20, total: 100 });
    await new Promise((r) => setTimeout(r, 0));
    expect(component.page()).toBe(3);

    // Menú de acciones: abrir, cerrar con Escape
    component.toggleActionsMenu(501);
    expect(component.openActionsPersonaId()).toBe(501);
    component.onActionsMenuKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.openActionsPersonaId()).toBeNull();
  });
});
