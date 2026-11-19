import {
  RhAsistenciaDocumentPlaceholders,
  RhAsistenciaInstitutionalCalendar,
} from './rh-asistencia.models';

export const RH_ASISTENCIA_MONTHS_CATALOG = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
].map((label, index) => ({
  value: index + 1,
  label,
  upper: label.toUpperCase(),
}));

export const RH_ASISTENCIA_DEFAULT_PLACEHOLDERS: Omit<
  RhAsistenciaDocumentPlaceholders,
  'nombre' | 'puesto' | 'mes' | 'anio'
> = {
  jornada: 'LUNES A VIERNES',
  horario: '08:00 – 17:00 HRS',
  adscripcion: 'COORDINACIÓN ESTATAL DE IMSS BIENESTAR BAJA CALIFORNIA',
};

/**
 * Calendarios institucionales de días de descanso obligatorio.
 * Para incorporar otro ejercicio se agrega una entrada respaldada por su circular oficial.
 */
export const RH_ASISTENCIA_INSTITUTIONAL_CALENDARS: Readonly<
  Record<number, RhAsistenciaInstitutionalCalendar>
> = {
  2026: {
    year: 2026,
    source: 'Circular IB-UAF-CRH-0003-2026',
    confirmed: true,
    holidays: [
      {
        id: 'new-year',
        name: 'Año Nuevo',
        scope: 'general',
        dateRule: { type: 'fixed', month: 1, day: 1 },
      },
      {
        id: 'constitution-day',
        name: 'Conmemoración de la Constitución',
        scope: 'general',
        dateRule: { type: 'nth-weekday', month: 2, weekday: 1, occurrence: 1 },
      },
      {
        id: 'benito-juarez',
        name: 'Conmemoración del natalicio de Benito Juárez',
        scope: 'general',
        dateRule: { type: 'nth-weekday', month: 3, weekday: 1, occurrence: 3 },
      },
      {
        id: 'labor-day',
        name: 'Día del Trabajo',
        scope: 'general',
        dateRule: { type: 'fixed', month: 5, day: 1 },
      },
      {
        id: 'independence-day',
        name: 'Día de la Independencia',
        scope: 'general',
        dateRule: { type: 'fixed', month: 9, day: 16 },
      },
      {
        id: 'revolution-day',
        name: 'Conmemoración de la Revolución Mexicana',
        scope: 'general',
        dateRule: { type: 'nth-weekday', month: 11, weekday: 1, occurrence: 3 },
      },
      {
        id: 'christmas',
        name: 'Navidad',
        scope: 'general',
        dateRule: { type: 'fixed', month: 12, day: 25 },
      },
      {
        id: 'battle-of-puebla',
        name: 'Conmemoración de la Batalla de Puebla',
        scope: 'additional',
        dateRule: { type: 'fixed', month: 5, day: 5 },
        applicability:
          'Aplicable únicamente a los trabajadores que indique la circular; no se sombrea de forma general.',
      },
    ],
  },
};

export function getRhAsistenciaInstitutionalCalendar(
  year: number
): RhAsistenciaInstitutionalCalendar | undefined {
  return RH_ASISTENCIA_INSTITUTIONAL_CALENDARS[year];
}
