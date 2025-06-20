
export class Inventario {
    public clave: string;
    public partida: string;
    public descripcion: string;
    public disponible: number;
    public almacen: string;
    public comprometidos: number;
    public lote: string;
    public caducidad: string | Date | null;
    public fuente: string;
    public fecha_entrada: string | Date | null;
}

export class InventarioDisponibles {
   public clave: string;
   public existenciasAZM: number;
   public existenciasAZE: number;
   public existenciasAZT: number;
}

    
export interface InventarioRow {
  [key: string]: string | number | Date | null | undefined;
  0?: string; // clave
  1?: string; // partida
  2?: string; // desc
  3?: string; // disponible
  4?: string; // almacen
  5?: string; // usuario (no se usa)
  6?: string; // comprometidos
  7?: string; // lote
  8?: string; // caducidad
  9?: string; // fuente
  10?: string; // fecha_entrada
}