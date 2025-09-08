export type CpmUnitRow = {
    unidad_medica_id: number;
    cluesimb: string;
    clave_cnis: string;
    cpm: number;          // > 0
};

export type UnitResp = { rows: CpmUnitRow[] } | CpmUnitRow[];