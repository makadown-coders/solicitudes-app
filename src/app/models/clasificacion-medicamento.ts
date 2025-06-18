import { ClasificadorVEN } from "./clasificador-ven";

export class ClasificacionMedicamento {
    clave: string;
    /**
     * Vital, Escencial o No Escencial
     * Con esto, si se quiere acceder al valor completo se puede hacer:
     * 
     * const descripcion = ClasificadorVEN[medicamento.ven]; // "No Escencial"
     * 
     */
    ven: keyof typeof ClasificadorVEN; // Esto asegura que solo se usen 'V', 'E' o 'N'
}