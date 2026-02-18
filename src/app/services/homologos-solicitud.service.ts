import { Injectable, inject } from '@angular/core';
import { ArticuloSolicitud } from '../models/articulo-solicitud';
import { HomologoDTO } from '../models/homologos/HomologoDto';
import { InventarioDisponibles } from '../models/Inventario';
import { HomologosService } from './homologos.service';
import { InventarioService } from './inventario.service';
import { ArticulosService } from './articulos.service';
import { firstValueFrom } from 'rxjs';

/**
 * Interface para una sugerencia de homólogo de un artículo solicitado
 */
export interface SugerenciaHomologoItem {
  originalClave: string;
  originalCantidad: number;
  originalDescripcion?: string;
  mejores: MiniBalanceHomologoCand[];  // Top 3 ranked
  total: number;  // Total candidatos disponibles
}

/**
 * Representa un candidato homólogo individual ranqueado
 * Adaptado del modelo del dashboard (MiniBalanceHomologoCand)
 */
export interface MiniBalanceHomologoCand {
  sustituto: string;
  factor: string;  // Decimal conversion factor
  qtySugerida: number;  // faltante × factor
  buckets: { AZM: number; AZT: number; AZE: number };
  bucketPreferido: 'AZM' | 'AZT' | 'AZE' | '';
  bucketSugerido: 'AZM' | 'AZT' | 'AZE' | '';
  existenciaPreferida: number;
}

@Injectable({ providedIn: 'root' })
export class HomologosSolicitudService {
  private homologosService = inject(HomologosService);
  private inventarioService = inject(InventarioService);
  private articulosService = inject(ArticulosService);

  /**
   * Detecta homologos disponibles para un conjunto de artículos
   * @param articulos Artículos para los cuales buscar homologos
   * @param inventarioDisponible Inventario de almacenes (AZM/AZE/AZT)
   * @param cluesimb Código de la unidad (para obtener jurisdicción preferida)
   * @returns Array de sugerencias con mejores candidatos
   */
  async detectarHomologosParaArticulos(
    articulos: ArticuloSolicitud[],
    inventarioDisponible: InventarioDisponibles[],
    cluesimb: string
  ): Promise<SugerenciaHomologoItem[]> {
    if (!articulos?.length) return [];

    // 1) Extraer claves únicas para batch call
    const claves = Array.from(new Set(articulos.map(a => a.clave).filter(Boolean)));
    if (!claves.length) return [];

    // 2) Llamar a HomologosService para obtener candidatos
    try {
      const mapHomologos = await firstValueFrom(
        this.homologosService.batch(claves)
      );

      // 3) Construir índice de inventario por almacén
      const almacenIndex = this.buildAlmacenIndex(inventarioDisponible);

      // 4) Para cada artículo, ranquear sus homologos
      const sugerencias: SugerenciaHomologoItem[] = [];
      const bucketPreferido = this.getBucketPreferidoFromCluesimb(cluesimb);

      for (const art of articulos) {
        const claveNorm = this.normalizarClave(art.clave);
        const candidatos = mapHomologos.get(claveNorm) ?? [];

        if (!candidatos.length) continue;

        // Verificar existencias del artículo original en los 3 almacenes
        // Solo sugerir homologos si el stock original no satisface la cantidad solicitada
        const existenciasOriginal = almacenIndex.get(claveNorm) ?? { AZM: 0, AZT: 0, AZE: 0 };
        const totalExistenciasOriginal =
          (existenciasOriginal.AZM ?? 0) +
          (existenciasOriginal.AZT ?? 0) +
          (existenciasOriginal.AZE ?? 0);

        // Si el stock original satisface la cantidad solicitada, no sugerir homologos
        if (totalExistenciasOriginal >= art.cantidad) {
          continue;
        }

        // Si no hay stock suficiente, ranquear candidatos
        const mejores = this.rankearHomologos(
          candidatos,
          art.cantidad,
          bucketPreferido,
          almacenIndex
        );

        if (mejores.length) {
          sugerencias.push({
            originalClave: art.clave,
            originalCantidad: art.cantidad,
            originalDescripcion: art.descripcion,
            mejores,
            total: candidatos.length
          });
        }
      }

      return sugerencias;
    } catch (error) {
      console.error('❌ Error detectando homologos:', error);
      return [];  // Graceful degradation
    }
  }

