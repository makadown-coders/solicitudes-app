export interface Ventana { zona: string; desde: string; hasta: string; almacenId?: number }
export interface Consulta { mes: string; ventanas: Ventana[]; presentaciones: string[] }
export interface Almacen { id: number; nombre: string; zonas: string[] }
export interface Fila { tieneMovimiento: boolean; solicitudIds: string[]; clues: string; nombre: string; municipio: string; clave: string; descripcion: string; medida: string; presentacionSas: string; solicitado: number|null; surtido: number; pendiente: number|null; excedente: number|null; cobertura: number|null; relacion: number|null; estado: string; validar: boolean }
export interface Informe { corte: string; almacenes: Almacen[]; filas: Fila[]; incidencias: string[]; sinSolicitud: Fila[]; ventanas: Ventana[] }
