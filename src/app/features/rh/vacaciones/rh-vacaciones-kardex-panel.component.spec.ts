import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  RhPersonasPadronItem,
  RhVacacionKardexResponse,
  RhVacacionPeriodoDto,
} from '../../../services/rh.service';
import { RhVacacionesKardexPanelComponent } from './rh-vacaciones-kardex-panel.component';

function makePersona(id = 42): RhPersonasPadronItem {
  return {
    persona_id: id,
    nombre_completo: `Persona ${id}`,
    nombres: 'Persona',
    apellidos: String(id),
    cargo: 'Analista',
    correo_principal: `p${id}@imssb.gob.mx`,
    unidad_medica_id: 177,
    unidad_medica_nombre: 'OFICINA CENTRAL',
    unidad_medica_cluesimb: 'BCIMS000484',
    tiene_rfc: false,
    rfc_masked: null,
    tiene_curp: false,
    curp_masked: null,
    activo: true,
    fecha_baja: null,
    fecha_ingreso: '2024-01-01',
    tiene_cuenta_activa: true,
  };
}

const PERIODOS_MOCK: RhVacacionPeriodoDto[] = [
  {
    id: 2,
    anio: 2026,
    numero_periodo: 2,
    clave: '2026-P2',
    nombre: 'Segundo periodo 2026',
    fecha_inicio: '2026-07-01',
    fecha_fin: '2026-12-31',
    dias_base_provisionales: 10,
    activo: true,
    observaciones: null,
  },
  {
    id: 5,
    anio: 2027,
    numero_periodo: 1,
    clave: '2027-P1',
    nombre: 'Primer periodo 2027',
    fecha_inicio: '2027-01-01',
    fecha_fin: '2027-06-30',
    dias_base_provisionales: 10,
    activo: true,
    observaciones: null,
  },
];