  /**
   * Obtiene mejores homologos para un artículo individual
   * Solo retorna sugerencias si las existencias de la clave original en los 3 almacenes
   * (AZM, AZE, AZT) no satisfacen la cantidad solicitada
   *
   * @param clave Código del artículo
   * @param cantidad Cantidad solicitada
   * @param inventarioDisponible Inventario de almacenes
   * @param cluesimb Código de la unidad
   * @returns Array de mejores candidatos (top 3) o [] si hay suficiente stock original
   */
  async obtenerMejoresHomologos(
    clave: string,
    cantidad: number,
    inventarioDisponible: InventarioDisponibles[],
    cluesimb: string
  ): Promise<MiniBalanceHomologoCand[]> {
    const claveNorm = this.normalizarClave(clave);
    if (!claveNorm) return [];

    try {
      // Construir índice de almacenes
      const almacenIndex = this.buildAlmacenIndex(inventarioDisponible);

      // Verificar existencias de la clave original en los 3 almacenes
      const existenciasOriginal = almacenIndex.get(claveNorm) ?? { AZM: 0, AZT: 0, AZE: 0 };
      const totalExistenciasOriginal =
        (existenciasOriginal.AZM ?? 0) +
        (existenciasOriginal.AZT ?? 0) +
        (existenciasOriginal.AZE ?? 0);

      // Si el stock original satisface la cantidad solicitada, no sugerir homologos
      if (totalExistenciasOriginal >= cantidad) {
        return [];
      }

      // Si no hay stock suficiente, buscar homologos
      const mapHomologos = await firstValueFrom(
        this.homologosService.batch([claveNorm])
      );

      const candidatos = mapHomologos.get(claveNorm) ?? [];
      if (!candidatos.length) return [];

      console.log('🔍 Detectando homologos para artículos:', cluesimb);
      const bucketPreferido = this.getBucketPreferidoFromCluesimb(cluesimb);

      return this.rankearHomologos(candidatos, cantidad, bucketPreferido, almacenIndex);
    } catch (error) {
      console.error('❌ Error obteniendo homologos para:', clave, error);
      return [];
    }
  }

  /**
   * Ranquea homologos según criterios de disponibilidad y cobertura
   * Implementación adaptada de dashboard rankHomologos()
   */
  private rankearHomologos(
    candidatos: HomologoDTO[],
    cantidad: number,
    bucketPreferido: 'AZM' | 'AZT' | 'AZE' | '',
    almacenIndex: Map<string, { AZM: number; AZT: number; AZE: number }>
  ): MiniBalanceHomologoCand[] {
    const ranked: MiniBalanceHomologoCand[] = [];

    for (const h of (candidatos ?? [])) {
      const sustituto = (h.candidato || '').trim().toUpperCase();
      if (!sustituto) continue;

      // Convertir factor a número
      const f = Number(h.factor);
      if (!isFinite(f) || f <= 0) continue;

      // Obtener stock en almacenes
      const buckets = almacenIndex.get(sustituto) ?? { AZM: 0, AZT: 0, AZE: 0 };
      const total = (buckets.AZM ?? 0) + (buckets.AZT ?? 0) + (buckets.AZE ?? 0);

      if (total <= 0) continue;  // Sin stock, skip

      // Existencia en almacén preferido
      const existenciaPreferida = bucketPreferido === 'AZM'
        ? buckets.AZM
        : bucketPreferido === 'AZT'
          ? buckets.AZT
          : bucketPreferido === 'AZE'
            ? buckets.AZE
            : 0;

      // Almacén sugerido: preferido si tiene stock, sino el que más tiene
      let bucketSugerido: 'AZM' | 'AZT' | 'AZE' | '' = '';

      // Si el preferido tiene stock, usarlo
      if (bucketPreferido && existenciaPreferida > 0) {
        bucketSugerido = bucketPreferido;
      } else {
        // Sino, buscar el almacén con mayor stock (excluyendo el preferido si es que tenía 0)
        const pares: Array<['AZM' | 'AZT' | 'AZE', number]> = [
          ['AZT', buckets.AZT ?? 0],
          ['AZM', buckets.AZM ?? 0],
          ['AZE', buckets.AZE ?? 0],
        ];

        // Primero, filtrar almacenes con stock > 0
        const conStock = pares.filter(p => p[1] > 0);
        const candidatos = conStock.length > 0 ? conStock : pares;

        // Ordenar por mayor stock descendente
        candidatos.sort((a, b) => b[1] - a[1]);
        bucketSugerido = candidatos[0]?.[0] ?? '';
      }

      ranked.push({
        sustituto,
        factor: h.factor,
        qtySugerida: (cantidad || 0) * f,
        buckets,
        bucketPreferido,
        bucketSugerido,
        existenciaPreferida: bucketSugerido === 'AZM'
          ? buckets.AZM
          : bucketSugerido === 'AZT'
            ? buckets.AZT
            : bucketSugerido === 'AZE'
              ? buckets.AZE
              : 0,
      });
    }

    // Ranking priority (igual que dashboard)
    ranked.sort((a, b) => {
      // 1) Tiene stock en almacén preferido?
      const aPref = (a.bucketPreferido && a.bucketPreferido === a.bucketSugerido) ? 1 : 0;
      const bPref = (b.bucketPreferido && b.bucketPreferido === b.bucketSugerido) ? 1 : 0;
      if (bPref !== aPref) return bPref - aPref;

      // 2) Mayor stock en almacén sugerido?
      const aDisp = a.existenciaPreferida || 0;
      const bDisp = b.existenciaPreferida || 0;
      if (bDisp !== aDisp) return bDisp - aDisp;

      // 3) Mejor factor (menor cantidad sugerida)?
      return (a.qtySugerida || 0) - (b.qtySugerida || 0);
    });

    return ranked.slice(0, 3);  // Top 3
  }

