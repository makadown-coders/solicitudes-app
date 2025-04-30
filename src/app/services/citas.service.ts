import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Cita {
  ejercicio: number | null;
  orden_de_suministro: string;
  institucion: string;
  tipo_de_entrega: string;
  clues_destino: string;
  unidad: string;
  fte_fmto: string;
  proveedor: string;
  clave_cnis: string;
  descripcion: string;
  compra: string;
  tipo_de_red: string;
  tipo_de_insumo: string;
  grupo_terapeutico: string;
  precio_unitario: number | null;
  no_de_piezas_emitidas: number | null;
  fecha_limite_de_entrega: Date;
  pzas_recibidas_por_la_entidad: number | null;
  fecha_recepcion_almacen: string | null;
  numero_de_remision: string;
  lote: string;
  caducidad: string | null;
  estatus: string;
  folio_abasto: string;
  almacen_hospital_que_recibio: string;
  evidencia: string;
  carga: string;
  fecha_de_cita: Date | null;
  observacion: string;
}


export interface PaginacionCitas {
  data: Cita[];
  total: number;
  page: number;
  limit: number;
}

@Injectable({
  providedIn: 'root'
})
export class CitasService {
  private apiUrl = environment.apiUrl + '/citas'; // Ajusta si necesitas proxy

  constructor(private http: HttpClient) {}

  obtenerCitas(
    page = 1,
    limit = 10,
    filtros: Partial<Cita> = {},
    search = '', sortBy = 'fecha_de_cita', sortOrder: 'ASC' | 'DESC' = 'DESC') {
      let params = new HttpParams()
        .set('page', page)
        .set('limit', limit)
        .set('sortBy', sortBy)
        .set('sortOrder', sortOrder);
  
    if (search.trim()) {
      params = params.set('search', search.trim());
    }
  
    // Agregar todos los filtros como query params
    Object.entries(filtros).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, value.toString());
      }
    });
  
    return this.http.get<PaginacionCitas>(this.apiUrl, { params });
  }

  buscarOrdenes(q: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/buscar-orden?q=${encodeURIComponent(q)}`);
  }
  
}
