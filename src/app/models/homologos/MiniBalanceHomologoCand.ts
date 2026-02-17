export type MiniBalanceHomologoCand = {
  sustituto: string;
  factor: string; // decimal como string
  qtySugerida: number;
  buckets: { AZM: number; AZT: number; AZE: number };
  bucketPreferido: 'AZM' | 'AZT' | 'AZE' | '';
  bucketSugerido: 'AZM' | 'AZT' | 'AZE' | '';
  existenciaPreferida: number;
};

