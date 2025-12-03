
export interface UnidadAsignada {
    unidad_medica_id: number;
    cluesimb: string;
    nombre: string;
}

export interface ListUnidadesResponse {
  ok: boolean;
  rows: UnidadAsignada[];
}
