
export type ComparativaRow = {
  clave: string;
  descripcion: string;
  solicitado: number;
  entregado: number;
  diferencia: number;       // solicitado - entregado
  cumplimientoPct: number;  // 0..100
  ordenesSuministro: string;
  ordenesSuministroCount: number;
};
