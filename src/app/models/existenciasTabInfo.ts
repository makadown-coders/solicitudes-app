// src/app/models/existenciasTabInfo.ts
import { Cita } from "./Cita";
import { CPMS } from "./CPMS";
import { Inventario } from "./Inventario";

/**
 * Información de las tabs de existencias de almacenes y unidades
 * en el dashboard abasto
 */
export class ExistenciasTabInfo {
    citas: Cita[] = [];
    cpms: CPMS[] = [];
    existenciaAlmacenes: Inventario[] = [];    
    existenciaUnidades: Map<string, Inventario[]> = new Map<string, Inventario[]>();
}

export interface ClaveExistenciaResumen {
  descripcion: string;
  cpm: number;
  existencia: number;
  reposicion: number;
}

export interface UnidadExistenciaResumen {
  unidad: string;
  claves: ClaveExistenciaResumen[];
}

export interface AlmacenExistenciaResumen {
  almacen: string;
  unidades: UnidadExistenciaResumen[];
}