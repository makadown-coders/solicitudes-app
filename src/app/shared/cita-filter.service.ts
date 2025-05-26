// src/app/shared/cita-filter.service.ts
import { inject, Injectable } from '@angular/core';
import { Cita } from '../models/Cita';
import { FiltrosCita } from '../models/filtros-cita';
import { PeriodoFechasService } from './periodo-fechas.service';

@Injectable({ providedIn: 'root' })
export class CitaFilterService {
    fechasService = inject(PeriodoFechasService)

  filtrar(citas: Cita[], filtros: FiltrosCita): Cita[] {
    return citas.filter(cita => {
      //const fechaRecepcion = cita.fecha_recepcion_almacen ? new Date(cita.fecha_recepcion_almacen) : null;

      return (
        cita.fecha_recepcion_almacen &&
        this.fechasService.fechaEnRango(cita.fecha_recepcion_almacen, filtros.fechaInicio, filtros.fechaFin) &&
        (filtros.anios.length === 0 || filtros.anios.includes(cita.ejercicio || 0)) &&
        (filtros.estatus.length === 0 || filtros.estatus.includes((cita.estatus || '').toUpperCase())) &&
        (filtros.tipoEntrega.length === 0 || filtros.tipoEntrega.includes((cita.tipo_de_entrega || '').toUpperCase()))
      );
    });
  }
}
