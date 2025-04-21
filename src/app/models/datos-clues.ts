import { Hospital } from "./articulo-solicitud";

export interface DatosClues {
  nombreHospital: string; // para B1
  tipoInsumo: string;     // para D4
  periodo: string;        // para E5
  // Estos son sólo para el datepicker y el tab
  hospital: Hospital | null;
  fechaInicio: Date | null; // ← en formato ISO
  fechaFin: Date | null;
}

/*
export interface TemplateData {
nombre: string; // nombre del hospital
tipoDeInsumo: string[]; // tipo de insumo 
fecha: string; // periodo de captura (ej. 01-30 Abr 2025)
}
 
*/