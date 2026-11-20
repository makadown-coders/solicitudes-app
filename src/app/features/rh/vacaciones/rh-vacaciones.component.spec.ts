import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SimpleChange } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  RhPersonasPadronItem,
  RhVacacionRegistroDto,
} from '../../../services/rh.service';
import { RhVacacionesComponent } from './rh-vacaciones.component';

describe('RhVacacionesComponent (RH-4A.4B)', () => {
  let fixture: ComponentFixture<RhVacacionesComponent>;
  let component: RhVacacionesComponent;
  let httpMock: HttpTestingController;

  const personaSinAdscripcionNiCuenta: RhPersonasPadronItem = {
    persona_id: 601,
    nombre_completo: 'Carlos Pérez Ruiz',
    nombres: 'Carlos',
    apellidos: 'Pérez Ruiz',
    cargo: 'Técnico Administrativo',
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
  };

  const sampleRegistros: RhVacacionRegistroDto[] = [
    {
      id: 10,
      persona_id: 601,
      adscripcion_id: null,
      anio_ciclo: 2026,
      periodo_referencia: '1er Periodo',
      fecha_inicio: '2026-07-01',
      fecha_fin: '2026-07-10',
      dias_registrados: 10,
      documento_referencia: 'OF-VAC-2026-01',
      observaciones: null,
      estado: 'REGISTRADO',
      motivo_anulacion: null,
      anulado_en: null,
      creado_en: '2026-06-20T10:00:00.000Z',
      actualizado_en: '2026-06-20T10:00:00.000Z',
    },
    {
      id: 11,
      persona_id: 601,
      adscripcion_id: 801,
      anio_ciclo: 2025,
      periodo_referencia: '2do Periodo',
      fecha_inicio: '2025-12-01',
      fecha_fin: '2025-12-10',
      dias_registrados: 10,
      documento_referencia: null,
      observaciones: 'Anulado por reprogramación',
      estado: 'ANULADO',
      motivo_anulacion: 'Reprogramación autorizada',
      anulado_en: '2025-11-25T10:00:00.000Z',
      creado_en: '2025-11-20T10:00:00.000Z',
      actualizado_en: '2025-11-25T10:00:00.000Z',
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RhVacacionesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(RhVacacionesComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    component.persona = personaSinAdscripcionNiCuenta;
    component.canManage = true;
  });

  afterEach(() => {
    for (const req of httpMock.match((r) => r.url.endsWith('/api/rh/vacaciones/periodos'))) {
      req.flush({ items: [] });
    }
    httpMock.verify();
  });

  function triggerInitialLoad(
    items: RhVacacionRegistroDto[] = sampleRegistros,
    total = items.length,
    page = 1,
    pageSize = 10
  ): void {
    component.ngOnChanges({
      persona: new SimpleChange(undefined, component.persona, true),
    });
    const req = httpMock.expectOne(
      (r) =>
        r.url.endsWith('/api/rh/personas/601/vacaciones') &&
        r.method === 'GET' &&
        r.params.get('estado') === 'todos'
    );
    req.flush({ persona_id: 601, items, page, pageSize, total });
    fixture.detectChanges();
  }

  it('carga kardex para trabajador sin adscripción ni cuenta y suma únicamente días registrados', async () => {
    triggerInitialLoad();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    expect(component.items().length).toBe(2);
    expect(component.diasRegistradosEnVista()).toBe(10);
    expect(component.canAnularItem(component.items()[0])).toBeTrue();
    expect(component.canAnularItem(component.items()[1])).toBeFalse();
  });

  it('filtra por ciclo y estado y soporta paginación real del backend', async () => {
    triggerInitialLoad([], 0);
    await new Promise((r) => setTimeout(r, 0));

    component.anioFilter.set('2026');
    component.onSelectEstadoFilter('registrados');
    const reqFilt = httpMock.expectOne(
      (r) =>
        r.url.endsWith('/api/rh/personas/601/vacaciones') &&
        r.params.get('anio_ciclo') === '2026' &&
        r.params.get('estado') === 'registrados' &&
        r.params.get('page') === '1'
    );
    reqFilt.flush({ persona_id: 601, items: [sampleRegistros[0]], page: 1, pageSize: 1, total: 2 });
    await new Promise((r) => setTimeout(r, 0));

    expect(component.totalPages()).toBe(2);
    component.onNextPage();
    const reqP2 = httpMock.expectOne(
      (r) =>
        r.url.endsWith('/api/rh/personas/601/vacaciones') &&
        r.params.get('page') === '2'
    );
    reqP2.flush({ persona_id: 601, items: [sampleRegistros[0]], page: 2, pageSize: 1, total: 2 });
    await new Promise((r) => setTimeout(r, 0));
    expect(component.page()).toBe(2);
  });

  it('valida fechas invertidas, días inválidos y registra periodo con advertencia por superposición', async () => {
    triggerInitialLoad([sampleRegistros[0]]);
    await new Promise((r) => setTimeout(r, 0));

    component.openCreateForm();
    component.draftAnioCiclo.set('2026');
    component.draftPeriodoReferencia.set('Extraordinario');
    component.draftFechaInicio.set('2026-07-15');
    component.draftFechaFin.set('2026-07-05');
    component.draftDiasRegistrados.set('5');
    expect(component.createValidationError()).toContain('no puede ser anterior');

    component.draftFechaFin.set('2026-07-20');
    component.draftDiasRegistrados.set('0');
    expect(component.createValidationError()).toContain('entre 1 y 366');

    component.draftDiasRegistrados.set('5');
    expect(component.createValidationError()).toBeNull();

    const submitPromise = component.submitCreate();
    const reqPost = httpMock.expectOne(
      (r) => r.url.endsWith('/api/rh/personas/601/vacaciones') && r.method === 'POST'
    );
    expect(reqPost.request.body.adscripcion_id).toBeNull();
    expect(reqPost.request.body.dias_registrados).toBe(5);
    reqPost.flush(
      {
        registro: { ...sampleRegistros[0], id: 12 },
        tiene_superposicion: true,
        registros_superpuestos_ids: [10],
      },
      { status: 201, statusText: 'Created' }
    );

    await new Promise((r) => setTimeout(r, 0));
    const reqReload = httpMock.expectOne(
      (r) => r.url.endsWith('/api/rh/personas/601/vacaciones') && r.method === 'GET'
    );
    reqReload.flush({ persona_id: 601, items: [sampleRegistros[0]], page: 1, pageSize: 10, total: 1 });
    await submitPromise;

    expect(component.createOpen()).toBeFalse();
    expect(component.overlapWarningBanner()).toContain('Advertencia administrativa');
  });

  it('muestra conflicto 409 por duplicado exacto sin reintentar', async () => {
    triggerInitialLoad([sampleRegistros[0]]);
    await new Promise((r) => setTimeout(r, 0));

    component.openCreateForm();
    component.draftAnioCiclo.set('2026');
    component.draftPeriodoReferencia.set('1er Periodo');
    component.draftFechaInicio.set('2026-07-01');
    component.draftFechaFin.set('2026-07-10');
    component.draftDiasRegistrados.set('10');

    const submitPromise = component.submitCreate();
    const reqPost = httpMock.expectOne(
      (r) => r.url.endsWith('/api/rh/personas/601/vacaciones') && r.method === 'POST'
    );
    reqPost.flush(
      { error: 'Ya existe un registro vacacional activo idéntico' },
      { status: 409, statusText: 'Conflict' }
    );
    await submitPromise;

    expect(component.createIsConflict()).toBeTrue();
    expect(component.createError()).toContain('idéntico');
  });

  it('anula registro con motivo obligatorio, permite cancelar y refleja idempotencia', async () => {
    triggerInitialLoad([sampleRegistros[0]]);
    await new Promise((r) => setTimeout(r, 0));

    component.openAnularDialog(sampleRegistros[0]);
    expect(component.anularValidationError()).toContain('motivo de anulación es obligatorio');

    component.closeAnularDialog();
    expect(component.anularTarget()).toBeNull();

    component.openAnularDialog(sampleRegistros[0]);
    component.anularMotivo.set('Captura duplicada');
    const anularPromise = component.submitAnular();

    const reqPatch = httpMock.expectOne(
      (r) => r.url.endsWith('/api/rh/personas/601/vacaciones/10/anular') && r.method === 'PATCH'
    );
    expect(reqPatch.request.body.motivo_anulacion).toBe('Captura duplicada');
    reqPatch.flush({
      registro: { ...sampleRegistros[0], estado: 'ANULADO', motivo_anulacion: 'Captura duplicada' },
      idempotente: true,
    });

    await new Promise((r) => setTimeout(r, 0));
    const reqReload = httpMock.expectOne(
      (r) => r.url.endsWith('/api/rh/personas/601/vacaciones') && r.method === 'GET'
    );
    reqReload.flush({ persona_id: 601, items: [], page: 1, pageSize: 10, total: 0 });
    await anularPromise;

    expect(component.successBanner()).toContain('ya se encontraba anulado');
  });

  it('deniega acceso si canManage=false o si backend responde 403', async () => {
    component.canManage = false;
    component.ngOnChanges({
      persona: new SimpleChange(undefined, component.persona, true),
    });
    expect(component.forbiddenError()).toContain('RECURSOS_HUMANOS GLOBAL');

    component.canManage = true;
    component.ngOnChanges({
      persona: new SimpleChange(undefined, component.persona, true),
    });
    const req = httpMock.expectOne((r) => r.url.endsWith('/api/rh/personas/601/vacaciones'));
    req.flush({ error: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });
    await new Promise((r) => setTimeout(r, 0));
    expect(component.forbiddenError()).toContain('RECURSOS_HUMANOS GLOBAL');
  });
});
