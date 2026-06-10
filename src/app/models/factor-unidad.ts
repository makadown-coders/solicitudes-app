
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
    clave: string;
    cluesimb: string;
    factor: number;
}

/**
 * Respuesta cruda del backend
 */
export interface FactoresResponse {
    success: boolean;
    data: FactorConversion[];
    timestamp?: string;
}

export function aplicarFactorConversion(value: number, factor?: FactorUnidad | null): number {
    const cantidad = Number(value ?? 0);
    const cantidadFc = Math.max(1, Number(factor?.cantidad_fc ?? 1));
    const aplicaFactor = Number(factor?.en_dispensacion ?? 0) === 1 && cantidadFc > 1;

    if (!Number.isFinite(cantidad)) return 0;
    if (!aplicaFactor) return cantidad;

    return Math.round(((cantidad / cantidadFc) + Number.EPSILON) * 100) / 100;
}
