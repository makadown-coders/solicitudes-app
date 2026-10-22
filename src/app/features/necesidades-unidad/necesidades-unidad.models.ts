export interface NecesidadArticulo {
  clave: string;
  descripcion: string;
  descripcionCnis?: string;
  presentacion: string;
  codigoMedicamento?: string;
  codigoPrograma?: string;
  origen?: 'APS' | 'PROGRAMA' | 'CLAVE';
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
