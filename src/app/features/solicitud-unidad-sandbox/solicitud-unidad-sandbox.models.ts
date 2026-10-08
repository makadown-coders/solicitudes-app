export interface SandboxArticulo {
  clave: string;
  descripcion: string;
  presentacion: string;
}

export interface SandboxSolicitudItem extends SandboxArticulo {
  cantidad: number;
}

export interface SandboxContextoUnidad {
  nombre: string;
  clues: string;
  periodo: string;
  responsable: string;
}