function makeKardex(overrides: Partial<RhVacacionKardexResponse> = {}): RhVacacionKardexResponse {
  return {
    persona_id: 42,
    periodo: PERIODOS_MOCK[0],
    resumen: {
      estado_bolsa: 'PROVISIONAL',
      es_provisional: true,
      dias_asignados: 10,
      dias_computables_registrados: 0,
      saldo_administrativo: 10,
      justificacion_ajuste: null,
    },
    movimientos: [],
    ...overrides,
  };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

describe('RhVacacionesKardexPanelComponent (RH-VAC-03)', () => {
  let fixture: ComponentFixture<RhVacacionesKardexPanelComponent>;
  let component: RhVacacionesKardexPanelComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RhVacacionesKardexPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(RhVacacionesKardexPanelComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('muestra aviso claro cuando no existen periodos institucionales configurados', async () => {
    fixture.componentRef.setInput('persona', makePersona(42));
    fixture.detectChanges();

    const reqPer = httpMock.expectOne((r) => r.url.endsWith('/api/rh/vacaciones/periodos'));
    reqPer.flush({ items: [] });
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.periodos().length).toBe(0);
    expect(fixture.nativeElement.querySelector('#rh-kardex-no-periodos')).not.toBeNull();
  });

  it('distingue bolsa inexistente sin mostrar 10 días automáticamente y exige justificación en AJUSTADA', async () => {
    fixture.componentRef.setInput('persona', makePersona(42));
    fixture.detectChanges();

    httpMock.expectOne((r) => r.url.endsWith('/api/rh/vacaciones/periodos')).flush({ items: PERIODOS_MOCK });
    await flushMicrotasks();

    httpMock
      .expectOne((r) => r.url.endsWith('/api/rh/personas/42/vacaciones/kardex'))
      .flush(
        makeKardex({
          resumen: {
            estado_bolsa: 'INEXISTENTE',
            es_provisional: false,
            dias_asignados: null,
            dias_computables_registrados: 0,
            saldo_administrativo: null,
            justificacion_ajuste: null,
          },
        })
      );
    await flushMicrotasks();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#rh-kardex-bolsa-inexistente-notice')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#rh-kardex-dias-asignados').textContent.trim()).toBe('—');

    component.openBolsaForm();
    component.draftBolsaDias.set('12');
    component.draftBolsaEstado.set('AJUSTADA');
    component.draftBolsaJustificacion.set('');
    await component.guardarBolsa();
    expect(component.bolsaError()).toContain('justificación');

    component.draftBolsaJustificacion.set('Ajuste autorizado por oficio');
    const savePromise = component.guardarBolsa();
    const patchReq = httpMock.expectOne((r) => r.url.endsWith('/api/rh/personas/42/vacaciones/bolsas/2'));
    expect(patchReq.request.method).toBe('PATCH');
    patchReq.flush({ bolsa: {} });
    await flushMicrotasks();

    httpMock.expectOne((r) => r.url.endsWith('/api/rh/personas/42/vacaciones/kardex')).flush(makeKardex());
    await savePromise;
  });

  it('permite seleccionar fechas discontinuas, distinguir excluidas con motivo, registrar y anular recuperando saldo', async () => {
    fixture.componentRef.setInput('persona', makePersona(42));
    fixture.detectChanges();

    httpMock.expectOne((r) => r.url.endsWith('/api/rh/vacaciones/periodos')).flush({ items: PERIODOS_MOCK });
    await flushMicrotasks();
    httpMock.expectOne((r) => r.url.endsWith('/api/rh/personas/42/vacaciones/kardex')).flush(makeKardex());
    await flushMicrotasks();
    fixture.detectChanges();

    component.openRegistroForm();
    component.toggleFecha({ iso: '2026-12-23', dayNumber: 23, inPeriod: true });
    component.toggleFecha({ iso: '2026-12-24', dayNumber: 24, inPeriod: true });
    component.toggleFecha({ iso: '2026-12-25', dayNumber: 25, inPeriod: true });
    component.toggleFechaComputable('2026-12-25');

    // Sin motivo de exclusión no puede confirmar
    expect(component.canSubmitRegistro()).toBeFalse();

    component.updateFechaMotivoExclusion('2026-12-25', 'Festivo oficial');
    expect(component.computablesCount()).toBe(2);
    expect(component.excluidasCount()).toBe(1);
    expect(component.saldoDespuesPreview()).toBe(8);
    expect(component.canSubmitRegistro()).toBeTrue();

    const submitPromise = component.confirmarRegistroFechas();
    const postReq = httpMock.expectOne((r) => r.url.endsWith('/api/rh/personas/42/vacaciones'));
    expect(postReq.request.method).toBe('POST');
    expect(postReq.request.body.periodo_id).toBe(2);
    expect(postReq.request.body.fechas.length).toBe(3);
    postReq.flush({ registro: { id: 901 }, tiene_superposicion: false, registros_superpuestos_ids: [] });
    await flushMicrotasks();

    httpMock
      .expectOne((r) => r.url.endsWith('/api/rh/personas/42/vacaciones/kardex'))
      .flush(
        makeKardex({
          resumen: {
            estado_bolsa: 'PROVISIONAL',
            es_provisional: true,
            dias_asignados: 10,
            dias_computables_registrados: 2,
            saldo_administrativo: 8,
            justificacion_ajuste: null,
          },
          movimientos: [
            {
              id: 901,
              persona_id: 42,
              adscripcion_id: null,
              periodo_id: 2,
              modo_registro: 'FECHAS_DETALLADAS',
              fecha_inicio: '2026-12-23',
              fecha_fin: '2026-12-25',
              dias_registrados: 2,
              documento_referencia: null,
              observaciones: null,
              estado: 'REGISTRADO',
              motivo_anulacion: null,
              anulado_en: null,
              creado_en: '2026-11-20T00:00:00.000Z',
              actualizado_en: '2026-11-20T00:00:00.000Z',
              fechas: [],
            },
          ],
        })
      );
    await submitPromise;
    fixture.detectChanges();

    // Anulación y recuperación de saldo
    component.openAnularDialog(component.kardex()!.movimientos[0]);
    component.anularMotivo.set('Cancelación administrativa');
    const anularPromise = component.confirmarAnulacion();
    const anularReq = httpMock.expectOne((r) => r.url.endsWith('/api/rh/personas/42/vacaciones/901/anular'));
    expect(anularReq.request.method).toBe('PATCH');
    anularReq.flush({ registro: { id: 901, estado: 'ANULADO' }, idempotente: false });
    await flushMicrotasks();

    httpMock.expectOne((r) => r.url.endsWith('/api/rh/personas/42/vacaciones/kardex')).flush(makeKardex());
    await anularPromise;

    expect(component.kardex()?.resumen.saldo_administrativo).toBe(10);
  });

  it('permite habilitar excepción fuera del periodo de origen con justificación obligatoria (RH-VAC-06)', async () => {
    fixture.componentRef.setInput('persona', makePersona(42));
    fixture.detectChanges();

    httpMock.expectOne((r) => r.url.endsWith('/api/rh/vacaciones/periodos')).flush({ items: PERIODOS_MOCK });
    await flushMicrotasks();
    httpMock.expectOne((r) => r.url.endsWith('/api/rh/personas/42/vacaciones/kardex')).flush(makeKardex());
    await flushMicrotasks();
    fixture.detectChanges();

    component.openRegistroForm();
    component.onToggleExcepcionFueraPeriodo(true);
    component.toggleFecha({ iso: '2027-02-10', dayNumber: 10, inPeriod: true });

    // Sin justificación no puede confirmar
    expect(component.canSubmitRegistro()).toBeFalse();

    component.justificacionExcepcion.set('Vacaciones pendientes disfrutadas en 2027');
    expect(component.canSubmitRegistro()).toBeTrue();

    const submitPromise = component.confirmarRegistroFechas();
    const postReq = httpMock.expectOne((r) => r.url.endsWith('/api/rh/personas/42/vacaciones'));
    expect(postReq.request.body.es_excepcion_fuera_periodo).toBeTrue();
    expect(postReq.request.body.justificacion_excepcion).toBe('Vacaciones pendientes disfrutadas en 2027');
    postReq.flush({ registro: { id: 902 }, tiene_superposicion: false, registros_superpuestos_ids: [] });
    await flushMicrotasks();

    httpMock.expectOne((r) => r.url.endsWith('/api/rh/personas/42/vacaciones/kardex')).flush(makeKardex());
    await submitPromise;
  });
});
