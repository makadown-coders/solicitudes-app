// Respuestas genéricas del backend
export interface BalanceoApiResponse<T> {
    ok: boolean;
    [key: string]: any; // para campos extra
    resumen?: T;
    detalle?: T;
    ejecucion?: T;
}
