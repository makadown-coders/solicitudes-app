import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, map, Observable, of } from 'rxjs';
import { Articulo, ArticuloSolicitud } from '../models/articulo-solicitud';

@Injectable({
  providedIn: 'root'
})
export class ArticulosService {
  private apiUrl = `${environment.apiUrl}/articulos`;

  private articulosPrimerNivelSubject = new BehaviorSubject<Articulo[]>([]);
  public articulosPrimerNivel$: Observable<Articulo[]> = this.articulosPrimerNivelSubject.asObservable();
  private medicamentosPrimerNivel: Articulo[] = [];

  constructor(private http: HttpClient) {
    this.cargarArticulosPrimerNivel();
   }

   private cargarArticulosPrimerNivel() {
    this.http.get<Articulo[]>('/articulos-primernivel.json').subscribe(articulos => {
      this.medicamentosPrimerNivel = [...articulos];
      this.articulosPrimerNivelSubject.next(articulos);
    });
  }

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
    // cargo los datos del json local en /public para no tener que hacer peticiones a la api de koyeb
    return this.http.get<Articulo[]>('/articulos.json')
      .pipe(
        map((articulosData: Articulo[]) => {
          const resultados = articulosData.filter(art =>
            art.clave.toLowerCase().includes(filtro) ||
            art.descripcion.toLowerCase().includes(filtro)
          );
          const res = resultados.map(art => ({
            clave: art.clave,
            descripcion: art.descripcion,
            unidadMedida: art.presentacion ?? '',
            cantidad: 0, // valor neutral inicial
          }));
          return {
            resultados: res,
            total: resultados.length,
          };
        })
      );
  }

  
  buscarArticulosPrimerNivel(termino: string): Observable<{ resultados: ArticuloSolicitud[]; total: number }> {
    const filtro = termino.toLowerCase();
    // cargo los datos del json local en /public para no tener que hacer peticiones a la api de koyeb
    return this.http.get<Articulo[]>('/articulos-primernivel.json')
      .pipe(
        map((articulosData: Articulo[]) => {          
          const resultados = articulosData.filter(art =>
            art.clave.toLowerCase().includes(filtro) ||
            art.descripcion.toLowerCase().includes(filtro)
          );          
          const res = resultados.map(art => ({
            clave: art.clave,
            descripcion: art.descripcion,
            unidadMedida: art.presentacion ?? '',
            cantidad: 0, // valor neutral inicial
          }));
          return {
            resultados: res,
            total: resultados.length,
          };
        })
      );
  }
}
