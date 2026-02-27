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

