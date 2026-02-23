// /src/app/models/articulo-solicitud.ts
export class ArticuloSolicitud {
  clave: string = '';
  descripcion: string = '';
  unidadMedida: string = '';
  presentacion: string = '';
  cantidad: number = 0;
  cpm: number = 0;
  observaciones: string = ''; 
}

export interface Articulo {
  clave: string;
  clavea: any;
  descripcion: string;
  presentacion: string;
  grupogasto: any;
  subgrupogasto: any;
  articulo: any;
  categoria: string;
  ubicacion: string;
  nivelatencion: string;
  cbf: string;
  activo: string;
  codigobarras: string;
  partida: any;
}

export interface Hospital {
  cluesssa: string;
  cluesimb: string;
  nombre: string;
}

/**
 * En vias de deprecacion
 */
export interface Unidad {
  cluesssa: string;
  cluesimb: string;
  nombre: string;
  municipio: string;
  localidad: string;
  jurisdiccion: string;
  direccion: string;
  latitud: string;
  longitud: string;
  estratoUnidad: string;
  nivelAtencion: string;
  tipoUnidad: string;
}

export interface Unidadv2 {
  cluesssa: string;
  cluesimb: string;
  nombre: string;
  aliasSas: string;
  municipio: string;
  localidad: string;
  jurisdiccion: string;
  direccion: string;
  latitud: string;
  longitud: string;
  estratoUnidad: string;
  nivelAtencion: string;
  tipoUnidad: string;
  // ⬇️ nuevos (opcionales, para la vista)
  nombreTipologia?: string;
  esSegundoNivel?: boolean;
}

/**
 * usado para dashboard abasto > Existencias > Existencias X Clave
 */
export interface UnidadExistente {
  /**
   * Este campo es escencial. Es para ligar con el enum de unidades con la clave de hospital que 
   * se usaria para llenar en Tab Existencias (CPMs) > Existencias X Clave
   */
  key: string; // enum de unidades HGE, HGM, etc
  cluesssa: string;
  cluesimb: string;
  nombre: string;
  municipio: string;
  localidad: string;
  jurisdiccion: string;
  direccion: string;
  latitud: string;
  longitud: string;
  estratoUnidad: string;
  nivelAtencion: string;
  tipoUnidad: string;
}

export interface ServicioEvaluado {
  nombre: string; // Ej. "HEMODIÁLISIS", "ALIMENTOS", etc.
  categoria: 'SMI' | 'SG'; // Para saber si es Médico o General
  estatusContratacion: 'No aplica' | 'Sin iniciar la contratación' | 'Proceso Inicial de contratación' | 'Proceso final de contratación' | 'Contratado';
  inicialesContrata: 'IB' | 'CE' | 'SSA' | ''; // Vacío si no aplica
  evaluacionCalidad: 'Bueno' | 'Regular' | 'Malo' | 'No aplica';
}

// Respuesta cruda del backend: soporta tabla vieja (nombre) y vista nueva (nombre_de_unidad)
export type UnidadFromApi = {
  id?: number;
  cluessa: string | null;
  cluesimb: string | null;

  // backend antiguo
  nombre?: string | null;

  // backend con la vista v_unidad_medica_detalle
  nombre_de_unidad?: string | null;
  nombre_tipologia?: string | null;
  es_segundo_nivel?: boolean | null;

  alias_sas: string | null;
  direccion: string | null;
  latitud: number | string | null;
  longitud: number | string | null;
  estrato_unidad: string | null;
  nivel_atencion: string | null;
  tipo_unidad: string | null;
  nombre_localidad?: string | null;
  nombre_municipio?: string | null;
};

/**
 * Estructura que devuelve el backend desde public.v_unidad_medica_detalle
 * (nombres en snake_case; la usamos solo para tipar la respuesta cruda).
 */
export type UnidadDetalleBackend = {
  id: number;
  cluessa: string | null;
  cluesimb: string | null;
  nombre_municipio: string | null;
  nombre_localidad: string | null;
  nombre_tipologia: string | null;
  es_segundo_nivel: boolean;
  nombre_de_unidad: string;
  tipo_unidad: string | null;
  alias_sas: string | null;
  direccion: string | null;
  latitud: number | null;   // en la vista vienen numéricos
  longitud: number | null;
  estrato_unidad: string | null;
  nivel_atencion: string | null;
};

/**
 * Proyección amigable para el UI (camelCase).
 * OJO: lat/long como number|null (si prefieres string, cambia el tipo aquí).
 */
export type UnidadDetalle = {
  id: number;
  cluessa: string | null;
  cluesimb: string | null;
  nombreMunicipio: string | null;
  nombreLocalidad: string | null;
  nombreTipologia: string | null;
  esSegundoNivel: boolean;
  nombreDeUnidad: string;
  tipoUnidad: string | null;
  aliasSas: string | null;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
  estratoUnidad: string | null;
  nivelAtencion: string | null;
};


