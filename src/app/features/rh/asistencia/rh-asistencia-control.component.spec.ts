import { TestBed } from '@angular/core/testing';
import {
  RhAsistenciaControlComponent,
  resolveBajaCaliforniaYearMonth,
} from './rh-asistencia-control.component';
import {
  RhAsistenciaSeguimientoItemDto,
  RhAsistenciaSeguimientoResponse,
  RhService,
} from '../../../services/rh.service';

function makeItem(overrides: Partial<RhAsistenciaSeguimientoItemDto> = {}): RhAsistenciaSeguimientoItemDto {
  return {
    persona_id: 1,
    nombre_completo: 'ACEVEDO JOSE LUIS',
    activo_actual: true,
    fecha_ingreso: '2024-01-01',
    fecha_baja: null,
    unidad_medica_id: 10,
    unidad_medica_nombre: 'OFICINA CENTRAL',
    unidad_origen: 'ADSCRIPCION_VIGENTE',
    adscripcion_laboral_id: 101,
    puesto_referencia: 'DEPARTAMENTO DE PERSONAL',
    tiene_registro_control: false,
    control_id: null,
    estado_control: null,
    situacion_seguimiento: 'SIN_REGISTRO_CONTROL',
    motivo_incertidumbre: null,
    fecha_recepcion: null,
    recibido_por: null,
    excepcion_administrativa: false,
    motivo_excepcion: null,
    observaciones: null,
    generado_docx_en: null,
    generaciones_docx_count: 0,
    entrega_declarada_en: null,
    actualizado_en: null,
    ...overrides,
  };
}

function makeResponse(
  items: RhAsistenciaSeguimientoItemDto[],
  overrides: Partial<RhAsistenciaSeguimientoResponse> = {}
): RhAsistenciaSeguimientoResponse {
  return {
    anio: 2026,
    mes: 11,
    unidad_medica_id: null,
    items,
    resumen: {
      anio: 2026,
      mes: 11,
      unidad_medica_id: null,
      total_personas_evaluadas: items.length,
      recepciones_confirmadas: items.filter((i) => i.estado_control === 'RECIBIDA').length,
      observadas: items.filter((i) => i.estado_control === 'OBSERVADA').length,
      declaradas_no_confirmadas: items.filter((i) => i.estado_control === 'ENTREGADA_DECLARADA').length,
      pendientes_explicitas: items.filter((i) => i.estado_control === 'PENDIENTE').length,
      no_aplicables_documentadas: items.filter((i) => i.estado_control === 'NO_APLICA').length,
      sin_registro_control: items.filter((i) => !i.tiene_registro_control && i.situacion_seguimiento === 'SIN_REGISTRO_CONTROL').length,
      elegibilidad_incierta: items.filter((i) => i.situacion_seguimiento === 'ELEGIBILIDAD_INCIERTA').length,
      universo_evaluable_referencia: items.length,
      porcentaje_recepcion_sobre_evaluable: items.length > 0 ? 50 : null,
      denominador_nota: 'Nota de denominador de prueba.',
    },
    page: 1,
    pageSize: 20,
    total: items.length,
    ...overrides,
  };
}

