import { fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import {
  RhAsistenciaControlComponent,
  resolveBajaCaliforniaYearMonth,
} from './rh-asistencia-control.component';
import {
  RhAsistenciaSeguimientoItemDto,
  RhAsistenciaCeldaAnual,
  RhAsistenciaMatrizAnualResponse,
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
      'getAsistenciaMatrizAnual',
      'confirmarRecepcionAsistencia',
      'actualizarEstadoAsistencia',
    ]);

    await TestBed.configureTestingModule({
      imports: [RhAsistenciaControlComponent],
      providers: [{ provide: RhService, useValue: rhServiceMock }],
    }).compileComponents();
  });

  function prepararMatriz() {
    const estados: RhAsistenciaCeldaAnual['estado_control'][] = [
      null, 'RECIBIDA', 'RECIBIDA', 'OBSERVADA', 'NO_APLICA', null, 'PENDIENTE', 'ENTREGADA_DECLARADA',
    ];
    const meses: RhAsistenciaCeldaAnual[] = Array.from({ length: 12 }, (_, i) => ({
      mes: i + 1, unidad_medica_id: i >= 6 ? 20 : 10,
      estado_control: estados[i] ?? null,
      situacion_seguimiento: i === 5 ? 'ELEGIBILIDAD_INCIERTA' : i === 4 ? 'NO_APLICABLE_DOCUMENTADO' :
        estados[i] ? 'REGISTRO_EXPLICITO' : 'SIN_REGISTRO_CONTROL',
      origen_registro: i === 2 ? 'MIGRACION_HISTORICA_EXCEL' : estados[i] ? 'CAPTURA_SISTEMA' : null,
      control_id: estados[i] ? i : null,
      fecha_recepcion: i === 1 ? '2026-02-03T00:00:00Z' : null,
      excepcion_administrativa: i === 4, motivo_excepcion: i === 4 ? 'TRANSFERENCIA' : null,
    }));
    const respuesta: RhAsistenciaMatrizAnualResponse = {
      anio: 2026, unidad_medica_id: null, situacion: 'ACTIVOS', page: 1, pageSize: 20, total: 45,
      items: [{
        persona_id: 1, nombre_completo: 'Persona sintética', puesto_referencia: 'Puesto',
        unidad_medica_id: 20, unidad_medica_nombre: 'Unidad actual', situacion_actual: 'ACTIVO', fecha_ingreso: null, meses,
      }],
    };
    rhServiceMock.getAsistenciaSeguimiento.and.resolveTo(makeResponse([]));
    rhServiceMock.getAsistenciaMatrizAnual.and.resolveTo(respuesta);
    const fixture = TestBed.createComponent(RhAsistenciaControlComponent);
    fixture.detectChanges();
    flushMicrotasks();
    const root: HTMLElement = fixture.nativeElement;
    const boton = (label: string, scope: ParentNode = root) =>
      Array.from(scope.querySelectorAll('button')).find((b) => b.textContent?.trim() === label)!;
    boton('Recepción rápida').click();
    flushMicrotasks();
    fixture.detectChanges();
    const componente = fixture.componentInstance;
    const dialogo = root.querySelector('dialog')!;
    const celda = (mes: number) => root.querySelectorAll('table td')[mes - 1].querySelector('button')!;
    return { fixture, root, boton, componente, dialogo, celda, respuesta };
  }

  it('cambia de vista y renderiza doce meses en tabla desplazable y tarjeta móvil', fakeAsync(() => {
    const { root, boton, fixture, componente, celda, dialogo } = prepararMatriz();
    expect(componente.vista()).toBe('anual');
    expect(Array.from(root.querySelectorAll('thead th .sr-only')).map((el) => el.textContent)).toEqual([
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre',
      'Noviembre', 'Diciembre',
    ]);
    expect(root.querySelector('table')?.parentElement?.classList).toContain('overflow-x-auto');
    expect(root.querySelector('table tbody th')?.classList).toContain('sticky');
    expect(root.querySelectorAll('.md\\:hidden article button').length).toBe(11);
    expect(Array.from(root.querySelectorAll('table td')).slice(0, 8).map((td) => td.textContent?.trim()))
      .toEqual(['', '✓', '✓', '!', 'N/A', '', '', '']);
    celda(4).click();
    expect(boton('Confirmar retiro', dialogo)).toBeUndefined();
    boton('Abrir en control mensual', dialogo).click();
    flushMicrotasks();
    expect(componente.vista()).toBe('mensual');
    expect(rhServiceMock.getAsistenciaSeguimiento.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({
      anio: componente.selectedAnio(), mes: 4, q: 'Persona sintética', unidadId: 10,
    }));
    expect(rhServiceMock.confirmarRecepcionAsistencia).not.toHaveBeenCalled();
  }));

  it('filtra antes de paginar, aplica debounce y descarta respuestas anteriores', fakeAsync(() => {
    const { componente, respuesta } = prepararMatriz();
    let responderAnterior!: (data: RhAsistenciaMatrizAnualResponse) => void;
    rhServiceMock.getAsistenciaMatrizAnual.and.returnValue(new Promise((resolve) => { responderAnterior = resolve; }));
    componente.goToPage(2);
    expect(rhServiceMock.getAsistenciaMatrizAnual.calls.mostRecent().args[0].page).toBe(2);
    componente.onSearchInput('Sintética');
    responderAnterior({ ...respuesta, items: [], total: 0 });
    flushMicrotasks();
    expect(componente.total()).toBe(45);
    rhServiceMock.getAsistenciaMatrizAnual.and.resolveTo(respuesta);
    tick(299);
    expect(rhServiceMock.getAsistenciaMatrizAnual.calls.count()).toBe(2);
    tick(1);
    expect(rhServiceMock.getAsistenciaMatrizAnual.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({
      page: 1, q: 'Sintética', situacion: 'ACTIVOS',
    }));
    componente.onUnidadChange(10);
    componente.onSituacionChange('BAJAS');
    expect(rhServiceMock.getAsistenciaMatrizAnual.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({
      page: 1, unidadId: 10, situacion: 'BAJAS',
    }));
    componente.onSituacionChange('TODOS');
    expect(rhServiceMock.getAsistenciaMatrizAnual.calls.mostRecent().args[0].situacion).toBe('TODOS');
    flushMicrotasks();
  }));

  it('mantiene el desbordamiento dentro de la tabla a 375, 768, 1024 y 1440 px', fakeAsync(() => {
    const { root } = prepararMatriz();
    const iframe = document.createElement('iframe');
    iframe.title = 'Comprobación de anchos de la matriz';
    iframe.style.cssText = 'position:fixed;left:-2000px;top:0;height:600px;border:0';
    document.body.append(iframe);
    try {
      const doc = iframe.contentDocument!;
      const frame = iframe.contentWindow!;
      const estilos = doc.createElement('style');
      estilos.textContent = Array.from(document.styleSheets)
        .flatMap((sheet) => Array.from(sheet.cssRules, (rule) => rule.cssText)).join('\n');
      doc.head.append(estilos);
      doc.body.append(doc.importNode(root, true));
      const tabla = doc.querySelector('table')!;
      const tarjetas = doc.querySelector('article')!.parentElement!;
      for (const ancho of [375, 768, 1024, 1440]) {
        iframe.style.width = `${ancho}px`;
        expect(frame.getComputedStyle(tabla.parentElement!).display === 'none').toBe(ancho < 768);
        expect(frame.getComputedStyle(tarjetas).display === 'none').toBe(ancho >= 768);
        expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(ancho);
        if (ancho === 768 || ancho === 1024) {
          const contenedor = tabla.parentElement!;
          expect(contenedor.scrollWidth).toBeGreaterThan(contenedor.clientWidth);
        }
      }
    } finally {
      iframe.remove();
    }
  }));

  it('calcula N/A por ingreso posterior y deja vacío cuando se desconoce la fecha', fakeAsync(() => {
    const { componente, celda, root, fixture, respuesta } = prepararMatriz();
    expect(celda(6).textContent?.trim()).toBe('');
    componente.onAnioChange(2026);
    flushMicrotasks();
    componente.matriz.set([{ ...respuesta.items[0], fecha_ingreso: '2026-07-15' }]);
    fixture.detectChanges();
    expect(celda(6)).toBeNull();
    expect(root.querySelectorAll('table td')[5].textContent?.trim()).toBe('N/A');
    expect(celda(7).textContent?.trim()).toBe('');
    expect(rhServiceMock.confirmarRecepcionAsistencia).not.toHaveBeenCalled();
  }));

  it('mantiene la palomita histórica y abre solo una consulta sin retiro', fakeAsync(() => {
    const { componente, celda, boton, dialogo } = prepararMatriz();
    expect(celda(3).textContent?.trim()).toBe('✓');
    celda(3).click();
    expect(dialogo.textContent).toContain('Recibida histórica');
    expect(dialogo.textContent).toContain('Recepción histórica protegida');
    expect(boton('Confirmar retiro', dialogo)).toBeUndefined();
    expect(dialogo.querySelector('textarea')).toBeNull();
    componente.motivoRetiro.set('Intento sintético');
    componente.retirarMarca(dialogo);
    expect(rhServiceMock.actualizarEstadoAsistencia).not.toHaveBeenCalled();
    expect(componente.matriz()[0].meses[2].estado_control).toBe('RECIBIDA');
  }));

  it('retira una marca ordinaria como PENDIENTE solo después de confirmar con motivo', fakeAsync(() => {
    const { componente, celda, boton, dialogo, fixture, respuesta } = prepararMatriz();
    celda(2).click();
    expect(boton('Confirmar retiro', dialogo).disabled).toBeTrue();
    boton('Cancelar', dialogo).click();
    expect(rhServiceMock.actualizarEstadoAsistencia).not.toHaveBeenCalled();
    celda(2).click();
    const [persona] = respuesta.items;
    const ordinaria = persona.meses[1];
    const pendiente = { ...ordinaria, estado_control: 'PENDIENTE' as const };
    rhServiceMock.getAsistenciaMatrizAnual.and.resolveTo({
      ...respuesta, items: [{ ...persona, meses: persona.meses.map((mes) => mes.mes === 2 ? pendiente : mes) }],
    });
    rhServiceMock.actualizarEstadoAsistencia.and.resolveTo({
      registro: { id: ordinaria.control_id, estado: 'PENDIENTE' },
      estado_anterior: 'RECIBIDA', idempotente: false, evento_auditoria: 'RH_ASISTENCIA_RECEPCION_CORREGIDA',
    } as Awaited<ReturnType<RhService['actualizarEstadoAsistencia']>>);
    componente.motivoRetiro.set(' Corrección documentada ');
    fixture.detectChanges();
    boton('Confirmar retiro', dialogo).click();
    componente.retirarMarca(dialogo);
    expect(rhServiceMock.actualizarEstadoAsistencia).toHaveBeenCalledOnceWith(1, componente.selectedAnio(), 2, {
      estado: 'PENDIENTE', motivo_administrativo: 'Corrección documentada',
    });
    flushMicrotasks();
    expect(componente.matriz()[0].meses[1].origen_registro).toBe('CAPTURA_SISTEMA');
    expect(componente.matriz()[0].meses[1].estado_control).toBe('PENDIENTE');
    expect(dialogo.open).toBeFalse();
  }));

  it('registra con un clic, bloquea doble envío, muestra error y conserva filtros', fakeAsync(() => {
    const { componente, celda, root, dialogo, fixture, respuesta } = prepararMatriz();
    componente.onUnidadChange(10);
    componente.goToPage(2);
    flushMicrotasks();
    fixture.detectChanges();
    rhServiceMock.confirmarRecepcionAsistencia.and.rejectWith(new HttpErrorResponse({
      status: 500, error: { error: 'Fallo simulado' },
    }));
    celda(1).click();
    celda(1).click();
    expect(rhServiceMock.confirmarRecepcionAsistencia).toHaveBeenCalledOnceWith(1, componente.selectedAnio(), 1, {
      unidad_medica_id: 10,
    });
    flushMicrotasks();
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')).not.toBeNull();
    expect(componente.matriz()[0].meses[0].estado_control).toBeNull();

    const registro = {
      id: 42, persona_id: 1, anio: componente.selectedAnio(), mes: 1, unidad_medica_id: 10,
      adscripcion_laboral_id: null, estado: 'RECIBIDA' as const, fecha_recepcion: '2026-01-31T00:00:00Z',
      recibido_por: null, observaciones: null, excepcion_administrativa: false, motivo_excepcion: null,
      generado_docx_en: null, generaciones_docx_count: 0, entrega_declarada_en: null, actualizado_en: '',
    };
    rhServiceMock.confirmarRecepcionAsistencia.and.resolveTo({
      registro, estado_anterior: null, idempotente: false, evento_auditoria: null,
    });
    const [persona] = respuesta.items;
    rhServiceMock.getAsistenciaMatrizAnual.and.resolveTo({
      ...respuesta, page: 2, items: [{ ...persona, meses: persona.meses.map((mes) => mes.mes === 1
        ? { ...mes, estado_control: 'RECIBIDA', origen_registro: 'CAPTURA_SISTEMA', control_id: 42 } : mes) }],
    });
    celda(1).click();
    flushMicrotasks();
    expect(dialogo.open).toBeFalse();
    expect(componente.matriz()[0].meses[0].estado_control).toBe('RECIBIDA');
    expect(rhServiceMock.getAsistenciaMatrizAnual.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({
      page: 2, unidadId: 10, situacion: 'ACTIVOS',
    }));
  }));

  for (const [filtro, cambiar] of [
    ['año', (c: RhAsistenciaControlComponent) => c.onAnioChange(2025)],
    ['unidad', (c: RhAsistenciaControlComponent) => c.onUnidadChange(25)],
    ['página', (c: RhAsistenciaControlComponent) => c.goToPage(2)],
    ['búsqueda', (c: RhAsistenciaControlComponent) => { c.onSearchInput('Sintética'); tick(300); }],
    ['situación', (c: RhAsistenciaControlComponent) => c.onSituacionChange('BAJAS')],
  ] as const) {
    it(`ignora el PATCH tardío después de cambiar ${filtro}`, fakeAsync(() => {
      const { componente, celda, fixture } = prepararMatriz();
      componente.onAnioChange(2026);
      flushMicrotasks();
      fixture.detectChanges();
      let terminar!: (resultado: Awaited<ReturnType<RhService['confirmarRecepcionAsistencia']>>) => void;
      rhServiceMock.confirmarRecepcionAsistencia.and.returnValue(new Promise((resolve) => { terminar = resolve; }));
      celda(1).click();
      cambiar(componente);
      flushMicrotasks();
      const filas = componente.matriz();
      const consultas = rhServiceMock.getAsistenciaMatrizAnual.calls.count();
      terminar({ idempotente: false } as Awaited<ReturnType<RhService['confirmarRecepcionAsistencia']>>);
      flushMicrotasks();
      expect(componente.matriz()).toBe(filas);
      expect(componente.matriz()[0].meses[0].estado_control).toBeNull();
      expect(rhServiceMock.getAsistenciaMatrizAnual.calls.count()).toBe(consultas);
      expect(rhServiceMock.confirmarRecepcionAsistencia).toHaveBeenCalledOnceWith(1, 2026, 1, jasmine.any(Object));
      expect(componente.guardandoCelda()).toBeFalse();
      expect(componente.loading()).toBeFalse();
    }));
  }

  it('un error PATCH tardío no sustituye los resultados ni el aviso de la consulta nueva', fakeAsync(() => {
    const { componente, celda } = prepararMatriz();
    let rechazar!: (error: Error) => void;
    rhServiceMock.confirmarRecepcionAsistencia.and.returnValue(new Promise((_, reject) => { rechazar = reject; }));
    celda(1).click();
    componente.onUnidadChange(25);
    flushMicrotasks();
    const filas = componente.matriz();
    rechazar(new Error('Fallo tardío de recepción'));
    flushMicrotasks();
    expect(componente.matriz()).toBe(filas);
    expect(componente.errorMessage()).toBeNull();
    expect(componente.guardandoCelda()).toBeFalse();
  }));

  it('deja la matriz vacía si la recarga posterior a la recepción falla', fakeAsync(() => {
    const { componente, celda } = prepararMatriz();
    rhServiceMock.confirmarRecepcionAsistencia.and.resolveTo(
      { idempotente: false } as Awaited<ReturnType<RhService['confirmarRecepcionAsistencia']>>
    );
    rhServiceMock.getAsistenciaMatrizAnual.and.rejectWith(new Error('Fallo al recargar'));
    celda(1).click();
    flushMicrotasks();
    expect(componente.matriz()).toEqual([]);
    expect(componente.errorMessage()).toContain('Fallo al recargar');
    expect(componente.feedbackSuccess()).toContain('Recepción confirmada');
    expect(componente.loading()).toBeFalse();
    expect(componente.guardandoCelda()).toBeFalse();
  }));

  it('muestra la recepción histórica mensual y oculta las acciones en tabla y tarjetas', fakeAsync(() => {
    rhServiceMock.getAsistenciaSeguimiento.and.resolveTo(makeResponse([makeItem({
      estado_control: 'RECIBIDA', origen_registro: 'MIGRACION_HISTORICA_EXCEL',
      tiene_registro_control: true, control_id: 17,
    })]));
    const fixture = TestBed.createComponent(RhAsistenciaControlComponent);
    fixture.detectChanges();
    flushMicrotasks();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.textContent?.match(/✓ Recibida histórica/g)?.length).toBe(2);
    expect(root.textContent?.match(/Recepción histórica protegida/g)?.length).toBe(2);
    expect(root.textContent).not.toMatch(/\b(Observar|Corregir|Confirmar recepción)\b/);
    const comp = fixture.componentInstance;
    comp.openModal('CORREGIR', comp.items()[0]);
    void comp.onConfirmarRecepcion(comp.items()[0]);
    expect(comp.modalOpen()).toBeFalse();
    expect(rhServiceMock.confirmarRecepcionAsistencia).not.toHaveBeenCalled();
  }));

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
    const p1 = comp.onConfirmarRecepcion(comp.items()[0]);
    const p2 = comp.onConfirmarRecepcion(comp.items()[0]); // doble envío ignorado
    expect(rhServiceMock.confirmarRecepcionAsistencia).toHaveBeenCalledTimes(1);

    resolveMutation({ registro: { estado: 'RECIBIDA' }, estado_anterior: null, idempotente: false, evento_auditoria: 'RH_ASISTENCIA_RECEPCION_CONFIRMADA' });
    await Promise.all([p1, p2]);
    expect(comp.feedbackSuccess()).toContain('Recepción confirmada');

    // Error de recepción
    rhServiceMock.confirmarRecepcionAsistencia.and.rejectWith(new Error('Fallo de red'));
    await comp.onConfirmarRecepcion(comp.items()[0]);
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
    rhServiceMock.getAsistenciaSeguimiento.and.resolveTo(makeResponse([itemRecibida, makeItem({ persona_id: 12 })]));
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
    comp.openModal('OBSERVADA', comp.items()[1]);
    comp.modalObservaciones.set('');
    await comp.submitModal();
    expect(comp.modalError()).toContain('observaciones');

    // NO_APLICA sin motivo -> error
    comp.openModal('NO_APLICA', comp.items()[1]);
    comp.modalMotivoExcepcion.set('');
    await comp.submitModal();
    expect(comp.modalError()).toContain('motivo de excepción');

    // CORREGIR sin motivo administrativo -> error
    comp.openModal('CORREGIR', comp.items()[0]);
    comp.modalNuevoEstado.set('PENDIENTE');
    comp.modalMotivoAdmin.set('');
    await comp.submitModal();
    expect(comp.modalError()).toContain('motivo administrativo');

    // CORREGIR con motivo administrativo -> éxito
    comp.modalMotivoAdmin.set('Captura en mes equivocado');
    await comp.submitModal();
    expect(rhServiceMock.actualizarEstadoAsistencia).toHaveBeenCalledTimes(1);
    expect(rhServiceMock.actualizarEstadoAsistencia).toHaveBeenCalledWith(
      11, comp.selectedAnio(), comp.selectedMes(), jasmine.objectContaining({ estado: 'PENDIENTE' })
    );
    expect(comp.modalOpen()).toBeFalse();
  });

  it('invalida filas y modal al cambiar de agosto a septiembre, incluso si falla el GET', fakeAsync(() => {
    const persona = makeItem({ persona_id: 41 });
    rhServiceMock.getAsistenciaSeguimiento.and.resolveTo(makeResponse([persona]));
    const fixture = TestBed.createComponent(RhAsistenciaControlComponent);
    const comp = fixture.componentInstance;
    comp.selectedAnio.set(2026);
    comp.selectedMes.set(8);
    fixture.detectChanges();
    flushMicrotasks();
    const anterior = comp.items()[0];
    comp.openModal('OBSERVADA', anterior);
    comp.modalObservaciones.set('Observación de prueba');
    expect(comp.modalOpen()).toBeTrue();

    let rechazar!: (error: unknown) => void;
    rhServiceMock.getAsistenciaSeguimiento.and.returnValue(new Promise((_, reject) => { rechazar = reject; }));
    comp.onMesChange(9);
    fixture.detectChanges();
    expect(comp.modalOpen()).toBeFalse();
    expect(comp.items()).toEqual([]);
    expect(fixture.nativeElement.textContent).not.toContain(anterior.nombre_completo);
    void comp.submitModal();
    void comp.onConfirmarRecepcion(anterior);
    rechazar(new HttpErrorResponse({ status: 500 }));
    flushMicrotasks();
    expect(comp.errorMessage()).toBeTruthy();
    expect(comp.items()).toEqual([]);
    comp.openModal('CORREGIR', anterior);
    expect(comp.modalOpen()).toBeFalse();
    expect(rhServiceMock.actualizarEstadoAsistencia).not.toHaveBeenCalled();
    expect(rhServiceMock.confirmarRecepcionAsistencia).not.toHaveBeenCalled();
  }));

  it('mantiene el año y mes de una recepción en curso y descarta filas tardías', fakeAsync(() => {
    const persona = makeItem({ persona_id: 41 });
    rhServiceMock.getAsistenciaSeguimiento.and.resolveTo(makeResponse([persona]));
    const fixture = TestBed.createComponent(RhAsistenciaControlComponent);
    const comp = fixture.componentInstance;
    comp.selectedAnio.set(2026);
    comp.selectedMes.set(8);
    fixture.detectChanges();
    flushMicrotasks();
    const anterior = comp.items()[0];
    let terminar!: (value: Awaited<ReturnType<RhService['confirmarRecepcionAsistencia']>>) => void;
    rhServiceMock.confirmarRecepcionAsistencia.and.returnValue(new Promise((resolve) => { terminar = resolve; }));
    void comp.onConfirmarRecepcion(anterior);

    let tardia!: (value: RhAsistenciaSeguimientoResponse) => void;
    rhServiceMock.getAsistenciaSeguimiento.and.returnValue(new Promise((resolve) => { tardia = resolve; }));
    comp.onAnioChange(2027);
    expect(comp.items()).toEqual([]);
    void comp.onConfirmarRecepcion(anterior);
    rhServiceMock.getAsistenciaSeguimiento.and.resolveTo(makeResponse([persona]));
    comp.onMesChange(9);
    flushMicrotasks();
    tardia(makeResponse([makeItem({ persona_id: 500 })]));
    flushMicrotasks();
    expect(comp.items()[0].persona_id).toBe(41);
    expect(rhServiceMock.confirmarRecepcionAsistencia).toHaveBeenCalledOnceWith(41, 2026, 8, jasmine.any(Object));
    terminar({ registro: { estado: 'RECIBIDA' }, idempotente: false } as Awaited<ReturnType<RhService['confirmarRecepcionAsistencia']>>);
    flushMicrotasks();
    void comp.onConfirmarRecepcion(anterior);
    expect(rhServiceMock.confirmarRecepcionAsistencia).toHaveBeenCalledTimes(1);
    void comp.onConfirmarRecepcion(comp.items()[0]);
    expect(rhServiceMock.confirmarRecepcionAsistencia).toHaveBeenCalledWith(41, 2027, 9, jasmine.any(Object));
    flushMicrotasks();
  }));

  it('invalida acciones en el intervalo de debounce de la búsqueda mensual', fakeAsync(() => {
    rhServiceMock.getAsistenciaSeguimiento.and.resolveTo(makeResponse([makeItem()]));
    const fixture = TestBed.createComponent(RhAsistenciaControlComponent);
    fixture.detectChanges();
    flushMicrotasks();
    const comp = fixture.componentInstance;
    const anterior = comp.items()[0];
    comp.onSearchInput('Otra persona');
    void comp.onConfirmarRecepcion(anterior);
    expect(comp.items()).toEqual([]);
    expect(rhServiceMock.confirmarRecepcionAsistencia).not.toHaveBeenCalled();
    tick(300);
    expect(rhServiceMock.getAsistenciaSeguimiento.calls.mostRecent().args[0].q).toBe('Otra persona');
  }));

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
