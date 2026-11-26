import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  EstadoDispositivo,
  TipoDispositivo,
  TipoPeriferico,
} from '../models/ti-inventario.models';

@Injectable({ providedIn: 'root' })
export class TiCatalogosService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl.replace(/\/+$/, '');

  tiposDispositivo(): Observable<TipoDispositivo[]> {
    return this.http.get<TipoDispositivo[]>(`${this.base}/catalogos/tipos-dispositivo`);
  }

  estadosDispositivo(): Observable<EstadoDispositivo[]> {
    return this.http.get<EstadoDispositivo[]>(`${this.base}/catalogos/estados-dispositivo`).pipe(
      catchError(() =>
        of([
          { id: 1, nombre: 'En Uso' },
          { id: 2, nombre: 'En Reparacion' },
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
}