describe('RhAsistenciaControlComponent (RH-ASIS-04)', () => {
  let rhServiceMock: jasmine.SpyObj<RhService>;

  beforeEach(async () => {
    rhServiceMock = jasmine.createSpyObj<RhService>('RhService', [
      'getAsistenciaSeguimiento',
      'confirmarRecepcionAsistencia',
      'actualizarEstadoAsistencia',
    ]);

    await TestBed.configureTestingModule({
      imports: [RhAsistenciaControlComponent],
      providers: [{ provide: RhService, useValue: rhServiceMock }],
    }).compileComponents();
  });

  it('carga mes actual (Baja California), resumen, sin registro y elegibilidad incierta', async () => {
    const bc = resolveBajaCaliforniaYearMonth();
    const itemSinReg = makeItem({ persona_id: 1, situacion_seguimiento: 'SIN_REGISTRO_CONTROL' });
    const itemIncierta = makeItem({
      persona_id: 2,
      nombre_completo: 'SIN FECHA',
      situacion_seguimiento: 'ELEGIBILIDAD_INCIERTA',
      motivo_incertidumbre: 'SIN_FECHA_INGRESO',
    });
    rhServiceMock.getAsistenciaSeguimiento.and.resolveTo(makeResponse([itemSinReg, itemIncierta]));

    const fixture = TestBed.createComponent(RhAsistenciaControlComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(comp.selectedAnio()).toBe(bc.anio);
    expect(comp.selectedMes()).toBe(bc.mes);
    expect(rhServiceMock.getAsistenciaSeguimiento).toHaveBeenCalled();
    expect(comp.items().length).toBe(2);
    expect(comp.getBadgeInfo(itemSinReg).label).toBe('Sin registro');
    expect(comp.getBadgeInfo(itemIncierta).label).toBe('Elegibilidad incierta');
  });

  it('soporta cambio de año/mes, unidad, búsqueda y paginación real', async () => {
    rhServiceMock.getAsistenciaSeguimiento.and.resolveTo(makeResponse([makeItem()], { total: 45, page: 1, pageSize: 20 }));

    const fixture = TestBed.createComponent(RhAsistenciaControlComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const comp = fixture.componentInstance;
    comp.onAnioChange(2025);
    comp.onMesChange(6);
    comp.onUnidadChange('10');
    comp.goToPage(2);
    await fixture.whenStable();

    const lastArgs = rhServiceMock.getAsistenciaSeguimiento.calls.mostRecent().args[0];
    expect(lastArgs.anio).toBe(2025);
    expect(lastArgs.mes).toBe(6);
    expect(lastArgs.unidadId).toBe(10);
    expect(lastArgs.page).toBe(2);
  });

  it('confirma recepción exitosamente, evita doble envío y maneja errores', async () => {
    const item = makeItem({ persona_id: 10 });
    rhServiceMock.getAsistenciaSeguimiento.and.resolveTo(makeResponse([item]));

    let resolveMutation!: (val: any) => void;
    rhServiceMock.confirmarRecepcionAsistencia.and.returnValue(
      new Promise((res) => {
        resolveMutation = res;
      })
    );

    const fixture = TestBed.createComponent(RhAsistenciaControlComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const comp = fixture.componentInstance;
    const p1 = comp.onConfirmarRecepcion(item);
    const p2 = comp.onConfirmarRecepcion(item); // doble envío ignorado
    expect(rhServiceMock.confirmarRecepcionAsistencia).toHaveBeenCalledTimes(1);

    resolveMutation({ registro: { estado: 'RECIBIDA' }, estado_anterior: null, idempotente: false, evento_auditoria: 'RH_ASISTENCIA_RECEPCION_CONFIRMADA' });
    await Promise.all([p1, p2]);
    expect(comp.feedbackSuccess()).toContain('Recepción confirmada');

    // Error de recepción
    rhServiceMock.confirmarRecepcionAsistencia.and.rejectWith(new Error('Fallo de red'));
    await comp.onConfirmarRecepcion(item);
    expect(comp.errorMessage()).toContain('Fallo de red');
  });

  it('exige observaciones en OBSERVADA, motivo en NO_APLICA y motivo administrativo al corregir', async () => {
    const itemRecibida = makeItem({
      persona_id: 11,
      tiene_registro_control: true,
      control_id: 50,
      estado_control: 'RECIBIDA',
      situacion_seguimiento: 'REGISTRO_EXPLICITO',
    });
    rhServiceMock.getAsistenciaSeguimiento.and.resolveTo(makeResponse([itemRecibida]));
    rhServiceMock.actualizarEstadoAsistencia.and.resolveTo({
      registro: { id: 50, persona_id: 11, anio: 2026, mes: 11, unidad_medica_id: 10, adscripcion_laboral_id: 101, estado: 'PENDIENTE', fecha_recepcion: null, recibido_por: null, observaciones: null, excepcion_administrativa: false, motivo_excepcion: null, generado_docx_en: null, generaciones_docx_count: 0, entrega_declarada_en: null, actualizado_en: '' },
      estado_anterior: 'RECIBIDA',
      idempotente: false,
      evento_auditoria: 'RH_ASISTENCIA_RECEPCION_CORREGIDA',
    });

    const fixture = TestBed.createComponent(RhAsistenciaControlComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const comp = fixture.componentInstance;

    // OBSERVADA sin observaciones -> error
    comp.openModal('OBSERVADA', makeItem({ persona_id: 12 }));
    comp.modalObservaciones.set('');
    await comp.submitModal();
    expect(comp.modalError()).toContain('observaciones');

    // NO_APLICA sin motivo -> error
    comp.openModal('NO_APLICA', makeItem({ persona_id: 12 }));
    comp.modalMotivoExcepcion.set('');
    await comp.submitModal();
    expect(comp.modalError()).toContain('motivo de excepción');

    // CORREGIR sin motivo administrativo -> error
    comp.openModal('CORREGIR', itemRecibida);
    comp.modalNuevoEstado.set('PENDIENTE');
    comp.modalMotivoAdmin.set('');
    await comp.submitModal();
    expect(comp.modalError()).toContain('motivo administrativo');

    // CORREGIR con motivo administrativo -> éxito
    comp.modalMotivoAdmin.set('Captura en mes equivocado');
    await comp.submitModal();
    expect(rhServiceMock.actualizarEstadoAsistencia).toHaveBeenCalledTimes(1);
    expect(comp.modalOpen()).toBeFalse();
  });

  it('descarta respuestas HTTP obsoletas y oculta acciones si canAdminister es false', async () => {
    let resolveFirst!: (val: RhAsistenciaSeguimientoResponse) => void;
    let resolveSecond!: (val: RhAsistenciaSeguimientoResponse) => void;
    let callCount = 0;

    rhServiceMock.getAsistenciaSeguimiento.and.callFake(() => {
      callCount++;
      return new Promise((res) => {
        if (callCount === 1) resolveFirst = res;
        else resolveSecond = res;
      });
    });

    const fixture = TestBed.createComponent(RhAsistenciaControlComponent);
    fixture.componentInstance.canAdminister = false;
    fixture.detectChanges();

    // Dispara segunda consulta antes de que resuelva la primera
    fixture.componentInstance.onMesChange(9);

    resolveSecond(makeResponse([makeItem({ persona_id: 99, nombre_completo: 'ACTUAL' })]));
    await fixture.whenStable();
    resolveFirst(makeResponse([makeItem({ persona_id: 1, nombre_completo: 'OBSOLETO' })]));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.items()[0].nombre_completo).toBe('ACTUAL');
    const html = fixture.nativeElement.textContent as string;
    expect(html).not.toContain('Confirmar recepción');
  });

  it('precarga defaultUnidadId (177 u otra unidad) y no sobrescribe selección manual ante actualizaciones del contexto', async () => {
    rhServiceMock.getAsistenciaSeguimiento.and.resolveTo(makeResponse([makeItem()]));

    const fixture = TestBed.createComponent(RhAsistenciaControlComponent);
    fixture.componentInstance.defaultUnidadId = 177;
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.selectedUnidadId()).toBe(177);
    expect(rhServiceMock.getAsistenciaSeguimiento.calls.mostRecent().args[0].unidadId).toBe(177);

    // Selección manual del usuario a unidad 20
    fixture.componentInstance.onUnidadChange(20);
    await fixture.whenStable();
    expect(fixture.componentInstance.selectedUnidadId()).toBe(20);

    // Actualización posterior del input desde el padre NO debe sobrescribir la selección manual
    fixture.componentInstance.defaultUnidadId = 177;
    fixture.componentInstance.ngOnChanges({
      defaultUnidadId: { currentValue: 177, previousValue: 177, firstChange: false, isFirstChange: () => false },
    });
    expect(fixture.componentInstance.selectedUnidadId()).toBe(20);
  });
});
