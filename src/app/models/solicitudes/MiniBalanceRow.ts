import { MiniBalanceHomologacion } from "../homologos/MiniBalanceHomologacion";

export type MiniBalanceRow = {
  clave: string;
  descripcion: string;
  solicitado: number;
  existencia_unidad: number;
  cpm: number;
  AZM: number;
  AZT: number;
  AZE: number;
  faltante: number;
  sugerencia: string;

  /**
   * Sugerencias de homologación (solo cuando la clave original no puede cubrirse
   * con existencias de almacenes).
   */
  homologacion?: MiniBalanceHomologacion;
};
