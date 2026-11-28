import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NgFastToastService } from 'ng-fast-toast';
import { RhSupervisionDirecta, RhTrabajadorFichaResponse } from '../../services/rh.service';
import { RhFichaTrabajadorDialogComponent } from './rh-ficha-trabajador-dialog.component';
import { RhSupervisionDirectaDialogComponent } from './rh-supervision-directa-dialog.component';

const unidad = { id: 177, nombre: 'Coordinación Estatal', cluesimb: null };
const ficha: RhTrabajadorFichaResponse = {
  unidad,
  personal: {
    persona_id: 12, nombre_completo: 'Persona de prueba', nombres: 'Persona', apellidos: 'de prueba',
    tiene_rfc: false, rfc_masked: null, tiene_curp: false, curp_masked: null, activo: true,
  },
  laboral: {
    adscripcion_laboral_id: 42, unidad_medica_id: 177, puesto: 'Analista', matricula: null, turno: null,
    jornada: null, horario: null, vigente_desde: '2025-01-01', vigente_hasta: null, activo: true, observaciones: null,
  },
  permisos: { puede_editar_laboral: true, puede_revelar_sensibles: false, puede_editar_identificacion: false },
};
const revision = '2026-11-27T00:00:00.123456Z';
const sugerencia = { persona_id: 20, nombre_completo: 'Alex Rivera', puesto_id: 5, denominacion: 'Jefatura' };
const fichaSupervision = (estado: RhSupervisionDirecta['estado'] = 'PENDIENTE'): RhSupervisionDirecta => ({
  unidad_medica_id: 177, persona_supervisada_id: 12, nombre_trabajador: ficha.personal.nombre_completo, estado,
  persona_supervisora_id: estado === 'ASIGNADO' ? 20 : null, nombre_supervisor: estado === 'ASIGNADO' ? 'Alex Rivera' : null,
  actualizado_en: estado === 'PENDIENTE' ? null : revision, revision: estado === 'PENDIENTE' ? null : revision,
  puesto_estructural: { puesto_id: 6, denominacion: 'Área de análisis', puesto_padre_id: 5 }, sugerencia,
});
const endpoint = '/unidades/177/personas/12/supervision-directa';

