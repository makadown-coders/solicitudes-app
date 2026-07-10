import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface ReporteCpmSemanalRow {
  fecha_corte: string;
  entidad: string;
  nombre_comercial: string;
  clues_imb: string;
  total_claves_en_cpm: number;
  total_claves_en_cpm_reportando: number;
  total_claves_reportando: number;
  claves_medicamentos_010_040_ultimo: number;
  claves_material_curacion_060_ultimo: number;
  otros_03_070_080: number;
  archivo_origen: string;
}

export interface ReporteCpmInitResponse {
  ok: true;
  table: string;
  truncated: boolean;
}

export interface ReporteCpmBatchResponse {
  processed: number;
}

@Injectable({ providedIn: 'root' })
export class ReporteCpmSemanalService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/reportes-cpm-semanal`;
  private readonly requestOptions = {
    headers: { 'X-Skip-Loader': '1' },
  };

  init(truncate: boolean) {
    return this.http.post<ReporteCpmInitResponse>(
      `${this.baseUrl}/init`,
      { truncate },
      this.requestOptions,
    );
  }

  batch(rows: ReporteCpmSemanalRow[]) {
    return this.http.post<ReporteCpmBatchResponse>(
      `${this.baseUrl}/batch`,
      { rows },
      this.requestOptions,
    );
  }
}
