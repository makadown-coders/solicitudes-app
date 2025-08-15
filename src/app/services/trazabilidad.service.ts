// trazabilidad.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { MovimientoTrazabilidad } from '../models/movimiento-trazabilidad';
import { environment } from '../../environments/environment';
import { firstValueFrom } from 'rxjs';
import { FactorUnidad } from '../models/factor-unidad';

@Injectable({ providedIn: 'root' })
export class TrazabilidadService {
  private factorCache = new Map<string, FactorUnidad>(); // key = `${clave}|${cluesimb}`
  
  constructor(private http: HttpClient) { }

  obtenerPorClaveYClues(clave: string, cluesimb: string) {
    return firstValueFrom(this.http.get<MovimientoTrazabilidad[]>(
      `${environment.apiUrl}/trazabilidad?clave=${clave}&cluesimb=${cluesimb}`));
  }

  // 🔹 (LEGACY) factor por clave únicamente – lo dejas por compatibilidad
  getFactorConversion(clave: string) {
    return this.http.get<{ clave: string; en_dispensacion: boolean; cantidad_fc: number }>(
      `${environment.apiUrl}/factores/${encodeURIComponent(clave)}`
    );
  }

  // 🔹 (NUEVO) factor por CLAVE + CLUES (usa el endpoint que implementamos en backend)
  async getFactorConversionPorUnidad(clave: string, cluesimb: string): Promise<FactorUnidad> {
    const key = `${clave}|${cluesimb}`;
    const cached = this.factorCache.get(key);
    if (cached) return cached;

    const params = new HttpParams().set('clave', clave).set('clues', cluesimb);
    let resp = await firstValueFrom(
      this.http.get<{ en_dispensacion: number | boolean; cantidad_fc: number }>(
        `${environment.apiUrl}/factores/factor`, { params }
      )
    );

    // si resp es nulo inicializarlo en 0 para no romper el front    
    if (!resp) {
      resp = { en_dispensacion: 0, cantidad_fc: 1 };
    }
    

    // Normaliza tipos (por si backend envía boolean)
    const factor: FactorUnidad = {
      clave,
      cluesimb,
      en_dispensacion: typeof resp.en_dispensacion === 'boolean' ? (resp.en_dispensacion ? 1 : 0) : (resp.en_dispensacion ?? 0),
      cantidad_fc: resp.cantidad_fc ?? 1
    };

    this.factorCache.set(key, factor);
    return factor;
  }
}


