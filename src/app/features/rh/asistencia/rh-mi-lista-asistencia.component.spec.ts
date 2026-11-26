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
  const descargar = jasmine.createSpy('downloadAttendanceDocxFromParams');
  beforeEach(() => {
    historial.calls.reset();
    historial.and.callFake((anio: number) => Promise.resolve(datos(anio)));
    descargar.calls.reset();
    descargar.and.resolveTo('lista.docx');
    TestBed.configureTestingModule({
      imports: [RhMiListaAsistenciaComponent],
      providers: [
        { provide: RhService, useValue: { obtenerMiHistorialAsistencia: historial } },
        { provide: RhAsistenciaDocxService, useValue: { downloadAttendanceDocxFromParams: descargar } },
      ],
    });
  });

  function crear() {
    const fixture = TestBed.createComponent(RhMiListaAsistenciaComponent);
    fixture.componentInstance.selectedYear.set(2026);
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

  it('ignora la respuesta anterior y mantiene la descarga disponible ante un error', fakeAsync(() => {
    let resolver!: (value: RhMiHistorialAsistenciaResponse) => void;
    historial.and.returnValue(new Promise((resolve) => { resolver = resolve; }));
    const { fixture, root, componente } = crear();
    historial.and.rejectWith(new Error('Error simulado'));
    componente.onYearChange(2027);
    flushMicrotasks();
    resolver(datos());
    flushMicrotasks();
    fixture.detectChanges();
    expect(historial.calls.allArgs()).toEqual([[2026], [2027]]);
    expect(root.textContent).toContain('No se pudo consultar tu historial');
    expect(root.querySelector('ul[aria-label="Meses del historial"]')).toBeNull();
    expect(root.querySelector<HTMLButtonElement>('#rh-asistencia-download-btn')?.disabled).toBeFalse();
  }));

  it('ajusta la cuadrícula a 375 px', fakeAsync(() => {
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
      expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(375);
    } finally {
      frame.remove();
    }
  }));
});
