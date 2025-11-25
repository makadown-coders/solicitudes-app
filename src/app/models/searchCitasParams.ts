export interface SearchCitasParams {
  clave_cnis?: string;
  desde?: string;            // YYYY-MM-DD (ventana mínima)
  hasta?: string;            // YYYY-MM-DD (opcional)  
  recibido?: string;        // 'true' | 'false'
  ejercicio?: Array<number | string>;
  estatus?: string[];
  tipo_de_entrega?: string[];
  compra?: string[];
  unidad?: string[];
  limit?: number;
}

