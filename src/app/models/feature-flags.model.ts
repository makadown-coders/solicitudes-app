// Tipos de flags que vamos a manejar en UI
export type FlagKey =
  | 'SOLO_CPMS'
  | 'BUSCAR_EXISTENCIA_EN_CLUES'
  | 'APLICAR_ENCUESTAS'
  | 'APLICAR_EQUIVALENCIAS'
  | 'CLUES_EXISTENCIAS_ALLOWLIST'
  | 'IMPORT_LIMIT_TO_KIT'
  | 'EDIT_CPMS';

export type FlagScope = 'global' | 'nivel' | 'clues';
export type Nivel = 'PRIMER_NIVEL' | 'SEGUNDO_NIVEL';

export interface EffectiveFlags {
  [key: string]: any; // normalmente boolean, salvo allowlist (array)
}

export interface UpsertFlagPayload {
  flag_key: FlagKey;
  scope: FlagScope;
  scope_id?: string     // 'global', 'PRIMER_NIVEL'/'SEGUNDO_NIVEL' en nivel; CLUESIMB en clues
  value: any;           //  boolean en nuestros toggles
}
