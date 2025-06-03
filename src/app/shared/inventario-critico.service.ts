import { Injectable } from '@angular/core';
import { Cita } from '../models/Cita';

export interface ArticuloCritico {
  clave: string;
  descripcion: string;
  emitidas: number;
  recibidas: number;
  porcentaje: number;
  nivel: 'Crítico' | 'Riesgo' | 'Estable';
}

@Injectable({ providedIn: 'root' })
export class InventarioCriticoService {

  detectarCriticos(citas: Cita[]): ArticuloCritico[] {
    const agrupados = new Map<string, ArticuloCritico>();

    for (const cita of citas) {
      if(cita.estatus.toLocaleUpperCase() === 'NO RECIBIR') continue;
      const clave = cita.clave_cnis || 'SIN CLAVE';
      const desc = cita.descripcion || 'SIN DESCRIPCIÓN';

      const item = agrupados.get(clave) || {
        clave,
        descripcion: desc,
        emitidas: 0,
        recibidas: 0,
        porcentaje: 0,
        nivel: 'Estable' as const
      };

      item.emitidas += cita.no_de_piezas_emitidas || 0;
      item.recibidas += cita.pzas_recibidas_por_la_entidad || 0;

      agrupados.set(clave, item);
    }

    const lista = Array.from(agrupados.values()).map(item => {
      item.porcentaje = item.emitidas > 0 ? (item.recibidas / item.emitidas) * 100 : 0;
      item.nivel =
        item.porcentaje < 30 ? 'Crítico' :
        item.porcentaje < 60 ? 'Riesgo' :
        'Estable';
      return item;
    });

    return lista
      .filter(a => a.emitidas > 0 && a.porcentaje <= 100)
      .sort((a, b) => a.porcentaje - b.porcentaje);
  }
}
