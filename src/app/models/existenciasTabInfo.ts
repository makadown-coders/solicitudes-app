// src/app/models/existenciasTabInfo.ts
import { Cita } from "./Cita";
import { CPMS } from "./CPMS";
import { Inventario, InventarioDisponibles } from "./Inventario";

/**
 * Información de las tabs de existencias de almacenes y unidades
 * en el dashboard abasto
 */
export class ExistenciasTabInfo {
    citas: Cita[] = [];
    cpms: CPMS[] = [];
    /** Existencias de almacenes, readonly solo asignado en cargarDesdeLocalStorage */
    // inventario: Inventario[] = [];
    /** Existencias de almacenes, readonly solo asignado en cargarDesdeLocalStorage  */
    // existenciaAlmacenes: InventarioDisponibles[] = [];
    /** Mapa de existencias por unidad, readonly solo asignado en cargarDesdeLocalStorage */
    existenciaUnidades: Map<string, Inventario[]> = new Map<string, Inventario[]>();
}