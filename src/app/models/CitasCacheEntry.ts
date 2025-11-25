import { CitaQueryResponse } from "./CitaQueryResponse";

export interface CitasCacheEntry {
    timestamp: number; // ms desde epoch
    resp: CitaQueryResponse; // respuesta tal cual del backend
}
