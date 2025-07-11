// src/app/models/unidad-clave-resumen.model.ts

/**
 * Usado en dashboard abasto > Existencias > Existencias X Clave
 */
export interface UnidadClaveResumen {
  unidad: string;
  municipio: string;
  clave: {
    cpm: number;
    existencia: number;
    reposicion: number;
  };
}
