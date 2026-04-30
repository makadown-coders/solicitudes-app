export interface IbOncoListResponse<T> {
  ok: boolean;
  count: number;
  data: T[];
}

export interface IbOncoPaginatedResponse<T> {
  count: number;
  total: number;
  page: number;
  limit: number;
  offset: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  rows: T[];
}

export interface IbOncoUnidad {
  id: number;
  cluesimb: string;
  cluessa?: string | null;
  nombre_de_unidad?: string | null;
  nombre_municipio?: string | null;
}

export interface IbOncoClave {
  id: number;
  cluesimb: string;
  clave_cnis: string;
  descripcion?: string | null;
}

export type IbOncoEstadoAbasto = 'ok' | 'posible sobre abasto';
export type IbOncoEstadoAbastoFiltro = '' | IbOncoEstadoAbasto;

export interface IbOncoAbastoCpmRow {
  cluesimb: string;
  nombre_de_unidad?: string | null;
  clave_cnis: string;
  descripcion?: string | null;
  existencias: number;
  cpm: number;
  cpm_x_3: number;
  cpms_eq: number;
  estado_abasto: IbOncoEstadoAbasto | string;
  citas_pendientes: number;
  piezas_pendientes: number;
  tiene_citas_pendientes: boolean;
}

export interface IbOncoCitaPendiente {
  id: number;
  ejercicio?: number | null;
  orden_de_suministro?: string | null;
  institucion?: string | null;
  contrato?: string | null;
  cluesimb: string;
  nombre_de_unidad?: string | null;
  clave_cnis: string;
  descripcion?: string | null;
  proveedor?: string | null;
  compra?: string | null;
  tipo_de_entrega?: string | null;
  fte_fmto?: string | null;
  tipo_de_red?: string | null;
  tipo_de_insumo?: string | null;
  grupo_terapeutico?: string | null;
  precio_unitario?: number | null;
  no_de_piezas_emitidas: number;
  pzas_recibidas_por_la_entidad: number;
  fecha_emision?: string | null;
  fecha_limite_de_entrega?: string | null;
  fecha_de_cita?: string | null;
  estatus?: string | null;
  folio_abasto?: string | null;
}

export interface IbOncoResumenUnidad {
  cluesimb: string;
  nombre_de_unidad?: string | null;
  claves_onco: number;
  claves_posible_sobre_abasto: number;
  existencias_total: number;
  cpm_total: number;
  citas_pendientes: number;
  piezas_pendientes: number;
}

export interface IbOncoAbastoCpmParams {
  cluesimb?: string;
  clave_cnis?: string;
  estado_abasto?: IbOncoEstadoAbastoFiltro;
  search?: string;
  window_days?: number;
  page?: number;
  limit?: number;
}

export interface IbOncoCitasPendientesParams {
  cluesimb?: string;
  clave_cnis?: string;
  window_days?: number;
  page?: number;
  limit?: number;
}
