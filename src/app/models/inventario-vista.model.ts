// src/app/models/inventario-vista.model.ts

/**
 * Usado en dashboard abasto > Inventario
 * Improvisando algo para los locos de cdmx
 */
export interface InventarioVistaRow {
  // 1
  entidadFederativa: string;               // "BAJA CALIFORNIA"
  // 2
  clues: string;
  // 3
  ordenDeSuministro: string | null;
  // 4
  rfcProveedor: string | null;             // por ahora en blanco
  // 5
  fuenteFinanciamiento: string | null;
  // 6
  partidaPresupuestal: string | null;      // primeros 5-6 números si viene como string
  // 7
  clave: string;                           // CNIS con puntos  
  categoria?: string | null;
  grupoInsumo?: string | null;
  // 8
  descripcion: string | null;              // de Artículos
  // 9
  precioUnitario: number | null;           // de Citas por (clave,lote)
  // 10
  valorTotal: number | null;               // precio * disponible
  // 11
  insumoEnCPM: 'SI' | 'NO';
  // 12
  estadoInsumo: 1 | 4 | 5 | 6;             // default 1
  // 13
  inventarioDisponible: number;            // disponible - comprometidos
  // 14
  unidadMedida: string | null;             // presentacion de Artículos
  // 15
  lote: string;                            // limpio, máx 20 chars
  // 16
  fechaCaducidad: string;                  // DD/MM/AAAA hh:mm:ss (o 31/12/2025 00:00:00)
  // 17
  fechaFabricacion: string;                // DD/MM/AAAA hh:mm:ss (default 01/01/2025 00:00:00)
  // 18
  fechaRecepcion: string;                  // DD/MM/AAAA hh:mm:ss (o 01/01/2025 00:00:00)

  // extra visible en grid
  unidadOrigenTexto: string | null;        // hospital/almacén
  tipoFuente: 'HOSPITAL' | 'ALMACEN';
}
