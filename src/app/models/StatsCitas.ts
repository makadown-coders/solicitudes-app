export interface KPIsResumen {
  registros: number;
  ordenes: number;
  emitidas: number;
  recibidas: number;
  cumplimiento_pct: number | null;
  min_fecha_cita: string | null;
  max_fecha_cita: string | null;
  min_fecha_recepcion: string | null;
  max_fecha_recepcion: string | null;
}

export interface SubtotalEstatus {
  estatus: string;
  ordenes: number;
  emitidas: number;
  recibidas: number;
  cumplimiento_pct: number | null;
}

export interface SubtotalTipoEntrega {
  tipo_de_entrega: string;
  ordenes: number;
  emitidas: number;
  recibidas: number;
  cumplimiento_pct: number | null;
}

export interface CumplimientoTimes {
  on_time: number;
  late: number;
  pendientes: number;
}

export interface ResumenResponse {
  filtros_aplicados: any;
  kpis: KPIsResumen | null;
  por_estatus: SubtotalEstatus[];
  por_tipo_entrega: SubtotalTipoEntrega[];
  cumplimiento: CumplimientoTimes | null;
}
