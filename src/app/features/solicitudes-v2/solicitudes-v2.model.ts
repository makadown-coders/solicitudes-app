import { UniversoClave, UniversoUnidad } from '../../models/universos-abasto.model';

export type EstadoCatalogoFiltro = 'TODAS' | 'DISPONIBLES' | 'AGREGADAS';
export type VistaSolicitudV2 = 'CATALOGO' | 'SOLICITUD';

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
