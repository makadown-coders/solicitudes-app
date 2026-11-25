import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  EstadoDispositivo,
  Page,
  PersonaLite,
  TipoDispositivo,
  TipoPeriferico,
  UnidadMedica,
} from '../models/ti-inventario.models';

@Injectable({ providedIn: 'root' })
export class TiCatalogosService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  tiposDispositivo(): Observable<TipoDispositivo[]> {
    return this.http.get<TipoDispositivo[]>(`${this.base}/catalogos/tipos-dispositivo`);
  }

  estadosDispositivo(): Observable<EstadoDispositivo[]> {
    return this.http.get<EstadoDispositivo[]>(`${this.base}/catalogos/estados-dispositivo`).pipe(
      catchError(() =>
        of([
          { id: 1, nombre: 'En Uso' },
          { id: 2, nombre: 'En Reparación' },
          { id: 3, nombre: 'En Resguardo' },
        ])
      )
    );
  }

  tiposPeriferico(): Observable<TipoPeriferico[]> {
    return this.http
      .get<TipoPeriferico[]>(`${this.base}/catalogos/tipos-periferico`)
      .pipe(catchError(() => of([])));
  }

  unidades(opts: {
    municipio_id?: number | null;
    localidad_id?: number | null;
    tipo_unidad_id?: number | null;
    q?: string | null;
    page?: number;
    pageSize?: number;
  }): Observable<Page<UnidadMedica>> {
    let params = new HttpParams()
      .set('page', String(opts.page ?? 1))
      .set('pageSize', String(opts.pageSize ?? 20));

    if (opts.municipio_id) params = params.set('municipio_id', String(opts.municipio_id));
    if (opts.localidad_id) params = params.set('localidad_id', String(opts.localidad_id));
    if (opts.tipo_unidad_id) params = params.set('tipo_unidad_id', String(opts.tipo_unidad_id));
    if (opts.q?.trim()) params = params.set('q', opts.q.trim());

    return this.http
      .get<Page<UnidadMedica>>(`${this.base}/ti/unidades`, { params })
      .pipe(map((r) => ({ ...r, items: r.items ?? [] })));
  }

  personas(opts: {
    q?: string | null;
    unidad_medica_id?: number | null;
    page?: number;
    pageSize?: number;
  }): Observable<Page<PersonaLite>> {
    let params = new HttpParams()
      .set('page', String(opts.page ?? 1))
      .set('pageSize', String(opts.pageSize ?? 20));

    if (opts.q?.trim()) params = params.set('q', opts.q.trim());
    if (opts.unidad_medica_id) params = params.set('unidad_medica_id', String(opts.unidad_medica_id));

    return this.http
      .get<Page<PersonaLite>>(`${this.base}/ti/personas`, { params })
      .pipe(map((r) => ({ ...r, items: r.items ?? [] })));
  }
}
