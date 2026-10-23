export type OrigenCapturaPrimerNivel = 'APS' | 'PROGRAMA_PREVENTIVO' | 'CLAVE';

export type ConcentradoPrimerNivelRow = {
  cluesimb: string;
  unidad: string;
  jurisdiccion: string | null;
  clave: string;
  nombre: string | null;
  descripcion: string | null;
  origen: OrigenCapturaPrimerNivel;
  referencia: string | null;
  etiquetaReferencia: string;
  solicitudes: number;
  piezas: number;
  primeraSolicitud: string;
  ultimaSolicitud: string;
};

export type ConcentradoPrimerNivelResponse = {
  mode: 'concentrado-primer-nivel';
  window: { months: number };
  page: number;
  pageSize: number;
  total: number;
  truncated?: boolean;
  resumen: {
    solicitudes: number;
    unidadesParticipantes: number;
    unidadesUniverso: number;
    unidadesSinSolicitud: number;
    clavesDistintas: number;
    piezas: number;
  };
  origenes: Array<{
    origen: OrigenCapturaPrimerNivel;
    solicitudes: number;
    unidades: number;
    claves: number;
    piezas: number;
  }>;
  referencias: Array<{
    origen: Exclude<OrigenCapturaPrimerNivel, 'CLAVE'>;
    referencia: string;
    etiquetaReferencia: string;
    solicitudes: number;
    unidades: number;
    claves: number;
    piezas: number;
  }>;
  unidadesSinSolicitud: Array<{
    cluesimb: string;
    unidad: string;
    jurisdiccion: string | null;
    solicitudes: number;
    ultimaSolicitud: string | null;
  }>;
  data: ConcentradoPrimerNivelRow[];
};

export type ConcentradoPrimerNivelFiltros = {
  months: number;
  jurisdiccion?: string;
  clues?: string;
  origen?: OrigenCapturaPrimerNivel | '';
  referencia?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};
