export interface Ventana { zona: string; desde: string; hasta: string; almacenId?: number }
export type Modalidad = 'MES_CALENDARIO' | 'ULTIMOS_30_DIAS';
export interface Consulta { mes: string; modalidad: Modalidad; ventanas: Ventana[] }
export interface Almacen { id: number; nombre: string; zonas: string[] }
export interface SolicitudTrazabilidad { id: string; fecha: string; periodo: string; tipo: string }
export interface Fila { tieneMovimiento: boolean; solicitudIds: string[]; solicitudes: SolicitudTrazabilidad[]; clues: string; nombre: string; municipio: string; jurisdiccion: string; clave: string; descripcion: string; solicitado: number|null; surtido: number; pendiente: number|null; excedente: number|null; cobertura: number|null; relacion: number|null; estado: string }
export interface SustitucionPotencial { municipio: string; jurisdiccion: string; nombre: string; clues: string; claveSolicitada: string; descripcionSolicitada: string; pendienteDirecto: number; claveSustituta: string; descripcionSas: string; cantidadSustituta: number; factor: number; cantidadEquivalente: number; potencialAplicable: number; estado: string; ambigua: boolean }
export interface FilaProgramatica {
  clues: string;
  clave: string;
  vertiente: 'APS' | 'PROGRAMAS_PREVENTIVOS';
  programa: string | null;
  programaNombre: string | null;
  cantidad: number;
  evidencia: 'REGISTRADA' | 'INFERIDA' | 'MIXTA';
  condicion: 'EXCLUSIVO' | 'COMPARTIDO' | 'POR VALIDAR';
  ramificaciones: string[];
  surtido: number | null;
  pendiente: number | null;
  excedente: number | null;
  cobertura: number | null;
  relacion: number | null;
}
export interface Informe { corte: string; modalidad: Modalidad; solicitudesDesde: string; solicitudesHasta: string; almacenes: Almacen[]; filas: Fila[]; incidencias: string[]; limitacionesTemporales: string[]; sinSolicitud: Fila[]; ventanas: Ventana[]; sustituciones: SustitucionPotencial[]; desgloseProgramatico?: FilaProgramatica[] }
