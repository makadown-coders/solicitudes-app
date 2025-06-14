import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class PeriodoFechasService {
  /**
     * Asegura que fecha1 sea la menor y fecha2 la mayor.
     */
  ordenarFechas(fecha1: Date, fecha2: Date): [Date, Date] {
    return fecha1.getTime() <= fecha2.getTime()
      ? [fecha1, fecha2]
      : [fecha2, fecha1];
  }

  /**
   * Formatea el rango como "01-30 ABRIL 2025" o "30 ABRIL 2025 - 05 MAYO 2025"
   */
  formatearRango(inicio: Date, fin: Date): string {
    const f = (d: Date) => ({
      dia: d.getDate().toString().padStart(2, '0'),
      mes: d.toLocaleString('es-MX', { month: 'long' }).toUpperCase(),
      anio: d.getFullYear()
    });

    const ini = f(inicio);
    const finF = f(fin);

    if (ini.mes === finF.mes && ini.anio === finF.anio) {
      return `${ini.dia}-${finF.dia} ${ini.mes} ${ini.anio}`;
    } else {
      return `${ini.dia} ${ini.mes} ${ini.anio} - ${finF.dia} ${finF.mes} ${finF.anio}`;
    }
  }

  fechaEnRango(fechaTexto: string | null, inicio: Date, fin: Date): boolean {
    if (!fechaTexto || fechaTexto.trim().length === 0) return false;

    return fechaTexto.split('/')
      .map(f => new Date(f.trim()))
      .some(fecha => {
        return !isNaN(fecha.getTime()) && fecha >= inicio && fecha <= fin;
      });
  }


  excelDateToJSDate(serial: number): Date {
    try {
      const daysSince1900 = serial - 1; // Ajuste porque el 1 de enero de 1900 es el día 1
      const date = new Date(1900, 0, daysSince1900);
      return date;
    } catch (error) {
      console.error('Error al convertir la fecha:', error);
      console.error('Serial:', serial);
      throw error;
    }
  }

  /**
  * Convierte una fecha en formato de serial de Excel a un string en formato ISO (YYYY-MM-DD).
  * Si la entrada es null o ya se encuentra en formato ISO, se devuelve la entrada sin cambios.
  * @param serial Fecha en formato de serial de Excel
  * @returns string | null
  */
  excelDateToDatestring(serial: string | null): string | null {
    try {
      if (!serial) return null;
      if ((serial + '').includes('-') || (serial + '').includes('/')) return serial;
      const jsDate = this.excelDateToJSDate(+serial);

      const day = String(jsDate.getDate()).padStart(2, '0');
      const month = String(jsDate.getMonth() + 1).padStart(2, '0'); // Los meses en JavaScript son 0-indexados
      const year = jsDate.getFullYear();

      const dateString = `${year}-${month}-${day}`;
      return !dateString.includes('NaN-NaN-NaN') ? dateString : null;
    } catch (error) {
      console.error('Error al convertir la fecha (excelDateToDatestring):', error);
      console.error('Serial:', serial);
      throw error;
    }
  }

  /**
  * Convierte una cadena con fechas separadas por guiones o slashes a una cadena con fechas en formato ISO (yyyy-mm-dd)
  * separadas por slashes.
  * @example '01-01-2022 02-02-2023' -> '2022-01-01/2023-02-02'
  * @example '01/01/2022' -> '2022-01-01'
  * @example '01-02-03' -> null (no cumple el formato)
  * @example '01-02-2023 03-04-2024' -> null (no cumple el formato)
  * @example null -> null
  * @param input Cadena con fechas separadas por guiones o slashes
  * @returns string | null
  */
  formatFechaMultiple(input: string | null | undefined): string | null {
    if (!input) return null;

    // Elimina espacios en blanco
    const cleaned = input.toString().replace(/\s+/g, '');

    // Divide por guiones o slashes
    const partes = cleaned.split(/[-/]/);

    const fechas: string[] = [];
    for (let i = 0; i < partes.length; i += 3) {
      if (partes[i] && partes[i + 1] && partes[i + 2]) {
        const dia = partes[i];
        const mes = partes[i + 1];
        const anio = partes[i + 2];

        if (/^\d{2}$/.test(dia) && /^\d{2}$/.test(mes) && /^\d{4}$/.test(anio)) {
          fechas.push(`${anio}-${mes}-${dia}`); // yyyy-mm-dd
        }
      }
    }

    return fechas.length > 0 ? fechas.join('/').replace('NaN-NaN-NaN', '') : null;
  }

  /**
   * Convierte una fecha en formato de serial de Excel a un objeto Date.
   * Usado para evitar errores de timezone al obtener fechas UTC.
   * @param dateStr Fecha en formato de serial de Excel
   * @returns Date
   */
  public parseLocalDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day); // Mes se indexa desde 0
  }

  /**
   * Método que recibe dos fechas e indica los dias que hay entre ellas
   * @param fecha1
   * @param fecha2
   * @returns number
   */
  public getDiasEntreFechas(fecha1: Date, fecha2: Date): number {
    // const diffTime = Math.abs(fecha2.getTime() - fecha1.getTime());
    const diffTime = fecha1.getTime() - fecha2.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

}
