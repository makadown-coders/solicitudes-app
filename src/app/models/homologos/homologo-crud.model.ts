export interface HomologoCrudRow {
  id: number;
  clave: string;
  sustituto: string;
  factor: string;
}

export interface HomologoCrudUiRow extends HomologoCrudRow {
  claveDescripcion: string | null;
  sustitutoDescripcion: string | null;
}

export interface HomologoCrudUpsertPayload {
  clave: string;
  sustituto: string;
  factor: string | number;
}
