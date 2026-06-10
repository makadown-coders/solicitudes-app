// src/app/models/unidad-clave-resumen.model.ts

import { FactorUnidad } from './factor-unidad';

/**
 * Usado en dashboard abasto > Existencias > Existencias X Clave
 */
export interface UnidadClaveResumen {
  unidad: string;
  municipio: string;
  cluesimb: string; 
  clave: {
    cpm: number;
    existencia: number;
    reposicion: number;
  };
  factorConversion?: FactorUnidad;
  existenciaDispensacion?: number;
}