  /**
   * Construye índice de inventario por clave: { AZM, AZE, AZT }
   */
  private buildAlmacenIndex(
    inventarioDisponible: InventarioDisponibles[]
  ): Map<string, { AZM: number; AZT: number; AZE: number }> {
    const idx = new Map<string, { AZM: number; AZT: number; AZE: number }>();

    const byCount = new Map<string, { AZM: number; AZT: number; AZE: number }>();
    for (const item of (inventarioDisponible ?? [])) {
      const k = this.normalizarClave(item.clave);
      if (!k) continue;
      const entry = byCount.get(k) ?? { AZM: 0, AZT: 0, AZE: 0 };
      entry.AZM += item.existenciasAZM ?? 0;
      entry.AZT += item.existenciasAZT ?? 0;
      entry.AZE += item.existenciasAZE ?? 0;
      byCount.set(k, entry);
    }

    return byCount;
  }

  /**
   * Obtiene el almacén preferido según la jurisdicción de la unidad
   * Lee el municipio desde localStorage (datosClues.hospital.municipio)
   * y lo mapea a la jurisdicción correspondiente
   */
  private getBucketPreferidoFromCluesimb(
    cluesimb: string
  ): 'AZM' | 'AZT' | 'AZE' | '' {
    if (!cluesimb) return '';

    // Intentar obtener municipio del localStorage
    let municipio = this.getMunicipioFromLocalStorage();

    // Si no hay municipio en localStorage, fallback a mapeo por cluesimb
    if (!municipio) {
      const cluesUpper = cluesimb.toUpperCase();
      if (cluesUpper.includes('TIJUANA') || cluesUpper.includes('TJ')) return 'AZT';
      if (cluesUpper.includes('MEXICALI') || cluesUpper.includes('MX')) return 'AZM';
      if (cluesUpper.includes('ENSENADA') || cluesUpper.includes('EN')) return 'AZE';
      return '';
    }

    // Mapear municipio a jurisdicción (según query del backend)
    const jurisdiccion = this.mapMunicipioToJurisdiccion(municipio);

    // Mapear jurisdicción a almacén
    return this.mapJurisdiccionToAlmacen(jurisdiccion);
  }

  /**
   * Extrae el municipio del localStorage desde datosClues.hospital.municipio
   * por ahora se usa solo en modulo de solicitudes (primer y segundo nivel)
   */
  private getMunicipioFromLocalStorage(): string | null {
    try {
      const datosCluesStr = localStorage.getItem('datosClues');
      if (!datosCluesStr) return null;

      const datosClues = JSON.parse(datosCluesStr);
      return datosClues?.hospital?.municipio?.trim().toUpperCase() || null;
    } catch (error) {
      console.warn('⚠️ Error leyendo municipio de localStorage:', error);
      return null;
    }
  }

  /**
   * Mapea un municipio a su jurisdicción correspondiente
   * Agrupa municipios según la lógica del backend (query detallado)
   */
  private mapMunicipioToJurisdiccion(municipio: string): string {
    const munUpper = municipio.toUpperCase().trim();

    // Mapeo de municipios a jurisdicciones
    if (['TIJUANA', 'TECATE', 'PLAYAS DE ROSARITO'].includes(munUpper)) {
      return 'TIJUANA';
    }
    if (['MEXICALI', 'SAN FELIPE'].includes(munUpper)) {
      return 'MEXICALI';
    }
    if (['ENSENADA', 'SAN QUINTIN'].includes(munUpper)) {
      return 'ENSENADA';
    }

    // Si no coincide, retornar el municipio como jurisdicción
    return munUpper;
  }

  /**
   * Mapea una jurisdicción al almacén correspondiente
   */
  private mapJurisdiccionToAlmacen(
    jurisdiccion: string
  ): 'AZM' | 'AZT' | 'AZE' | '' {
    const jurUpper = jurisdiccion.toUpperCase().trim();

    if (jurUpper === 'TIJUANA') return 'AZT';
    if (jurUpper === 'MEXICALI') return 'AZM';
    if (jurUpper === 'ENSENADA') return 'AZE';

    return '';
  }

  /**
   * Normaliza una clave para búsqueda
   */
  private normalizarClave(clave: string | undefined | null): string {
    return this.inventarioService.normalizarClave((clave ?? '').toString().toUpperCase());
  }
}
