import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RhTrabajadorFichaResponse } from '../../services/rh.service';
import { RH_ASISTENCIA_DEFAULT_PLACEHOLDERS } from './asistencia/rh-asistencia-holidays.data';
import { RhFichaTrabajadorDialogComponent } from './rh-ficha-trabajador-dialog.component';
import {
  formatRhHorarioRango,
  RH_HORARIO_SUGERENCIAS,
  RH_JORNADA_SUGERENCIAS,
  RH_TURNO_SUGERENCIAS,
} from './rh-laboral-sugerencias.constants';

function buildFicha(puesto: string | null = null): RhTrabajadorFichaResponse {
  return {
    unidad: { id: 177, nombre: 'OFICINA CENTRAL', cluesimb: 'N/A' },
    personal: {
      persona_id: 42,
      nombre_completo: 'ANA LOPEZ',
      nombres: 'ANA',
      apellidos: 'LOPEZ',
      tiene_rfc: false,
      rfc_masked: null,
      tiene_curp: false,
      curp_masked: null,
      activo: true,
    },
    laboral: {
      adscripcion_laboral_id: 901,
      unidad_medica_id: 177,
      matricula: 'MAT-001',
      puesto,
      turno: 'Turno Histórico Especial',
      jornada: null,
      horario: null,
      vigente_desde: '2026-01-01',
      vigente_hasta: null,
      activo: true,
      observaciones: null,
    },
    permisos: {
      puede_editar_laboral: true,
      puede_revelar_sensibles: true,
      puede_editar_identificacion: true,
    },
  };
}

describe('Captura laboral asistida (RH-UX-05B)', () => {
  it('reutiliza las convenciones del generador de asistencia sin imponer valores', () => {
    expect(RH_JORNADA_SUGERENCIAS).toContain(RH_ASISTENCIA_DEFAULT_PLACEHOLDERS.jornada);
    expect(RH_HORARIO_SUGERENCIAS).toContain(RH_ASISTENCIA_DEFAULT_PLACEHOLDERS.horario);
    expect(RH_TURNO_SUGERENCIAS.length).toBeGreaterThan(0);

    expect(formatRhHorarioRango('08:00', '16:30')).toBe('08:00 – 16:30 HRS');
    expect(formatRhHorarioRango('', '16:30')).toBeNull();
    expect(formatRhHorarioRango('25:00', '16:30')).toBeNull();
  });

  describe('RhFichaTrabajadorDialogComponent - sugerencias editables', () => {
    let fixture: ComponentFixture<RhFichaTrabajadorDialogComponent>;
    let component: RhFichaTrabajadorDialogComponent;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [RhFichaTrabajadorDialogComponent],
        providers: [provideHttpClient(), provideHttpClientTesting()],
      }).compileComponents();

      fixture = TestBed.createComponent(RhFichaTrabajadorDialogComponent);
      component = fixture.componentInstance;
    });

    it('ofrece cargo de Plantilla solo cuando puesto está vacío y aplica únicamente por acción explícita sin guardar', () => {
      component.open = true;
      component.ficha = buildFicha(null);
      component.cargoDirectorio = 'JEFE DE DEPARTAMENTO';
      fixture.detectChanges();

      const saveSpy = spyOn(component.saveLaboral, 'emit');
      component.startEditLaboral();
      fixture.detectChanges();

      expect(component.draftPuesto()).toBe('');
      expect(fixture.nativeElement.querySelector('#rh-ficha-usar-cargo-plantilla-btn')).not.toBeNull();

      component.aplicarCargoPlantillaSugerido();
      fixture.detectChanges();

      expect(component.draftPuesto()).toBe('JEFE DE DEPARTAMENTO');
      expect(saveSpy).not.toHaveBeenCalled();

      // Cancelar descarta cambios sin emitir guardado
      component.cancelEditLaboral();
      fixture.detectChanges();
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('conserva puesto existente e histórico de turno sin sobrescribir automáticamente', () => {
      component.open = true;
      component.ficha = buildFicha('COORDINADOR ESTATAL');
      component.cargoDirectorio = 'OTRO CARGO';
      fixture.detectChanges();

      component.startEditLaboral();
      fixture.detectChanges();

      expect(component.draftPuesto()).toBe('COORDINADOR ESTATAL');
      expect(component.draftTurno()).toBe('Turno Histórico Especial');
      expect(fixture.nativeElement.querySelector('#rh-ficha-usar-cargo-plantilla-btn')).toBeNull();
    });

    it('permite aplicar rango de horario asistido y emitir guardado explícito', () => {
      component.open = true;
      component.ficha = buildFicha(null);
      fixture.detectChanges();

      const saveSpy = spyOn(component.saveLaboral, 'emit');
      component.startEditLaboral();
      component.draftHoraEntrada.set('08:00');
      component.draftHoraSalida.set('17:00');
      component.aplicarDraftHorarioRango();
      component.draftJornada.set(RH_ASISTENCIA_DEFAULT_PLACEHOLDERS.jornada);
      fixture.detectChanges();

      expect(component.draftHorario()).toBe('08:00 – 17:00 HRS');
      expect(saveSpy).not.toHaveBeenCalled();

      component.onSubmitEditLaboral();
      expect(saveSpy).toHaveBeenCalledWith({
        jornada: 'LUNES A VIERNES',
        horario: '08:00 – 17:00 HRS',
      });
    });
  });
});
