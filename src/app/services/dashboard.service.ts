import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Cita } from '../models/Cita';
import * as LZString from 'lz-string';
import { CitasService } from './citas.service';
import { CitasFull } from '../models/ElementosBase64';
import { CitaSlim } from '../models/PaginacionCitas';

const cleanProveedor = (s: any) =>
    (s == null ? '' : String(s)).replace(/[.,]/g, '').trim();

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private STORAGE_KEY = 'citasFull';
  private citasSubject = new BehaviorSubject<Cita[]>([]);
  public citas$: Observable<Cita[]> = this.citasSubject.asObservable();

  private citasService = inject(CitasService);

  constructor(private http: HttpClient) {
    this.cargarDesdeLocalStorage();
  }

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

  limpiarDatos(): void {
    //    console.info('🧹 Limpiando datos del dashboard...');
    localStorage.removeItem(this.STORAGE_KEY);
    this.citasSubject.next([] as Cita[]);
  }

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

  // 2) Mapa clave__lote → {precio, orden, fte} ya listo para el tab
  public citasSlimMap$ = this.citasSlim$.pipe(
    map(list => {
      const mp = new Map<string, { precio?: number | null; orden?: string | null; fte?: string | null; proveedor?: string | null }>();
      for (const c of list) {
        const key = `${(c.clave_cnis ?? '').trim()}__${(c.lote ?? '').trim()}`;
        if (!mp.has(key)) {
          mp.set(key, {
            precio: c.precio_unitario ?? null,
            orden: c.orden_de_suministro ?? null,
            fte: c.fte_fmto ?? null,
            proveedor: c.proveedor ?? null
          });
        }
      }
      return mp;
    })
  );
}


