import { fakeAsync, flushMicrotasks, TestBed } from '@angular/core/testing';
import { RhMiHistorialAsistenciaResponse, RhService } from '../../../services/rh.service';
import { RhAsistenciaDocxService } from './rh-asistencia-docx.service';
import { RhMiListaAsistenciaComponent } from './rh-mi-lista-asistencia.component';

function datos(anio = 2026): RhMiHistorialAsistenciaResponse {
  const estados = {
    2: 'RECIBIDA', 3: 'RECIBIDA', 4: 'NO_APLICA', 7: 'OBSERVADA', 8: 'ENTREGADA_DECLARADA', 11: 'RECIBIDA',
  } as const;
  return {
    anio, ultimo_mes_cerrado: 10,
    meses: Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1;
      const estado = estados[mes as keyof typeof estados] ?? null;
      return {
        mes, estado_control: estado,
        elegibilidad: mes === 1 || mes === 4 ? 'NO_CORRESPONDE' : mes === 6 ? 'INCIERTA' : 'EVALUABLE',
        origen_registro: mes === 3 ? 'MIGRACION_HISTORICA_EXCEL' : estado ? 'CAPTURA_SISTEMA' : null,
        fecha_recepcion: mes === 2 ? '2026-02-25T12:00:00Z' : null,
        es_mes_cerrado: mes <= 10, requiere_atencion: [3, 6, 7, 8].includes(mes),
      };
    }),
    resumen: {
      sin_recepcion_registrada: [5, 9, 10],
      requieren_atencion: [3, 6, 7, 8], no_corresponden: [1, 4], recibidas: [2, 3],
    },
  };
}

