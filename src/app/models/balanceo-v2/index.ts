export interface BalanceoV2ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface BalanceoV2EjecutarResponse {
  ok: boolean;
  ejecucionId: number;
}

export interface BalanceoV2Ejecucion {
  id: number;
  fecha_inicio: string;
  fecha_fin: string | null;
  estado: string;
  total_claves: number | null;
  claves_procesadas: number | null;
}

export interface BalanceoV2ResumenJurisdiccional {
  ejecucion_id: number;
  clave_cnis: string;
  descripcion?: string;
  descripcion_clave?: string;
  jurisdiccion: string;
  cpm_jurisdiccional: number;
  existencia_original_almacen: number;
  cantidad_apartada: number;
  existencia_balanceable_inicial: number;
  transferido_a_otros: number;
  recibido_de_otros: number;
  excedente_final: number;
  delta_vs_cpm: number;
  cubre_cpm_jurisdiccional: boolean;
}

export interface BalanceoV2Detalle {
  ejecucion_id: number;
  fecha_ejecucion: string;
  clave_cnis: string;
  jurisdiccion_almacen: string;
  jurisdiccion_destino: string;
  clues_destino: string;
  nombre_unidad_destino: string;
  necesidad_original: number;
  cantidad_sugerida: number;
  prioridad: number;
}

export interface BalanceoV2Apartado {
  id: number;
  ejecucion_id: number;
  fecha_ejecucion: string;
  clave_cnis: string;
  clues_almacen: string;
  nombre_almacen: string;
  jurisdiccion: string;
  existencia_original: number;
  cpm_jurisdiccion: number;
  cantidad_apartada: number;
  existencia_disponible_balanceo: number;
  observaciones: string | null;
}

export interface BalanceoV2Resultado {
  ejecucion_id: number;
  fecha_ejecucion: string;
  clave_cnis: string;
  jurisdiccion_origen: string;
  jurisdiccion_destino: string;
  cantidad_transferir: number;
  existencia_original: number | null;
  necesidad_destino: number | null;
}