describe('Administración visual de jefaturas', () => {
  let fixture: ComponentFixture<RhFichaTrabajadorDialogComponent>;
  let http: HttpTestingController;
  let toast: jasmine.Spy;
  let root: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RhFichaTrabajadorDialogComponent], providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(RhFichaTrabajadorDialogComponent);
    root = fixture.nativeElement;
    http = TestBed.inject(HttpTestingController);
    toast = spyOn(TestBed.inject(NgFastToastService), 'success');
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('ficha', ficha);
    fixture.componentRef.setInput('permiteAdministrarSupervision', true);
  });

  afterEach(() => http.verify());

  const peticion = (method: 'GET' | 'PATCH') => http.expectOne((r) => r.method === method && r.url.endsWith(endpoint));
  const dialogo = () => root.querySelector<HTMLDialogElement>('dialog[open]')!;
  const boton = (texto: string) => Array.from(dialogo().querySelectorAll('button'))
    .find((b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === texto)!;
  const abrir = (estado?: RhSupervisionDirecta['estado'], cambios: Partial<RhSupervisionDirecta> = {}) => {
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('#rh-ficha-supervision')!.click();
    fixture.detectChanges();
    expect(root.querySelectorAll('dialog[open], [aria-modal="true"]').length).toBe(1);
    peticion('GET').flush({ ...fichaSupervision(estado), ...cambios });
    flushMicrotasks();
    fixture.detectChanges();
    return fixture.debugElement.query(By.directive(RhSupervisionDirectaDialogComponent)).componentInstance as RhSupervisionDirectaDialogComponent;
  };

  it('limita la entrada al permiso existente y a la unidad 177', () => {
    fixture.componentRef.setInput('permiteAdministrarSupervision', false);
    fixture.detectChanges();
    expect(root.querySelector('#rh-ficha-supervision')).toBeNull();
    fixture.componentRef.setInput('permiteAdministrarSupervision', true);
    fixture.componentRef.setInput('ficha', { ...ficha, unidad: { ...unidad, id: 10 } });
    fixture.detectChanges();
    expect(root.querySelector('#rh-ficha-supervision')).toBeNull();
  });

  it('carga pendiente, separa la sugerencia y confirma con revisión null, motivo y bloqueo', fakeAsync(() => {
    const editor = abrir();
    expect(dialogo().textContent).toContain('Pendiente de definir');
    expect(dialogo().textContent).toContain('Área de análisis');
    expect(dialogo().textContent).toContain('Coordinación Estatal · Analista');
    expect(dialogo().textContent).toContain('Sugerencia del organigrama');
    expect(document.activeElement?.id).toBe('rh-supervision-titulo');
    expect(editor.candidato()).toBeNull();
    boton('Elegir sugerencia').click();
    fixture.detectChanges();
    expect(boton('Confirmar cambio').disabled).toBeTrue();
    editor.motivo.set('  Asignación validada  ');
    fixture.detectChanges();
    boton('Confirmar cambio').click();
    void editor.confirmar();
    fixture.detectChanges();
    expect(boton('Cerrar').disabled).toBeTrue();
    expect(boton('Cancelar').disabled).toBeTrue();
    dialogo().dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(dialogo().open).toBeTrue();
    const req = peticion('PATCH');
    expect(req.request.body).toEqual({
      persona_supervisora_id: 20, motivo: 'Asignación validada', revision_esperada: null,
    });
    req.flush(fichaSupervision('ASIGNADO'));
    flushMicrotasks();
    fixture.detectChanges();
    expect(dialogo()).toBeNull();
    expect(root.textContent?.replace(/\s+/g, ' ')).toContain('Jefe asignado · Alex Rivera');
    expect(document.activeElement?.id).toBe('rh-ficha-supervision');
    expect(toast).toHaveBeenCalledOnceWith({
      title: 'Jefatura actualizada', content: 'Persona de prueba · Jefe asignado', duration: 2.5,
    });
  }));

  it('pagina homónimos, impide autorreferencia y conserva borrador ante ciclo y revisión obsoleta', fakeAsync(() => {
    const editor = abrir('ASIGNADO');
    boton('Cambiar jefe directo').click();
    fixture.detectChanges();
    editor.buscar('Al');
    tick(200);
    editor.buscar('Alex');
    tick(300);
    const buscar = (page: string) => http.expectOne((r) => r.url.endsWith('/unidades/177/personal') &&
      r.params.get('q') === 'Alex' && r.params.get('page') === page && r.params.get('situacion') === 'ACTIVOS');
    const personas = [
      { persona_id: 12, adscripcion_laboral_id: 42, nombre_completo: 'Alex Rivera', puesto: 'Analista' },
      { persona_id: 21, adscripcion_laboral_id: 81, nombre_completo: 'Alex Rivera', puesto: 'Enlace' },
    ];
    buscar('1').flush({ unidad, items: personas, page: 1, pageSize: 8, total: 9 });
    flushMicrotasks();
    fixture.detectChanges();
    const opciones = dialogo().querySelectorAll<HTMLButtonElement>('[data-supervisor]');
    expect(opciones[0].disabled).toBeTrue();
    expect(opciones[1].textContent).toContain('Enlace · Adscripción #81');
    boton('Siguiente').click();
    buscar('2').flush({ unidad, items: [personas[1]], page: 2, pageSize: 8, total: 9 });
    flushMicrotasks();
    fixture.detectChanges();
    dialogo().querySelector<HTMLButtonElement>('[data-supervisor]')!.click();
    editor.motivo.set('Cambio solicitado');
    fixture.detectChanges();
    boton('Confirmar cambio').click();
    const req = peticion('PATCH');
    expect(req.request.body).toEqual({
      persona_supervisora_id: 21, motivo: 'Cambio solicitado', revision_esperada: revision,
    });
    req.flush({ codigo: 'CICLO_SUPERVISION' }, { status: 409, statusText: 'Conflict' });
    flushMicrotasks();
    fixture.detectChanges();
    expect(dialogo().querySelector('[role="alert"]')?.textContent).toContain('formaría un ciclo');
    expect(boton('Confirmar cambio').disabled).toBeTrue();
    expect(editor.motivo()).toBe('Cambio solicitado');
    expect(editor.candidato()?.persona_id).toBe(21);
    expect(toast).not.toHaveBeenCalled();

    boton('Actualizar datos').click();
    const nueva = '2026-11-27T00:00:00.123457Z';
    peticion('GET').flush({ ...fichaSupervision('ASIGNADO'), revision: nueva });
    flushMicrotasks();
    fixture.detectChanges();
    http.expectNone((r) => r.method === 'PATCH');
    boton('Confirmar cambio').click();
    const segundo = peticion('PATCH');
    expect(segundo.request.body.revision_esperada).toBe(nueva);
    segundo.flush({ codigo: 'REVISION_OBSOLETA' }, { status: 409, statusText: 'Conflict' });
    flushMicrotasks();
    fixture.detectChanges();
    expect(dialogo().textContent).toContain('Otra persona actualizó la jefatura');
    boton('Actualizar datos').click();
    peticion('GET').flush({ ...fichaSupervision('ASIGNADO'), revision: nueva });
    flushMicrotasks();
    fixture.detectChanges();
    boton('Confirmar cambio').click();
    peticion('PATCH').flush({ ...fichaSupervision('ASIGNADO'), persona_supervisora_id: 21, nombre_supervisor: 'Alex Rivera (Enlace)' });
    flushMicrotasks();
    fixture.detectChanges();
    expect(dialogo()).toBeNull();
    expect(root.textContent).toContain('Alex Rivera (Enlace)');
  }));

  it('registra una decisión explícita sin jefe, sin buscar candidatos, y permite reintento de red', fakeAsync(() => {
    const editor = abrir('ASIGNADO');
    boton('Sin jefe directo asignado').click();
    editor.motivo.set('Decisión de RH');
    fixture.detectChanges();
    expect(dialogo().querySelector('input[type=search]')).toBeNull();
    boton('Confirmar cambio').click();
    const req = peticion('PATCH');
    expect(req.request.body).toEqual({ persona_supervisora_id: null, motivo: 'Decisión de RH', revision_esperada: revision });
    req.error(new ProgressEvent('network'));
    flushMicrotasks();
    fixture.detectChanges();
    expect(dialogo().textContent).toContain('No se pudo conectar');
    expect(toast).not.toHaveBeenCalled();
    boton('Confirmar cambio').click();
    peticion('PATCH').flush(fichaSupervision('SIN_JEFE_ASIGNADO'));
    flushMicrotasks();
    fixture.detectChanges();
    expect(root.textContent).toContain('Sin jefe directo asignado');
  }));

  it('protege el borrador y permite descartar sin escritura con un encabezado compacto', fakeAsync(() => {
    const editor = abrir('SIN_JEFE_ASIGNADO');
    const modal = dialogo();
    modal.style.maxWidth = '343px';
    const cerrar = boton('Cerrar');
    expect(cerrar.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    expect(cerrar.getBoundingClientRect().right).toBeLessThan(modal.getBoundingClientRect().right);
    expect(getComputedStyle(modal).overflowY).toBe('auto');
    boton('Asignar jefe directo').click();
    editor.motivo.set('Borrador');
    fixture.detectChanges();
    modal.click();
    expect(dialogo()).toBe(modal);
    cerrar.click();
    fixture.detectChanges();
    expect(modal.textContent).toContain('¿Descartar los cambios?');
    boton('Seguir editando').click();
    fixture.detectChanges();
    expect(editor.motivo()).toBe('Borrador');
    modal.dispatchEvent(new Event('cancel', { cancelable: true }));
    fixture.detectChanges();
    boton('Descartar cambios').click();
    fixture.detectChanges();
    expect(dialogo()).toBeNull();
    expect(document.activeElement?.id).toBe('rh-ficha-supervision');
    http.expectNone((r) => r.method === 'PATCH');
    expect(toast).not.toHaveBeenCalled();
  }));

  it('oculta la sugerencia redundante cuando ASIGNADO coincide por persona_id', fakeAsync(() => {
    abrir('ASIGNADO');
    expect(dialogo().textContent).toContain('Jefe asignado');
    expect(dialogo().textContent).not.toContain('Sugerencia del organigrama');
    expect(boton('Elegir sugerencia')).toBeUndefined();
    http.expectNone((r) => r.method === 'PATCH');
  }));

  it('muestra la sugerencia como referencia informativa cuando ASIGNADO difiere por persona_id', fakeAsync(() => {
    const sugerenciaDistinta = { ...sugerencia, persona_id: 25, nombre_completo: 'Alex Rivera', denominacion: 'Dirección' };
    const editor = abrir('ASIGNADO', { sugerencia: sugerenciaDistinta });
    expect(dialogo().textContent).toContain('Sugerencia del organigrama');
    expect(dialogo().textContent).toContain('Referencia informativa del organigrama');
    expect(boton('Elegir sugerencia')).toBeUndefined();
    expect(editor.accion()).toBeNull();
    expect(editor.candidato()).toBeNull();
    http.expectNone((r) => r.method === 'PATCH');
  }));

  it('muestra la sugerencia con acción Elegir sugerencia cuando el estado es PENDIENTE', fakeAsync(() => {
    abrir('PENDIENTE');
    expect(dialogo().textContent).toContain('Sugerencia del organigrama');
    expect(boton('Elegir sugerencia')).toBeDefined();
    http.expectNone((r) => r.method === 'PATCH');
  }));

  it('oculta la sugerencia cuando el estado es SIN_JEFE_ASIGNADO y conserva Asignar jefe directo', fakeAsync(() => {
    abrir('SIN_JEFE_ASIGNADO');
    expect(dialogo().textContent).toContain('Sin jefe directo asignado');
    expect(dialogo().textContent).not.toContain('Sugerencia del organigrama');
    expect(boton('Elegir sugerencia')).toBeUndefined();
    expect(boton('Asignar jefe directo')).toBeDefined();
    http.expectNone((r) => r.method === 'PATCH');
  }));

  it('no muestra tarjeta de sugerencia cuando sugerencia es null', fakeAsync(() => {
    abrir('PENDIENTE', { sugerencia: null });
    expect(dialogo().textContent).not.toContain('Sugerencia del organigrama');
    expect(boton('Elegir sugerencia')).toBeUndefined();
    http.expectNone((r) => r.method === 'PATCH');
  }));
});
