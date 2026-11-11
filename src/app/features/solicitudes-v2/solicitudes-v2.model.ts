import { UniversoClave, UniversoUnidad } from '../../models/universos-abasto.model';

export type EstadoCatalogoFiltro = 'TODAS' | 'DISPONIBLES' | 'AGREGADAS';
export type VistaSolicitudV2 = 'CATALOGO' | 'SOLICITUD' | 'REVISION';

export interface SolicitudV2Contexto {
  unidad: UniversoUnidad | null;
  periodo: string;
  tipoPedido: 'Ordinario';
  responsableCaptura: string;
}

export interface SolicitudV2Renglon extends UniversoClave {
  claveNormalizada: string;
  cantidad: number | null;
}

export interface SolicitudV2AnalisisAlternativa {
  clave: string;
  descripcion: string | null;
  presentacion: string | null;
  factor: number;
  cpm: number;
  existenciaAzm: number;
  existenciaAzt: number;
  existenciaAze: number;
  fechaSnapshot: string | null;
}

export interface SolicitudV2AnalisisRenglon {
  clave: string;
  cpm: number;
  existenciaAzm: number;
  existenciaAzt: number;
  existenciaAze: number;
  fechaSnapshot: string | null;
  alternativa: SolicitudV2AnalisisAlternativa | null;
}

export interface SolicitudV2AnalisisOperativo {
  jurisdiccion: 'MEXICALI' | 'TIJUANA' | 'ENSENADA' | null;
  snapshotExistencias: string | null;
  data: SolicitudV2AnalisisRenglon[];
}
