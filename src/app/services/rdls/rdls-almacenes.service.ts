import { Injectable, inject } from '@angular/core';
import { filter, map, shareReplay, startWith, switchMap, take } from 'rxjs/operators';
import { combineLatest, Observable, of } from 'rxjs';
import { RdlsNormalizeService } from './rdls-normalize.service';
import { Inventario } from '../../models';
import { AlmacenBucket } from '../../models/rdls/almacen.types';
import { Buckets } from '../../models/rdls/buckets.model';
import { InventarioService } from '../inventario.service';
import { UnidadesService } from '../unidades.service';
import { StorageSolicitudService } from '../storage-solicitud.service';

/**
 * Servicio para obtener existencias por almacén.
 */
@Injectable({ providedIn: 'root' })
export class RdlsAlmacenesService {
  private invSrv = inject(InventarioService);
  private unidadesSrv = inject(UnidadesService);
  private storage = inject(StorageSolicitudService);
  private norm = inject(RdlsNormalizeService);

  /** Emite UNA vez cuando los índices de Unidades están listos (o los carga si están vacíos) */
  private unidadesReady$ = this.unidadesSrv.unidades$.pipe(
    switchMap(list => (list?.length ? of(list) : this.unidadesSrv.load())),
    filter(list => Array.isArray(list) && list.length > 0),
    take(1),
    shareReplay(1)
  );

  /**
   * Map<claveNormalizada, {AZM, AZE, AZT}>
   * Suma inventario por clave y bucket (AZM/AZE/AZT) **después** de que Unidades ya indexó.
   * Recalcula cuando cambia inventario$; Unidades se usa “listo” vía unidadesReady$.
   */
  existenciasAlmacenesByClave$ = combineLatest([
    // inventario con fallback a localStorage y un valor inicial para combineLatest
    this.invSrv.inventario$.pipe(
      map((rows: Inventario[] | null | undefined) => {
        if (rows && rows.length) return rows;
        const local = this.storage.getInventarioFromLocalStorage?.();
        return Array.isArray(local) ? local : [];
      }),
      startWith([] as Inventario[])
    ),
    // garantiza que los índices de unidades ya existen
    this.unidadesReady$
  ]).pipe(
    map(([rows /*, _unidades*/]) => {
      const acc = new Map<string, Buckets>();

      for (const it of rows) {
        const clave = this.norm.normClave(String(it.clave ?? ''));
        if (!clave) continue;

        // nombre y clues (con índices de Unidades listos)
        const nombre = (it as any).almacen ?? (it as any).unidad ?? '';
        const clues = this.unidadesSrv.getCluesimbFor?.(nombre, (it as any).clues ?? (it as any).cluesimb ?? '') ?? '';       
        const bucket: AlmacenBucket | null = this.norm.classifyAlmacen(nombre, clues);
        if (!bucket) continue;

        // disponible base
        const disp = Math.max(0, Number(it.disponible ?? 0) - Number((it as any).comprometidos ?? 0));

        const curr = acc.get(clave) ?? { AZM: 0, AZE: 0, AZT: 0 };
        curr[bucket] += disp;
        acc.set(clave, curr);
      }
      return acc;
    }),
    shareReplay(1)
  );
}