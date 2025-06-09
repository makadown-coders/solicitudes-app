
export class Cita {
  ejercicio: number | null;
  orden_de_suministro: string;
  institucion: string;
  contrato: string;
  procedimiento: string;
  tipo_de_entrega: string;
  clues_destino: string;
  unidad: string;
  fte_fmto: string;
  proveedor: string;
  clave_cnis: string;
  descripcion: string;
  compra: string;
  tipo_de_red: string;
  tipo_de_insumo: string;
  grupo_terapeutico: string;
  precio_unitario: number | null;
  no_de_piezas_emitidas: number | null;
  fecha_limite_de_entrega: Date;
  pzas_recibidas_por_la_entidad: number | null;
  fecha_recepcion_almacen: string | null;
  numero_de_remision: string;
  lote: string;
  caducidad: string | null;
  estatus: string;
  folio_abasto: string;
  almacen_hospital_que_recibio: string;
  evidencia: string;
  carga: string;
  fecha_de_cita: Date | null;
  observacion: string;
  /**
   * Nuevo campo: fecha_limite_de_entrega - 15 días naturales
   */
  fecha_arranque_dist: Date;
}


// Define una interfaz para la estructura de una fila del Excel
export interface CitaRow {
  [key: string]: string | number | Date | null | undefined;
  0?: string; // ejercicio
  1?: string; // ordenSuministro
  2?: string; // institucion
  3?: string; // contrato
  4?: string; // procedimiento
  5?: string; // tipoEntrega
  6?: string; // cluesDestino
  7?: string; // unidad
  8?: string; // fuenteFormato
  9?: string; // proveedor
  10?: string; // claveCNIS
  11?: string; // descripcion
  12?: string; // compra
  13?: string; // tipoRed
  14?: string; // tipoInsumo
  15?: string; // grupoTerapeutico
  16?: string | number | null; // precioUnitario
  17?: string | number | null; // piezasEmitidas
  18?: string | Date; // fechaLimiteEntrega
  19?: string | number | null; // piezasRecibidas
  20?: string | Date | null; // fechaRecepcionAlmacen
  21?: string; // numeroRemision
  22?: string; // lote
  23?: string | Date | null; // caducidad
  24?: string; // estatus
  25?: string; // folioAbasto
  26?: string; // almacenHospital
  27?: string; // evidencia
  28?: string; // carga
  29?: string | Date | null; // fechaCita
  30?: string; // observacion
}
