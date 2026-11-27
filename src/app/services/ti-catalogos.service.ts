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
    return this.http.get<TipoDispositivo[]>(`${this.base}/ti/catalogos/tipos-dispositivo`);
  }

  estadosDispositivo(): Observable<EstadoDispositivo[]> {
    return this.http.get<EstadoDispositivo[]>(`${this.base}/ti/catalogos/estados-dispositivo`);
  }

  tiposPeriferico(): Observable<TipoPeriferico[]> {
    return this.http
      .get<TipoPeriferico[]>(`${this.base}/catalogos/tipos-periferico`)
      .pipe(catchError(() => of([])));
  }
}
