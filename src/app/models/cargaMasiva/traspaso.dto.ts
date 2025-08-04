export interface TraspasoDTO {
  fecha_recepcion?: string;
  folio?: string;
  unidad_origen_id?: number;
  unidad_origen_texto?: string;
  clave_cnis: string;
  descripcion: string;
  cantidad: number;
  total?: number;
  unidad_destino_id?: number;
  unidad_destino_texto?: string;
  lote?: string;
  fecha_caducidad?: string;
  partida?: string;
}
