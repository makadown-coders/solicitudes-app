import { RH_ASISTENCIA_DEFAULT_PLACEHOLDERS } from './asistencia/rh-asistencia-holidays.data';

/**
 * Sugerencias editables (no normativas) para captura asistida de datos laborales
 * en vinculación individual y edición de ficha laboral (RH-UX-05B).
 *
 * Reutiliza las convenciones del generador de hojas de asistencia (`/rh`)
 * sin modificar dicho generador ni imponer valores predeterminados sin elección explícita.
 */
export const RH_TURNO_SUGERENCIAS: ReadonlyArray<string> = [
  'Matutino',
  'Vespertino',
  'Nocturno',
  'Mixto',
  'Jornada acumulada',
];

export const RH_JORNADA_SUGERENCIAS: ReadonlyArray<string> = [
  RH_ASISTENCIA_DEFAULT_PLACEHOLDERS.jornada,
  'LUNES A SÁBADO',
  'SÁBADOS, DOMINGOS Y DÍAS FESTIVOS',
];

export const RH_HORARIO_SUGERENCIAS: ReadonlyArray<string> = [
  RH_ASISTENCIA_DEFAULT_PLACEHOLDERS.horario,
  '08:00 – 16:00 HRS',
  '07:00 – 15:00 HRS',
  '14:00 – 21:00 HRS',
];

const HH_MM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Construye una cadena de horario con el formato institucional usado en
 * `RH_ASISTENCIA_DEFAULT_PLACEHOLDERS.horario` (`HH:MM – HH:MM HRS`).
 * Devuelve `null` si alguna hora es inválida o está vacía.
 */
export function formatRhHorarioRango(entrada: string, salida: string): string | null {
  const start = entrada.trim();
  const end = salida.trim();
  if (!HH_MM_REGEX.test(start) || !HH_MM_REGEX.test(end)) {
    return null;
  }
  return `${start} – ${end} HRS`;
}
