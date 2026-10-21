import { HttpClient, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type EnviarNecesidadesPrimerNivelPayload = {
  cluesimb: string;
  responsable?: string;
  periodo?: string;
  articulos: Array<{
    clave: string;
    cantidad: number;
    origenCaptura?: 'APS' | 'PROGRAMA_PREVENTIVO' | 'CLAVE';
    referenciaCaptura?: string | null;
  }>;
};

export type EnviarNecesidadesPrimerNivelResponse = {
  ok: true;
  solicitudId: string;
  folio: string;
  cluesimb: string;
  unidad: string;
  periodo: string | null;
  totalInsumos: number;
  totalPiezas: number;
  recibidoEn: string;
};

@Injectable({ providedIn: 'root' })
export class NecesidadesPrimerNivelService {
  private readonly http = inject(HttpClient);

  enviar(payload: EnviarNecesidadesPrimerNivelPayload): Observable<EnviarNecesidadesPrimerNivelResponse> {
    return this.http.post<EnviarNecesidadesPrimerNivelResponse>(
      `${environment.apiUrl}/solicitudes/primer-nivel/enviar`,
      payload,
      { headers: { 'X-Skip-Loader': '1' } }
    );
  }

  generarVistaPreviaExcel(payload: EnviarNecesidadesPrimerNivelPayload): Observable<HttpResponse<Blob>> {
    return this.http.post(
      `${environment.apiUrl}/solicitudes/primer-nivel/vista-previa-excel`,
      payload,
      { observe: 'response', responseType: 'blob' }
    );
  }
}
