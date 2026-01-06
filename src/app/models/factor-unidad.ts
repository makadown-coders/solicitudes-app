
export interface FactorUnidad {
  clave: string;
  cluesimb: string;
  en_dispensacion: number;   // 0|1 (aceptamos boolean y lo normalizamos)
  cantidad_fc: number;       // >=1
}

/**
 * Respuesta cruda del backend
 */
export interface FactorConversion {
    cluesimb: string;
    factor: number;
}

/**
 * Respuesta cruda del backend
 */
export interface FactoresResponse {
    success: boolean;
    data: { [key: string]: FactorConversion };
    timestamp?: string;
}