export interface NecesidadArticulo {
  clave: string;
  descripcion: string;
  presentacion: string;
}

export interface NecesidadItem extends NecesidadArticulo {
  cantidad: number;
}

export interface NecesidadesContextoUnidad {
  nombre: string;
  clues: string;
  periodo: string;
  responsable: string;
}
