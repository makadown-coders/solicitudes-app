import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ChevronRight, CircleAlert, LucideAngularModule, Search, ShoppingBasket, X } from 'lucide-angular';
import { Subject, catchError, debounceTime, distinctUntilChanged, firstValueFrom, map, of, switchMap, tap } from 'rxjs';
import { ArticulosService } from '../../services/articulos.service';
import { UnidadesService } from '../../services/unidades.service';
import {
  EnviarNecesidadesPrimerNivelPayload,
  EnviarNecesidadesPrimerNivelResponse,
  NecesidadesPrimerNivelService,
} from '../../services/necesidades-primer-nivel.service';
import {
  ApsEstructuraEje,
  ApsMedicamentoDetalle,
  ApsMedicamentoResumen,
  NecesidadesPrimerNivelApsService,
} from '../../services/necesidades-primer-nivel-aps.service';
import {
  NecesidadesPrimerNivelProgramasPreventivosService,
  ProgramaPreventivoDetalle,
  ProgramaPreventivoResumen,
} from '../../services/necesidades-primer-nivel-programas-preventivos.service';
import { StorageSolicitudService } from '../../services/storage-solicitud.service';
import { ModoCapturaSolicitud } from '../../shared/modo-captura-solicitud';
import { DatosClues } from '../../models/datos-clues';
import { Unidadv2 } from '../../models/articulo-solicitud';
import { ResultadosInsumosNecesidadesComponent } from './components/resultados-insumos/resultados-insumos.component';
import { ResumenNecesidadesComponent } from './components/solicitud-resumen/solicitud-resumen.component';
import { NecesidadArticulo, NecesidadesContextoUnidad, NecesidadItem } from './necesidades-unidad.models';
import { environment } from '../../../environments/environment';

type EstadoBusqueda = 'inicial' | 'escribiendo' | 'cargando' | 'resultados' | 'vacio' | 'error';
type ModoBusqueda = 'aps' | 'programa' | 'clave';

