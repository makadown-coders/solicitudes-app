export interface ArticuloSolicitud {
    clave: string;
    descripcion: string;
    unidadMedida: string;
    cantidad: number;
  }
  
export interface Articulo {
  clave: string
  clavea: any
  descripcion: string
  presentacion: string
  grupogasto: any
  subgrupogasto: any
  articulo: any
  categoria: string
  ubicacion: string
  nivelatencion: string
  cbf: string
  activo: string
  codigobarras: string
  partida: any
}

export interface Hospital {
  cluesssa: string
  cluesimb: string
  nombre: string
}

export interface TemplateData {
  nombre: string; // nombre del hospital
  tipoDeInsumo: string[]; // tipo de insumo 
  fecha: string; // periodo de captura (ej. 01-30 Abr 2025)    
}