import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, map, Observable, of } from 'rxjs';
import { GrupoClave, GrupoClaveRaw } from '../models/grupo-clave.model';

@Injectable({ providedIn: 'root' })
export class GruposClavesService {
  private cache: Map<string, GrupoClave> = new Map();       // key: clave normalizada
  private mapa$ = new BehaviorSubject<Map<string, GrupoClave>>(new Map());

  constructor(private http: HttpClient) {}

  /** Carga una sola vez el JSON local y construye el mapa */
  load(): Observable<Map<string, GrupoClave>> {
    if (this.cache.size) return of(this.cache); // ya cargado

    return this.http.get<GrupoClaveRaw[]>('/grupos-claves.json').pipe(
      map(rows => {
        const mp = new Map<string, GrupoClave>();
        for (const r of rows ?? []) {
          const claveNorm = this.normalizarClave(r.Clave);
          const categoria = this.cleanText(r.Categoria);
          const grupoInsumo = this.cleanText(r.GrupoInsumo);
          if (!claveNorm) continue;
          mp.set(claveNorm, { clave: claveNorm, categoria, grupoInsumo });
        }
        this.cache = mp;
        this.mapa$.next(mp);
        return mp;
      })
    );
  }

  /** Observable del mapa (por si quieres reaccionar a recargas a futuro) */
  getMapa$(): Observable<Map<string, GrupoClave>> {
    return this.mapa$.asObservable();
  }

  /** Lookup síncrono; devuelve undefined si no existe */
  findByClave(clave: string): GrupoClave | undefined {
    return this.cache.get(this.normalizarClave(clave));
  }

  // ——— helpers ———
  private cleanText(s: string | null | undefined): string {
    if (!s) return '';
    // colapsa saltos y espacios, quita BOM raros
    return s.replace(/\uFEFF/g, '').replace(/\s+/g, ' ').trim();
  }

  /** Normaliza igual que tu InventarioService.normalizarClave (10/12 dígitos con puntos) */
  private normalizarClave(clave: string): string {
    // si prefieres, puedes inyectar InventarioService y usar su normalizador
    const s = (clave ?? '').trim();
    // aquí no inventamos reglas: solo dejamos como viene y quitamos espacios
    // si quieres la misma lógica de los prefijos10, reemplaza por tu función real
    return s;
  }
}
