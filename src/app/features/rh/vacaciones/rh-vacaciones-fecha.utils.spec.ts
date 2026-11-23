import {
  formatFechaVacacionCortaEs,
  formatFechaVacacionLargaEs,
  selectPeriodoVigentePorFecha,
  sortFechasVacacionCronologico,
} from './rh-vacaciones-fecha.utils';

describe('rh-vacaciones-fecha.utils (RH-VAC-07A)', () => {
  it('formatea 2026-10-07 y 2026-12-23 como miércoles sin desplazamiento por zona horaria', () => {
    expect(formatFechaVacacionLargaEs('2026-10-07')).toBe('Miércoles 7 de octubre de 2026');
    expect(formatFechaVacacionCortaEs('2026-10-07')).toBe('Mié 07-oct-2026');

    expect(formatFechaVacacionLargaEs('2026-12-23')).toBe('Miércoles 23 de diciembre de 2026');
    expect(formatFechaVacacionCortaEs('2026-12-23')).toBe('Mié 23-dic-2026');
  });

  it('maneja cambios de mes y año correctamente en UTC', () => {
    expect(formatFechaVacacionLargaEs('2026-12-31')).toBe('Jueves 31 de diciembre de 2026');
    expect(formatFechaVacacionLargaEs('2027-01-01')).toBe('Viernes 1 de enero de 2027');
    expect(formatFechaVacacionCortaEs('2027-01-01')).toBe('Vie 01-ene-2027');
  });

  it('ordena fechas discontinuas cronológicamente sin mutar el arreglo original', () => {
    const input = [
      { fecha: '2026-12-28' },
      { fecha: '2026-12-23' },
      { fecha: '2026-12-24' },
    ];
    const sorted = sortFechasVacacionCronologico(input);
    expect(sorted.map((x) => x.fecha)).toEqual(['2026-12-23', '2026-12-24', '2026-12-28']);
    expect(input[0].fecha).toBe('2026-12-28');
  });

  it('selecciona automáticamente el periodo vigente según fecha local sin depender del orden ni IDs (RH-UX-VAC-08)', () => {
    const catalogoDesordenado = [
      { id: 99, clave: '2027-P2', anio: 2027, numero_periodo: 2, fecha_inicio: '2027-07-01', fecha_fin: '2027-12-31' },
      { id: 10, clave: '2026-P1', anio: 2026, numero_periodo: 1, fecha_inicio: '2026-01-01', fecha_fin: '2026-06-30' },
      { id: 44, clave: '2027-P1', anio: 2027, numero_periodo: 1, fecha_inicio: '2027-01-01', fecha_fin: '2027-06-30' },
      { id: 22, clave: '2026-P2', anio: 2026, numero_periodo: 2, fecha_inicio: '2026-07-01', fecha_fin: '2026-12-31' },
    ];

    expect(selectPeriodoVigentePorFecha(catalogoDesordenado, '2026-03-15').periodo?.clave).toBe('2026-P1');
    expect(selectPeriodoVigentePorFecha(catalogoDesordenado, '2026-11-23').periodo?.clave).toBe('2026-P2');
    expect(selectPeriodoVigentePorFecha(catalogoDesordenado, '2027-02-10').periodo?.clave).toBe('2027-P1');
    expect(selectPeriodoVigentePorFecha(catalogoDesordenado, '2027-09-15').periodo?.clave).toBe('2027-P2');

    // Catálogo sin periodo que cubra la fecha actual -> fallback seguro + cubreFechaActual = false
    const sinVigente = selectPeriodoVigentePorFecha(catalogoDesordenado, '2030-05-01');
    expect(sinVigente.cubreFechaActual).toBeFalse();
    expect(sinVigente.periodo?.clave).toBe('2027-P2');

    // Catálogo vacío
    const vacio = selectPeriodoVigentePorFecha([], '2026-11-23');
    expect(vacio.periodo).toBeNull();
    expect(vacio.cubreFechaActual).toBeFalse();
  });
});
