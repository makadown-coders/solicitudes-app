// src/app/models/cita-slim-inventario.model.ts
export interface CitaSlimExistencia {
  clave_cnis: string;
  lote: string;
  precio_unitario: number | null;
  orden_de_suministro: string | null;
  fte_fmto: string | null;
  proveedor: string | null;
}

export interface CitaSlimByClaveLote {
  precio?: number | null;
  orden?: string | null;
  fte?: string | null;
  proveedor?: string | null;
}
