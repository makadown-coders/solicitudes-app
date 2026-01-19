// movimiento-trazabilidad.model.ts
export interface MovimientoTrazabilidad {
  tipo_movimiento: 'entrada' | 'traspaso' | 'salida' | 'faltante';
  fecha: string;
  clave_cnis: string;
  descripcion: string | null;
  cantidad: number;

  cluesimb: string | null;
  nombre_unidad: string;
  alias_unidad: string | null;

  proveedor?: string | null;
  folio?: string | null;
  lote?: string | null;
  fecha_caducidad?: string | null;
  observaciones?: string | null;
}
