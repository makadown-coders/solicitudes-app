export type RadarRiesgoNivel = 'BAJO' | 'MEDIO' | 'ALTO' | 'CRITICO';

export type RadarEstadoEvento = 'abierto' | 'en_seguimiento' | 'cerrado';

export type RadarEventoClaveDraft = {
  clave_cnis: string;
  descripcion?: string | null;
};

export type RadarCrearEventoPayload = {
  fecha_evento?: string;
  clues: string;
  unidad_nombre?: string | null;
  tipo_insumo?: string | null;
  fecha_referencia?: string | null;
  motivo: string;
  observaciones?: string | null;
  estado?: RadarEstadoEvento;
  creado_por?: string | null;
  claves: RadarEventoClaveDraft[];
};

export type RadarEventoResumen = {
  total_claves: number;
  riesgo_maximo: RadarRiesgoNivel | null;
  critico: number;
  alto: number;
  medio: number;
  bajo: number;
};

export type RadarCrearEventoResponse = {
  id: number;
  fecha_evento: string;
  clues: string;
  estado: RadarEstadoEvento;
  resumen: RadarEventoResumen;
};

export type RadarEventoHeader = {
  id: number;
  fecha_evento: string;
  clues: string;
  unidad_nombre: string | null;
  tipo_insumo: string | null;
  fecha_referencia: string | null;
  motivo: string;
  observaciones: string | null;
  estado: RadarEstadoEvento;
  creado_por: string | null;
  created_at: string;
  total_claves: number;
  riesgo_maximo: RadarRiesgoNivel | null;
};

export type RadarEventoClave = {
  id: number;
  evento_id: number;
  clave_cnis: string;
  descripcion: string | null;
  existencia_actual: number;
  consumo_promedio: number;
  dias_cobertura: number | null;
  citas_pendientes: number;
  entradas_30d: number;
  salidas_30d: number;
  traspasos_30d: number;
  solicitado_30d: number;
  movimientos_recientes: number;
  nivel_riesgo: RadarRiesgoNivel;
  flags: string[];
  created_at: string;
  recalculated_at: string | null;
};

export type RadarEventoDetalle = {
  evento: RadarEventoHeader;
  claves: RadarEventoClave[];
};

export type RadarListarEventosResponse = {
  page: number;
  pageSize: number;
  total: number;
  data: RadarEventoHeader[];
};

export type RadarGlobalSolicitudRow = {
  id: string;
  created_day: string;
  created_at: string;
  cluesimb: string;
  tipo_pedido: string;
  tipos_insumo: string;
  periodo_texto: string | null;
  total_renglones: number;
  total_piezas: number;
  solicitado_acumulado: number;
  solicitado_promedio: number;
};

export type RadarGlobalSnapshotResponse = {
  mode: 'snapshot';
  page: number;
  pageSize: number;
  total: number;
  summary: {
    total_combinaciones: number;
    total_renglones: number;
    total_piezas: number;
  };
  data: RadarGlobalSolicitudRow[];
};

export type RadarGlobalTimelineResponse = {
  mode: 'timeline';
  months: number;
  page: number;
  pageSize: number;
  total: number;
  summary: {
    total_registros: number;
    total_renglones: number;
    total_piezas: number;
  };
  data: RadarGlobalSolicitudRow[];
};

export type RadarGlobalClaveRiesgoRow = {
  cluesimb: string;
  nombre_de_unidad: string | null;
  clave: string;
  descripcion: string | null;
  solicitado_acumulado: number;
  solicitado_promedio: number;
  solicitado_periodo: number;
  renglones_solicitados: number;
  existencia_actual: number;
  consumo_promedio: number;
  dias_cobertura: number | null;
  entradas_30d: number;
  salidas_30d: number;
  ultima_solicitud: string | null;
  puntaje_desabasto: number;
  nivel_desabasto: 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAJO';
  puntaje_sobreabasto: number;
  nivel_sobreabasto: 'ALTO' | 'MEDIO' | 'BAJO';
};

export type RadarGlobalClavesRiesgoResponse = {
  mode: 'claves-riesgo';
  window: { months: number };
  page: number;
  pageSize: number;
  total: number;
  data: RadarGlobalClaveRiesgoRow[];
  top_desabasto: RadarGlobalClaveRiesgoRow[];
  top_sobreabasto: RadarGlobalClaveRiesgoRow[];
};

export type RadarGlobalV2Segmento =
  | 'CRITICA_CPM' | 'ATENCION_CPM' | 'DEMANDA_SIN_CPM'
  | 'CPM_SIN_SOLICITUD' | 'CUBIERTA' | 'OBSERVAR';

export type RadarGlobalV2Row = {
  cluesimb: string;
  nombre_de_unidad: string | null;
  clave: string;
  descripcion: string | null;
  cpm: number;
  en_cpm: boolean;
  existencia_actual: number;
  snapshot_existencias: string | null;
  cobertura_cpm: number | null;
  cobertura_dias: number | null;
  solicitado_periodo: number;
  ciclos_con_clave: number;
  ciclos_unidad: number;
  frecuencia_solicitud: number;
  primera_solicitud: string | null;
  ultima_solicitud: string | null;
  homologos_disponibles: number;
  existencia_homologos_equivalente: number;
  mejor_homologo: string | null;
  segmento: RadarGlobalV2Segmento;
  prioridad: number;
  razones: string[];
};

export type RadarGlobalV2Response = {
  mode: 'radar-global-v2';
  window: { months: number };
  page: number;
  pageSize: number;
  total: number;
  summary: {
    criticas_cpm: number;
    atencion_cpm: number;
    demanda_sin_cpm: number;
    cpm_sin_solicitud: number;
    cubiertas: number;
  };
  data: RadarGlobalV2Row[];
};

