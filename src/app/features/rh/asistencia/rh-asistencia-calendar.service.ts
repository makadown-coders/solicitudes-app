import { Injectable } from '@angular/core';
import {
  getRhAsistenciaInstitutionalCalendar,
  RH_ASISTENCIA_MONTHS_CATALOG,
} from './rh-asistencia-holidays.data';
import {
  RhAsistenciaDayInfo,
  RhAsistenciaHolidayRule,
  RhAsistenciaMonthCalendarSummary,
} from './rh-asistencia.models';

const DAY_NAMES_ES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

@Injectable({ providedIn: 'root' })
export class RhAsistenciaCalendarService {
  isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  getDaysInMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
  }

  /**
   * Calcula el día en que inicia el segundo bloque de la tabla de asistencia:
   * el primer lunes a partir del día 16, para conservar semanas completas.
   */
  getSecondSectionStartDay(year: number, month: number): number {
    const dayOfWeek = new Date(year, month - 1, 16).getDay();
    const daysUntilMonday = (8 - dayOfWeek) % 7;
    return 16 + daysUntilMonday;
  }

  resolveHolidayDay(year: number, rule: RhAsistenciaHolidayRule): number | null {
    const dateRule = rule.dateRule;
    const daysInMonth = this.getDaysInMonth(year, dateRule.month);

    if (dateRule.type === 'fixed') {
      return dateRule.day >= 1 && dateRule.day <= daysInMonth ? dateRule.day : null;
    }

    let occurrences = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      if (
        new Date(year, dateRule.month - 1, day).getDay() === dateRule.weekday &&
        ++occurrences === dateRule.occurrence
      ) {
        return day;
      }
    }

    return null;
  }

  buildMonthCalendar(year: number, month: number): RhAsistenciaMonthCalendarSummary {
    const daysInMonth = this.getDaysInMonth(year, month);
    const institutionalCalendar = getRhAsistenciaInstitutionalCalendar(year);
    const confirmed = institutionalCalendar?.confirmed === true;
    const applicableCalendar =
      institutionalCalendar ?? getRhAsistenciaInstitutionalCalendar(2026);

    const resolvedHolidays = new Map<number, string>();
    for (const rule of applicableCalendar?.holidays ?? []) {
      if (rule.scope !== 'general' || rule.dateRule.month !== month) {
        continue;
      }
      const day = this.resolveHolidayDay(year, rule);
      if (day !== null) {
        resolvedHolidays.set(day, rule.name);
      }
    }

    const days: RhAsistenciaDayInfo[] = [];
    let weekendDaysCount = 0;
    let effectiveHolidaysCount = 0;
    let workingDaysCount = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const holidayName = resolvedHolidays.get(day);
      const isHoliday = Boolean(holidayName);

      if (isWeekend) {
        weekendDaysCount++;
      } else if (isHoliday) {
        effectiveHolidaysCount++;
      } else {
        workingDaysCount++;
      }

      days.push({
        day,
        date,
        dayOfWeek,
        dayName: DAY_NAMES_ES[dayOfWeek],
        isWeekend,
        isHoliday,
        holidayName,
        isShaded: isWeekend || isHoliday,
      });
    }

    return {
      year,
      month,
      monthName:
        RH_ASISTENCIA_MONTHS_CATALOG.find((entry) => entry.value === month)?.upper ?? '',
      daysInMonth,
      secondSectionStartDay: this.getSecondSectionStartDay(year, month),
      isLeapYear: this.isLeapYear(year),
      hasConfirmedInstitutionalCalendar: confirmed,
      weekendDaysCount,
      effectiveHolidaysCount,
      workingDaysCount,
      days,
    };
  }
}
