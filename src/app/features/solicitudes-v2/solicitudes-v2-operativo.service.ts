import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { SolicitudV2AnalisisOperativo, SolicitudV2Renglon } from './solicitudes-v2.model';

@Injectable({ providedIn: 'root' })
export class SolicitudesV2OperativoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/abasto/universos`;

  obtenerAnalisis(unidadId: number, articulos: SolicitudV2Renglon[]) {
    return this.http.post<SolicitudV2AnalisisOperativo>(
      `${this.baseUrl}/unidades/${unidadId}/analisis-operativo`,
      {
        articulos: articulos.map(articulo => ({
          clave: articulo.clave,
          cantidad: articulo.cantidad,
        })),
      },
      { headers: { 'X-Skip-Loader': 'true' } },
    );
  }
}
