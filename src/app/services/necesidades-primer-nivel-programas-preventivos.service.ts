import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ProgramaPreventivoResumen {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
  totalInsumos: number;
}

export interface ProgramaPreventivoInsumo {
  clave: string;
  nombre: string;
  descripcion: string | null;
  presentacion: string | null;
  obligatorio: boolean;
  orden: number;
}

export interface ProgramaPreventivoDetalle {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  insumos: ProgramaPreventivoInsumo[];
}

export interface ResolverProgramaPreventivoResponse {
  programa: { codigo: string; nombre: string };
  articulos: Array<{ clave: string; cantidad: number }>;
  totalArticulos: number;
  listoParaEnviar: true;
}

@Injectable({ providedIn: 'root' })
export class NecesidadesPrimerNivelProgramasPreventivosService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/solicitudes/primer-nivel/programas-preventivos`;
  private readonly opciones = { headers: { 'X-Skip-Loader': '1' } };

  listar(cluesimb: string): Observable<{ items: ProgramaPreventivoResumen[] }> {
    const params = new HttpParams().set('cluesimb', cluesimb);
    return this.http.get<{ items: ProgramaPreventivoResumen[] }>(this.apiUrl, { ...this.opciones, params });
  }

  obtenerDetalle(codigo: string, cluesimb: string): Observable<ProgramaPreventivoDetalle> {
    const params = new HttpParams().set('cluesimb', cluesimb);
    return this.http.get<ProgramaPreventivoDetalle>(
      `${this.apiUrl}/${encodeURIComponent(codigo)}`,
      { ...this.opciones, params }
    );
  }

  resolver(payload: {
    cluesimb: string;
    programa: string;
    insumos: Array<{ clave: string; cantidad: number }>;
  }): Observable<ResolverProgramaPreventivoResponse> {
    return this.http.post<ResolverProgramaPreventivoResponse>(`${this.apiUrl}/resolver`, payload, this.opciones);
  }
}
