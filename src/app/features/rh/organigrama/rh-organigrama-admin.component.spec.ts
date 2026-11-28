import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NgFastToastComponent, NgFastToastService } from 'ng-fast-toast';
import { RhOrgOcupacion, RhOrgEstadoOcupacion } from '../../../services/rh.service';
import { RhOrganigramaAdminComponent } from './rh-organigrama-admin.component';
import { RhOrgOcupacionComponent } from './rh-org-ocupacion.component';

@Component({ imports: [NgFastToastComponent], template: '<ng-fast-toast />' })
class AnfitrionToastPrueba {}

const MOCK_PUESTOS = [
  { id: 1, version_id: 1, puesto_padre_id: null, denominacion: 'Coordinador Estatal IMSS-Bienestar', codigo_nivel: 'K11', nivel_jerarquico: 1, siglas_area: 'UPECE', orden_visual: 1, observaciones: null, activo: true },
  { id: 2, version_id: 1, puesto_padre_id: 1, denominacion: 'Jefe de Servicios Administrativos y Finanzas', codigo_nivel: 'M11', nivel_jerarquico: 2, siglas_area: 'SAF', orden_visual: 1, observaciones: null, activo: true },
  { id: 3, version_id: 1, puesto_padre_id: 2, denominacion: 'Departamento de Tecnologías de la Información', codigo_nivel: 'CF80003', nivel_jerarquico: 3, siglas_area: 'SAF', orden_visual: 1, observaciones: null, activo: true },
];
const revision = '2026-11-27T00:00:00.123456Z';
const ocupacion = (estado: RhOrgEstadoOcupacion, revisionActual = revision): RhOrgOcupacion => ({
  puesto_id: 2, denominacion: MOCK_PUESTOS[1].denominacion, puesto_padre_id: 1,
  unidad_medica_id: 177, estado, actualizado_en: estado === 'SIN_VINCULAR' ? null : revisionActual,
  persona_id: estado === 'OCUPADO' ? 20 : null,
  nombre_ocupante: estado === 'OCUPADO' ? 'Alex Rivera' : null,
  puesto_laboral_referencia: estado === 'OCUPADO' ? 'Analista' : null,
});

