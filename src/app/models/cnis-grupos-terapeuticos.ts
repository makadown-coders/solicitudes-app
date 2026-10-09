export interface CnisGrupoTerapeutico {
  numero: number;
  nombre: string;
}

export interface CnisArticuloGrupoTerapeuticoDetalle {
  clave: string;
  descripcion: string | null;
  presentacion: string | null;
}
