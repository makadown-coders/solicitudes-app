// src/app/models/almacen-clave-resumen.model.ts
import { UnidadClaveResumen } from './unidad-clave-resumen.model';

/**
 * Usado en dashboard abasto > Existencias > Existencias X Clave
 */
export interface AlmacenClaveResumen {
  almacen: string;
  unidades: UnidadClaveResumen[];
}
