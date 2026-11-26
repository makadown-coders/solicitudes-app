export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface TipoDispositivo {
  id: number;
  nombre: string;
}

export interface EstadoDispositivo {
  id: number;
  nombre: string;
}

export interface TipoPeriferico {
  id: number;
  nombre: string;
}

export interface UnidadMedica {
  id: number;
  nombre: string;
  cluesimb?: string | null;
  cluessa?: string | null;
  municipio?: string | null;
  localidad?: string | null;
  tipo_unidad?: string | null;
}

export interface PersonaLite {
  id: number;
  nombre_completo: string;
  unidad_medica_id?: number | null;
  unidad_medica?: string | null;
  correo_principal?: string | null;
}

export interface DispositivoCreate {
  unidad_medica_id: number;
  tipo_dispositivo_id: number;
  ip?: string | null;
  conexion?: string | null;
  serial?: string | null;
  marca?: string | null;
  modelo?: string | null;
  observaciones?: string | null;
}

export interface DispositivoRowEx {
  id: number;
  unidad_medica_id: number;
  unidad_medica?: string | null;
  tipo_dispositivo_id?: number;
  tipo?: string | null;
  tipo_dispositivo?: string | null;
  ip?: string | null;
  conexion?: string | null;
  serial?: string | null;
  marca?: string | null;
  modelo?: string | null;
  observaciones?: string | null;
  asignacion_dispositivo_id?: number | null;
  persona_id?: number | null;
  persona_nombre_completo?: string | null;
  lugar_especifico?: string | null;
  estado_dispositivo_id?: number | null;
  estado_dispositivo?: string | null;
  fecha_asignacion?: string | null;
  fecha_retiro?: string | null;
}

export type NicKind = 'ethernet' | 'wifi' | 'mgmt' | 'bt' | 'other';

export interface NicItem {
  id?: number;
  iface_name?: string | null;
  kind?: NicKind | string | null;
  mac: string;
  mac_norm?: string | null;
  en_uso?: boolean;
}

export interface Monitor {
  id?: number;
  dispositivo_id?: number;
  serial?: string | null;
  marca?: string | null;
  modelo?: string | null;
  es_principal?: boolean;
}

export interface Periferico {
  id?: number;
  dispositivo_id?: number;
  tipo_id: number;
  tipo_nombre?: string | null;
  tipo?: string | null;
  serial?: string | null;
  marca?: string | null;
  modelo?: string | null;
}

export interface DispositivoAsignacion {
  id: number;
  dispositivo_id?: number;
  unidad_medica_id?: number | null;
  unidad_medica?: string | null;
  persona_id?: number | null;
  persona?: string | null;
  persona_nombre_completo?: string | null;
  lugar_especifico?: string | null;
  estado_dispositivo_id?: number | null;
  estado_dispositivo?: string | null;
  fecha_asignacion?: string | null;
  fecha_retiro?: string | null;
  observaciones?: string | null;
}

export interface DispositivoDetail {
  id: number;
  unidad_medica_id: number;
  unidad_medica?: string | null;
  tipo_dispositivo_id: number;
  tipo_dispositivo?: string | null;
  ip?: string | null;
  conexion?: string | null;
  serial?: string | null;
  marca?: string | null;
  modelo?: string | null;
  observaciones?: string | null;
  macs?: NicItem[];
  nics?: NicItem[];
  monitores?: Monitor[];
  perifericos?: Periferico[];
  asignacion_actual?: DispositivoAsignacion | null;
}

export interface AsignacionBitacoraRow {
  id: number;
  desde?: string | null;
  hasta?: string | null;
  unidad_medica?: string | null;
  persona?: string | null;
  lugar_especifico?: string | null;
  estado_dispositivo?: string | null;
  observaciones?: string | null;
  creado_por?: string | null;
  fecha_asignacion?: string | null;
  fecha_retiro?: string | null;
}

export interface DispositivoUpdateBasicPayload {
  serial: string;
  marca: string;
  modelo: string;
  ip: string;
  conexion: string;
  observaciones: string;
  nics: NicItem[];
}

export interface CambiarAsignacionPayload {
  unidad_medica_id?: number | null;
  persona_id: number | null;
  lugar_especifico: string | null;
  estado_dispositivo_id: number | null;
  fecha_asignacion?: string | null;
}

export const MAC_RE = /^[0-9a-fA-F]{12}$/;

export function normalizeMac(raw: string): string | null {
  const hex = (raw ?? '').replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  if (!MAC_RE.test(hex)) {
    return null;
  }
  return hex.match(/.{2}/g)!.join(':');
}
