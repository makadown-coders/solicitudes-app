import { AbastoProgramasNecesidadRow } from '../../../models/AbastoProgramasNecesidades';

export type CoberturaUnidadEjecutiva = {
  jurisdiccion: string;
  unidad: string;
  clues: string;
  clavesEvaluables: number;
  clavesCompletas: number;
  clavesParciales: number;
  clavesSinSalida: number;
  clavesCompartidas: number;
  porcentaje: number | null;
};

export function construirCoberturaPorUnidad(filas: AbastoProgramasNecesidadRow[]): CoberturaUnidadEjecutiva[] {
  const unidades = new Map<string, {
    jurisdiccion: string; unidad: string; clues: string;
    claves: Map<string, { necesidades: Map<string, number>; surtido: number; compartida: boolean }>;
  }>();
  for (const fila of filas) {
    const unidad = unidades.get(fila.clues) ?? {
      jurisdiccion: fila.jurisdiccion, unidad: fila.unidad, clues: fila.clues, claves: new Map(),
    };
    const clave = unidad.claves.get(fila.clave) ?? { necesidades: new Map<string, number>(), surtido: 0, compartida: false };
    const propietario = fila.vertiente === 'APS' ? 'APS' : `PP:${fila.programa ?? 'SIN_REFERENCIA'}`;
    clave.necesidades.set(propietario, Math.max(clave.necesidades.get(propietario) ?? 0, fila.cantidad));
    clave.compartida ||= fila.atribucionSas === 'COMPARTIDA';
    if (fila.atribucionSas === 'EXCLUSIVA' && fila.surtidoSas !== null) clave.surtido = Math.max(clave.surtido, fila.surtidoSas);
    unidad.claves.set(fila.clave, clave);
    unidades.set(fila.clues, unidad);
  }
  return [...unidades.values()].map(unidad => {
    const evaluables = [...unidad.claves.values()].map(clave => ({
      ...clave, necesidad: [...clave.necesidades.values()].reduce((total, cantidad) => total + cantidad, 0),
    })).filter(clave => clave.necesidad > 0);
    const compartidas = evaluables.filter(clave => clave.compartida).length;
    const atribuibles = evaluables.filter(clave => !clave.compartida);
    const completas = atribuibles.filter(clave => clave.surtido >= clave.necesidad).length;
    const parciales = atribuibles.filter(clave => clave.surtido > 0 && clave.surtido < clave.necesidad).length;
    const sinSalida = atribuibles.filter(clave => clave.surtido <= 0).length;
    return {
      jurisdiccion: unidad.jurisdiccion, unidad: unidad.unidad, clues: unidad.clues,
      clavesEvaluables: evaluables.length, clavesCompletas: completas, clavesParciales: parciales,
      clavesSinSalida: sinSalida, clavesCompartidas: compartidas,
      porcentaje: evaluables.length ? 100 * completas / evaluables.length : null,
    };
  }).sort((a, b) => {
    if (a.porcentaje === null && b.porcentaje !== null) return 1;
    if (a.porcentaje !== null && b.porcentaje === null) return -1;
    return (b.porcentaje ?? 0) - (a.porcentaje ?? 0) || a.unidad.localeCompare(b.unidad, 'es');
  });
}