@Component({
  selector: 'app-necesidades-unidad',
  standalone: true,
  imports: [
    CommonModule,
    LucideAngularModule,
    ResultadosInsumosNecesidadesComponent,
    ResumenNecesidadesComponent,
  ],
  templateUrl: './necesidades-unidad.component.html',
  styleUrl: './necesidades-unidad.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NecesidadesUnidadComponent {
  private readonly storageNecesidadesKey = 'necesidades_unidad_v1';
  private readonly storageAnteriorKey = 'solicitud_unidad_sandbox_v1';
  private readonly articulosService = inject(ArticulosService);
  private readonly unidadesService = inject(UnidadesService);
  private readonly necesidadesService = inject(NecesidadesPrimerNivelService);
  private readonly apsService = inject(NecesidadesPrimerNivelApsService);
  private readonly programasPreventivosService = inject(NecesidadesPrimerNivelProgramasPreventivosService);
  private readonly storageSolicitudService = inject(StorageSolicitudService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly busqueda$ = new Subject<string>();
  private readonly busquedaAps$ = new Subject<string>();
  private feedbackTimer?: ReturnType<typeof setTimeout>;

  readonly SearchIcon = Search;
  readonly BasketIcon = ShoppingBasket;
  readonly NextIcon = ChevronRight;
  readonly CloseIcon = X;
  readonly AlertIcon = CircleAlert;

  readonly contexto = signal<NecesidadesContextoUnidad | null>(null);
  readonly cargandoUnidad = signal(true);
  readonly errorUnidad = signal('');
  readonly terminoUnidad = signal('');
  readonly unidadesEncontradas = signal<Unidadv2[]>([]);
  readonly terminoBusqueda = signal('');
  readonly modoBusqueda = signal<ModoBusqueda>('aps');
  readonly estadoBusqueda = signal<EstadoBusqueda>('inicial');
  readonly resultadosBusqueda = signal<NecesidadArticulo[]>([]);
  readonly estructuraAps = signal<ApsEstructuraEje[]>([]);
  readonly cargandoEstructuraAps = signal(true);
  readonly errorEstructuraAps = signal('');
  readonly ejeApsSeleccionado = signal('');
  readonly grupoApsSeleccionado = signal<number | null>(null);
  readonly resultadosAps = signal<ApsMedicamentoResumen[]>([]);
  readonly totalResultadosAps = signal(0);
  readonly detalleAps = signal<ApsMedicamentoDetalle | null>(null);
  readonly modalDetalleApsAbierto = signal(false);
  readonly cargandoDetalleAps = signal(false);
  readonly errorDetalleAps = signal('');
  readonly cantidadAps = signal(1);
  readonly claveVarianteAps = signal('');
  readonly resolviendoAps = signal(false);
  readonly programasPreventivos = signal<ProgramaPreventivoResumen[]>([]);
  readonly cargandoProgramasPreventivos = signal(true);
  readonly errorProgramasPreventivos = signal('');
  readonly programaPreventivoDetalle = signal<ProgramaPreventivoDetalle | null>(null);
  readonly cargandoProgramaPreventivo = signal(false);
  readonly cantidadesProgramaPreventivo = signal<Record<string, number>>({});
  readonly insumosProgramaExpandidos = signal<Set<string>>(new Set());
  readonly resolviendoProgramaPreventivo = signal(false);
  readonly errorProgramaPreventivo = signal('');
  readonly limiteBusqueda = signal(20);
  readonly solicitud = signal<NecesidadItem[]>([]);
  readonly claveAgregada = signal('');
  readonly solicitudMovilAbierta = signal(false);
  readonly revisionAbierta = signal(false);
  readonly enviandoLista = signal(false);
  readonly errorEnvio = signal('');
  readonly resultadoEnvio = signal<EnviarNecesidadesPrimerNivelResponse | null>(null);
  readonly envioLocal = signal(false);

  readonly resultadosVisibles = computed(() => this.resultadosBusqueda().slice(0, this.limiteBusqueda()));
  readonly totalPiezasSolicitud = computed(() => this.solicitud().reduce((total, item) => total + item.cantidad, 0));
  readonly totalInsumosProgramaCapturados = computed(() =>
    Object.values(this.cantidadesProgramaPreventivo()).filter(cantidad => cantidad > 0).length
  );

  constructor() {
    this.configurarBusqueda();
    this.configurarBusquedaAps();
    this.cargarEstructuraAps();
    this.cargarProgramasPreventivos();
    this.cargarCatalogoUnidades();
  }

  cambiarModoBusqueda(modo: ModoBusqueda): void {
    if (this.modoBusqueda() === modo) return;
    this.modoBusqueda.set(modo);
    this.terminoBusqueda.set('');
    this.estadoBusqueda.set('inicial');
    this.resultadosBusqueda.set([]);
    this.resultadosAps.set([]);
    this.totalResultadosAps.set(0);
    this.ejeApsSeleccionado.set('');
    this.grupoApsSeleccionado.set(null);
    this.programaPreventivoDetalle.set(null);
    this.cantidadesProgramaPreventivo.set({});
    this.insumosProgramaExpandidos.set(new Set());
    this.errorProgramaPreventivo.set('');
  }

  seleccionarProgramaPreventivo(programa: ProgramaPreventivoResumen): void {
    this.cargandoProgramaPreventivo.set(true);
    this.errorProgramaPreventivo.set('');
    this.cantidadesProgramaPreventivo.set({});
    this.insumosProgramaExpandidos.set(new Set());
    this.programasPreventivosService.obtenerDetalle(programa.codigo)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: detalle => {
          this.programaPreventivoDetalle.set(detalle);
          this.cargandoProgramaPreventivo.set(false);
        },
        error: error => {
          this.errorProgramaPreventivo.set(
            error?.error?.error || 'No pudimos cargar los insumos de este programa.'
          );
          this.cargandoProgramaPreventivo.set(false);
        },
      });
  }

  volverAProgramasPreventivos(): void {
    if (this.resolviendoProgramaPreventivo()) return;
    this.programaPreventivoDetalle.set(null);
    this.cantidadesProgramaPreventivo.set({});
    this.insumosProgramaExpandidos.set(new Set());
    this.errorProgramaPreventivo.set('');
  }

  cantidadProgramaPreventivo(clave: string): number {
    return this.cantidadesProgramaPreventivo()[clave] ?? 0;
  }

  descripcionProgramaExpandida(clave: string): boolean {
    return this.insumosProgramaExpandidos().has(clave);
  }

  alternarDescripcionPrograma(clave: string): void {
    this.insumosProgramaExpandidos.update(actual => {
      const siguiente = new Set(actual);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });
  }

  descripcionProgramaEsLarga(descripcion: string | null): boolean {
    return String(descripcion ?? '').trim().length > 180;
  }

  cambiarCantidadProgramaPreventivo(clave: string, valor: unknown): void {
    const cantidad = Math.max(0, Math.min(99999, Math.trunc(Number(valor) || 0)));
    this.cantidadesProgramaPreventivo.update(actual => ({ ...actual, [clave]: cantidad }));
  }

  async agregarProgramaPreventivo(): Promise<void> {
    const programa = this.programaPreventivoDetalle();
    if (!programa || !this.totalInsumosProgramaCapturados() || this.resolviendoProgramaPreventivo()) return;

    const insumos = programa.insumos.map(insumo => ({
      clave: insumo.clave,
      cantidad: this.cantidadProgramaPreventivo(insumo.clave),
    }));
    this.resolviendoProgramaPreventivo.set(true);
    this.errorProgramaPreventivo.set('');
    try {
      const respuesta = await firstValueFrom(this.programasPreventivosService.resolver({
        programa: programa.codigo,
        insumos,
      }));
      for (const articulo of respuesta.articulos) {
        const insumo = programa.insumos.find(item => item.clave === articulo.clave);
        this.agregar({
          articulo: {
            clave: articulo.clave,
            descripcion: insumo?.descripcion || 'Insumo de programa preventivo',
            presentacion: insumo?.presentacion || '',
            codigoPrograma: programa.codigo,
            origen: 'PROGRAMA',
          },
          cantidad: articulo.cantidad,
        });
      }
      this.programaPreventivoDetalle.set(null);
      this.cantidadesProgramaPreventivo.set({});
      this.insumosProgramaExpandidos.set(new Set());
      this.solicitudMovilAbierta.set(true);
    } catch (error: any) {
      this.errorProgramaPreventivo.set(
        error?.error?.error || 'No pudimos agregar los insumos del programa. Intenta nuevamente.'
      );
    } finally {
      this.resolviendoProgramaPreventivo.set(false);
    }
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
    void this.router.navigate(['/necesidades-unidad', cluesimb]);
  }

  cambiarUnidad(): void {
    if (this.solicitud().length && !window.confirm('Al cambiar de unidad se vaciará la lista actual. ¿Deseas continuar?')) return;
    this.eliminarSolicitudGuardada();
    this.solicitud.set([]);
    this.contexto.set(null);
    this.terminoUnidad.set('');
    this.unidadesEncontradas.set([]);
    void this.router.navigate(['/necesidades-unidad']);
  }

  buscar(termino: string): void {
    this.terminoBusqueda.set(termino);
    this.limiteBusqueda.set(20);
    const limpio = termino.trim();
    if (this.modoBusqueda() === 'aps') this.busquedaAps$.next(limpio);
    else this.busqueda$.next(limpio);
    if (limpio.length < 2) {
      this.resultadosBusqueda.set([]);
      this.estadoBusqueda.set(limpio ? 'escribiendo' : 'inicial');
      return;
    }
    this.estadoBusqueda.set('escribiendo');
  }

  reintentarBusqueda(): void {
    const termino = this.terminoBusqueda().trim();
    if (termino.length < 2) return;
    if (this.modoBusqueda() === 'aps') this.busquedaAps$.next(termino);
    else this.busqueda$.next(termino);
  }

  seleccionarEjeAps(codigo: string): void {
    this.ejeApsSeleccionado.set(this.ejeApsSeleccionado() === codigo ? '' : codigo);
    this.grupoApsSeleccionado.set(null);
    this.resultadosAps.set([]);
    this.totalResultadosAps.set(0);
    this.estadoBusqueda.set('inicial');
  }

  seleccionarGrupoAps(numero: number): void {
    this.grupoApsSeleccionado.set(numero);
    this.terminoBusqueda.set('');
    this.estadoBusqueda.set('cargando');
    this.apsService.buscar({ grupo: numero, eje: this.ejeApsSeleccionado(), pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: respuesta => {
          this.resultadosAps.set(respuesta.items);
          this.totalResultadosAps.set(respuesta.total);
          this.estadoBusqueda.set(respuesta.items.length ? 'resultados' : 'vacio');
        },
        error: () => this.estadoBusqueda.set('error'),
      });
  }

  abrirMedicamentoAps(medicamento: ApsMedicamentoResumen): void {
    this.modalDetalleApsAbierto.set(true);
    this.detalleAps.set(null);
    this.errorDetalleAps.set('');
    this.cantidadAps.set(1);
    this.claveVarianteAps.set('');
    this.cargandoDetalleAps.set(true);
    this.apsService.obtenerMedicamento(medicamento.codigo)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: detalle => {
          this.detalleAps.set(detalle);
          if (detalle.variantes.length === 1) this.claveVarianteAps.set(detalle.variantes[0].clave);
          this.cargandoDetalleAps.set(false);
        },
        error: () => {
          this.errorDetalleAps.set('No pudimos cargar las presentaciones de este medicamento.');
          this.cargandoDetalleAps.set(false);
        },
      });
  }

  cerrarDetalleAps(): void {
    if (this.resolviendoAps()) return;
    this.modalDetalleApsAbierto.set(false);
    this.detalleAps.set(null);
    this.errorDetalleAps.set('');
    this.cargandoDetalleAps.set(false);
  }

  cambiarCantidadAps(valor: unknown): void {
    this.cantidadAps.set(this.sanitizarCantidad(Number(valor)));
  }

  async agregarMedicamentoAps(): Promise<void> {
    const detalle = this.detalleAps();
    if (!detalle || this.resolviendoAps()) return;
    if (detalle.requiereSeleccionDeVariante && !this.claveVarianteAps()) {
      this.errorDetalleAps.set('Selecciona una presentación para continuar.');
      return;
    }

    this.resolviendoAps.set(true);
    this.errorDetalleAps.set('');
    try {
      const respuesta = await firstValueFrom(this.apsService.resolver({
        medicamentos: [{
          codigo: detalle.codigo,
          cantidad: this.cantidadAps(),
          ...(this.claveVarianteAps() ? { claveSeleccionada: this.claveVarianteAps() } : {}),
        }],
      }));
      const resuelto = respuesta.resueltos[0];
      if (!respuesta.listoParaEnviar || !resuelto) {
        this.errorDetalleAps.set('Selecciona una presentación para continuar.');
        return;
      }
      const variante = detalle.variantes.find(item => item.clave === resuelto.clave);
      this.agregar({
        articulo: {
          clave: resuelto.clave,
          descripcion: detalle.etiqueta,
          presentacion: this.descripcionVariante(variante?.descripcion, variante?.nombre),
          codigoMedicamento: detalle.codigo,
          origen: 'APS',
        },
        cantidad: resuelto.cantidad,
      });
      this.modalDetalleApsAbierto.set(false);
      this.detalleAps.set(null);
    } catch (error: any) {
      this.errorDetalleAps.set(error?.error?.error || 'No pudimos agregar este medicamento. Intenta nuevamente.');
    } finally {
      this.resolviendoAps.set(false);
    }
  }

  mostrarMasResultados(): void {
    this.limiteBusqueda.update(valor => valor + 20);
  }

  agregar(evento: { articulo: NecesidadArticulo; cantidad: number }): void {
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
    if (this.solicitud().length && window.confirm('¿Quieres quitar todos los insumos de esta lista?')) {
      this.solicitud.set([]);
      this.eliminarSolicitudGuardada();
      this.solicitudMovilAbierta.set(false);
    }
  }

  abrirRevision(): void {
    if (!this.solicitud().length) return;
    this.solicitudMovilAbierta.set(false);
    this.revisionAbierta.set(true);
    this.errorEnvio.set('');
    this.resultadoEnvio.set(null);
    this.envioLocal.set(false);
  }

  async enviarParaRevision(): Promise<void> {
    const contexto = this.contexto();
    if (!contexto || !this.solicitud().length || this.enviandoLista()) return;

    this.enviandoLista.set(true);
    this.errorEnvio.set('');
    try {
      const payload: EnviarNecesidadesPrimerNivelPayload = {
        cluesimb: contexto.clues,
        responsable: contexto.responsable,
        periodo: contexto.periodo,
        articulos: this.solicitud().map(item => ({
          clave: item.clave,
          cantidad: item.cantidad,
          origenCaptura: item.origen === 'PROGRAMA' ? 'PROGRAMA_PREVENTIVO' : (item.origen ?? 'CLAVE'),
          referenciaCaptura: item.origen === 'APS'
            ? item.codigoMedicamento
            : item.origen === 'PROGRAMA'
              ? item.codigoPrograma
              : null,
        })),
      };

      if (!environment.production) {
        const respuesta = await firstValueFrom(this.necesidadesService.generarVistaPreviaExcel(payload));
        const resultadoCodificado = respuesta.headers.get('X-Preview-Result');
        if (!resultadoCodificado) throw new Error('El backend no devolvió los datos de la vista previa');
        const bytesResultado = Uint8Array.from(atob(resultadoCodificado), caracter => caracter.charCodeAt(0));
        const resultado = JSON.parse(new TextDecoder().decode(bytesResultado)) as Omit<EnviarNecesidadesPrimerNivelResponse, 'ok'>;
        this.descargarBlob(
          respuesta.body,
          this.obtenerNombreDescarga(respuesta.headers.get('Content-Disposition'))
        );
        this.envioLocal.set(true);
        this.resultadoEnvio.set({ ok: true, ...resultado });
        // voy a dejar por ahora viva la lista si estoy en local para evitar la fatiga
        // this.eliminarSolicitudGuardada();
        return;
      }

      const resultado = await firstValueFrom(this.necesidadesService.enviar(payload));
      this.resultadoEnvio.set(resultado);
      this.eliminarSolicitudGuardada();
    } catch (error: any) {
      let mensaje = error?.error?.error || error?.message;
      if (error?.error instanceof Blob && error.error.type === 'application/json') {
        try {
          mensaje = JSON.parse(await error.error.text())?.error;
        } catch {
          mensaje = undefined;
        }
      }
      this.errorEnvio.set(
        mensaje || 'No pudimos enviar tu lista. Tus insumos siguen guardados para que puedas reintentar.'
      );
    } finally {
      this.enviandoLista.set(false);
    }
  }

  finalizarEnvio(): void {
    if (!this.envioLocal()) {
      this.solicitud.set([]);
    }
    this.revisionAbierta.set(false);
    this.resultadoEnvio.set(null);
    this.errorEnvio.set('');
    this.envioLocal.set(false);
  }

  private descargarBlob(blob: Blob | null, nombreArchivo: string): void {
    if (!blob) throw new Error('El backend devolvió un archivo vacío');
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombreArchivo;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  private obtenerNombreDescarga(contentDisposition: string | null): string {
    const coincidencia = contentDisposition?.match(/filename="?([^";]+)"?/i);
    return coincidencia?.[1] || `Necesidades-vista-previa-${new Date().toISOString().slice(0, 10)}.xlsx`;
  }

  descripcionVisible(descripcion: string): string {
    const texto = (descripcion || 'Descripción no disponible').trim();
    return texto.length <= 100 ? texto : `${texto.slice(0, 99).trimEnd()}…`;
  }

  descripcionVariante(descripcion?: string | null, nombre?: string | null): string {
    const texto = String(descripcion || nombre || 'Presentación principal').replace(/\s+/g, ' ').trim();
    return texto.length <= 180 ? texto : `${texto.slice(0, 179).trimEnd()}…`;
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
        : this.articulosService.buscarArticulosNecesidadesPrimerNivel(termino).pipe(
        map(respuesta => ({
          termino,
          resultados: respuesta.resultados.map(item => ({
            clave: item.clave,
            descripcion: item.descripcion || 'Descripción no disponible',
            presentacion: item.presentacion || item.unidadMedida || '',
            origen: 'CLAVE' as const,
          })),
        })),
        catchError(() => {
          if (this.terminoBusqueda().trim() === termino) this.estadoBusqueda.set('error');
          return of(null);
        })
      )),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(respuesta => {
      if (respuesta === null || this.modoBusqueda() !== 'clave' || this.terminoBusqueda().trim() !== respuesta.termino) return;
      this.resultadosBusqueda.set(respuesta.resultados);
      this.estadoBusqueda.set(respuesta.resultados.length ? 'resultados' : 'vacio');
    });
  }

  private configurarBusquedaAps(): void {
    this.busquedaAps$.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      tap(termino => {
        if (termino.length >= 2) this.estadoBusqueda.set('cargando');
      }),
      switchMap(termino => termino.length < 2
        ? of(null)
        : this.apsService.buscar({ q: termino, pageSize: 100 }).pipe(
          map(respuesta => ({ termino, respuesta })),
          catchError(() => {
            if (this.terminoBusqueda().trim() === termino) this.estadoBusqueda.set('error');
            return of(null);
          })
        )),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(resultado => {
      if (resultado === null || this.modoBusqueda() !== 'aps' || this.terminoBusqueda().trim() !== resultado.termino) return;
      this.ejeApsSeleccionado.set('');
      this.grupoApsSeleccionado.set(null);
      this.resultadosAps.set(resultado.respuesta.items);
      this.totalResultadosAps.set(resultado.respuesta.total);
      this.estadoBusqueda.set(resultado.respuesta.items.length ? 'resultados' : 'vacio');
    });
  }

  private cargarEstructuraAps(): void {
    this.cargandoEstructuraAps.set(true);
    this.errorEstructuraAps.set('');
    this.apsService.obtenerEstructura().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: estructura => {
        this.estructuraAps.set(estructura);
        this.cargandoEstructuraAps.set(false);
      },
      error: () => {
        this.errorEstructuraAps.set('No pudimos cargar las categorías APS. Puedes buscar por nombre.');
        this.cargandoEstructuraAps.set(false);
      },
    });
  }

  private cargarProgramasPreventivos(): void {
    this.cargandoProgramasPreventivos.set(true);
    this.errorProgramasPreventivos.set('');
    this.programasPreventivosService.listar().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: respuesta => {
        this.programasPreventivos.set(respuesta.items);
        this.cargandoProgramasPreventivos.set(false);
      },
      error: () => {
        this.errorProgramasPreventivos.set('No pudimos cargar los programas preventivos.');
        this.cargandoProgramasPreventivos.set(false);
      },
    });
  }

  private cargarCatalogoUnidades(): void {
    this.cargandoUnidad.set(true);
    this.unidadesService.load({ skipLoader: true }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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

  private leerContextoPrimerNivel(): NecesidadesContextoUnidad | null {
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
      localStorage.setItem(this.storageNecesidadesKey, JSON.stringify({
        cluesimb,
        items: this.solicitud(),
      }));
      localStorage.removeItem(this.storageAnteriorKey);
    } catch {
      // La captura sigue funcionando en memoria si el navegador bloquea localStorage.
    }
  }

  private restaurarSolicitud(cluesimb: string): void {
    try {
      const raw = localStorage.getItem(this.storageNecesidadesKey)
        ?? localStorage.getItem(this.storageAnteriorKey);
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
      const restaurados: NecesidadItem[] = items
        .slice(0, 500)
        .filter(item => item && typeof item === 'object' && String(item.clave ?? '').trim())
        .map(item => ({
          clave: String(item.clave).trim(),
          descripcion: String(item.descripcion ?? 'Descripción no disponible'),
          presentacion: String(item.presentacion ?? ''),
          cantidad: this.sanitizarCantidad(Number(item.cantidad)),
          codigoMedicamento: item.codigoMedicamento ? String(item.codigoMedicamento) : undefined,
          codigoPrograma: item.codigoPrograma ? String(item.codigoPrograma) : undefined,
          origen: item.origen === 'APS' ? 'APS' : item.origen === 'PROGRAMA' ? 'PROGRAMA' : 'CLAVE',
        }));
      this.solicitud.set(restaurados);
      this.guardarSolicitud();
    } catch {
      this.eliminarSolicitudGuardada();
      this.solicitud.set([]);
    }
  }

  private eliminarSolicitudGuardada(): void {
    try {
      localStorage.removeItem(this.storageNecesidadesKey);
      localStorage.removeItem(this.storageAnteriorKey);
    } catch {
      // Sin acción: el estado en memoria ya se limpia.
    }
  }

}
