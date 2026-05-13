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
