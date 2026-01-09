// src/app/services/carga-masiva.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CargaMasivaService {
  constructor(private http: HttpClient) { }

  init(tipo: string) {
    return firstValueFrom(this.http.post(`${environment.apiUrl}/carga/${tipo}/init`, {}, {
      headers: { 'X-Skip-Loader': '1' }
    }));
  }

  batch(tipo: string, datos: any[]) {
    return firstValueFrom(this.http.post(`${environment.apiUrl}/carga/${tipo}/batch`, datos, {
      headers: { 'X-Skip-Loader': '1' }
    }));
  }

  // 🔹 nuevos para Inventario Inicial
  initInventarioInicial() {
    return this.http.post(`${environment.apiUrl}/carga/inventario-inicial/init`, {});
  }

  batchInventarioInicial(datos: any[], anio: number, resetAnio = true) {
    return firstValueFrom(this.http.post(
      `${environment.apiUrl}/carga/inventario-inicial/batch`,
      datos,
      { params: { anio, resetAnio},
        headers: { 'X-Skip-Loader': '1' }
      }
    ));
  }

}
