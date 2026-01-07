// src/app/models/CpmExpectedRow.ts

export interface CpmExpectedRow {
  clave_cnis: string;
  cpm?: number | null;
  en_cpm?: boolean;
  kit_codigo?: string;        // legacy
  kit_codigos?: string[];     // 🆕 real
  kit_ids?: number[];         // 🆕 opcional
}

/*export type CpmExpectedRow = {
    unidad_medica_id: number;
    cluesimb: string;
    cluessa: string | null;
    nombre_unidad: string;
    nombre_tipologia: string | null;
    kit_codigo: string;
    clave_cnis: string;
    cpm: number | null; // puede venir null
    en_cpm: boolean; // ya trae la regla cpm > 0 en la vista
};*/

export type ExpectedResp = { rows: CpmExpectedRow[] } | CpmExpectedRow[];

export type CpmRowLite = {
  clave_cnis: string;
  cpm?: number | null;
  cluesimb?: string;
};