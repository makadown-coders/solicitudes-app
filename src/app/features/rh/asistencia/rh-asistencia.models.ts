export type RhAsistenciaHolidayScope = 'general' | 'additional';

export type RhAsistenciaHolidayDateRule =
  | { type: 'fixed'; month: number; day: number }
  | { type: 'nth-weekday'; month: number; weekday: number; occurrence: number };

export interface RhAsistenciaHolidayRule {
  id: string;
  name: string;
  scope: RhAsistenciaHolidayScope;
  dateRule: RhAsistenciaHolidayDateRule;
  applicability?: string;
}

export interface RhAsistenciaInstitutionalCalendar {
  year: number;
  source: string;
  confirmed: boolean;
  holidays: RhAsistenciaHolidayRule[];
}

export interface RhAsistenciaDayInfo {
  day: number;
  date: Date;
  dayOfWeek: number;
  dayName: string;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string;
  isShaded: boolean;
}

export interface RhAsistenciaMonthCalendarSummary {
  year: number;
  month: number;
  monthName: string;
  daysInMonth: number;
  secondSectionStartDay: number;
  isLeapYear: boolean;
  hasConfirmedInstitutionalCalendar: boolean;
  weekendDaysCount: number;
  effectiveHolidaysCount: number;
  workingDaysCount: number;
  days: RhAsistenciaDayInfo[];
}

export interface RhAsistenciaDocumentPlaceholders {
  nombre: string;
  puesto: string;
  mes: string;
  anio: string;
  jornada: string;
  horario: string;
  adscripcion: string;
}

/**
 * Parámetros de entrada para generar o descargar el formato institucional
 * de «Mi lista de asistencia».
 */
export interface RhAsistenciaGenerateParams {
  nombre: string;
  puesto: string;
  adscripcion?: string | null;
  jornada?: string | null;
  horario?: string | null;
  mes: number;
  anio: number;
}
