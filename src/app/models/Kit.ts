
export interface Kit {
    id: number;
    codigo: string;
    nombre: string | null;
}


export interface ListKitsResponse {
  ok: boolean;
  rows: Kit[];
}

export interface KitResponse {
  ok: boolean;
  kit: Kit;
}

export interface ImportOneResponse {
  ok: boolean;
  kitId: number;
  codigo: string;
  clavesInsertadas: number;
}

export interface ParsedKitPreview {
  codigo: string;
  claves: string[];
  exists: boolean; // true = ya está en BD (se actualizará), false = se creará
}

export interface ImportLog {
  codigo: string;
  totalClaves: number;
  status: 'pending' | 'ok' | 'error';
  message?: string;
}

