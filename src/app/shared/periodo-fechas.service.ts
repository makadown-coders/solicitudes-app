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
}
