// src/app/models/KitRow.ts 

export type KitRow =
    {
        clave: string;
        cpm: number;
        azm: number;
        aze: number;
        azt: number;
        total: number;
        existUnidad?: number; // existencia en la unidad (tmp_existencias) 
        reordenSug?: number; // punto de reorden (si lo calculas) 
    };
