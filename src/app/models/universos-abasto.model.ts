export interface UniversoUnidad {
  id: number;
  nombre: string;
  cluesimb: string | null;
  cluessa: string | null;
  totalClaves: number;
}

export interface UniversoClave {
  clave: string;
  descripcion: string | null;
  presentacion: string | null;
  tipoInsumo: string;
  cpm: number;
  cpmRegistrado: boolean;
  activo: boolean;
  correspondenciaArticulo: boolean;
}

export interface UniversoClavesResponse {
  unidad: UniversoUnidad;
  data: UniversoClave[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CatalogoClaveCandidata {
  clave: string;
  descripcion: string | null;
  presentacion: string | null;
  cpm: number;
  perteneceUniverso: boolean;
  clasificacionEstado: 'AUTOMATICA' | 'MANUAL_160' | 'NO_DISPONIBLE' | 'INCOMPATIBLE' | 'AMBIGUA';
  tipoInsumo: 'Medicamento' | 'Material de curación' | null;
  clasificacionMensaje: string;
}

export interface IncorporarClaveResponse {
  ok: true;
  data: { clave: string; tipoInsumo: string };
}

export interface ActualizarActivoResponse {
  data: {
    clave: string;
    activo: boolean;
    actualizado: boolean;
  };
}


export interface CatalogoClavesResponse {
  data: CatalogoClaveCandidata[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
