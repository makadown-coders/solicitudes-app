/**
 * Usado en solicitudes
 */
export type EnrichedProps = {
  _azm: number;
  _aze: number;
  _azt: number;
  /**
   * Total de existencias en almacenes AZM/AZE/AZT
   */
  _totalExistencias: number;
  _cpm: number;
  _enKit: boolean;
};