import { Hospital, Unidad } from "./articulo-solicitud";

export interface DatosClues {
  nombreHospital: string; // para B1
  tipoInsumo: string;     // para D4
  periodo: string;        // para E5
  // Estos son sólo para el datepicker y el tab
  hospital: Unidad | null;
  fechaInicio: Date | null; // ← en formato ISO
  fechaFin: Date | null;
  tipoPedido: string;           // Ordinario / Extraordinario
  responsableCaptura: string;   // Responsable de captura
}
