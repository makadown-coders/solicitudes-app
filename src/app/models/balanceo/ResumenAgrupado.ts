
export interface ResumenAgrupado {
    clave_cnis: string;
    jurisdiccion_almacen: string;
    unidades_destino: number;
    piezas_destino: number;
    piezas_excedente?: number; // excedente de ese almacén si existe
}
