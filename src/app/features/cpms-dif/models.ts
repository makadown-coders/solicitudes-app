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
  descripcion?: string;
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

export interface CpmsDifIndicadorValueRow {
  label: string;
  value: number;
}

export interface CpmsDifTopDiferenciasRow {
  cluesimb: string;
  nombre_de_unidad: string;
  total_diferencias: number;
}

export interface CpmsDifTopImpactoRow {
  cluesimb: string;
  nombre_de_unidad: string;
  impacto_absoluto_total: number;
}

export interface CpmsDifComposicionUnidadRow {
  cluesimb: string;
  nombre_de_unidad: string;
  agregados: number;
  eliminados: number;
  total_modificados: number;
  modificados_mas: number;
  modificados_menos: number;
  total_diferencias: number;
}

export interface CpmsDifIndicadoresKpis {
  total_unidades_universo: number;
  total_unidades_con_cambios: number;
  total_unidades_sin_cambios: number;
  porcentaje_unidades_sin_cambios: number;
  total_claves_evaluadas: number;
  total_diferencias: number;
  total_agregados: number;
  total_eliminados: number;
  total_modificados: number;
  modificados_mas: number;
  modificados_menos: number;
  impacto_absoluto_total: number;
  porcentaje_modificados: number;
  porcentaje_agregados: number;
  porcentaje_eliminados: number;
  riesgo_global: string;
}

export interface CpmsDifIndicadoresCharts {
  distribucion_acciones: CpmsDifIndicadorValueRow[];
  top_unidades_por_diferencias: CpmsDifTopDiferenciasRow[];
  top_unidades_por_impacto: CpmsDifTopImpactoRow[];
  composicion_por_unidad: CpmsDifComposicionUnidadRow[];
}

export interface CpmsDifIndicadoresTutorialExcel {
  titulo: string;
  pasos: string[];
  recomendacion: string;
}

export interface CpmsDifIndicadoresResponse {
  kpis: CpmsDifIndicadoresKpis;
  charts: CpmsDifIndicadoresCharts;
  lectura_ejecutiva: string;
  tutorial_excel?: CpmsDifIndicadoresTutorialExcel;
}
