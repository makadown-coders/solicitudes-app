// src/app/services/unidades.service.ts
import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Unidad, Unidadv2, UnidadFromApi } from '../models/articulo-solicitud';
import { UnidadMedica } from '../models';


@Injectable({ providedIn: 'root' })
export class UnidadesService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/unidades`;

  // ⬇️ corrige el tipo del cache: era Unidad[], pero realmente cargas Unidadv2[]
  private unidadesSubject = new BehaviorSubject<Unidadv2[]>([]);
  public unidades$: Observable<Unidadv2[]> = this.unidadesSubject.asObservable();

  // índices para búsquedas rápidas
  private byCluesimb = new Map<string, Unidadv2>();
  private byCluessa = new Map<string, Unidadv2>();
  private byNombreNorm = new Map<string, Unidadv2>();
  private byAliasSasNorm = new Map<string, Unidadv2>();

  // para kits
  private unidadesSignal = signal<UnidadMedica[]>([]);
  unidadesAll = this.unidadesSignal.asReadonly();

  // utilidad de normalización de nombre (quita acentos, mayúsculas y espacios extra)
  private normalizeName(s: string) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // quita acentos
      .replace(/\s+/g, ' ')                               // colapsa espacios
      .trim();
  }

  /** Carga (o recarga) desde backend y construye los índices */
  load(): Observable<Unidadv2[]> {
    return this.http.get<UnidadFromApi[]>(this.apiUrl).pipe(
      map(rows => (rows ?? []).map(r => {
        // nombre puede venir como 'nombre_de_unidad' (vista) o 'nombre' (tabla antigua)
        const nombre = (r as any).nombre_de_unidad ?? r.nombre ?? '';

        const u: Unidadv2 = {
          // tu interfaz usa 'cluesssa' (con 3 's'); lo llenamos desde 'cluessa'
          cluesssa: (r.cluessa ?? '') || '',
          cluesimb: (r.cluesimb ?? '') || '',
          nombre,
          aliasSas: (r.alias_sas ?? '') || '',
          municipio: (r as any).nombre_municipio ?? '',
          localidad: (r as any).nombre_localidad ?? '',
          jurisdiccion: '', // no viene (por ahora) en la vista
          direccion: r.direccion ?? '',
          latitud: r.latitud != null ? String(r.latitud) : '',
          longitud: r.longitud != null ? String(r.longitud) : '',
          estratoUnidad: r.estrato_unidad ?? '',
          nivelAtencion: r.nivel_atencion ?? '',
          tipoUnidad: r.tipo_unidad ?? '',

          // nuevos opcionales (si vienen de la vista)
          nombreTipologia: (r as any).nombre_tipologia ?? undefined,
          esSegundoNivel: r.es_segundo_nivel ?? undefined,
        };
        return u;
      })),
      map((unidades: Unidadv2[]) => {
        // reconstruir índices
        this.byCluesimb.clear();
        this.byNombreNorm.clear();
        this.byAliasSasNorm.clear();
        this.byCluessa.clear();

        for (const u of unidades) {
          if (u.cluesimb) this.byCluesimb.set(u.cluesimb.trim().toUpperCase(), u);
          const norm = this.normalizeName(u.nombre);
          if (norm) this.byNombreNorm.set(norm, u);
          if (u.aliasSas) {
            const aliasNorm = this.normalizeName(u.aliasSas);
            if (aliasNorm) this.byAliasSasNorm.set(aliasNorm, u);
          }
          if (u.cluesssa) this.byCluessa.set(u.cluesssa.trim().toUpperCase(), u);
        }
        this.unidadesSubject.next(unidades);
        return unidades;
      })
    );
  }

  loadAllOnce() {
    if (this.unidadesSignal().length) return; // ya cargado
    this.http.get<{ ok: boolean; rows: UnidadMedica[] }>(this.apiUrl)
      .subscribe({
        next: res => this.unidadesSignal.set(res.rows ?? []),
        error: err => console.error('Error cargando unidades:', err),
      });
  }

  /** Síncrono sobre el caché (útil para autocomplete) */
  searchLocal(term: string, opts: { primerNivel: boolean; limit?: number } = { primerNivel: true }): Unidadv2[] {
    const q = this.normalizeName(term);
    if (!q) return [];
    const list = this.unidadesSubject.value || [];
    const lim = Math.max(1, Math.min(opts.limit ?? 12, 100));

    const esPrimerNivel = (u: Unidadv2) => {
      // preferimos el flag de la vista; si no viene, inferimos
      if (typeof u.esSegundoNivel === 'boolean') return !u.esSegundoNivel;
      return (u.nivelAtencion || '').toUpperCase() === 'PRIMER NIVEL';
    };
    const esSegundoNivel = (u: Unidadv2) => !esPrimerNivel(u);

    const pasaNivel = (u: Unidadv2) => opts.primerNivel ? esPrimerNivel(u) : esSegundoNivel(u);

    const contiene = (u: Unidadv2) => {
      const nombreNorm = this.normalizeName(u.nombre);
      const muni = (u.municipio || '').toLowerCase();
      return (u.cluesssa || '').toLowerCase().includes(q)
        || (u.cluesimb || '').toLowerCase().includes(q)
        || nombreNorm.includes(q)
        || muni.includes(q)
        || (u.aliasSas || '').toLowerCase().includes(q);
    };

    const result: Unidadv2[] = [];
    for (const u of list) {
      if (!pasaNivel(u)) continue;
      if (contiene(u)) {
        result.push(u);
        if (result.length >= lim) break;
      }
    }
    return result;
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
    let encontrado = this.byNombreNorm.get(norm) || this.byAliasSasNorm.get(norm);
    return encontrado;
  }

  /** Devuelve CLUES IMB por nombre (o por clues embebido en inventario si ya viene) */
  getCluesimbFor(invNombre?: string, fallbackClues?: string): string | null {
    if (fallbackClues) return fallbackClues;
    const u = this.findByNombre(invNombre || '') || this.byAliasSasNorm.get(invNombre!);
    return u?.cluesimb ?? null;
  }

  getCluesSSAFor(invNombre?: string, fallbackClues?: string): string | null {
    if (fallbackClues) return fallbackClues;
    const u = this.findByNombre(invNombre || '') || this.byAliasSasNorm.get(invNombre!);
    return u?.cluesssa ?? null;
  }

  findByCluessa(cluessa?: string): Unidadv2 | undefined {
    if (!cluessa) return undefined;
    return this.byCluessa.get(cluessa.trim().toUpperCase());
  }

  getCluesimbByCluessa(cluessa?: string): string | null {
    const u = this.findByCluessa(cluessa);
    return u?.cluesimb ?? null;
  }
}
