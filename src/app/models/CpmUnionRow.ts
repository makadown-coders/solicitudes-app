
export interface CpmUnionRow {
  cluesimb: string;
  clave_cnis: string;
  cpm: number;
  en_kit: boolean;
  kit_codigos?: string[];     // 🆕 para filtro por kit
}

/*export type CpmUnionRow = {
  cluesimb: string;
  clave_cnis: string;
  cpm: number;          // max entre fuentes
  en_kit: boolean;      // true si viene en expected-vs
};*/

// Tabla renderizable (no calcules en el template)
export type KitRowView = {
  clave: string;
  cpm: number;
  azm: number; aze: number; azt: number; total: number;
  existUnidad?: number;
  reordenSug?: number;
};