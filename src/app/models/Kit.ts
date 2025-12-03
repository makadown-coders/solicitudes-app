
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