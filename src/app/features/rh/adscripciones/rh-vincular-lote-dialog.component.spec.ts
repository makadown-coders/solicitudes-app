import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  RhLoteAdscripcionEjecucionResponse,
  RhLoteAdscripcionValidarResponse,
  RhPersonaAdminDto,
} from '../../../services/rh.service';
import { RhVincularLoteDialogComponent } from './rh-vincular-lote-dialog.component';

function makePersona(id: number, overrides: Partial<RhPersonaAdminDto> = {}): RhPersonaAdminDto {
  return {
    persona_id: id,
    nombres: `Nombre${id}`,
    apellidos: `Apellido${id}`,
    nombre_completo: `Nombre${id} Apellido${id}`,
    cargo: `Cargo ${id}`,
    correo_principal: `persona${id}@imssb.gob.mx`,
    unidad_medica_id: 177,
    tiene_rfc: false,
    rfc_masked: null,
    tiene_curp: false,
    curp_masked: null,
    fecha_baja: null,
    fecha_ingreso: '2023-01-15',
    activo: true,
    ...overrides,
  };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('RhVincularLoteDialogComponent (RH-UX-04C)', () => {
  let fixture: ComponentFixture<RhVincularLoteDialogComponent>;
  let component: RhVincularLoteDialogComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RhVincularLoteDialogComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(RhVincularLoteDialogComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  async function openDialog(unidadId = 177, items: RhPersonaAdminDto[] = [makePersona(1), makePersona(2)], total?: number) {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('unidadId', unidadId);
    fixture.componentRef.setInput('unidadNombre', 'OFICINA CENTRAL');
    fixture.componentRef.setInput('unidadClues', 'BCIMB000001');
    fixture.detectChanges();

    const req = httpMock.expectOne((r) =>
      r.method === 'GET' &&
      r.url.endsWith('/api/rh/personas') &&
      r.params.get('estado') === 'activas' &&
      r.params.get('unidadId') === String(unidadId)
    );
    req.flush({
      items,
      page: 1,
      pageSize: 20,
      total: total ?? items.length,
    });

    await flushMicrotasks();
    fixture.detectChanges();
  }

  it('carga personas activas de la unidad al abrir, sin autoselección y sin botón Buscar', async () => {
    await openDialog(177, [makePersona(10), makePersona(11)]);

    expect(component.candidates().length).toBe(2);
    expect(component.selectedCount()).toBe(0);
    expect(component.defaultVigenteDesde()).toBe('');
    expect(component.defaultPuesto()).toBe('');

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('#rh-lote-search-input')).not.toBeNull();
    expect(el.textContent).not.toContain('CURP');
    expect(el.textContent).not.toContain('RFC');
  });

  it('persiste la selección deduplicada al cambiar de página y soporta paginación completa', async () => {
    await openDialog(177, [makePersona(1), makePersona(2)], 45);

    component.togglePersonaSelection(component.candidates()[0]);
    expect(component.selectedCount()).toBe(1);

    component.goToPage(2);
    const reqP2 = httpMock.expectOne((r) =>
      r.method === 'GET' && r.url.endsWith('/api/rh/personas') && r.params.get('page') === '2'
    );
    reqP2.flush({ items: [makePersona(21), makePersona(22)], page: 2, pageSize: 20, total: 45 });
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.page()).toBe(2);
    expect(component.totalPages()).toBe(3);
    expect(component.isSelected(1)).toBeTrue();

    component.togglePersonaSelection(component.candidates()[0]);
    expect(component.selectedCount()).toBe(2);
  });

  it('seleccionar todos los filtrados pagina hasta máximo 100 y advierte si total > 100', async () => {
    await openDialog(177, [makePersona(1)], 120);

    const selectPromise = component.selectAllFilteredEligible();

    const p1Items = Array.from({ length: 50 }, (_, idx) => makePersona(idx + 1));
    const req1 = httpMock.expectOne((r) =>
      r.method === 'GET' && r.url.endsWith('/api/rh/personas') && r.params.get('page') === '1' && r.params.get('pageSize') === '50'
    );
    req1.flush({ items: p1Items, page: 1, pageSize: 50, total: 120 });
    await flushMicrotasks();

    const p2Items = Array.from({ length: 50 }, (_, idx) => makePersona(idx + 51));
    const req2 = httpMock.expectOne((r) =>
      r.method === 'GET' && r.url.endsWith('/api/rh/personas') && r.params.get('page') === '2' && r.params.get('pageSize') === '50'
    );
    req2.flush({ items: p2Items, page: 2, pageSize: 50, total: 120 });
    await flushMicrotasks();

    await selectPromise;
    fixture.detectChanges();

    expect(component.selectedCount()).toBe(100);
    expect(component.selectionNotice()).toContain('120');
    expect(component.selectionNotice()).toContain('100');
  });

  it('valida Paso 2 (vigente_desde obligatorio, rango de fechas y overrides omitido vs null vs valor)', async () => {
    await openDialog(177, [makePersona(1), makePersona(2)]);

    component.togglePersonaSelection(component.candidates()[0]);
    component.togglePersonaSelection(component.candidates()[1]);
    component.goToStep(2);
    fixture.detectChanges();

    // Sin vigente_desde no puede avanzar
    expect(component.canProceedToStep3()).toBeFalse();

    // Rango inválido
    component.onDefaultFieldChange('vigente_desde', '2026-05-10');
    component.onDefaultFieldChange('vigente_hasta', '2026-05-01');
    expect(component.canProceedToStep3()).toBeFalse();

    // Rango válido + defaults + overrides (null y custom)
    component.onDefaultFieldChange('vigente_hasta', '2026-12-31');
    component.onDefaultFieldChange('turno', 'Matutino');
    component.setOverrideNull(1, 'turno');
    component.setOverrideValue(2, 'puesto', 'Enfermero Especialista');

    expect(component.canProceedToStep3()).toBeTrue();

    const payload = component.buildPayload();
    expect(payload.defaults).toEqual({
      vigente_desde: '2026-05-10',
      vigente_hasta: '2026-12-31',
      turno: 'Matutino',
    });

    const item1 = payload.items.find((i) => i.persona_id === 1)!;
    const item2 = payload.items.find((i) => i.persona_id === 2)!;
    expect(item1.turno).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(item1, 'puesto')).toBeFalse();
    expect(item2.puesto).toBe('Enfermero Especialista');
    expect(Object.prototype.hasOwnProperty.call(item2, 'turno')).toBeFalse();
  });

  it('prevalida en Paso 3, invalida al editar, y ejecuta confirmación emitiendo completed', async () => {
    await openDialog(177, [makePersona(1), makePersona(2)]);

    component.togglePersonaSelection(component.candidates()[0]);
    component.togglePersonaSelection(component.candidates()[1]);
    component.goToStep(2);
    component.onDefaultFieldChange('vigente_desde', '2026-06-01');

    component.goToStep(3);
    const valReq = httpMock.expectOne((r) => r.url.endsWith('/api/rh/unidades/177/adscripciones/lote/validar'));
    expect(valReq.request.method).toBe('POST');

    const mockValResponse: RhLoteAdscripcionValidarResponse = {
      unidad_id: 177,
      total_solicitados: 2,
      elegibles: 1,
      ya_vinculadas: 1,
      personas_inactivas: 0,
      conflictos_adscripcion: 0,
      datos_invalidos: 0,
      resultados: [
        { persona_id: 1, estado: 'ELEGIBLE', detalle: null },
        { persona_id: 2, estado: 'YA_VINCULADA', detalle: 'Ya tiene adscripción activa' },
      ],
    };
    valReq.flush(mockValResponse);
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.validationResult()?.elegibles).toBe(1);
    expect(component.canConfirmExecution()).toBeTrue();

    // Editar un campo invalida la prevalidación inmediatamente
    component.onDefaultFieldChange('turno', 'Vespertino');
    expect(component.validationResult()).toBeNull();
    expect(component.canConfirmExecution()).toBeFalse();

    // Revalidar
    const revalidatePromise = component.ejecutarPrevalidacion();
    const valReq2 = httpMock.expectOne((r) => r.url.endsWith('/api/rh/unidades/177/adscripciones/lote/validar'));
    valReq2.flush(mockValResponse);
    await revalidatePromise;
    fixture.detectChanges();

    // Confirmar ejecución
    const completedSpy = spyOn(component.completed, 'emit');
    const execPromise = component.confirmarVinculacionLote();

    // Protección contra doble envío mientras está en curso
    expect(component.submitting()).toBeTrue();
    expect(component.canConfirmExecution()).toBeFalse();

    const execReq = httpMock.expectOne((r) => r.url.endsWith('/api/rh/unidades/177/adscripciones/lote'));
    expect(execReq.request.method).toBe('POST');

    const mockExecResponse: RhLoteAdscripcionEjecucionResponse = {
      lote_id: 'lote-test-001',
      unidad_id: 177,
      total_solicitados: 2,
      creadas: 1,
      omitidas: 1,
      errores: 0,
      resultados: [
        { persona_id: 1, resultado: 'CREADA', adscripcion_laboral_id: 501, detalle: null },
        { persona_id: 2, resultado: 'OMITIDA_DUPLICADO', adscripcion_laboral_id: null, detalle: 'Ya vinculada' },
      ],
    };
    execReq.flush(mockExecResponse);
    await execPromise;
    fixture.detectChanges();

    expect(component.executionResult()?.lote_id).toBe('lote-test-001');
    expect(completedSpy).toHaveBeenCalledWith(mockExecResponse);
  });

  it('ante error de red o timeout en confirmación NO reintenta y muestra advertencia de resultado incierto', async () => {
    await openDialog(177, [makePersona(1)]);

    component.togglePersonaSelection(component.candidates()[0]);
    component.goToStep(2);
    component.onDefaultFieldChange('vigente_desde', '2026-06-01');
    component.goToStep(3);

    const valReq = httpMock.expectOne((r) => r.url.endsWith('/api/rh/unidades/177/adscripciones/lote/validar'));
    valReq.flush({
      unidad_id: 177,
      total_solicitados: 1,
      elegibles: 1,
      ya_vinculadas: 0,
      personas_inactivas: 0,
      conflictos_adscripcion: 0,
      datos_invalidos: 0,
      resultados: [{ persona_id: 1, estado: 'ELEGIBLE', detalle: null }],
    });
    await flushMicrotasks();

    const execPromise = component.confirmarVinculacionLote();
    const execReq = httpMock.expectOne((r) => r.url.endsWith('/api/rh/unidades/177/adscripciones/lote'));
    execReq.flush(null, { status: 504, statusText: 'Gateway Timeout' });
    await execPromise;
    fixture.detectChanges();

    expect(component.submitUncertainWarning()).toContain('incierto');
    expect(component.executionResult()).toBeNull();
  });

  it('reinicia el estado del asistente cuando cambia la unidad destino', async () => {
    await openDialog(177, [makePersona(1)]);
    component.togglePersonaSelection(component.candidates()[0]);
    expect(component.selectedCount()).toBe(1);

    fixture.componentRef.setInput('unidadId', 200);
    fixture.componentRef.setInput('unidadNombre', 'HOSPITAL GENERAL');
    fixture.detectChanges();

    const req = httpMock.expectOne((r) =>
      r.method === 'GET' && r.url.endsWith('/api/rh/personas') && r.params.get('unidadId') === '200'
    );
    req.flush({ items: [makePersona(99, { unidad_medica_id: 200 })], page: 1, pageSize: 20, total: 1 });
    await flushMicrotasks();

    expect(component.selectedCount()).toBe(0);
    expect(component.currentStep()).toBe(1);
  });
});
