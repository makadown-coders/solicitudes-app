import { AbastoProgramasNecesidadRow } from '../../../models/AbastoProgramasNecesidades';
import { construirCoberturaPorUnidad } from './abasto-programas-cobertura';

const fila = (cambios: Partial<AbastoProgramasNecesidadRow>): AbastoProgramasNecesidadRow => ({
  jurisdiccion: 'TIJUANA', municipio: 'TIJUANA', unidad: 'Unidad A', clues: 'BCIMB-A',
  vertiente: 'APS', programa: null, programaNombre: null, clave: 'K1', descripcion: null,
  cantidad: 10, evidencia: 'REGISTRADA', solicitudes: 1, surtidoSas: 0, pendiente: 10,
  excedente: 0, cobertura: 0, relacionSurtidoSolicitado: 0, atribucionSas: 'EXCLUSIVA',
  ...cambios,
});

describe('construirCoberturaPorUnidad', () => {
  it('clasifica cobertura completa, parcial, sin salida y ordena de mayor a menor', () => {
    const resultado = construirCoberturaPorUnidad([
      fila({ clave: 'A1', surtidoSas: 10, pendiente: 0, cobertura: 100 }),
      fila({ clave: 'A2', surtidoSas: 5, pendiente: 5, cobertura: 50 }),
      fila({ clave: 'A3', surtidoSas: -2, pendiente: 12 }),
      fila({ unidad: 'Unidad B', clues: 'BCIMB-B', clave: 'B1', surtidoSas: 12, pendiente: 0, excedente: 2, cobertura: 100 }),
      fila({ unidad: 'Unidad C', clues: 'BCIMB-C', clave: 'C1', cantidad: 0 }),
    ]);
    expect(resultado.map(item => item.clues)).toEqual(['BCIMB-B', 'BCIMB-A', 'BCIMB-C']);
    expect(resultado[0].porcentaje).toBe(100);
    expect(resultado[1]).toEqual(jasmine.objectContaining({ clavesEvaluables: 3, clavesCompletas: 1, clavesParciales: 1, clavesSinSalida: 1 }));
    expect(resultado[2].porcentaje).toBeNull();
  });

  it('no acredita compartidas ni duplica una CNIS por programa o ramificación APS', () => {
    const resultado = construirCoberturaPorUnidad([
      fila({ clave: 'APS-DUP', surtidoSas: 10 }),
      fila({ clave: 'APS-DUP', surtidoSas: 10 }),
      fila({ clave: 'PP-COMPARTIDA', vertiente: 'PROGRAMAS_PREVENTIVOS', programa: 'DENTAL', cantidad: 4, atribucionSas: 'COMPARTIDA', surtidoSas: null }),
      fila({ clave: 'PP-COMPARTIDA', vertiente: 'PROGRAMAS_PREVENTIVOS', programa: 'VACUNACION', cantidad: 6, atribucionSas: 'COMPARTIDA', surtidoSas: null }),
    ])[0];
    expect(resultado).toEqual(jasmine.objectContaining({ clavesEvaluables: 2, clavesCompletas: 1, clavesCompartidas: 1, porcentaje: 50 }));
  });
});
