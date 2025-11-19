import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Cita } from '../models/Cita';
import * as LZString from 'lz-string';
import { CitasService } from './citas.service';
import { CitasFull } from '../models/ElementosBase64';
import { CitaSlim } from '../models/PaginacionCitas';
import { CumplimientoTimes, KPIsResumen, ResumenResponse, SubtotalEstatus, SubtotalTipoEntrega } from '../models/StatsCitas';

type StatsFiltros = {
  ejercicio?: Array<number | string>;
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
  // private STORAGE_KEY = 'citasFull';
  /**
   * En vias de deprecación / refactorización
   */
  // private citasSubject = new BehaviorSubject<Cita[]>([]);
  /**
   * En vias de deprecación / refactorización
   */
  // public citas$: Observable<Cita[]> = this.citasSubject.asObservable();  
  private resumenCitasSubject = new BehaviorSubject<Cita[]>([]);
  public resumenCitas$ = this.resumenCitasSubject.asObservable();

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
    // this.cargarDesdeLocalStorage();
  }

  setFiltroEjercicio(vals: number | string | Array<number | string>) {
    const arr = Array.isArray(vals) ? vals : [vals];
    this.filtrosStats = { ...this.filtrosStats, ejercicio: arr };
  }
  setFiltroEstatus(vals: string[] | string) {
    const arr = Array.isArray(vals) ? vals : [vals];
    this.filtrosStats = { ...this.filtrosStats, estatus: arr };
  }
  setFiltroTipoEntrega(vals: string[] | string) {
    const arr = Array.isArray(vals) ? vals : [vals];
    this.filtrosStats = { ...this.filtrosStats, tipo_de_entrega: arr };
  }
  setFiltroCompra(vals: string[] | string) {
    const arr = Array.isArray(vals) ? vals : [vals];
    this.filtrosStats = { ...this.filtrosStats, compra: arr };
  }
  setRangoFechas(desdeISO?: string, hastaISO?: string) {
    this.filtrosStats = { ...this.filtrosStats, desde: desdeISO, hasta: hastaISO };
  }

  cargarCitasParaResumen(): void {
    const params = this.buildStatsParams()
      // ajusta si tu endpoint pagina; aquí pedimos un techo alto “seguro”
      .set('limit', '10000')
      .set('page', '1');

    this.http.get<{ data: Cita[] }>(`${environment.apiUrl}/citas`, { params })
      .subscribe({
        next: (resp) => {
          resp?.data?.forEach((cita: Cita) => {            
            if (cita.tipo_de_entrega?.trim().toLowerCase() === 'operador logísitico' ||
              cita.tipo_de_entrega?.trim().toLowerCase() === 'operador logistico' ||
              cita.tipo_de_entrega?.trim().toLowerCase() === 'operador logístico') {
              cita.tipo_de_entrega = 'Operador Logístico';
            }
            /*if (cita.unidad?.trim().length == 0) {
              cita.unidad = this.mapCluesUnidad.get(cita.clues_destino) ?? '';
            }*/
            if (cita.unidad?.trim() == 'Almacén Zona Ensenada') {
              cita.unidad = cita.unidad.toLocaleUpperCase();
            }
            if(cita.unidad?.trim() == 'ALMACÉN DE MEXICALI') {
              cita.unidad = 'ALMACÉN ZONA MEXICALI';
            }
            if (cita.fecha_recepcion_almacen == null || cita.fecha_recepcion_almacen?.trim().length == 0) {
              // asignar fecha_recepcion_min pero sin el formato UTC (T00:00:00Z)
              cita.fecha_recepcion_almacen = cita.fecha_recepcion_min?.substring(0, 10) || null;
            }
          });
          this.resumenCitasSubject.next(resp?.data ?? []);
        },
        error: (err) => console.error('❌ Error cargando citas (resumen):', err)
      });
  }


  private buildStatsParams(): HttpParams {
    let params = new HttpParams();
    const f = this.filtrosStats;

    (f.ejercicio ?? []).forEach(v => params = params.append('ejercicio', String(v)));

    (f.estatus ?? []).forEach(v => params = params.append('estatus', v));
    (f.tipo_de_entrega ?? []).forEach(v => params = params.append('tipo_de_entrega', v));
    (f.compra ?? []).forEach(v => params = params.append('compra', v));

    if (f.desde) params = params.set('desde', f.desde);
    if (f.hasta) params = params.set('hasta', f.hasta);

    return params;
  }

  cargarStats(): void {
    const params = this.buildStatsParams();
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

  /*refrescarMVs(): void {
    this.citasService.refreshMaterializedViews().subscribe({
      next: () => {
        // Tras refresh de MVs, recargamos KPIs
        this.cargarStats();
      },
      error: (err) => console.error('❌ Error al refrescar MVs:', err)
    });
  }*/

  recargarResumen(): void {
    this.cargarStats();           // ya existente
    this.cargarCitasParaResumen(); // nuevo
  }

  /**
   * En vias de deprecación / refactorización
   */
  /*private cargarDesdeLocalStorage() {
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
  }*/

  /**
   * En vias de deprecación / refactorización
   */
  /*refrescarDatos(): void {
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
  }*/

  /**
   * En vias de deprecación / refactorización
   */
  /* limpiarDatos(): void {
     //    console.info('🧹 Limpiando datos del dashboard...');
     localStorage.removeItem(this.STORAGE_KEY);
     this.citasSubject.next([] as Cita[]);
   }*/

  /**
   * En vias de deprecación / refactorización
   */
  /* refrescarDeLocalStorage(): void {
     this.cargarDesdeLocalStorage();
   }*/


  // 1) Lista slim derivada del cache (citas$)
  /* public citasSlim$: Observable<CitaSlim[]> = this.citas$.pipe(
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
   );*/

  // 2) Mapa clave__lote → {precio, orden, fte, proveedor, clues_destino} ya listo para el tab
  /* public citasSlimMap$ = this.citasSlim$.pipe(
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
   );*/
}


