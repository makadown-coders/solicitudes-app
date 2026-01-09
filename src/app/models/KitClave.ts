export interface KitClave {
    id: number;
    kit_id: number;
    clave: string;
    aplica: boolean;
}

export interface ListClavesResponse {
  ok: boolean;
  rows: KitClave[];
}

export interface KitClaveResponse {
  ok: boolean;
  clave: KitClave;
}