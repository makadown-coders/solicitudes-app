import { Cita } from "./Cita";

export interface PaginacionCitas {
  data: Cita[];
  total: number;
  page: number;
  limit: number;
}
