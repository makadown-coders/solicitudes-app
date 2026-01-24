// src/app/services/solicitudes-bitacora.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ArticuloSolicitud } from '../../models/articulo-solicitud';

export type BitacoraPayload = {
  cluesimb: string;
  tipoPedido: 'Ordinario' | 'Extraordinario';
  tipoInsumo: string;          // ej "Medicamento - Material de Curación"
  periodo?: string;
  articulos: Array<{ clave: string; cantidad: number }>;
};

export type BitacoraHeader = {
  id: string;
  created_day: string;              // YYYY-MM-DD
  created_at?: string;              // opcional
  cluesimb: string;
  tipo_pedido: 'Ordinario' | 'Extraordinario';
  tipos_insumo: string[];           // text[]
  periodo_texto: string | null;
  total_renglones: number;
  total_piezas: number;
};

export type BitacoraDetalle = {
  solicitud_id: string;
  clave: string;
  cantidad: number;
};

@Injectable({ providedIn: 'root' })
export class SolicitudesBitacoraService {
  private http = inject(HttpClient);

  async registrar(payload: BitacoraPayload): Promise<void> {
    // No lances por errores de red: solo “best effort”
    try {
      await firstValueFrom(
        this.http.post(`${environment.apiUrl}/solicitudes/bitacora`, payload)
      );
    } catch {
      // Silencioso; opcional: console.warn('No se pudo registrar bitácora');
    }
  }

  async listar(desdeISO: string, hastaISO: string): Promise<BitacoraHeader[]> {
    const params = new HttpParams()
      .set('desde', desdeISO)
      .set('hasta', hastaISO);

    return await firstValueFrom(
      this.http.get<BitacoraHeader[]>(`${environment.apiUrl}/solicitudes/bitacora`, { params })
    );
  }

  async detalle(id: string): Promise<BitacoraDetalle[]> {
    return await firstValueFrom(
      this.http.get<BitacoraDetalle[]>(`${environment.apiUrl}/solicitudes/bitacora/${id}/detalle`)
    );
  }

  buildPayload(
    datosClues: any,
    items: ArticuloSolicitud[],
    modoStandalone: boolean
  ): BitacoraPayload | null {
    if (modoStandalone) return null;

    const cluesimb = (datosClues?.hospital?.cluesimb ?? '').toString().trim().toUpperCase();
    if (!cluesimb) return null;

    const tipoPedido = (datosClues?.tipoPedido ?? 'Ordinario') as 'Ordinario' | 'Extraordinario';
    const tipoInsumo = (datosClues?.tipoInsumo ?? '').toString().trim();
    const periodo = (datosClues?.periodo ?? '').toString().trim();

    const articulos = (items ?? [])
      .filter(a => (a?.clave ?? '').trim() && Number(a?.cantidad ?? 0) >= 0)
      .map(a => ({
        clave: a.clave.trim().toUpperCase(),
        cantidad: Number(a.cantidad) || 0
      }));

    if (!tipoInsumo || articulos.length === 0) return null;

    return { cluesimb, tipoPedido, tipoInsumo, periodo, articulos };
  }
}
