import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Cita } from '../models/Cita';
import { PaginacionCitas } from '../models/PaginacionCitas';

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
