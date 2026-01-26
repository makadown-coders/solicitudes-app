import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MovimientoResumenRow } from '../../models/solicitudes/MovimientoResumenRow';
import { MovimientoRow } from '../../models/solicitudes/MovimientoRow';

@Injectable({ providedIn: 'root' })
export class SolicitudesMovimientosService {
  private http = inject(HttpClient);

  async listar(params: {
    cluesimb: string;
    desde: string;
    hasta: string;
    clave?: string;
    tipo?: 'SALIDA' | 'TRASPASO';
  }): Promise<MovimientoRow[]> {
    let p = new HttpParams()
      .set('cluesimb', params.cluesimb)
      .set('desde', params.desde)
      .set('hasta', params.hasta);

    if (params.clave) p = p.set('clave', params.clave);
    if (params.tipo) p = p.set('tipo', params.tipo);

    return await firstValueFrom(
      this.http.get<MovimientoRow[]>(`${environment.apiUrl}/solicitudes/movimientos`, { params: p })
    );
  }

  async resumen(params: {
    cluesimb: string;
    desde: string;
    hasta: string;
    clave?: string;
    tipo?: 'SALIDA' | 'TRASPASO';
  }): Promise<MovimientoResumenRow[]> {
    let p = new HttpParams()
      .set('cluesimb', params.cluesimb)
      .set('desde', params.desde)
      .set('hasta', params.hasta);

    if (params.clave) p = p.set('clave', params.clave);
    if (params.tipo) p = p.set('tipo', params.tipo);

    return await firstValueFrom(
      this.http.get<MovimientoResumenRow[]>(
        `${environment.apiUrl}/solicitudes/movimientos/resumen`,
        { params: p }
      )
    );
  }
}
