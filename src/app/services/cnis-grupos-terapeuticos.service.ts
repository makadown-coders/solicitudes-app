import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  CnisArticuloGrupoTerapeuticoDetalle,
  CnisGrupoTerapeutico,
} from '../models/cnis-grupos-terapeuticos';

@Injectable({ providedIn: 'root' })
export class CnisGruposTerapeuticosService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/cnis/grupos-terapeuticos`;
  private gruposCache$?: Observable<CnisGrupoTerapeutico[]>;
  private readonly articulosPorGrupoCache = new Map<number, Observable<CnisArticuloGrupoTerapeuticoDetalle[]>>();

  obtenerGrupos(forzarRecarga = false): Observable<CnisGrupoTerapeutico[]> {
    if (forzarRecarga || !this.gruposCache$) {
      this.gruposCache$ = this.http.get<CnisGrupoTerapeutico[]>(this.baseUrl).pipe(shareReplay(1));
    }
    return this.gruposCache$;
  }

  obtenerArticulosPorGrupo(
    numero: number,
    forzarRecarga = false
  ): Observable<CnisArticuloGrupoTerapeuticoDetalle[]> {
    if (forzarRecarga) this.articulosPorGrupoCache.delete(numero);

    let peticion = this.articulosPorGrupoCache.get(numero);
    if (!peticion) {
      peticion = this.http
        .get<CnisArticuloGrupoTerapeuticoDetalle[]>(`${this.baseUrl}/${numero}/articulos`)
        .pipe(shareReplay(1));
      this.articulosPorGrupoCache.set(numero, peticion);
    }
    return peticion;
  }
}
