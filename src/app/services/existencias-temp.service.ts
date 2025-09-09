import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export type Fuente = 'SAS'|'SALUS';
export type TempRow = {
  fuente: Fuente;
  alias_sas?: string | null;
  cluessa?: string | null;
  cluesimb?: string | null;
  clave_cnis: string;
  lote?: string | null;
  fecha_caducidad?: string | null;
  existencia: number;
};

@Injectable({ providedIn: 'root' })
export class ExistenciasTempService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/existencias-temp`;

  init(reset = true) {
    return this.http.post<{ok:true}>(`${this.base}/init?reset=${reset}`, {});
  }

  batch(rows: TempRow[]) {
    return this.http.post<{inserted:number}>(`${this.base}/batch`, { rows });
  }
}