describe('RhOrganigramaAdminComponent', () => {
  let fixture: ComponentFixture<RhOrganigramaAdminComponent>;
  let component: RhOrganigramaAdminComponent;
  let httpMock: HttpTestingController;
  let exito: jasmine.Spy;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RhOrganigramaAdminComponent, NgFastToastComponent, AnfitrionToastPrueba],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(RhOrganigramaAdminComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    exito = spyOn(TestBed.inject(NgFastToastService), 'success').and.callThrough();
  });

  afterEach(() => {
    httpMock.verify();
  });

  function cargarArbol(estado = ocupacion('SIN_VINCULAR'), puestos = MOCK_PUESTOS): void {
    httpMock.expectOne((r) => r.method === 'GET' && r.url.endsWith('/organigrama/puestos')
      && r.params.get('incluirOcupacion') === 'true').flush({
      version: { id: 1, clave: 'ORG-COORDINACION-ESTATAL', nombre: 'Coordinación Estatal', estado: 'VIGENTE' },
      items: puestos.map((puesto) => ({ ...puesto,
        estado_ocupacion: puesto.id === estado.puesto_id ? estado.estado : 'SIN_VINCULAR',
        persona_id: puesto.id === estado.puesto_id ? estado.persona_id : null,
        nombre_ocupante: puesto.id === estado.puesto_id ? estado.nombre_ocupante : null,
      })),
    });
    flushMicrotasks();
    fixture.detectChanges();
  }

  function peticionOcupacion(method: string, puestoId = 2) {
    return httpMock.expectOne((r) => r.method === method && r.url.endsWith(`/organigrama/puestos/${puestoId}/ocupacion`));
  }

  function boton(texto: string, zona: ParentNode = fixture.nativeElement): HTMLButtonElement {
    const encontrado = Array.from(zona.querySelectorAll('button')).find(
      (elemento) => (elemento.getAttribute('aria-label') ?? elemento.textContent?.trim()) === texto,
    );
    if (!encontrado) throw new Error(`No se encontró el botón «${texto}»`);
    return encontrado;
  }

  function modalOcupacion(): HTMLDialogElement {
    const dialogo = (fixture.nativeElement as HTMLElement).querySelector<HTMLDialogElement>('dialog[open]');
    if (!dialogo) throw new Error('No se encontró el modal de ocupación abierto');
    return dialogo;
  }

  function filaPuesto(puestoId: number): HTMLElement {
    const fila = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(`[data-puesto-id="${puestoId}"]`);
    if (!fila) throw new Error(`No se encontró la fila del puesto ${puestoId}`);
    return fila;
  }

  function accionOcupacion(puestoId: number): HTMLButtonElement {
    const accion = filaPuesto(puestoId).querySelector<HTMLButtonElement>(
      'button[aria-haspopup="dialog"], button[aria-label^="Ocupación de "]',
    );
    if (!accion) throw new Error(`No se encontró la acción de ocupación del puesto ${puestoId}`);
    return accion;
  }

  function abrirPuesto(detalle: RhOrgOcupacion): RhOrgOcupacionComponent {
    const accion = accionOcupacion(detalle.puesto_id);
    accion.focus();
    accion.click();
    fixture.detectChanges();
    const dialogo = modalOcupacion();
    expect(dialogo.matches(':modal')).toBeTrue();
    expect(dialogo.textContent).toContain('Administrar ocupación');
    expect(dialogo.textContent).toContain(detalle.denominacion);
    expect(dialogo.contains(document.activeElement)).toBeTrue();
    expect(filaPuesto(detalle.puesto_id).classList.contains('org-puesto-seleccionado')).toBeTrue();
    peticionOcupacion('GET', detalle.puesto_id).flush(detalle);
    flushMicrotasks();
    fixture.detectChanges();
    return fixture.debugElement.query(By.directive(RhOrgOcupacionComponent)).componentInstance;
  }

  function abrir(detalle: RhOrgOcupacion): RhOrgOcupacionComponent {
    fixture.detectChanges();
    cargarArbol(detalle);
    return abrirPuesto(detalle);
  }

  it('renderiza el árbol organizacional y conserva contexto de ancestros al buscar', async () => {
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url.endsWith('/api/rh/organigrama/puestos')).flush({
      version: { id: 1, clave: 'ORG-COORDINACION-ESTATAL', nombre: 'Estructura organizacional de Coordinación Estatal', estado: 'VIGENTE' },
      items: MOCK_PUESTOS,
    });
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    expect(component.items().length).toBe(3);
    component.searchQuery.set('Tecnologías');
    fixture.detectChanges();

    const visible = component.visibleNodes();
    expect(visible.length).toBe(3); // incluye ancestros 1 y 2 + coincidencia 3
    expect(visible[2].matchesSearch).toBeTrue();
  });

  it('identifica la acción de alta y envía el puesto de su fila como padre del nuevo subordinado', fakeAsync(() => {
    fixture.detectChanges();
    cargarArbol();
    const fila = (fixture.nativeElement as HTMLElement).querySelector('[data-puesto-id="2"]')!;
    boton('Agregar puesto subordinado', fila).click();
    fixture.detectChanges();
    const dialogo = (fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]')!;
    expect(dialogo.textContent).toContain('Agregar puesto subordinado');
    expect(dialogo.textContent).toContain(MOCK_PUESTOS[1].denominacion);
    component.draftDenominacion.set('Puesto de prueba');
    fixture.detectChanges();
    boton('Guardar', dialogo).click();
    const peticion = httpMock.expectOne((r) => r.method === 'POST' && r.url.endsWith('/organigrama/puestos'));
    expect(peticion.request.body.puesto_padre_id).toBe(2);
    expect(peticion.request.body.denominacion).toBe('Puesto de prueba');
    const nuevo = { ...MOCK_PUESTOS[2], id: 4, denominacion: 'Puesto de prueba' };
    peticion.flush({ puesto: nuevo });
    flushMicrotasks();
    cargarArbol(ocupacion('SIN_VINCULAR'), [...MOCK_PUESTOS, nuevo]);
    expect(component.byId()[4].puesto_padre_id).toBe(2);
    expect(component.formDialogMode()).toBeNull();
    expect(exito).toHaveBeenCalledOnceWith({ title: 'Puesto agregado', content: nuevo.denominacion, duration: 2.5 });
  }));

  it('identifica cada nivel con texto y aplica un mismo color a los puestos del mismo nivel', fakeAsync(() => {
    fixture.detectChanges();
    const hermano = { ...MOCK_PUESTOS[2], id: 4, denominacion: 'Otro departamento', orden_visual: 2 };
    cargarArbol(ocupacion('VACANTE'), [...MOCK_PUESTOS, hermano]);
    const niveles = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[data-nivel]'));
    expect(niveles.map((nivel) => nivel.textContent?.trim())).toEqual(['Nivel 1', 'Nivel 2', 'Nivel 3', 'Nivel 3']);
    const fondos = niveles.map((nivel) => getComputedStyle(nivel).backgroundColor);
    expect(new Set(fondos.slice(0, 3)).size).toBe(3);
    expect(fondos[2]).toBe(fondos[3]);
    const fila = (fixture.nativeElement as HTMLElement).querySelector('[data-puesto-id="2"]');
    expect(fila?.textContent).toContain('VACANTE');
  }));

  it('muestra en el modal la jerarquía, el ocupante y el puesto laboral', fakeAsync(() => {
    abrir(ocupacion('OCUPADO'));
    const dialogo = modalOcupacion();
    expect(filaPuesto(2).textContent).toContain('ASIGNADO');
    expect(filaPuesto(1).textContent).toContain('SIN ASIGNAR');
    expect(dialogo.textContent).not.toContain('OCUPADO');
    expect(dialogo.textContent).not.toContain('SIN_VINCULAR');
    expect(dialogo.textContent).toContain('Alex Rivera');
    expect(dialogo.textContent).toContain('Analista');
    expect(dialogo.textContent).toContain(MOCK_PUESTOS[0].denominacion + ' › ' + MOCK_PUESTOS[1].denominacion);
    expect(dialogo.textContent).toContain('Cambiar ocupante');
    expect(dialogo.contains(document.activeElement)).toBeTrue();
    component.openEditDialog(MOCK_PUESTOS[1]);
    component.draftDenominacion.set('Edición pendiente');
    boton('Cerrar', dialogo).click();
    fixture.detectChanges();
    expect(component.draftDenominacion()).toBe('Edición pendiente');
    expect(component.formTargetPuesto()?.id).toBe(2);
  }));

  it('abre la ocupación de cualquier nivel sin cambiar la expansión y devuelve el foco al cerrar', fakeAsync(() => {
    fixture.detectChanges();
    cargarArbol();
    const expansion = filaPuesto(1).querySelector<HTMLButtonElement>('button[aria-expanded]')!;
    expect(expansion.getAttribute('aria-expanded')).toBe('true');
    expansion.click();
    fixture.detectChanges();
    expect(expansion.getAttribute('aria-expanded')).toBe('false');
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-puesto-id="3"]')).toBeNull();

    const raiz = { ...ocupacion('SIN_VINCULAR'), puesto_id: 1, puesto_padre_id: null, denominacion: MOCK_PUESTOS[0].denominacion };
    abrirPuesto(raiz);
    expect(expansion.getAttribute('aria-expanded')).toBe('false');
    boton('Cerrar', modalOcupacion()).click();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('dialog[open]')).toBeNull();
    expect(document.activeElement).toBe(accionOcupacion(1));

    expansion.click();
    fixture.detectChanges();
    expect(expansion.getAttribute('aria-expanded')).toBe('true');
    const subordinado = { ...raiz, puesto_id: 3, puesto_padre_id: 2, denominacion: MOCK_PUESTOS[2].denominacion };
    abrirPuesto(subordinado);
    expect(expansion.getAttribute('aria-expanded')).toBe('true');
    const escape = new Event('cancel', { cancelable: true });
    modalOcupacion().dispatchEvent(escape);
    fixture.detectChanges();
    expect(escape.defaultPrevented).toBeTrue();
    expect((fixture.nativeElement as HTMLElement).querySelector('dialog[open]')).toBeNull();
    expect(document.activeElement).toBe(accionOcupacion(3));
    httpMock.expectNone((r) => r.method === 'PATCH');
  }));

  for (const inicial of ['SIN_VINCULAR', 'OCUPADO'] as const) {
    it(`asigna por persona_id desde ${inicial}, distingue homónimos y pagina`, fakeAsync(() => {
      const editor = abrir(ocupacion(inicial));
      const dialogo = modalOcupacion();
      boton(inicial === 'OCUPADO' ? 'Cambiar ocupante' : 'Asignar ocupante', dialogo).click();
      fixture.detectChanges();
      expect(modalOcupacion()).toBe(dialogo);
      expect(dialogo.textContent).toContain(MOCK_PUESTOS[1].denominacion);
      expect(dialogo.textContent).toContain(MOCK_PUESTOS[0].denominacion);
      if (inicial === 'OCUPADO') expect(dialogo.textContent).toContain('Alex Rivera');
      const entrada = dialogo.querySelector<HTMLInputElement>('input[type="search"]')!;
      expect(document.activeElement).toBe(entrada);
      entrada.value = 'Ale';
      entrada.dispatchEvent(new Event('input', { bubbles: true }));
      tick(200);
      entrada.value = 'Alex';
      entrada.dispatchEvent(new Event('input', { bubbles: true }));
      tick(299);
      httpMock.expectNone((r) => r.url.endsWith('/unidades/177/personal'));
      tick(1);
      const personas = [
        { persona_id: 20, adscripcion_laboral_id: 301, nombre_completo: 'Alex Rivera', puesto: 'Analista', activo: true },
        { persona_id: 21, adscripcion_laboral_id: 302, nombre_completo: 'Alex Rivera', puesto: 'Enlace', activo: true },
      ];
      const buscar = (page: number) => httpMock.expectOne((r) =>
        r.url.endsWith('/unidades/177/personal') && r.params.get('q') === 'Alex' &&
        r.params.get('situacion') === 'ACTIVOS' && r.params.get('page') === String(page));
      const listado = { unidad: { id: 177, nombre: 'Coordinación Estatal' }, pageSize: 8, total: 10 };
      buscar(1).flush({ ...listado, page: 1, items: personas });
      flushMicrotasks();
      fixture.detectChanges();
      const botones = dialogo.querySelectorAll('[data-candidata]');
      expect(botones[0].textContent).toContain('Analista');
      expect(botones[1].textContent).toContain('Adscripción #302');
      boton('Siguiente', dialogo).click();
      buscar(2).flush({ ...listado, page: 2, items: [personas[1]] });
      flushMicrotasks();
      fixture.detectChanges();
      dialogo.querySelector<HTMLButtonElement>('[data-candidata]')!.click();
      void editor.confirmar();
      httpMock.expectNone((r) => r.method === 'PATCH');
      editor.motivo.set('  Validación de RH  ');
      fixture.detectChanges();
      expect(dialogo.textContent).toContain('Antes');
      expect(dialogo.textContent).toContain('Después');
      expect(dialogo.textContent).toContain('ASIGNADO');
      expect(dialogo.textContent).toContain('Enlace');
      const confirmar = boton('Confirmar cambio', dialogo);
      confirmar.click();
      void editor.confirmar();
      const patch = peticionOcupacion('PATCH');
      expect(patch.request.body).toEqual({ estado: 'OCUPADO', persona_id: 21,
        revision_esperada: inicial === 'OCUPADO' ? revision : null, motivo: 'Validación de RH' });
      expect(component.byId()[2].estado_ocupacion).toBe(inicial);
      fixture.detectChanges();
      expect(boton('Cerrar', dialogo).disabled).toBeTrue();
      expect(boton('Cancelar', dialogo).disabled).toBeTrue();
      dialogo.dispatchEvent(new Event('cancel', { cancelable: true }));
      dialogo.click();
      fixture.detectChanges();
      expect(dialogo.open).toBeTrue();
      httpMock.expectNone((r) => r.method === 'PATCH');
      const guardada = { ...ocupacion('OCUPADO'), persona_id: 21, puesto_laboral_referencia: 'Enlace' };
      patch.flush(guardada);
      flushMicrotasks();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('dialog[open]')).toBeNull();
      expect(component.byId()[2].persona_id).toBe(21);
      expect(component.byId()[2].puesto_padre_id).toBe(1);
      cargarArbol(guardada);
      expect(filaPuesto(2).textContent).toContain('ASIGNADO');
      expect(exito).toHaveBeenCalledOnceWith({
        title: 'Ocupación actualizada', content: `${guardada.denominacion} · ASIGNADO`, duration: 2.5,
      });
    }));
  }

  it('declara vacancia y después desvincula, conservando los estados distintos', fakeAsync(() => {
    let editor = abrir(ocupacion('OCUPADO'));
    for (const estado of ['VACANTE', 'SIN_VINCULAR'] as const) {
      const dialogo = modalOcupacion();
      boton(estado === 'VACANTE' ? 'Marcar VACANTE' : 'Dejar SIN ASIGNAR', dialogo).click();
      editor.motivo.set('Acuerdo administrativo');
      fixture.detectChanges();
      expect(dialogo.textContent).toContain('Antes');
      expect(dialogo.textContent).toContain('Después');
      boton('Confirmar cambio', dialogo).click();
      const patch = peticionOcupacion('PATCH');
      expect(patch.request.body).toEqual({ estado, persona_id: null,
        revision_esperada: revision, motivo: 'Acuerdo administrativo' });
      patch.flush({ ...ocupacion(estado), actualizado_en: revision });
      flushMicrotasks();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('dialog[open]')).toBeNull();
      cargarArbol(ocupacion(estado));
      expect(filaPuesto(2).textContent).toContain(estado === 'VACANTE' ? 'VACANTE' : 'SIN ASIGNAR');
      expect(exito.calls.mostRecent().args[0].content).toContain(estado === 'VACANTE' ? 'VACANTE' : 'SIN ASIGNAR');
      if (estado === 'VACANTE') {
        editor = abrirPuesto(ocupacion('VACANTE'));
        expect(modalOcupacion().textContent).toContain('Vacancia confirmada por RH');
      }
    }
    expect(exito).toHaveBeenCalledTimes(2);
  }));

  it('reutiliza el anfitrión de toast para editar y notificar ocupación, con vencimiento y cierre manual', fakeAsync(() => {
    const anfitrion = TestBed.createComponent(NgFastToastComponent);
    anfitrion.detectChanges();
    fixture.detectChanges();
    cargarArbol();
    component.openEditDialog(component.byId()[2]);
    component.draftDenominacion.set('Puesto actualizado de prueba');
    void component.submitFormDialog();
    const actualizado = { ...MOCK_PUESTOS[1], denominacion: 'Puesto actualizado de prueba' };
    httpMock.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/organigrama/puestos/2')).flush({ puesto: actualizado });
    flushMicrotasks();
    cargarArbol(ocupacion('SIN_VINCULAR'), [MOCK_PUESTOS[0], actualizado, MOCK_PUESTOS[2]]);
    anfitrion.detectChanges();
    const toasts = (anfitrion.nativeElement as HTMLElement).shadowRoot!;
    expect(toasts.querySelectorAll('toast-root').length).toBe(1);
    expect(toasts.querySelector('toast-root')?.shadowRoot?.textContent).toContain('Puesto actualizado de prueba');
    const ubicacion = getComputedStyle(toasts.querySelector('[role="ng-fast-toast"]')!);
    expect(ubicacion.position).toBe('fixed');
    expect(ubicacion.right).toBe('0px');
    expect(ubicacion.bottom).toBe('0px');

    tick(100);
    component.ocupacionGuardada(ocupacion('OCUPADO'));
    cargarArbol(ocupacion('OCUPADO'));
    anfitrion.detectChanges();
    expect(toasts.querySelectorAll('toast-root').length).toBe(2);
    const anuncio = fixture.nativeElement.querySelector('[aria-live="polite"].sr-only');
    expect(anuncio.textContent).toContain('Ocupación actualizada');
    expect(fixture.nativeElement.textContent).not.toContain('Ocultar');
    expect(anuncio.getAttribute('aria-atomic')).toBe('true');

    tick(100);
    toasts.querySelector('toast-root:last-child')!.shadowRoot!
      .querySelector<HTMLElement>('[title="Dismiss notification"]')!.click();
    tick(500);
    anfitrion.detectChanges();
    expect(toasts.querySelectorAll('toast-root').length).toBe(1);
    tick(2500);
    anfitrion.detectChanges();
    expect(toasts.querySelectorAll('toast-root').length).toBe(0);
  }));

  it('limita la tarjeta al ancho visible y habilita el cierre por teclado en el anfitrión compartido', async () => {
    const anfitrion = TestBed.createComponent(AnfitrionToastPrueba);
    anfitrion.detectChanges();
    component.ocupacionGuardada(ocupacion('OCUPADO'));
    httpMock.expectOne((r) => r.method === 'GET' && r.url.endsWith('/organigrama/puestos')).flush({
      version: { nombre: 'Coordinación Estatal', clave: 'ORG' }, items: [],
    });
    anfitrion.detectChanges();
    await new Promise((resolver) => setTimeout(resolver, 0));
    const raiz = anfitrion.nativeElement.querySelector('ng-fast-toast').shadowRoot as ShadowRoot;
    const tarjeta = raiz.querySelector('toast-root')!.shadowRoot!;
    const estilos = getComputedStyle(tarjeta.querySelector('div')!);
    expect(estilos.maxWidth).toBe(`${window.innerWidth - 32}px`);
    expect(estilos.overflowWrap).toBe('anywhere');
    const cerrar = tarjeta.querySelector<HTMLElement>('[aria-label="Cerrar notificación"]')!;
    expect(cerrar.tabIndex).toBe(0);
    const clic = spyOn(cerrar, 'click').and.callThrough();
    cerrar.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(clic).toHaveBeenCalledTimes(1);
  });

  it('mantiene el borrador en un 409 y exige actualizar la revisión y confirmar de nuevo', fakeAsync(() => {
    const panel = abrir(ocupacion('OCUPADO'));
    boton('Cambiar ocupante').click();
    fixture.detectChanges();
    const dialogo = modalOcupacion();
    panel.buscar('Eva');
    tick(300);
    httpMock.expectOne((r) => r.params.get('q') === 'Eva').flush({
      unidad: { id: 177, nombre: 'Coordinación Estatal' }, page: 1, pageSize: 8, total: 1,
      items: [{ persona_id: 25, adscripcion_laboral_id: 50, nombre_completo: 'Eva Díaz', puesto: 'Enlace', activo: true }],
    });
    flushMicrotasks();
    fixture.detectChanges();
    dialogo.querySelector<HTMLButtonElement>('[data-candidata]')!.click();
    panel.motivo.set('Solicitud autorizada');
    void panel.confirmar();
    peticionOcupacion('PATCH').flush({ error: 'La ocupación cambió.' }, { status: 409, statusText: 'Conflict' });
    flushMicrotasks();
    fixture.detectChanges();
    expect(panel.error()).toBe('La ocupación cambió.');
    expect(panel.motivo()).toBe('Solicitud autorizada');
    expect(panel.candidata()?.persona_id).toBe(25);
    expect(dialogo.open).toBeTrue();
    expect(dialogo.querySelector('[role="alert"]')?.textContent).toContain('La ocupación cambió.');
    expect(exito).not.toHaveBeenCalled();
    expect(panel.puedeConfirmar()).toBeFalse();
    void panel.confirmar();
    httpMock.expectNone((r) => r.method === 'PATCH');
    boton('Actualizar datos', dialogo).click();
    const reciente = '2026-11-27T00:00:00.123457Z';
    peticionOcupacion('GET').flush(ocupacion('VACANTE', reciente));
    flushMicrotasks();
    fixture.detectChanges();
    expect(dialogo.textContent).toContain('VACANTE');
    httpMock.expectNone((r) => r.method === 'PATCH');
    void panel.confirmar();
    const retry = peticionOcupacion('PATCH');
    expect(retry.request.body.revision_esperada).toBe(reciente);
    retry.error(new ProgressEvent('network'));
    flushMicrotasks();
    expect(panel.error()).toContain('No se pudo conectar');
    expect(panel.enviando()).toBeFalse();
    expect(panel.motivo()).toBe('Solicitud autorizada');
    expect(component.byId()[2].estado_ocupacion).toBe('OCUPADO');
    void panel.confirmar();
    peticionOcupacion('PATCH').flush({ error: 'La persona ya ocupa el puesto estructural 10' }, { status: 409, statusText: 'Conflict' });
    flushMicrotasks();
    expect(panel.error()).toContain('ya ocupa el puesto estructural 10');
    expect(panel.puedeRevisarAdscripcion()).toBeFalse();
  }));

  it('verifica la adscripción mediante el padrón antes de ofrecer navegación contextual', fakeAsync(() => {
    const editor = abrir(ocupacion('VACANTE'));
    editor.preparar('OCUPADO');
    editor.buscar('Eva Díaz');
    tick(300);
    httpMock.expectOne((r) => r.url.endsWith('/unidades/177/personal')).flush({
      items: [], total: 0, page: 1, pageSize: 8,
    });
    flushMicrotasks();
    expect(editor.puedeRevisarAdscripcion()).toBeFalse();
    void editor.verificarEnPlantilla();
    httpMock.expectOne((r) => r.url.endsWith('/rh/personas') && r.params.get('estado') === 'todas').flush({
      items: [{ persona_id: 25, nombre_completo: 'Eva Díaz', activo: true }], total: 1,
    });
    flushMicrotasks();
    httpMock.expectOne((r) => r.url.endsWith('/personas/25/adscripciones') && r.params.get('estado') === 'vigentes')
      .flush({ items: [], total: 0 });
    flushMicrotasks();
    expect(editor.diagnostico()).toContain('no tiene una adscripción vigente');
    const navegar = jasmine.createSpy();
    component.revisarAdscripcion.subscribe(navegar);
    fixture.detectChanges();
    boton('Cerrar e ir a Personal por unidad').click();
    expect(navegar).toHaveBeenCalledOnceWith('Eva Díaz');
    httpMock.expectNone((r) => r.method === 'PATCH');
  }));

  it('distingue un error de búsqueda de una ausencia de adscripción', fakeAsync(() => {
    const editor = abrir(ocupacion('VACANTE'));
    editor.preparar('OCUPADO');
    editor.buscar('Eva Díaz');
    tick(300);
    httpMock.expectOne((r) => r.url.endsWith('/unidades/177/personal')).error(new ProgressEvent('network'));
    flushMicrotasks();
    expect(editor.errorBusqueda()).toContain('No se pudo conectar');
    expect(editor.puedeRevisarAdscripcion()).toBeFalse();
    httpMock.expectNone((r) => r.url.endsWith('/rh/personas'));
  }));

  it('protege el borrador al pulsar fuera y exige confirmar el descarte sin guardar', fakeAsync(() => {
    const editor = abrir(ocupacion('OCUPADO'));
    const dialogo = modalOcupacion();
    boton('Cambiar ocupante', dialogo).click();
    editor.motivo.set('Motivo en borrador');
    fixture.detectChanges();
    dialogo.click();
    fixture.detectChanges();
    expect(dialogo.open).toBeTrue();
    expect(dialogo.textContent).not.toContain('Descartar cambios');

    const cancelarConEscape = new Event('cancel', { cancelable: true });
    dialogo.dispatchEvent(cancelarConEscape);
    fixture.detectChanges();
    expect(dialogo.open).toBeTrue();
    expect(cancelarConEscape.defaultPrevented).toBeTrue();
    expect(dialogo.textContent).toContain('Descartar cambios');
    boton('Seguir editando', dialogo).click();
    fixture.detectChanges();
    expect(modalOcupacion()).toBe(dialogo);
    expect(editor.motivo()).toBe('Motivo en borrador');

    boton('Cerrar', dialogo).click();
    fixture.detectChanges();
    boton('Descartar cambios', dialogo).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog[open]')).toBeNull();
    expect(document.activeElement).toBe(accionOcupacion(2));
    expect(component.byId()[2].persona_id).toBe(20);
    httpMock.expectNone((r) => r.method === 'PATCH');
  }));

  it('limita el modal al área disponible y habilita desplazamiento vertical interno', fakeAsync(() => {
    abrir(ocupacion('VACANTE'));
    const dialogo = modalOcupacion();
    dialogo.style.maxWidth = '343px';
    const cerrar = boton('Cerrar', dialogo);
    const titulo = dialogo.querySelector('h3')!.getBoundingClientRect();
    const area = cerrar.getBoundingClientRect();
    expect(cerrar.getAttribute('aria-label')).toBe('Cerrar');
    expect(cerrar.textContent?.trim()).toBe('');
    expect(cerrar.querySelector('svg[aria-hidden="true"] path')).not.toBeNull();
    expect(area.width).toBeGreaterThanOrEqual(44);
    expect(area.height).toBeGreaterThanOrEqual(44);
    expect(area.left).toBeGreaterThanOrEqual(titulo.right);
    expect(area.top).toBeCloseTo(titulo.top, 0);
    expect(area.right).toBeLessThan(dialogo.getBoundingClientRect().right);
    boton('Asignar ocupante', dialogo).click();
    fixture.detectChanges();
    const viewport = dialogo.ownerDocument.defaultView!;
    const medidas = dialogo.getBoundingClientRect();
    expect(medidas.width).toBeGreaterThan(0);
    expect(medidas.width).toBeLessThan(viewport.innerWidth);
    expect(medidas.height).toBeLessThanOrEqual(viewport.innerHeight * 0.92 + 1);
    expect(getComputedStyle(dialogo).overflowY).toBe('auto');
  }));

  it('descarta resultados tardíos y limpia la selección al escribir otra búsqueda', fakeAsync(() => {
    const panel = abrir(ocupacion('VACANTE'));
    panel.preparar('OCUPADO');
    panel.buscar('Ana');
    tick(300);
    const vieja = httpMock.expectOne((r) => r.params.get('q') === 'Ana');
    panel.buscar('Eva');
    tick(300);
    const fila = { persona_id: 25, adscripcion_laboral_id: 50, nombre_completo: 'Eva Díaz' };
    const listado = { unidad: { id: 177, nombre: 'Coordinación Estatal' }, page: 1, pageSize: 8, total: 1 };
    httpMock.expectOne((r) => r.params.get('q') === 'Eva').flush({ ...listado, items: [fila] });
    vieja.flush({ ...listado, items: [{ ...fila, persona_id: 26 }] });
    flushMicrotasks();
    expect(panel.resultado()?.items[0].persona_id).toBe(25);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-candidata]').click();
    expect(panel.candidata()?.persona_id).toBe(25);
    panel.buscar('');
    expect(panel.candidata()).toBeNull();
    expect(panel.resultado()).toBeNull();
  }));

  it('mantiene el borrador ante un 400 y bloquea el guardado si el puesto deja de existir', fakeAsync(() => {
    const panel = abrir(ocupacion('VACANTE'));
    panel.preparar('SIN_VINCULAR');
    panel.motivo.set('Corrección de vacancia');
    void panel.confirmar();
    peticionOcupacion('PATCH').flush({}, { status: 400, statusText: 'Bad Request' });
    flushMicrotasks();
    expect(panel.error()).toContain('no son válidos');
    expect(panel.motivo()).toBe('Corrección de vacancia');
    void panel.confirmar();
    peticionOcupacion('PATCH').flush({}, { status: 404, statusText: 'Not Found' });
    flushMicrotasks();
    expect(panel.error()).toContain('El puesto no se encontró');
    expect(panel.puedeConfirmar()).toBeFalse();
  }));
});
