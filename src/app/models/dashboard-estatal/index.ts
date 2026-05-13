export type RiesgoFaltante = 'BAJO' | 'MEDIO' | 'ALTO' | 'CRITICO';
export type RiesgoSobreabasto = 'BAJO' | 'MEDIO' | 'ALTO';

export interface DashboardEstatalClave {
  clave_cnis: string;
  descripcion: string | null;
}

export interface DashboardEstatalResumenClave {
  clave_cnis: string;
  descripcion: string | null;
  cpm_estatal: number;
  cpm_x_3_estatal: number;
  existencia_estatal: number;
  ordenes_pendientes: number;
  piezas_pendientes: number;
  cpms_equivalentes: number | null;
  faltante_estimado: number;
  sobreabasto_estimado: number;
  riesgo_faltante: RiesgoFaltante;
  riesgo_sobreabasto: RiesgoSobreabasto;
  lectura: string;
}

export interface DashboardEstatalOrdenPendiente {
  clave_cnis: string;
  descripcion?: string | null;
  orden_compra?: string | null;
  folio?: string | null;
  proveedor?: string | null;
  fecha_emision?: string | null;
  fecha_entrega?: string | null;
  dias_pendiente?: number | null;
  piezas_pendientes: number;
  precio_unitario?: number | null;
  importe_pendiente?: number | null;
  jurisdiccion?: string | null;
  almacen?: string | null;
  unidad?: string | null;
  estatus?: string | null;
  contrato?: string | null;
}

export interface DashboardEstatalClavesResponse {
  ok: boolean;
  count: number;
  data: DashboardEstatalClave[];
}

export interface DashboardEstatalResumenResponse {
  ok: boolean;
  data: DashboardEstatalResumenClave;
}

export interface DashboardEstatalTopResponse {
  ok: boolean;
  data: {
    top_sobreabasto: DashboardEstatalResumenClave[];
    top_faltantes: DashboardEstatalResumenClave[];
  };
}

export interface DashboardEstatalOrdenesPendientesResponse {
  ok: boolean;
  count: number;
  data: DashboardEstatalOrdenPendiente[];
}
