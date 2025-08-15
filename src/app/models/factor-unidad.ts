
export interface FactorUnidad {
  clave: string;
  cluesimb: string;
  en_dispensacion: number;   // 0|1 (aceptamos boolean y lo normalizamos)
  cantidad_fc: number;       // >=1
}
