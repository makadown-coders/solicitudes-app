import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { Consulta, Informe } from '../models/SurtimientoPrimerNivel';

@Injectable({providedIn:'root'})
export class SurtimientoPrimerNivelService {
  private http=inject(HttpClient);
  analizar(consulta: Consulta) {
    return firstValueFrom(this.http.post<Informe>(environment.apiUrl+'/solicitudes/primer-nivel/surtimiento',consulta));
  }
}
