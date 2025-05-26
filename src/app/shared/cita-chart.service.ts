// src/app/shared/cita-chart.service.ts
import { Injectable } from '@angular/core';
import { Cita } from '../models/Cita';
import { ChartConfiguration } from 'chart.js';

@Injectable({ providedIn: 'root' })
export class CitaChartService {

  obtenerPiezasPorUnidad(citasFiltradas: Cita[]): ChartConfiguration<'bar'>['data'] {
    const datos: { [unidad: string]: { [tipoEntrega: string]: number } } = {};
    const etiquetasHospitales = new Set<string>();
    const etiquetasTipos = new Set<string>();

    citasFiltradas.forEach(cita => {
      const unidad = cita.unidad ?? 'SIN UNIDAD';
      const tipo = (cita.tipo_de_insumo ?? 'OTRO').toUpperCase();
      etiquetasHospitales.add(unidad.toUpperCase());
      etiquetasTipos.add(tipo);

      if (!datos[unidad]) datos[unidad] = {};
      datos[unidad][tipo] = (datos[unidad][tipo] || 0) + (cita.pzas_recibidas_por_la_entidad || 0);
    });

    const hospitales = Array.from(etiquetasHospitales);
    const tiposEntrega = Array.from(etiquetasTipos);
    const colores = ['#2E8B57', '#CBA135', '#FFD700', '#FF0000', '#000000']; // Verde y dorado IMSS-Bienestar

    const datasets = tiposEntrega.map((tipo, idx) => ({
      label: tipo,
      data: hospitales.map(h => datos[h]?.[tipo] || 0),
      backgroundColor: colores[idx % colores.length],
      borderColor: '#2E8B57',
      borderWidth: 1,
    }));

    return {
      labels: hospitales,
      datasets,
    };
  }

  obtenerTendenciaDiaria(citasFiltradas: Cita[]): ChartConfiguration<'line'>['data'] {
    const mapFecha = new Map<string, number>();

    citasFiltradas.forEach(cita => {
      const fecha = cita.fecha_recepcion_almacen;
      if (fecha) {
        mapFecha.set(fecha, (mapFecha.get(fecha) || 0) + (cita.pzas_recibidas_por_la_entidad || 0));
      }
    });

    const fechasOrdenadas = Array.from(mapFecha.keys()).sort();
    const valores = fechasOrdenadas.map(f => mapFecha.get(f) || 0);

    return {
      labels: fechasOrdenadas,
      datasets: [{
        data: valores,
        label: 'Tendencia diaria',
        fill: true,
        tension: 0.3,
        borderColor: '#006341',
        backgroundColor: 'rgba(0, 99, 65, 0.2)',
        pointBackgroundColor: '#CBA135',
        pointBorderColor: '#006341',
        pointRadius: 4
      }]
    };
  }
}
