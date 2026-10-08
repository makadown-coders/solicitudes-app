import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ChevronRight, CircleAlert, LucideAngularModule, Search, ShoppingBasket, X } from 'lucide-angular';
import { Subject, catchError, debounceTime, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';
import { ArticulosService } from '../../services/articulos.service';
import { UnidadesService } from '../../services/unidades.service';
import { StorageSolicitudService } from '../../services/storage-solicitud.service';
import { ModoCapturaSolicitud } from '../../shared/modo-captura-solicitud';
import { DatosClues } from '../../models/datos-clues';
import { Unidadv2 } from '../../models/articulo-solicitud';
import { ResultadosInsumosSandboxComponent } from './components/resultados-insumos/resultados-insumos.component';
import { SolicitudResumenSandboxComponent } from './components/solicitud-resumen/solicitud-resumen.component';
import { SandboxArticulo, SandboxContextoUnidad, SandboxSolicitudItem } from './solicitud-unidad-sandbox.models';

type EstadoBusqueda = 'inicial' | 'escribiendo' | 'cargando' | 'resultados' | 'vacio' | 'error';

@Component({
  selector: 'app-solicitud-unidad-sandbox',
  standalone: true,
  imports: [
    CommonModule,
    LucideAngularModule,
    ResultadosInsumosSandboxComponent,
    SolicitudResumenSandboxComponent,
  ],
  templateUrl: './solicitud-unidad-sandbox.component.html',
  styleUrl: './solicitud-unidad-sandbox.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SolicitudUnidadSandboxComponent {
  private readonly storageSandboxKey = 'solicitud_unidad_sandbox_v1';
  private readonly articulosService = inject(ArticulosService);
  private readonly unidadesService = inject(UnidadesService);
  private readonly storageSolicitudService = inject(StorageSolicitudService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly busqueda$ = new Subject<string>();
  private feedbackTimer?: ReturnType<typeof setTimeout>;

  readonly SearchIcon = Search;
  readonly BasketIcon = ShoppingBasket;
  readonly NextIcon = ChevronRight;
  readonly CloseIcon = X;
  readonly AlertIcon = CircleAlert;

  readonly contexto = signal<SandboxContextoUnidad | null>(null);
  readonly cargandoUnidad = signal(true);
  readonly errorUnidad = signal('');
  readonly terminoUnidad = signal('');
  readonly unidadesEncontradas = signal<Unidadv2[]>([]);
  readonly terminoBusqueda = signal('');
  readonly estadoBusqueda = signal<EstadoBusqueda>('inicial');
  readonly resultadosBusqueda = signal<SandboxArticulo[]>([]);
  readonly limiteBusqueda = signal(20);
  readonly solicitud = signal<SandboxSolicitudItem[]>([]);
  readonly claveAgregada = signal('');
  readonly solicitudMovilAbierta = signal(false);
  readonly revisionAbierta = signal(false);
  readonly pedidoSimulado = signal(false);

  readonly resultadosVisibles = computed(() => this.resultadosBusqueda().slice(0, this.limiteBusqueda()));

  constructor() {
    this.configurarBusqueda();
    this.cargarCatalogoUnidades();
  }

  buscarUnidad(termino: string): void {
    this.terminoUnidad.set(termino);
    this.errorUnidad.set('');
    if (termino.trim().length < 2) {
      this.unidadesEncontradas.set([]);
      return;
    }
    this.unidadesEncontradas.set(
      this.unidadesService
        .searchLocal(termino, { primerNivel: true, limit: 12 })
        .filter(unidad => !(unidad.tipoUnidad || '').toUpperCase().includes('ALMAC'))
    );
  }

  seleccionarUnidad(unidad: Unidadv2): void {
    const cluesimb = unidad.cluesimb?.trim().toUpperCase();
    if (!cluesimb) {
      this.errorUnidad.set('La unidad seleccionada no tiene una CLUES IMB válida.');
      return;
    }
    void this.router.navigate(['/solicitud-unidad-sandbox', cluesimb]);
  }

  cambiarUnidad(): void {
    if (this.solicitud().length && !window.confirm('Al cambiar de unidad se limpiará la solicitud actual. ¿Deseas continuar?')) return;
    this.eliminarSolicitudGuardada();
    this.solicitud.set([]);
    this.contexto.set(null);
    this.terminoUnidad.set('');
    this.unidadesEncontradas.set([]);
    void this.router.navigate(['/solicitud-unidad-sandbox']);
  }

  buscar(termino: string): void {
    this.terminoBusqueda.set(termino);
    this.limiteBusqueda.set(20);
    const limpio = termino.trim();
    this.busqueda$.next(limpio);
    if (limpio.length < 2) {
      this.resultadosBusqueda.set([]);
      this.estadoBusqueda.set(limpio ? 'escribiendo' : 'inicial');
      return;
    }
    this.estadoBusqueda.set('escribiendo');
  }

  reintentarBusqueda(): void {
    if (this.terminoBusqueda().trim().length >= 2) this.busqueda$.next(this.terminoBusqueda().trim());
  }

  mostrarMasResultados(): void {
    this.limiteBusqueda.update(valor => valor + 20);
  }

  agregar(evento: { articulo: SandboxArticulo; cantidad: number }): void {
    const cantidad = this.sanitizarCantidad(evento.cantidad);
    this.solicitud.update(items => {
      const existente = items.find(item => item.clave === evento.articulo.clave);
      if (!existente) return [...items, { ...evento.articulo, cantidad }];
      return items.map(item => item.clave === evento.articulo.clave
        ? { ...item, cantidad: Math.min(99999, item.cantidad + cantidad) }
        : item);
    });
    this.guardarSolicitud();
    this.claveAgregada.set(evento.articulo.clave);
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
    this.feedbackTimer = setTimeout(() => this.claveAgregada.set(''), 1400);
  }

  actualizarCantidad(evento: { clave: string; cantidad: number }): void {
    this.solicitud.update(items => items.map(item => item.clave === evento.clave
      ? { ...item, cantidad: this.sanitizarCantidad(evento.cantidad) }
      : item));
    this.guardarSolicitud();
  }

  eliminar(clave: string): void {
    this.solicitud.update(items => items.filter(item => item.clave !== clave));
    this.guardarSolicitud();
  }

  limpiar(): void {
    if (this.solicitud().length && window.confirm('¿Quieres quitar todos los artículos de esta solicitud de prueba?')) {
      this.solicitud.set([]);
      this.eliminarSolicitudGuardada();
      this.solicitudMovilAbierta.set(false);
    }
  }

  abrirRevision(): void {
    if (!this.solicitud().length) return;
    this.solicitudMovilAbierta.set(false);
    this.revisionAbierta.set(true);
    this.pedidoSimulado.set(false);
  }

  generarPedidoSandbox(): void {
    this.pedidoSimulado.set(true);
  }

  private configurarBusqueda(): void {
    this.busqueda$.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      tap(termino => {
        if (termino.length >= 2) this.estadoBusqueda.set('cargando');
      }),
      switchMap(termino => termino.length < 2
        ? of(null)
        : this.articulosService.buscarArticulosSandboxPrimerNivel(termino).pipe(
        map(respuesta => ({
          termino,
          resultados: respuesta.resultados.map(item => ({
            clave: item.clave,
            descripcion: item.descripcion || 'Descripción no disponible',
            presentacion: item.presentacion || item.unidadMedida || '',
          })),
        })),
        catchError(() => {
          if (this.terminoBusqueda().trim() === termino) this.estadoBusqueda.set('error');
          return of(null);
        })
      )),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(respuesta => {
      if (respuesta === null || this.terminoBusqueda().trim() !== respuesta.termino) return;
      this.resultadosBusqueda.set(respuesta.resultados);
      this.estadoBusqueda.set(respuesta.resultados.length ? 'resultados' : 'vacio');
    });
  }

  private cargarCatalogoUnidades(): void {
    this.cargandoUnidad.set(true);
    this.unidadesService.load().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.cargandoUnidad.set(false);
        this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(parametros => {
          this.resolverUnidad(parametros.get('cluesimb'));
        });
      },
      error: () => {
        this.cargandoUnidad.set(false);
        this.errorUnidad.set('No pudimos cargar el catálogo de Centros de Salud.');
      },
    });
  }

  private resolverUnidad(cluesimb: string | null): void {
    this.errorUnidad.set('');
    if (!cluesimb) {
      this.contexto.set(null);
      return;
    }

    const unidad = this.unidadesService.findByCluesimb(cluesimb) as Unidadv2 | undefined;
    if (!unidad || !this.esPrimerNivel(unidad)) {
      this.contexto.set(null);
      this.errorUnidad.set('La CLUES indicada no corresponde a un Centro de Salud de Primer Nivel.');
      return;
    }

    const previo = this.leerContextoPrimerNivel();
    const coincidePrevio = previo?.clues.toUpperCase() === unidad.cluesimb.toUpperCase();
    this.contexto.set({
      nombre: unidad.nombre,
      clues: unidad.cluesimb,
      periodo: coincidePrevio ? previo.periodo : '',
      responsable: coincidePrevio ? previo.responsable : '',
    });
    this.restaurarSolicitud(unidad.cluesimb);
    this.terminoUnidad.set('');
    this.unidadesEncontradas.set([]);
  }

  private esPrimerNivel(unidad: Unidadv2): boolean {
    if (typeof unidad.esSegundoNivel === 'boolean') return !unidad.esSegundoNivel;
    return (unidad.nivelAtencion || '').trim().toUpperCase() === 'PRIMER NIVEL';
  }

  private leerContextoPrimerNivel(): SandboxContextoUnidad | null {
    if (this.storageSolicitudService.getModoCapturaSolicitud() !== ModoCapturaSolicitud.PRIMER_NIVEL) return null;
    try {
      const raw = this.storageSolicitudService.getDatosCluesFromLocalStorage();
      if (!raw) return null;
      const datos = JSON.parse(raw) as DatosClues;
      return {
        nombre: datos.nombreHospital || datos.hospital?.nombre || '',
        clues: datos.hospital?.cluesimb || datos.hospital?.cluesssa || '',
        periodo: datos.periodo || '',
        responsable: datos.responsableCaptura || '',
      };
    } catch {
      return null;
    }
  }

  private sanitizarCantidad(valor: number): number {
    return Math.max(1, Math.min(99999, Math.trunc(Number(valor) || 1)));
  }

  private guardarSolicitud(): void {
    const cluesimb = this.contexto()?.clues.trim().toUpperCase();
    if (!cluesimb) return;
    try {
      localStorage.setItem(this.storageSandboxKey, JSON.stringify({
        cluesimb,
        items: this.solicitud(),
      }));
    } catch {
      // La captura sigue funcionando en memoria si el navegador bloquea localStorage.
    }
  }

  private restaurarSolicitud(cluesimb: string): void {
    try {
      const raw = localStorage.getItem(this.storageSandboxKey);
      if (!raw) {
        this.solicitud.set([]);
        return;
      }

      const guardado = JSON.parse(raw) as { cluesimb?: unknown; items?: unknown };
      if (String(guardado.cluesimb ?? '').trim().toUpperCase() !== cluesimb.trim().toUpperCase()) {
        this.eliminarSolicitudGuardada();
        this.solicitud.set([]);
        return;
      }

      const items = Array.isArray(guardado.items) ? guardado.items : [];
      const restaurados: SandboxSolicitudItem[] = items
        .slice(0, 500)
        .filter(item => item && typeof item === 'object' && String(item.clave ?? '').trim())
        .map(item => ({
          clave: String(item.clave).trim(),
          descripcion: String(item.descripcion ?? 'Descripción no disponible'),
          presentacion: String(item.presentacion ?? ''),
          cantidad: this.sanitizarCantidad(Number(item.cantidad)),
        }));
      this.solicitud.set(restaurados);
    } catch {
      this.eliminarSolicitudGuardada();
      this.solicitud.set([]);
    }
  }

  private eliminarSolicitudGuardada(): void {
    try {
      localStorage.removeItem(this.storageSandboxKey);
    } catch {
      // Sin acción: el estado en memoria ya se limpia.
    }
  }

}
