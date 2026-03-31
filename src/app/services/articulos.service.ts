// src/app/services/articulos.service.ts
import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, map, Observable, of, shareReplay } from 'rxjs';
import { Articulo, ArticuloSolicitud } from '../models/articulo-solicitud';

@Injectable({
  providedIn: 'root'
})
export class ArticulosService {
  private apiUrl = `${environment.apiUrl}/articulos`;

  /** Por deprecar ahora se jalaria por postgres */
  private articulosPrimerNivelSubject = new BehaviorSubject<Articulo[]>([]);
  /** Por deprecar ahora se jalaria por postgres */
  public articulosPrimerNivel$: Observable<Articulo[]> = this.articulosPrimerNivelSubject.asObservable();
  /** Por deprecar ahora se jalaria por postgres */
  private medicamentosPrimerNivel: Articulo[] = [];

  /** para Tab Inventario en Dashboard abasto */
  private _articulosMapaCache: Record<string, { descripcion: string; presentacion?: string }> | null = null;
  private _articulosMapaCache$: Observable<Record<string, any>> | null = null;

  /** para Tab Solicitudes */
  private _articulosSolicitudMapaCache$: Observable<Record<string, any>> | null = null;
  private _articulosSolicitudMapaCacheKey: string | null = null;
  private _articulosCatalogoLocalCache$: Observable<Articulo[]> | null = null;
  private _articulosCatalogoLocalMapCache$: Observable<Record<string, Articulo>> | null = null;

  constructor(private http: HttpClient) {
    // this.cargarArticulosPrimerNivel();
  }

  /*private cargarArticulosPrimerNivel() {
    this.http.get<Articulo[]>('/articulos-primernivel.json').subscribe(articulos => {
      this.medicamentosPrimerNivel = [...articulos];
      this.articulosPrimerNivelSubject.next(articulos);
    });
  }*/

  /** Por deprecar ahora se jalaria por postgres */
  esPrimerNivel(clave: string) {
    return this.medicamentosPrimerNivel.some(art => art.clave === clave);
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
    return this.getArticulosCatalogoLocal()
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
            presentacion: art.presentacion ?? '',
            observaciones: '',
            cantidad: 0, // valor neutral inicial,
            cpm: 0, // valor neutral inicial
          }));
          return {
            resultados: res,
            total: resultados.length,
          };
        })
      );
  }

  getArticulosCatalogoLocal(): Observable<Articulo[]> {
    if (!this._articulosCatalogoLocalCache$) {
      this._articulosCatalogoLocalCache$ = this.http.get<Articulo[]>('/articulos.json').pipe(
        shareReplay(1)
      );
    }

    return this._articulosCatalogoLocalCache$;
  }

  getArticulosCatalogoLocalMap(): Observable<Record<string, Articulo>> {
    if (!this._articulosCatalogoLocalMapCache$) {
      this._articulosCatalogoLocalMapCache$ = this.getArticulosCatalogoLocal().pipe(
        map(arr => {
          const mapa: Record<string, Articulo> = {};
          for (const art of arr) {
            mapa[(art.clave || '').toUpperCase()] = art;
          }
          return mapa;
        }),
        shareReplay(1)
      );
    }

    return this._articulosCatalogoLocalMapCache$;
  }

  /** Por deprecar ahora se jalaria por postgres */
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
            cpm: 0, // valor neutral inicial
            presentacion: art.presentacion ?? '',
            observaciones: '',
          }));
          return {
            resultados: res,
            total: resultados.length,
          };
        })
      );
  }


  /**
   * Returns a map of clave: { descripcion, presentacion, categoria }.
   * The map is cached so that subsequent calls return the same map.
   * Para uso en Dashboard abasto > Inventario
   * Para usarse en caso de emergencia.
   * @returns {Observable<Record<string, any>>} The map of clave: { descripcion, presentacion, categoria }.
   */
  getArticulosMapa(): Observable<Record<string, any>> {
    if (!this._articulosMapaCache$) {
      this._articulosMapaCache$ = this.http.get<{ resultados: ArticuloSolicitud[]; total: number }>(this.apiUrl+'/all').pipe(
        map( arr => {
          const mapa: Record<string, any> = {};
          for (const a of arr.resultados) {
            mapa[a.clave] = {
              descripcion: a.descripcion,
              presentacion: a.unidadMedida && a.unidadMedida !== '' ? a.unidadMedida : (a as any).presentacion ?? '',
              categoria: (a as any).categoria ?? null,
            };
          }
          this._articulosMapaCache = mapa;
          return mapa;
        }),
        shareReplay(1) // 👈 Comparte la ejecución entre múltiples suscriptores
      );
    }

    return this._articulosMapaCache$;
  }

  getArticulosMapaByCluesIMBCPM(cluesimb: string): Observable<Record<string, any>> {
    const key = (cluesimb || '').trim().toUpperCase();

    if (!key) {
      return of({});
    }

    if (!this._articulosSolicitudMapaCache$ || this._articulosSolicitudMapaCacheKey !== key) {
      this._articulosSolicitudMapaCacheKey = key;
      this._articulosSolicitudMapaCache$ = this.http
        .get<{ resultados: ArticuloSolicitud[]; total: number }>(
          `${this.apiUrl}/by-cluesimb-cpm?cluesimb=${encodeURIComponent(key)}`
        )
        .pipe(
          map(arr => {
            const mapa: Record<string, any> = {};
            for (const a of arr.resultados) {
              mapa[a.clave] = {
                descripcion: a.descripcion,
                presentacion: a.unidadMedida && a.unidadMedida !== '' ? a.unidadMedida : (a as any).presentacion ?? '',
                categoria: (a as any).categoria ?? null,
              };
            }
            return mapa;
          }),
          shareReplay(1)
        );
    }

    return this._articulosSolicitudMapaCache$;
  }

  /**
   * Por deprecar o usar en caso de emergencia =/
   * @returns
   */
  getArticulosMapaLegacy() {
    if (!this._articulosMapaCache$) {
      this._articulosMapaCache$ = this.http.get<Articulo[]>('/articulos.json').pipe(
        map(arr => {
          const mapa: Record<string, any> = {};
          for (const a of arr) {
            mapa[a.clave] = {
              descripcion: a.descripcion,
              presentacion: a.presentacion ?? '',
              categoria: (a as any).categoria ?? null,
            };
          }
          this._articulosMapaCache = mapa;
          return mapa;
        }),
        shareReplay(1) // 👈 Comparte la ejecución entre múltiples suscriptores
      );
    }

    return this._articulosMapaCache$;
  }
}
