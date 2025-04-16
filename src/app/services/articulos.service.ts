import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { ArticuloSolicitud } from '../models/articulo-solicitud';
import { articulosData } from '../models/articulosData';

@Injectable({
  providedIn: 'root'
})
export class ArticulosService {
  private apiUrl = `${environment.apiUrl}/articulos`;

  constructor(private http: HttpClient) {}

  buscarArticulos(termino: string): Observable<{ resultados: ArticuloSolicitud[]; total: number }> {
    return this.http.get<{ resultados: ArticuloSolicitud[]; total: number }>(
      `${this.apiUrl}?q=${encodeURIComponent(termino)}`
    );
  }

  /**
   * Método de emergencia por que se me acabaron los créditos en el backend de railway :(
   * @param termino 
   * @returns 
   */
  buscarArticulosv2(termino: string): Observable<{ resultados: ArticuloSolicitud[]; total: number }> {
    const filtro = termino.toLowerCase();
    
    const resultados = articulosData.filter(art =>
      art.clave.toLowerCase().includes(filtro) ||
      art.descripcion.toLowerCase().includes(filtro)
    );
    const res = resultados.map(art => ({
      clave: art.clave,
      descripcion: art.descripcion,
      unidadMedida: art.presentacion,
      cantidad: 0, // valor neutral inicial
    }));  
    return of({
      resultados: res,
      total: resultados.length,
    });
  }

}
