export interface ArticuloSolicitud {
    clave: string;
    descripcion: string;
    unidadMedida: string;
    cantidad: number;
    cpm: number;
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

/**
 * usado para dashboard abasto > Existencias > Existencias X Clave
 */
export interface UnidadExistente {
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
