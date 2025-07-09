// src/app/models/datos-clave-seleccionada.model.ts

/**
 * Usado en dashboard abasto > Existencias > Existencias X Clave
 */
export interface DatosClaveSeleccionada {
  clave: string;
  descripcion: string;
  clasificacion: string;
  unidadPresentacion: string;
}
