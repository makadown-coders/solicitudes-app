import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Cita } from '../models/Cita';
import * as LZString from 'lz-string';
import { CitasService } from './citas.service';
import { CitasFull } from '../models/ElementosBase64';
import { CitaSlim } from '../models/PaginacionCitas';
import { CumplimientoTimes, KPIsResumen, ResumenResponse, SubtotalEstatus, SubtotalTipoEntrega } from '../models/StatsCitas';

type StatsFiltros = {
  ejercicio?: number | string;
  estatus?: string[];          // exactos
  tipo_de_entrega?: string[];  // exactos
  compra?: string[];           // exactos
  desde?: string;              // 'YYYY-MM-DD'
  hasta?: string;              // 'YYYY-MM-DD'
};

const cleanProveedor = (s: any) =>
  (s == null ? '' : String(s)).replace(/[.,]/g, '').trim();


@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  /**
   * En vias de deprecación / refactorización
   */
  private STORAGE_KEY = 'citasFull';
  /**
   * En vias de deprecación / refactorización
   */
  private citasSubject = new BehaviorSubject<Cita[]>([]);
  /**
   * En vias de deprecación / refactorización
   */
  public citas$: Observable<Cita[]> = this.citasSubject.asObservable();

  private citasService = inject(CitasService);

  private kpisSubject = new BehaviorSubject<KPIsResumen | null>(null);
  private porEstatusSubject = new BehaviorSubject<SubtotalEstatus[]>([]);
  private porTipoEntregaSubject = new BehaviorSubject<SubtotalTipoEntrega[]>([]);
  private cumplimientoSubject = new BehaviorSubject<CumplimientoTimes | null>(null);

  kpis$ = this.kpisSubject.asObservable();
  porEstatus$ = this.porEstatusSubject.asObservable();
  porTipoEntrega$ = this.porTipoEntregaSubject.asObservable();
  cumplimiento$ = this.cumplimientoSubject.asObservable();

  // Parámetros mínimos para stats (por ahora solo ejercicio, ajustable luego)
  private filtrosStats: StatsFiltros = {};
  // private filtrosStats: Record<string, string | number | boolean> = {};

  constructor(private http: HttpClient) {
    this.cargarDesdeLocalStorage();
  }

  setFiltroEjercicio(ejercicio: number | string) {
    this.filtrosStats = { ...this.filtrosStats, ejercicio };
  }
  setFiltroEstatus(estatus: string[]) {
    this.filtrosStats = { ...this.filtrosStats, estatus };
  }
  setFiltroTipoEntrega(tipos: string[]) {
    this.filtrosStats = { ...this.filtrosStats, tipo_de_entrega: tipos };
  }
  setFiltroCompra(compras: string[]) {
    this.filtrosStats = { ...this.filtrosStats, compra: compras };
  }
  setRangoFechas(desdeISO: string | undefined, hastaISO: string | undefined) {
    this.filtrosStats = { ...this.filtrosStats, desde: desdeISO, hasta: hastaISO };
  }

  private buildStatsQuery(): Record<string, string> {
    const q: Record<string, string> = {};
    const f = this.filtrosStats;

    if (f.ejercicio != null) q['ejercicio'] = String(f.ejercicio);

    // estos 3 llegan como arrays → el backend actual acepta exactos, no arrays.
    // Estrategia mínima: si hay >0, mandamos múltiples veces el mismo filtro concatenado por coma y en backend (si quieres) lo amplías a IN.
    // Para no tocar backend hoy, mandamos SOLO el primer valor si hay varios:
    if (f.estatus?.length) q['estatus'] = f.estatus[0];
    if (f.tipo_de_entrega?.length) q['tipo_de_entrega'] = f.tipo_de_entrega[0];
    if (f.compra?.length) q['compra'] = f.compra[0];

    if (f.desde) q['desde'] = f.desde;
    if (f.hasta) q['hasta'] = f.hasta;

    return q;
  }

  cargarStats(): void {
    console.log('🔄 Cargando stats resumen con filtros:', this.filtrosStats);
    const params = this.buildStatsQuery();
    this.citasService.getStatsResumen(params).subscribe({
      next: (r) => {
        this.kpisSubject.next(r.kpis);
        this.porEstatusSubject.next(r.por_estatus ?? []);
        this.porTipoEntregaSubject.next(r.por_tipo_entrega ?? []);
        this.cumplimientoSubject.next(r.cumplimiento ?? null);
      },
      error: (err) => console.error('❌ Error cargando stats resumen:', err)
    });
  }

  refrescarMVs(): void {
    this.citasService.refreshMaterializedViews().subscribe({
      next: () => {
        // Tras refresh de MVs, recargamos KPIs
        this.cargarStats();
      },
      error: (err) => console.error('❌ Error al refrescar MVs:', err)
    });
  }

  /**
   * En vias de deprecación / refactorización
   */
  private cargarDesdeLocalStorage() {
    const compressed = localStorage.getItem(this.STORAGE_KEY);
    if (compressed) {
      try {
        const raw = LZString.decompress(compressed);
        const citas = raw ? JSON.parse(raw) : [];
        this.citasSubject.next(citas as Cita[]);
      } catch {
        localStorage.removeItem(this.STORAGE_KEY);
      }
    }
  }

  /**
   * En vias de deprecación / refactorización
   */
  refrescarDatos(): void {
    // purgar todo el localStorage
    // this.limpiarDatos();

    // console.info('🔄 Actualizando datos del dashboard...');
    const url = `${environment.apiUrl}/citas/full`;
    // console.log('solicitando a ', url);
    this.http.get<CitasFull>(url).subscribe({
      next: (response: CitasFull) => {
        const citas = this.citasService.obtenerCitasDeBase64(response.citas);

        // 1) Serializar y comprimir
        const raw = JSON.stringify(citas);
        const compressed = LZString.compress(raw);
        try {
          localStorage.setItem(this.STORAGE_KEY, compressed);
        } catch {
          console.warn('😱 localStorage lleno, omitiendo guardado');
        }
        // 2) Emitir
        // console.info('✅ Datos del dashboard actualizados.');
        this.citasSubject.next(citas as Cita[]);
      },
      error: (err) => {
        console.error('❌ Error al cargar datos del dashboard:', err);
      }
    });
  }

  /**
   * En vias de deprecación / refactorización
   */
  limpiarDatos(): void {
    //    console.info('🧹 Limpiando datos del dashboard...');
    localStorage.removeItem(this.STORAGE_KEY);
    this.citasSubject.next([] as Cita[]);
  }

  /**
   * En vias de deprecación / refactorización
   */
  refrescarDeLocalStorage(): void {
    this.cargarDesdeLocalStorage();
  }


  // 1) Lista slim derivada del cache (citas$)
  public citasSlim$: Observable<CitaSlim[]> = this.citas$.pipe(
    map(list => (list ?? []).map(c => ({
      clave_cnis: (c as any).clave_cnis,
      lote: ((c as any).lote ?? '').toString().trim(),
      precio_unitario: (c as any).precio_unitario ?? null,
      orden_de_suministro: (c as any).orden_de_suministro ?? null,
      fte_fmto: (c as any).fte_fmto ?? null,
      proveedor: cleanProveedor((c as any).proveedor ?? ''),   // 👈 limpio (sin comas/puntos)
    }))),
    // dedupe opcional por clave__lote
    map(list => {
      const seen = new Set<string>();
      return list.filter(x => {
        const k = `${x.clave_cnis}__${x.lote}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    })
  );

  // 2) Mapa clave__lote → {precio, orden, fte, proveedor, clues_destino} ya listo para el tab
  public citasSlimMap$ = this.citasSlim$.pipe(
    map(list => {
      const mp = new Map<string, { precio?: number | null; orden?: string | null; fte?: string | null; proveedor?: string | null; }>();
      for (const c of list) {
        const key = `${(c.clave_cnis ?? '').trim()}__${(c.lote ?? '').trim()}`;
        if (!mp.has(key)) {
          mp.set(key, {
            precio: c.precio_unitario ?? null,
            orden: c.orden_de_suministro ?? null,
            fte: c.fte_fmto ?? null,
            proveedor: c.proveedor ?? null,
          });
        }
      }
      return mp;
    })
  );
}


