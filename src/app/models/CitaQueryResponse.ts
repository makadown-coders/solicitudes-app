import { Cita } from "./Cita";



export interface CitaQueryResponse {
  data: Cita[];
  total: number;
  page: number;
  limit: number;
}
