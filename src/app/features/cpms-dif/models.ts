// Models for CPMS DIF feature
export interface CpmsDifResponse<T> {
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

export type CpmsDifObservacion = 'AGREGADO' | 'ELIMINADO' | 'MODIFICADO';

export interface CpmsDifRow {
  cluesimb: string;
  nombre_de_unidad: string;
  clave_cnis: string;
  cpm_cdmx: number;
  cpm_propuesto: number;
  diferencia: number;
  observacion: CpmsDifObservacion;
}

export interface CpmsDifResumenRow {
  cluesimb: string;
  nombre_de_unidad: string;
  total_diferencias: number;
  agregados: number;
  eliminados: number;
  modificados: number;
  impacto_absoluto_total: number;
}
