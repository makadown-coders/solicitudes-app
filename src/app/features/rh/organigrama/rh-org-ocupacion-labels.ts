import type { RhOrgEstadoOcupacion } from '../../../services/rh.service';

const etiquetas: Record<RhOrgEstadoOcupacion, string> = {
  OCUPADO: 'ASIGNADO',
  VACANTE: 'VACANTE',
  SIN_VINCULAR: 'SIN ASIGNAR',
};

export function rhOrgEtiquetaOcupacion(estado: RhOrgEstadoOcupacion): string {
  return etiquetas[estado];
}
