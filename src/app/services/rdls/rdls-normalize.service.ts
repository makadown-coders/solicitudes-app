import { Injectable, inject } from '@angular/core';
import { InventarioService } from '../inventario.service';
import { AlmacenBucket, CatBase } from '../../models/rdls/almacen.types';

@Injectable({ providedIn: 'root' })
export class RdlsNormalizeService {
  private invSrv = inject(InventarioService);

  /** Normaliza categoría (equivalente a normalizeCategoria del inventario-tab) */
  normalizeCategoria(cat?: string | null): string {
    const s = (cat ?? '').trim();
    return s ? s : 'NO ESPECIFICADO';
  }

  /** Detecta base: MEDICAMENTO / MATERIAL DE CURACIÓN / OTRA (misma heurística del inventario-tab) */
  catBase(source?: string | null): CatBase {
    const t = (source ?? '').toLowerCase();
    if (t.includes('medica'))  return 'MEDICAMENTO';
    if (t.includes('material')) return 'MATERIAL DE CURACIÓN';
    return 'OTRA';
  }

  /** Convierte a texto de columna “GRUPO TERAPÉUTICO” */
  grupoTerapeutico(categoria?: string | null, grupoInsumo?: string | null): '' | 'Medicamento' | 'Material de curacion' {
    const base = this.catBase(grupoInsumo ?? categoria ?? '');
    if (base === 'MEDICAMENTO') return 'Medicamento';
    if (base === 'MATERIAL DE CURACIÓN') return 'Material de curacion';
    return '';
  }

  /** Normaliza clave (usa el mismo normalizador de tu InventarioService si existe) */
  normClave(x: string): string {
    return this.invSrv?.normalizarClave?.(x) ?? (x?.trim() || '');
  }

  /** Clasifica un almacén a AZM/AZE/AZT por nombre/CLUES (heurística) */
  classifyAlmacen(nombre?: string | null, cluesimb?: string | null): AlmacenBucket | null {
    const n = (nombre ?? '').toUpperCase();
    const c = (cluesimb ?? '').toUpperCase();
    if (n.includes('MEXICALI') || c.includes('MEXICALI') || /\bMXL\b/.test(n)) return 'AZM';
    if (n.includes('ENSENADA') || c.includes('ENSENADA') || /\bENS\b/.test(n)) return 'AZE';
    if (n.includes('TIJUANA')  || c.includes('TIJUANA')  || /\bTIJ\b/.test(n)) return 'AZT';
    return null;
  }
}
