import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  ConcentradoPrimerNivelFiltros,
  ConcentradoPrimerNivelResponse,
  MatrizDistribucionPrimerNivelResponse,
} from '../models/ConcentradoPrimerNivelModels';

@Injectable({ providedIn: 'root' })
export class ConcentradoPrimerNivelService {
  private readonly http = inject(HttpClient);

  consultar(filtros: ConcentradoPrimerNivelFiltros): Promise<ConcentradoPrimerNivelResponse> {
    return firstValueFrom(this.http.get<ConcentradoPrimerNivelResponse>(
      `${environment.apiUrl}/solicitudes/primer-nivel/concentrado`,
      { params: this.params(filtros) }
    ));
  }

  exportar(filtros: ConcentradoPrimerNivelFiltros): Promise<ConcentradoPrimerNivelResponse> {
    return firstValueFrom(this.http.get<ConcentradoPrimerNivelResponse>(
      `${environment.apiUrl}/solicitudes/primer-nivel/concentrado/export`,
      { params: this.params(filtros) }
    ));
  }

  matrizDistribucion(months: number): Promise<MatrizDistribucionPrimerNivelResponse> {
    return firstValueFrom(this.http.get<MatrizDistribucionPrimerNivelResponse>(
      `${environment.apiUrl}/solicitudes/primer-nivel/concentrado/matriz-distribucion`,
      { params: new HttpParams().set('months', String(months)) }
    ));
  }

  private params(filtros: ConcentradoPrimerNivelFiltros): HttpParams {
    let params = new HttpParams().set('months', String(filtros.months));
    if (filtros.jurisdiccion) params = params.set('jurisdiccion', filtros.jurisdiccion);
    if (filtros.clues) params = params.set('clues', filtros.clues);
    if (filtros.origen) params = params.set('origen', filtros.origen);
    if (filtros.referencia) params = params.set('referencia', filtros.referencia);
    if (filtros.search) params = params.set('search', filtros.search);
    if (filtros.page) params = params.set('page', String(filtros.page));
    if (filtros.pageSize) params = params.set('pageSize', String(filtros.pageSize));
    return params;
  }
}
