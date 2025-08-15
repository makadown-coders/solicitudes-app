// src/app/services/unidades.service.ts
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Unidad } from '../models/articulo-solicitud';

// Backend model de referencia:
// interface UnidadMedica {
//   id?: number; cluessa: string | null; cluesimb: string | null; nombre: string;
//   direccion: string | null; latitud: number | null; longitud: number | null;
//   estrato_unidad: string | null; nivel_atencion: string | null;
//   tipo_unidad_id: number; localidad_id: number;
//   // y el getAll() incluye: tipo_unidad.nombre_tipo AS tipo_unidad, localidad.nombre_localidad, municipio.nombre_municipio
// }

type UnidadFromApi = {
  id?: number;
  cluessa: string | null;
  cluesimb: string | null;
  nombre: string;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
  estrato_unidad: string | null;
  nivel_atencion: string | null;
  tipo_unidad: string | null;
  nombre_localidad?: string | null;
  nombre_municipio?: string | null;
};

@Injectable({ providedIn: 'root' })
export class UnidadesService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/unidades`;

  // cache reactivo
  private unidadesSubject = new BehaviorSubject<Unidad[]>([]);
  public unidades$: Observable<Unidad[]> = this.unidadesSubject.asObservable();

  // índices para búsquedas rápidas
  private byCluesimb = new Map<string, Unidad>();
  private byNombreNorm = new Map<string, Unidad>();

  // utilidad de normalización de nombre (quita acentos, mayúsculas y espacios extra)
  private normalizeName(s: string) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // quita acentos
      .replace(/\s+/g, ' ')                               // colapsa espacios
      .trim();
  }

  /** Carga (o recarga) desde backend y construye los índices */
  load(): Observable<Unidad[]> {
    return this.http.get<UnidadFromApi[]>(this.apiUrl).pipe(
      map(rows => (rows ?? []).map(r => {
        const u: Unidad = {
          // tu interfaz usa 'cluesssa' (con 3 's'); lo llenamos desde 'cluessa'
          cluesssa: (r.cluessa ?? '') || '',
          cluesimb: (r.cluesimb ?? '') || '',
          nombre: r.nombre || '',
          municipio: (r as any).nombre_municipio ?? '',
          localidad: (r as any).nombre_localidad ?? '',
          jurisdiccion: '', // no viene en el SELECT actual
          direccion: r.direccion ?? '',
          latitud: r.latitud != null ? String(r.latitud) : '',
          longitud: r.longitud != null ? String(r.longitud) : '',
          estratoUnidad: r.estrato_unidad ?? '',
          nivelAtencion: r.nivel_atencion ?? '',
          tipoUnidad: r.tipo_unidad ?? '',
        };
        return u;
      })),
      map((unidades: Unidad[]) => {
        // reconstruir índices
        this.byCluesimb.clear();
        this.byNombreNorm.clear();
        for (const u of unidades) {
          if (u.cluesimb) this.byCluesimb.set(u.cluesimb.trim().toUpperCase(), u);
          const norm = this.normalizeName(u.nombre);
          if (norm) this.byNombreNorm.set(norm, u);
        }
        this.unidadesSubject.next(unidades);
        return unidades;
      })
    );
  }

  /** Devuelve el objeto Unidad por CLUES IMB (case-insensitive) */
  findByCluesimb(cluesimb?: string): Unidad | undefined {
    if (!cluesimb) return undefined;
    return this.byCluesimb.get(cluesimb.trim().toUpperCase());
  }

  /** Busca por nombre “normalizado” (útil cuando inventario trae 'almacen' o 'unidad' como texto) */
  findByNombre(nombre?: string): Unidad | undefined {
    if (!nombre) return undefined;    
    const norm = this.normalizeName(nombre);
    let encontrado = this.byNombreNorm.get(norm);
    if (!encontrado) {
      // TODO: chicanada, hay que arreglarlo en BD, para que jale desde [unidad_medica_alias] 
      // haciendo join con [unidad_medica]
      if (nombre.toLocaleUpperCase().includes('UNEME ONCOLOGIA MEXICALI')){
        nombre = 'uneme de oncologia';
      } /*else {
        console.log('no encontrado', nombre);
      }*/
      encontrado = this.byNombreNorm.get(nombre);
    }
    return encontrado;
  }

  /** Devuelve CLUES IMB por nombre (o por clues embebido en inventario si ya viene) */
  getCluesimbFor(invNombre?: string, fallbackClues?: string): string | null {
    if (fallbackClues) return fallbackClues;
    const u = this.findByNombre(invNombre || '');
    return u?.cluesimb ?? null;
  }
}
