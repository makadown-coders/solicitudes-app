import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RhMisVacacionesComponent } from './rh-mis-vacaciones.component';

describe('RhMisVacacionesComponent (RH-VAC-07B)', () => {
  let fixture: ComponentFixture<RhMisVacacionesComponent>;
  let component: RhMisVacacionesComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RhMisVacacionesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(RhMisVacacionesComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('muestra consulta personal de solo lectura con día de la semana y sin controles administrativos', async () => {
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url.endsWith('/api/rh/mi-vacaciones'));
    expect(req.request.method).toBe('GET');
    req.flush({
      periodos: [
        {
          id: 24,
          anio: 2024,
          numero_periodo: 2,
          clave: '2024-P2',
          nombre: 'Segundo periodo 2024',
          fecha_inicio: '2024-07-01',
          fecha_fin: '2024-12-31',
          dias_base_provisionales: 10,
          activo: true,
          observaciones: null,
        },
      ],
      kardex: {
        persona_id: 42,
        periodo: {
          id: 24,
          anio: 2024,
          numero_periodo: 2,
          clave: '2024-P2',
          nombre: 'Segundo periodo 2024',
          fecha_inicio: '2024-07-01',
          fecha_fin: '2024-12-31',
          dias_base_provisionales: 10,
          activo: true,
          observaciones: null,
        },
        resumen: {
          estado_bolsa: 'PROVISIONAL',
          es_provisional: true,
          dias_asignados: 10,
          dias_computables_registrados: 1,
          saldo_administrativo: 9,
          justificacion_ajuste: null,
        },
        movimientos: [
          {
            id: 1,
            persona_id: 42,
            adscripcion_id: null,
            periodo_id: 24,
            modo_registro: 'FECHAS_DETALLADAS',
            fecha_inicio: '2026-10-07',
            fecha_fin: '2026-10-07',
            dias_registrados: 1,
            documento_referencia: null,
            observaciones: '[EXCEPCIÓN FUERA DE PERIODO]: Pendientes 2024',
            estado: 'REGISTRADO',
            motivo_anulacion: null,
            anulado_en: null,
            creado_en: '2026-10-01T00:00:00Z',
            actualizado_en: '2026-10-01T00:00:00Z',
            fechas: [{ id: 1, fecha: '2026-10-07', computable: true, motivo_exclusion: null, activo: true }],
          },
        ],
      },
    });
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Mis vacaciones');
    expect(text).toContain('Miércoles 7 de octubre de 2026');
    expect(text).toContain('Disfrute fuera de periodo de origen');
    expect(text).toContain('Información del registro de Recursos Humanos, sujeta a validación administrativa');
    expect(text).not.toContain('PROVISIONAL');
    expect(text).not.toContain('Provisional');
    expect(text).not.toContain('CONFIRMADA');
    expect(text).not.toContain('AJUSTADA');
    expect(text).not.toContain('Registrar vacaciones');
    expect(text).not.toContain('Ajustar días asignados');
    expect(text).not.toContain('Anular');
  });

  it('muestra mensaje controlado cuando el usuario no tiene vinculación institucional (403)', async () => {
    fixture.detectChanges();
    const req = httpMock.expectOne((r) => r.url.endsWith('/api/rh/mi-vacaciones'));
    req.flush(
      { error: 'Tu cuenta no está vinculada a una persona institucional activa' },
      { status: 403, statusText: 'Forbidden' }
    );
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#rh-mis-vacaciones-error')).not.toBeNull();
  });
});
