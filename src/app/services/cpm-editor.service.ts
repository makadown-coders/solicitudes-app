import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { environment } from "../../environments/environment";
import { BatchItem, CpmRow } from "../models/cpm-row";

@Injectable({ providedIn: 'root' })
export class CpmEditorService {
  private http = inject(HttpClient);
  private base = environment.apiUrl + '/cpms';

  /** Incluye cpm = 0 */
  getByUnidadAll(cluesimb?: string, cluessa?: string) {
    const params: Record<string, string> = {};
    if (cluesimb) params['cluesimb'] = cluesimb;
    if (cluessa) params['cluessa'] = cluessa;
    return this.http.get<{ rows: CpmRow[]; count?: number }>(`${this.base}/by-unidad-all`, { params });
  }

  upsertOne(um: string, clave: string, cpm: number, fuente = 'manual') {
    return this.http.patch<{ ok: true }>(`${this.base}`, { um, clave, cpm, fuente });
  }

  upsertBatch(um: string, items: BatchItem[]) {
    return this.http.post<{ ok: true; count: number }>(`${this.base}/batch`, { um, items }, {
      headers: { 'X-Skip-Loader': '1' }
    });
  }

  initClues(cluesimb: string) {
    return this.http.post<{ ok: true }>(`${this.base}/init-clues-cpm-reset?cluesimb=${cluesimb}`, {}, {
      headers: { 'X-Skip-Loader': '1' }
    });
  }
}