import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SimpleChange } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RhPersonasPadronItem } from '../../../services/rh.service';
import { RhExpedienteConsolidadoComponent } from './rh-expediente-consolidado.component';

describe('RhExpedienteConsolidadoComponent (RH-4A.5A)', () => {
  let fixture: ComponentFixture<RhExpedienteConsolidadoComponent>;
  let component: RhExpedienteConsolidadoComponent;
  let httpMock: HttpTestingController;

  const personaOficinaCentral: RhPersonasPadronItem = {
    persona_id: 701,
    nombre_completo: 'Elena Martínez Soto',
    nombres: 'Elena',
    apellidos: 'Martínez Soto',
    cargo: 'Coordinadora Administrativa',
    correo_principal: 'elena@imssbienestar.gob.mx',
    unidad_medica_id: 177,
    unidad_medica_nombre: 'OFICINA CENTRAL',
    unidad_medica_cluesimb: 'N/A',
    tiene_rfc: true,
    rfc_masked: '**********AB1',
    tiene_curp: true,
    curp_masked: '****************01',
    activo: true,
    fecha_baja: null,
    tiene_cuenta_activa: false,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RhExpedienteConsolidadoComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(RhExpedienteConsolidadoComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    component.persona = personaOficinaCentral;
    component.canManage = true;
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('muestra datos generales con identificadores enmascarados y Oficina Central sin llamadas HTTP iniciales', () => {
    component.ngOnChanges({
      persona: new SimpleChange(undefined, component.persona, true),
    });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Elena Martínez Soto');
    expect(text).toContain('OFICINA CENTRAL (N/A)');
    expect(text).toContain('**********AB1');
    expect(text).toContain('Sin cuenta activa');
    expect(component.activeTab()).toBe('generales');
  });

  it('carga adscripciones oficiales y comisiones bajo demanda al abrir Situación laboral', async () => {
    component.ngOnChanges({
      persona: new SimpleChange(undefined, component.persona, true),
    });
    component.onSelectTab('laboral');

    const reqAds = httpMock.expectOne(
      (r) => r.url.endsWith('/api/rh/personas/701/adscripciones') && r.method === 'GET'
    );
    reqAds.flush({
      persona_id: 701,
      items: [
        {
          adscripcion_laboral_id: 901,
          persona_id: 701,
          unidad_medica_id: 177,
          unidad_nombre: 'OFICINA CENTRAL',
          unidad_cluesimb: 'N/A',
          matricula: 'MAT-01',
          puesto: 'Coordinación',
          turno: null,
          jornada: null,
          horario: null,
          vigente_desde: '2026-01-01',
          vigente_hasta: null,
          activo: true,
          estado_vigencia: 'VIGENTE',
          observaciones: null,
        },
        {
          adscripcion_laboral_id: 902,
          persona_id: 701,
          unidad_medica_id: 12,
          unidad_nombre: 'HOSPITAL GENERAL MEXICALI',
          unidad_cluesimb: 'BCIMB000012',
          matricula: null,
          puesto: 'Apoyo',
          turno: null,
          jornada: null,
          horario: null,
          vigente_desde: '2027-01-01',
          vigente_hasta: '2027-06-30',
          activo: true,
          estado_vigencia: 'FUTURA',
          observaciones: null,
        },
        {
          adscripcion_laboral_id: 903,
          persona_id: 701,
          unidad_medica_id: 12,
          unidad_nombre: 'HOSPITAL GENERAL MEXICALI',
          unidad_cluesimb: 'BCIMB000012',
          matricula: null,
          puesto: 'Auxiliar',
          turno: null,
          jornada: null,
          horario: null,
          vigente_desde: '2024-01-01',
          vigente_hasta: '2024-12-31',
          activo: false,
          estado_vigencia: 'HISTORICA',
          observaciones: 'Inactiva',
        },
      ],
      page: 1,
      pageSize: 10,
      total: 3,
    });

    const req = httpMock.expectOne(
      (r) => r.url.endsWith('/api/rh/personas/701/comisiones') && r.method === 'GET'
    );
    req.flush({
      persona_id: 701,
      items: [
        {
          id: 1,
          persona_id: 701,
          adscripcion_origen_id: null,
          sin_adscripcion_formal_origen: true,
          unidad_destino_id: 177,
          unidad_destino_nombre: 'OFICINA CENTRAL',
          unidad_destino_cluesimb: 'N/A',
          area_destino_texto: 'Dirección Estatal',
          fecha_inicio: '2026-11-01',
          fecha_fin: null,
          motivo: 'Apoyo',
          oficio_referencia: 'OF-1',
          observaciones: null,
          activo: true,
          estado_vigencia: 'VIGENTE',
        },
        {
          id: 2,
          persona_id: 701,
          adscripcion_origen_id: null,
          sin_adscripcion_formal_origen: true,
          unidad_destino_id: null,
          unidad_destino_nombre: null,
          unidad_destino_cluesimb: null,
          area_destino_texto: 'Planeación',
          fecha_inicio: '2027-01-01',
          fecha_fin: '2027-02-01',
          motivo: null,
          oficio_referencia: null,
          observaciones: null,
          activo: true,
          estado_vigencia: 'FUTURA',
        },
        {
          id: 3,
          persona_id: 701,
          adscripcion_origen_id: null,
          sin_adscripcion_formal_origen: true,
          unidad_destino_id: null,
          unidad_destino_nombre: null,
          unidad_destino_cluesimb: null,
          area_destino_texto: 'Archivo',
          fecha_inicio: '2025-01-01',
          fecha_fin: '2025-06-01',
          motivo: null,
          oficio_referencia: null,
          observaciones: null,
          activo: false,
          estado_vigencia: 'CONCLUIDA',
        },
      ],
      page: 1,
      pageSize: 50,
      total: 3,
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(component.adscripciones().length).toBe(3);
    expect(component.adscripciones()[0].unidad_cluesimb).toBe('N/A');
    expect(component.adscripciones()[0].estado_vigencia).toBe('VIGENTE');
    expect(component.adscripciones()[1].estado_vigencia).toBe('FUTURA');
    expect(component.adscripciones()[2].estado_vigencia).toBe('HISTORICA');
    expect(component.comisionesVigentes().length).toBe(1);
    expect(component.comisionesFuturas().length).toBe(1);
    expect(component.comisionesConcluidas().length).toBe(1);
  });

  it('soporta filtros, paginación y descarta respuestas pendientes al cambiar de trabajador (RH-4A.5C)', async () => {
    component.ngOnChanges({
      persona: new SimpleChange(undefined, component.persona, true),
    });
    component.onSelectTab('laboral');

    const reqAds1 = httpMock.expectOne((r) => r.url.endsWith('/api/rh/personas/701/adscripciones'));
    const reqCom1 = httpMock.expectOne((r) => r.url.endsWith('/api/rh/personas/701/comisiones'));
    reqCom1.flush({ persona_id: 701, items: [], page: 1, pageSize: 50, total: 0 });
    reqAds1.flush({ persona_id: 701, items: [], page: 1, pageSize: 1, total: 2 });
    await new Promise((r) => setTimeout(r, 0));

    // Filtro y paginación
    component.onSelectAdscripcionesFilter('historicas');
    const reqHist = httpMock.expectOne(
      (r) =>
        r.url.endsWith('/api/rh/personas/701/adscripciones') &&
        r.params.get('estado') === 'historicas' &&
        r.params.get('page') === '1'
    );
    reqHist.flush({ persona_id: 701, items: [], page: 1, pageSize: 1, total: 2 });
    await new Promise((r) => setTimeout(r, 0));

    component.onAdsNextPage();
    const reqP2 = httpMock.expectOne(
      (r) =>
        r.url.endsWith('/api/rh/personas/701/adscripciones') &&
        r.params.get('page') === '2'
    );

    // Cambiar de trabajador antes de que responda reqP2 -> respuesta obsoleta descartada
    const otraPersona: RhPersonasPadronItem = { ...personaOficinaCentral, persona_id: 702, nombre_completo: 'Otro Trabajador' };
    component.persona = otraPersona;
    component.ngOnChanges({ persona: new SimpleChange(personaOficinaCentral, otraPersona, false) });

    reqP2.flush({ persona_id: 701, items: [{ adscripcion_laboral_id: 999 } as any], page: 2, pageSize: 1, total: 2 });
    await new Promise((r) => setTimeout(r, 0));
    expect(component.adscripciones().length).toBe(0);
  });

  it('carga historial vacacional bajo demanda (registrado y anulado) y limpia datos al cerrar', async () => {
    component.ngOnChanges({
      persona: new SimpleChange(undefined, component.persona, true),
    });
    component.onSelectTab('vacaciones');

    const req = httpMock.expectOne(
      (r) => r.url.endsWith('/api/rh/personas/701/vacaciones') && r.method === 'GET'
    );
    req.flush({
      persona_id: 701,
      items: [
        {
          id: 10,
          persona_id: 701,
          adscripcion_id: null,
          anio_ciclo: 2026,
          periodo_referencia: '1er Periodo',
          fecha_inicio: '2026-07-01',
          fecha_fin: '2026-07-10',
          dias_registrados: 10,
          documento_referencia: 'OF-VAC-1',
          observaciones: null,
          estado: 'REGISTRADO',
          motivo_anulacion: null,
          anulado_en: null,
          creado_en: '2026-06-01T00:00:00Z',
          actualizado_en: '2026-06-01T00:00:00Z',
        },
        {
          id: 11,
          persona_id: 701,
          adscripcion_id: null,
          anio_ciclo: 2025,
          periodo_referencia: '2do Periodo',
          fecha_inicio: '2025-12-01',
          fecha_fin: '2025-12-05',
          dias_registrados: 5,
          documento_referencia: null,
          observaciones: null,
          estado: 'ANULADO',
          motivo_anulacion: 'Cancelado',
          anulado_en: '2025-11-20T00:00:00Z',
          creado_en: '2025-11-01T00:00:00Z',
          actualizado_en: '2025-11-20T00:00:00Z',
        },
      ],
      page: 1,
      pageSize: 50,
      total: 2,
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(component.vacaciones().length).toBe(2);
    expect(component.diasVacacionesRegistrados()).toBe(10);

    // Limpieza al cerrar
    let closedCalled = false;
    component.closed.subscribe(() => (closedCalled = true));
    component.onClose();
    expect(closedCalled).toBeTrue();
    expect(component.vacaciones().length).toBe(0);
    expect(component.comisiones().length).toBe(0);
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
    component.onSelectTab('laboral');
    const reqAds = httpMock.expectOne((r) => r.url.endsWith('/api/rh/personas/701/adscripciones'));
    reqAds.flush({ error: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });
    const req = httpMock.expectOne((r) => r.url.endsWith('/api/rh/personas/701/comisiones'));
    req.flush({ error: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });
    await new Promise((r) => setTimeout(r, 0));
    expect(component.forbiddenError()).toContain('RECURSOS_HUMANOS GLOBAL');
  });
});
