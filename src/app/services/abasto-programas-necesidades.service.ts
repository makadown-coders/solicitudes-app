import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AbastoProgramasFiltros, AbastoProgramasNecesidadesResponse } from '../models/AbastoProgramasNecesidades';

@Injectable({ providedIn: 'root' })
export class AbastoProgramasNecesidadesService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, { creado: number; peticion: Promise<AbastoProgramasNecesidadesResponse> }>();
  private readonly ttlMs = 5 * 60 * 1000;
  private readonly limiteCache = 12;

  consultar(filtros: AbastoProgramasFiltros, omitirCache = false): Promise<AbastoProgramasNecesidadesResponse> {
    const clave = this.claveCache(filtros);
    this.eliminarCaducadas();
    if (!omitirCache) {
      const guardada = this.cache.get(clave);
      if (guardada && Date.now() - guardada.creado < this.ttlMs) return guardada.peticion;
    }

    const peticion = this.consultarCompleto(filtros).catch(error => {
      if (this.cache.get(clave)?.peticion === peticion) this.cache.delete(clave);
      throw error;
    });
    this.cache.delete(clave);
    this.cache.set(clave, { creado: Date.now(), peticion });
    while (this.cache.size > this.limiteCache) this.cache.delete(this.cache.keys().next().value!);
    return peticion;
  }

  private async consultarCompleto(filtros: AbastoProgramasFiltros): Promise<AbastoProgramasNecesidadesResponse> {
    const pageSize = 100;
    const primera = await firstValueFrom(this.http.get<AbastoProgramasNecesidadesResponse>(
      `${environment.apiUrl}/solicitudes/primer-nivel/abasto-programas/necesidades`,
      { params: this.crearParams(filtros, 1, pageSize) }
    ));
    const paginas = Math.ceil(primera.total / pageSize);
    if (paginas <= 1) return { ...primera, page: 1, pageSize: primera.total || pageSize };
    const restantes = await Promise.all(Array.from({ length: paginas - 1 }, (_, index) =>
      firstValueFrom(this.http.get<AbastoProgramasNecesidadesResponse>(
        `${environment.apiUrl}/solicitudes/primer-nivel/abasto-programas/necesidades`,
        { params: this.crearParams(filtros, index + 2, pageSize) }
      ))
    ));
    return {
      ...primera,
      page: 1,
      pageSize: primera.total,
      data: [primera, ...restantes].flatMap(respuesta => respuesta.data),
    };
  }

  private crearParams(filtros: AbastoProgramasFiltros, page: number, pageSize: number): HttpParams {
    let params = new HttpParams()
      .set('modalidad', filtros.modalidad).set('mes', filtros.mes).set('desde', filtros.desde)
      .set('vertiente', filtros.vertiente).set('page', String(page)).set('pageSize', String(pageSize));
    if (filtros.jurisdiccion) params = params.set('jurisdiccion', filtros.jurisdiccion);
    if (filtros.municipio) params = params.set('municipio', filtros.municipio);
    if (filtros.clues) params = params.set('clues', filtros.clues);
    if (filtros.programa) params = params.set('programa', filtros.programa);
    for (const ventana of filtros.ventanasSas) {
      const prefijo = ventana.zona.toLowerCase();
      params = params.set(`${prefijo}Desde`, ventana.desde).set(`${prefijo}Hasta`, ventana.hasta);
    }
    return params;
  }

  private claveCache(filtros: AbastoProgramasFiltros): string {
    return JSON.stringify({
      modalidad: filtros.modalidad, mes: filtros.mes, desde: filtros.desde,
      jurisdiccion: filtros.jurisdiccion, municipio: filtros.municipio, clues: filtros.clues,
      vertiente: filtros.vertiente, programa: filtros.programa,
      ventanasSas: [...filtros.ventanasSas].sort((a, b) => a.zona.localeCompare(b.zona)),
    });
  }

  private eliminarCaducadas(): void {
    const ahora = Date.now();
    for (const [clave, entrada] of this.cache) {
      if (ahora - entrada.creado >= this.ttlMs) this.cache.delete(clave);
    }
  }
}
