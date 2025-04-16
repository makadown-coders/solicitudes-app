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