describe('Historial personal de asistencia', () => {
  const historial = jasmine.createSpy('obtenerMiHistorialAsistencia');
  const vacaciones = jasmine.createSpy('obtenerMisFechasVacacionales');
  const descargar = jasmine.createSpy('downloadAttendanceDocxFromParams');
  beforeEach(() => {
    historial.calls.reset();
    vacaciones.calls.reset();
    vacaciones.and.callFake((anio: number, mes: number) => Promise.resolve({ anio, mes, fechas: [] }));
    historial.and.callFake((anio: number) => Promise.resolve(datos(anio)));
    descargar.calls.reset();
    descargar.and.resolveTo('lista.docx');
    TestBed.configureTestingModule({
      imports: [RhMiListaAsistenciaComponent],
      providers: [
        { provide: RhService, useValue: {
          obtenerMiHistorialAsistencia: historial, obtenerMisFechasVacacionales: vacaciones,
        } },
        { provide: RhAsistenciaDocxService, useValue: { downloadAttendanceDocxFromParams: descargar } },
      ],
    });
  });

  function crear() {
    const fixture = TestBed.createComponent(RhMiListaAsistenciaComponent);
    fixture.componentInstance.selectedYear.set(2026);
    fixture.componentInstance.selectedMonth.set(7);
    fixture.componentRef.setInput('contexto', {
      persona: { nombre_completo: 'Persona de prueba' }, adscripciones: [], unidad_referencia: null,
    });
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    return { fixture, root, componente: fixture.componentInstance };
  }

  it('muestra doce meses, atención separada, recepción del mes abierto y permite descargar históricos', fakeAsync(() => {
    const respuesta = datos();
    respuesta.resumen.sin_recepcion_registrada = [5, 6, 9, 10];
    respuesta.resumen.requieren_atencion = [3, 7, 8];
    respuesta.meses[5].elegibilidad = 'EVALUABLE';
    respuesta.meses[5].requiere_atencion = false;
    historial.and.resolveTo(respuesta);
    const { fixture, root, componente } = crear();
    expect(root.textContent).toContain('Consultando tu historial');
    flushMicrotasks();
    fixture.detectChanges();
    const celdas = Array.from(root.querySelectorAll<HTMLButtonElement>('ul[aria-label="Meses del historial"] button'));
    expect(celdas.map((e) => e.firstElementChild?.textContent)).toEqual(componente.monthsCatalog.map((m) => m.label));
    expect(celdas.map((e) => e.lastElementChild?.textContent?.trim())).toEqual(
      ['N/A', '✓', '✓', 'N/A', '', '', '!', '!', '', '', '✓', '']
    );
    expect(celdas[11].title).toBe('Periodo sin cerrar');
    expect(root.textContent).toContain('Tienes 4 listas pendientes de registro');
    expect(root.textContent).toContain('mayo, junio, septiembre y octubre');
    expect(root.textContent).toContain('Hay 3 meses que requieren revisión');
    celdas[2].click();
    flushMicrotasks();
    fixture.detectChanges();
    expect(celdas[2].getAttribute('aria-pressed')).toBe('true');
    expect(root.textContent).toContain('RH ya registró la recepción de tu lista de marzo de 2026.');
    expect(root.textContent).toContain('fecha original no disponible');
    componente.draftPuesto.set('Puesto de prueba');
    const boton = root.querySelector<HTMLButtonElement>('#rh-asistencia-download-btn')!;
    expect(boton.disabled).toBeFalse();
    boton.click();
    flushMicrotasks();
    expect(descargar).toHaveBeenCalledOnceWith(jasmine.objectContaining({ anio: 2026, mes: 3 }));
    celdas[10].click();
    fixture.detectChanges();
    expect(root.textContent).toContain('recepción de tu lista de noviembre');
  }));

  it('presenta la incertidumbre accesible y evita duplicar meses entre resúmenes', fakeAsync(() => {
    const respuesta = datos();
    respuesta.resumen.sin_recepcion_registrada = [3];
    historial.and.resolveTo(respuesta);
    const { fixture, root } = crear();
    flushMicrotasks();
    fixture.detectChanges();
    const celdas = root.querySelectorAll<HTMLButtonElement>('ul[aria-label="Meses del historial"] button');
    expect(celdas[5].title).toContain('Información laboral insuficiente');
    expect(celdas[5].lastElementChild?.textContent?.trim()).toBe('');
    expect(root.textContent).toContain('Sin listas pendientes de registro entre los meses cerrados evaluados');
    expect(root.textContent).toContain('Hay 4 meses que requieren revisión');
  }));

  it('actualiza el historial con un solo GET y conserva el formulario, el periodo y vacaciones', fakeAsync(() => {
    const { fixture, root, componente } = crear();
    flushMicrotasks();
    componente.onMonthChange(9);
    flushMicrotasks();
    componente.draftNombre.set('Nombre editado');
    componente.draftPuesto.set('Puesto editado');
    componente.draftAdscripcion.set('Unidad editada');
    componente.draftJornada.set('Jornada editada');
    componente.draftHorario.set('Horario editado');
    fixture.detectChanges();
    expect(root.textContent).toContain('Tienes 3 listas pendientes de registro');
    const llamadasVacaciones = vacaciones.calls.count();
    let resolver!: (value: RhMiHistorialAsistenciaResponse) => void;
    historial.and.returnValue(new Promise((resolve) => { resolver = resolve; }));
    const boton = root.querySelector<HTMLButtonElement>('#rh-asistencia-actualizar-historial')!;
    boton.click();
    boton.click();
    fixture.detectChanges();
    expect(boton.disabled).toBeTrue();
    expect(root.textContent).toContain('Consultando tu historial');
    expect(historial.calls.allArgs()).toEqual([[2026], [2026]]);
    const respuesta = datos();
    respuesta.meses[8].estado_control = 'RECIBIDA';
    respuesta.meses[8].origen_registro = 'CAPTURA_SISTEMA';
    respuesta.resumen.recibidas.push(9);
    respuesta.resumen.sin_recepcion_registrada = [5, 10];
    respuesta.resumen.requieren_atencion = [3, 7, 8];
    resolver(respuesta);
    flushMicrotasks();
    fixture.detectChanges();
    expect(boton.disabled).toBeFalse();
    expect(root.textContent).toContain('Tienes 2 listas pendientes de registro');
    expect(root.textContent).toContain('Hay 3 meses que requieren revisión');
    expect(root.textContent).toContain('RH ya registró la recepción de tu lista de septiembre de 2026.');
    const septiembre = root.querySelectorAll('ul[aria-label="Meses del historial"] button')[8];
    expect(septiembre.lastElementChild?.textContent?.trim()).toBe('✓');
    expect(septiembre.getAttribute('aria-pressed')).toBe('true');
    expect(componente.selectedYear()).toBe(2026);
    expect(componente.selectedMonth()).toBe(9);
    expect([componente.draftNombre(), componente.draftPuesto(), componente.draftAdscripcion(),
      componente.draftJornada(), componente.draftHorario()]).toEqual([
      'Nombre editado', 'Puesto editado', 'Unidad editada', 'Jornada editada', 'Horario editado',
    ]);
    expect(vacaciones.calls.count()).toBe(llamadasVacaciones);
  }));

  it('ignora una actualización tardía al cambiar de año, conserva la descarga y permite reintentar', fakeAsync(() => {
    const { fixture, root, componente } = crear();
    flushMicrotasks();
    fixture.detectChanges();
    let resolver!: (value: RhMiHistorialAsistenciaResponse) => void;
    historial.and.returnValue(new Promise((resolve) => { resolver = resolve; }));
    root.querySelector<HTMLButtonElement>('#rh-asistencia-actualizar-historial')!.click();
    historial.and.rejectWith(new Error('Error simulado'));
    componente.onYearChange(2027);
    flushMicrotasks();
    resolver(datos());
    flushMicrotasks();
    fixture.detectChanges();
    expect(historial.calls.allArgs()).toEqual([[2026], [2026], [2027]]);
    expect(root.textContent).toContain('No se pudo consultar tu historial');
    expect(root.querySelector('ul[aria-label="Meses del historial"]')).toBeNull();
    expect(root.querySelector<HTMLButtonElement>('#rh-asistencia-download-btn')?.disabled).toBeFalse();
    historial.and.resolveTo(datos(2027));
    Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
      .find((boton) => boton.textContent?.trim() === 'Reintentar')!.click();
    flushMicrotasks();
    fixture.detectChanges();
    expect(historial.calls.mostRecent().args).toEqual([2027]);
    expect(componente.historial()?.anio).toBe(2027);
    expect(root.textContent).not.toContain('No se pudo consultar tu historial');
  }));

  it('usa las fechas consolidadas del periodo, valida días y descarta respuestas obsoletas', fakeAsync(() => {
    let resolver!: (value: unknown) => void;
    vacaciones.and.returnValue(new Promise((resolve) => { resolver = resolve; }));
    const { componente, fixture, root } = crear();
    componente.draftPuesto.set('Puesto sintético');
    void componente.onDownloadDocx();
    expect(descargar).not.toHaveBeenCalled();
    vacaciones.and.callFake((anio: number, mes: number) => Promise.resolve({
      anio, mes, fechas: ['2028-02-01', '2028-02-06', '2028-02-07', '2028-02-29', '2028-02-29', '2028-02-30', '2028-03-01'],
    }));
    componente.onYearChange(2028);
    componente.onMonthChange(2);
    flushMicrotasks();
    resolver({ anio: 2026, mes: 7, fechas: ['2026-07-07'] });
    flushMicrotasks();
    fixture.detectChanges();
    expect(vacaciones.calls.allArgs()).toEqual([[2026, 7], [2028, 7], [2028, 2]]);
    expect(root.textContent).toContain('días sombreados: 2028-02-06');
    const indicadores = Array.from(root.querySelectorAll('[data-calendar-vacation]'));
    expect(indicadores.map((el) => el.closest('[data-calendar-day]')?.getAttribute('data-calendar-day')))
      .toEqual(['1', '6', '7', '29']);
    for (const [dia, clasificacion, sombreado] of [
      [1, 'Hábil', 'false'], [6, 'Fin de semana', 'true'], [7, 'Descanso general', 'true'],
    ] as const) {
      const fila = root.querySelector(`[data-calendar-day="${dia}"]`)!;
      expect(fila.textContent).toContain(clasificacion);
      expect(fila.textContent).toContain('Vacaciones');
      expect(fila.getAttribute('data-shaded')).toBe(sombreado);
    }
    void componente.onDownloadDocx();
    flushMicrotasks();
    expect(descargar).toHaveBeenCalledOnceWith(jasmine.objectContaining({
      anio: 2028, mes: 2, observacionesPorFecha: {
        '2028-02-01': 'Vacaciones', '2028-02-06': 'Vacaciones',
        '2028-02-07': 'Vacaciones', '2028-02-29': 'Vacaciones',
      },
    }));
    expect(vacaciones.calls.count()).toBe(3);
  }));

  it('limpia la vista previa al cambiar periodo y mantiene el periodo vigente ante respuestas tardías', fakeAsync(() => {
    vacaciones.and.resolveTo({ anio: 2026, mes: 7, fechas: ['2026-07-07'] });
    const { componente, fixture, root } = crear();
    flushMicrotasks();
    fixture.detectChanges();
    expect(root.querySelectorAll('[data-calendar-vacation]').length).toBe(1);
    let resolver!: (value: unknown) => void;
    vacaciones.and.returnValue(new Promise((resolve) => { resolver = resolve; }));
    componente.onMonthChange(8);
    fixture.detectChanges();
    expect(root.querySelector('[data-calendar-vacation]')).toBeNull();
    vacaciones.and.resolveTo({ anio: 2027, mes: 8, fechas: [] });
    componente.onYearChange(2027);
    flushMicrotasks();
    resolver({ anio: 2026, mes: 8, fechas: ['2026-08-09'] });
    flushMicrotasks();
    fixture.detectChanges();
    expect(root.querySelector('[data-calendar-vacation]')).toBeNull();
    expect(vacaciones.calls.allArgs()).toEqual([[2026, 7], [2026, 8], [2027, 8]]);
  }));

  it('permite omitir explícitamente tras un error y reintentar sin recordar la decisión', fakeAsync(() => {
    vacaciones.and.rejectWith(new Error('Error simulado'));
    const { componente, fixture, root } = crear();
    componente.draftPuesto.set('Puesto sintético');
    flushMicrotasks();
    fixture.detectChanges();
    expect(root.textContent).toContain('No pudimos consultar tus vacaciones para este mes.');
    expect(root.querySelector('[data-calendar-vacation]')).toBeNull();
    expect(root.textContent).toContain('Revisa las observaciones antes de imprimir.');
    void componente.onDownloadDocx();
    expect(descargar).not.toHaveBeenCalled();
    const botones = Array.from(root.querySelectorAll('button'));
    botones.find((b) => b.textContent?.trim() === 'Descargar sin autocompletar vacaciones')!.click();
    flushMicrotasks();
    expect(descargar.calls.mostRecent().args[0].observacionesPorFecha).toBeUndefined();
    expect(componente.estadoVacaciones()).toBe('error');
    vacaciones.and.resolveTo({ anio: 2026, mes: 7, fechas: [] });
    botones.find((b) => b.textContent?.trim() === 'Reintentar')!.click();
    flushMicrotasks();
    fixture.detectChanges();
    expect(componente.estadoVacaciones()).toBe('listo');
    expect(root.querySelector<HTMLButtonElement>('#rh-asistencia-download-btn')!.disabled).toBeFalse();
  }));

  it('ajusta la cuadrícula a 375 px', fakeAsync(() => {
    vacaciones.and.resolveTo({ anio: 2026, mes: 7, fechas: ['2026-07-07', '2026-07-25'] });
    const { fixture, root } = crear();
    flushMicrotasks();
    fixture.detectChanges();
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:-2000px;width:375px;height:600px;border:0';
    document.body.append(frame);
    try {
      const doc = frame.contentDocument!;
      const style = doc.createElement('style');
      style.textContent = Array.from(document.styleSheets)
        .flatMap((sheet) => Array.from(sheet.cssRules, (rule) => rule.cssText)).join('\n');
      doc.head.append(style);
      const grid = root.querySelector('ul[aria-label="Meses del historial"]')!;
      const copy = doc.importNode(grid, true);
      doc.body.append(copy);
      expect(frame.contentWindow!.getComputedStyle(copy).gridTemplateColumns.split(' ').length).toBe(3);
      expect(copy.children.length).toBe(12);
      const calendario = doc.importNode(root.querySelector('#rh-asistencia-calendar-preview')!, true);
      doc.body.append(calendario);
      expect(frame.contentWindow!.getComputedStyle(calendario).gridTemplateColumns.split(' ').length).toBe(1);
      for (const bloque of Array.from(calendario.children)) {
        const etiqueta = bloque.querySelector('[data-calendar-vacation]')!;
        const fila = etiqueta.closest('[data-calendar-day]')!.getBoundingClientRect();
        const rect = etiqueta.getBoundingClientRect();
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.right).toBeLessThanOrEqual(fila.right);
      }
      expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(375);
    } finally {
      frame.remove();
    }
  }));
});
