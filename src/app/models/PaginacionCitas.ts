import { Cita } from "./Cita";

export interface PaginacionCitas {
  data: Cita[];
  total: number;
  page: number;
  limit: number;
}

export interface CitaSlim {
  clave_cnis: string;
  lote: string;
  precio_unitario?: number | null;
  orden_de_suministro?: string | null;
  fte_fmto?: string | null;
  proveedor?: string | null;
};

