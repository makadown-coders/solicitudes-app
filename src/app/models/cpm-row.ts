export interface CpmRow {
  clave_cnis: string;
  cpm: number;
  fuente: string;
}

export interface BatchItem { clave: string; cpm: number; fuente?: string; }

export type UIRow = CpmRow & {
  _dirty?: boolean;
  _invalid?: boolean;
  _isNew?: boolean;
  _originalCpm?: number;
  _originalFuente?: string;
};

export type UIRowX = UIRow & { descripcion?: string; presentacion?: string };
