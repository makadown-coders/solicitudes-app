import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SimpleChange } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  RhComisionLaboralDto,
  RhPersonasPadronItem,
  RhUnidadAutorizada,
} from '../../../services/rh.service';
import { RhComisionesLaboralesComponent } from './rh-comisiones-laborales.component';

describe('RhComisionesLaboralesComponent (RH-4A.3B)', () => {
  let fixture: ComponentFixture<RhComisionesLaboralesComponent>;
  let component: RhComisionesLaboralesComponent;
  let httpMock: HttpTestingController;

  const mockUnidades: RhUnidadAutorizada[] = [
    { id: 12, nombre: 'HOSPITAL GENERAL MEXICALI', cluesimb: 'BCIMB000012' },
    { id: 177, nombre: 'OFICINA CENTRAL', cluesimb: 'N/A' },
  ];

  const personaSinAdscripcionNiCuenta: RhPersonasPadronItem = {
    persona_id: 501,
    nombre_completo: 'María López Hernández',
    nombres: 'María',
    apellidos: 'López Hernández',
    cargo: 'Auxiliar Administrativo',
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

  const sampleComisiones: RhComisionLaboralDto[] = [
    {
      id: 1,
      persona_id: 501,
      adscripcion_origen_id: null,
      sin_adscripcion_formal_origen: true,
      unidad_destino_id: 177,
      unidad_destino_nombre: 'OFICINA CENTRAL',
      unidad_destino_cluesimb: 'N/A',
      area_destino_texto: 'Coordinación Estatal',
      fecha_inicio: '2026-11-01',
      fecha_fin: null,
      motivo: 'Apoyo estatal',
      oficio_referencia: 'OF-RH-001',
      observaciones: null,
      activo: true,
      estado_vigencia: 'VIGENTE',
    },
    {
      id: 2,
      persona_id: 501,
      adscripcion_origen_id: 701,
      sin_adscripcion_formal_origen: false,
      unidad_destino_id: 12,
      unidad_destino_nombre: 'HOSPITAL GENERAL MEXICALI',
      unidad_destino_cluesimb: 'BCIMB000012',
      area_destino_texto: null,
      fecha_inicio: '2027-01-15',
      fecha_fin: '2027-03-15',
      motivo: 'Cobertura programada',
      oficio_referencia: null,
      observaciones: null,
      activo: true,
      estado_vigencia: 'FUTURA',
    },
    {
      id: 3,
      persona_id: 501,
      adscripcion_origen_id: null,
      sin_adscripcion_formal_origen: true,
      unidad_destino_id: null,
      unidad_destino_nombre: null,
      unidad_destino_cluesimb: null,
      area_destino_texto: 'Subdirección de Recursos Humanos',
      fecha_inicio: '2026-01-01',
      fecha_fin: '2026-06-30',
      motivo: 'Comisión cerrada',
      oficio_referencia: null,
      observaciones: 'Concluida',
      activo: false,
      estado_vigencia: 'CONCLUIDA',
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RhComisionesLaboralesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(RhComisionesLaboralesComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    component.persona = personaSinAdscripcionNiCuenta;
    component.unidades = mockUnidades;
    component.canManage = true;
  });

  afterEach(() => {
    httpMock.verify();
  });

  function triggerInitialLoad(
    items: RhComisionLaboralDto[] = sampleComisiones,
    total = items.length,
    page = 1,
    pageSize = 10
  ): void {
    component.ngOnChanges({
      persona: new SimpleChange(undefined, component.persona, true),
    });
    const req = httpMock.expectOne(
      (r) =>
        r.url.endsWith('/api/rh/personas/501/comisiones') &&
        r.method === 'GET' &&
        r.params.get('estado') === 'todas'
    );
    req.flush({ persona_id: 501, items, page, pageSize, total });
    fixture.detectChanges();
  }

  it('carga comisiones para persona sin adscripción ni cuenta (vigente, futura, concluida)', async () => {
    triggerInitialLoad();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.items().length).toBe(3);
    expect(component.items()[0].estado_vigencia).toBe('VIGENTE');
    expect(component.items()[1].estado_vigencia).toBe('FUTURA');
    expect(component.items()[2].estado_vigencia).toBe('CONCLUIDA');
    expect(component.canConcluirItem(component.items()[0])).toBeTrue();
    expect(component.canConcluirItem(component.items()[2])).toBeFalse();
  });

  it('muestra historial vacío y permite cambiar filtros y paginación', async () => {
    triggerInitialLoad([], 0);
    await fixture.whenStable();
    expect(component.items().length).toBe(0);

    component.onSelectEstadoFilter('vigentes');
    const reqVig = httpMock.expectOne(
      (r) =>
        r.url.endsWith('/api/rh/personas/501/comisiones') &&
        r.params.get('estado') === 'vigentes' &&
        r.params.get('page') === '1'
    );
    reqVig.flush({ persona_id: 501, items: [sampleComisiones[0]], page: 1, pageSize: 1, total: 2 });
    await fixture.whenStable();

    expect(component.totalPages()).toBe(2);
    component.onNextPage();
    const reqPage2 = httpMock.expectOne(
      (r) =>
        r.url.endsWith('/api/rh/personas/501/comisiones') &&
        r.params.get('estado') === 'vigentes' &&
        r.params.get('page') === '2'
    );
    reqPage2.flush({ persona_id: 501, items: [sampleComisiones[0]], page: 2, pageSize: 1, total: 2 });
    await fixture.whenStable();
    expect(component.page()).toBe(2);
  });

  it('valida destino obligatorio, fechas coherentes y límites de longitud en el alta', async () => {
    triggerInitialLoad([]);
    await fixture.whenStable();

    component.openCreateForm();
    expect(component.createValidationError()).toContain('al menos una unidad médica');

    component.draftAreaDestinoTexto.set('Área Administrativa');
    expect(component.createValidationError()).toContain('fecha de inicio es obligatoria');

    component.draftFechaInicio.set('2026-11-15');
    component.draftFechaFin.set('2026-11-10');
    expect(component.createValidationError()).toContain('no puede ser anterior');

    component.draftFechaFin.set('2026-11-30');
    component.draftMotivo.set('x'.repeat(201));
    expect(component.createValidationError()).toContain('200 caracteres');

    component.draftMotivo.set('Motivo válido');
    expect(component.createValidationError()).toBeNull();
  });

  it('registra comisión con ambos destinos (Oficina Central CLUES N/A + área) sin adscripción origen y limpia formulario', async () => {
    triggerInitialLoad([]);
    await fixture.whenStable();

    component.openCreateForm();
    component.draftUnidadDestinoId.set('177');
    component.draftAreaDestinoTexto.set('Dirección General');
    component.draftFechaInicio.set('2026-11-01');
    component.draftMotivo.set('Apoyo temporal');

    const submitPromise = component.submitCreate();
    const reqPost = httpMock.expectOne(
      (r) => r.url.endsWith('/api/rh/personas/501/comisiones') && r.method === 'POST'
    );
    expect(reqPost.request.body.unidad_destino_id).toBe(177);
    expect(reqPost.request.body.area_destino_texto).toBe('Dirección General');
    expect(reqPost.request.body.adscripcion_origen_id).toBeNull();
    reqPost.flush(sampleComisiones[0], { status: 201, statusText: 'Created' });

    await new Promise((r) => setTimeout(r, 0));
    const reqReload = httpMock.expectOne(
      (r) => r.url.endsWith('/api/rh/personas/501/comisiones') && r.method === 'GET'
    );
    reqReload.flush({ persona_id: 501, items: [sampleComisiones[0]], page: 1, pageSize: 10, total: 1 });
    await submitPromise;

    expect(component.createOpen()).toBeFalse();
    expect(component.draftAreaDestinoTexto()).toBe('');
    expect(component.successBanner()).toContain('registrada correctamente');
  });

  it('muestra conflicto 409 por periodos superpuestos al registrar', async () => {
    triggerInitialLoad([sampleComisiones[0]]);
    await fixture.whenStable();

    component.openCreateForm();
    component.draftAreaDestinoTexto.set('Otra área');
    component.draftFechaInicio.set('2026-11-10');

    const submitPromise = component.submitCreate();
    const reqPost = httpMock.expectOne(
      (r) => r.url.endsWith('/api/rh/personas/501/comisiones') && r.method === 'POST'
    );
    reqPost.flush(
      { error: 'El periodo se superpone con otra comisión activa' },
      { status: 409, statusText: 'Conflict' }
    );
    await submitPromise;

    expect(component.createIsConflict()).toBeTrue();
    expect(component.createError()).toContain('superpone');
  });

  it('requiere confirmación al concluir, impide fecha futura en cierre inmediato, permite cancelar y refleja idempotencia', async () => {
    triggerInitialLoad([sampleComisiones[0]]);
    await fixture.whenStable();

    component.openConcluirDialog(sampleComisiones[0]);
    expect(component.concluirTarget()?.id).toBe(1);

    // Fecha futura bloqueada en UI
    component.concluirFechaFin.set('2099-01-01');
    expect(component.concluirValidationError()).toContain('iguales o anteriores a hoy');

    // Cancelar limpia estado
    component.closeConcluirDialog();
    expect(component.concluirTarget()).toBeNull();

    // Confirmar conclusión válida (respuesta idempotente)
    component.openConcluirDialog(sampleComisiones[0]);
    component.concluirFechaFin.set(component.todayIso());
    const concluirPromise = component.submitConcluir();

    const reqPatch = httpMock.expectOne(
      (r) => r.url.endsWith('/api/rh/personas/501/comisiones/1/concluir') && r.method === 'PATCH'
    );
    reqPatch.flush({
      comision: { ...sampleComisiones[0], activo: false, estado_vigencia: 'CONCLUIDA' },
      idempotente: true,
    });

    await new Promise((r) => setTimeout(r, 0));
    const reqReload = httpMock.expectOne(
      (r) => r.url.endsWith('/api/rh/personas/501/comisiones') && r.method === 'GET'
    );
    reqReload.flush({ persona_id: 501, items: [], page: 1, pageSize: 10, total: 0 });
    await concluirPromise;

    expect(component.successBanner()).toContain('ya se encontraba concluida');
  });

  it('bloquea acceso si canManage=false (RH CLUES / ADMIN_TIC sin RH GLOBAL) o si backend responde 403', async () => {
    component.canManage = false;
    component.ngOnChanges({
      persona: new SimpleChange(undefined, component.persona, true),
    });
    expect(component.forbiddenError()).toContain('RECURSOS_HUMANOS GLOBAL');

    component.canManage = true;
    component.ngOnChanges({
      persona: new SimpleChange(undefined, component.persona, true),
    });
    const req = httpMock.expectOne((r) => r.url.endsWith('/api/rh/personas/501/comisiones'));
    req.flush({ error: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });
    await new Promise((r) => setTimeout(r, 0));

    expect(component.forbiddenError()).toContain('RECURSOS_HUMANOS GLOBAL');
  });
});
