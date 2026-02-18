// src/app/features/solicitudes/solicitudes.component.ts
import { ArticuloSolicitud } from '../../models/articulo-solicitud';
import { Component, OnInit, ViewChildren, QueryList, ElementRef, HostListener, ViewChild, inject, ChangeDetectorRef, AfterViewInit, ChangeDetectionStrategy, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { debounceTime, firstValueFrom, map, Subject, takeUntil } from 'rxjs';
import { CommonModule } from '@angular/common';
import { NombrarArchivoModalComponent } from '../../shared/nombrar-archivo-modal/nombrar-archivo-modal.component';
import { ConfirmacionModalComponent } from '../../shared/confirmacion-modal/confirmacion-modal.component';
import { TablaArticulosComponent } from '../tabla-articulos/tabla-articulos.component';
import { ArticulosService } from '../../services/articulos.service';
import { ExcelService } from '../../services/excel.service';
import { DatosClues } from '../../models/datos-clues';
import { Router, RouterModule } from '@angular/router';
import { InventarioService } from '../../services/inventario.service';
import { Inventario, InventarioDisponibles } from '../../models/Inventario';
import { StorageSolicitudService } from '../../services/storage-solicitud.service';
import { ModoCapturaSolicitud } from '../../shared/modo-captura-solicitud';
import { CPMS } from '../../models/CPMS';
import { SurveyService } from '../../services/survey.service';
import { FeatureFlagsService } from '../../services/feature-flags.service';
import { Nivel } from '../../models/feature-flags.model';
import { CpmService } from '../../services/cpm.service';
import { CpmRowLite } from '../../models/CpmExpectedRow';
import { EnrichedProps } from '../../models/EnrichedProps';
import { NgFastToastService } from 'ng-fast-toast';
import { ExistenciasTempService } from '../../services/existencias-temp.service';
import { KitModalComponent } from './kit-modal/kit-modal.component';
import { CpmUnionRow } from '../../models/CpmUnionRow';
import { CpmModalComponent } from './cpm-modal/cpm-modal.component';
import { FactorUnidad } from '../../models';
import { TrazabilidadService } from '../../services/trazabilidad.service';
import { SolicitudesBitacoraService } from '../../services/solicitudes/solicitudes-bitacora.service';
import { HomologosSolicitudService, SugerenciaHomologoItem, MiniBalanceHomologoCand } from '../../services/homologos-solicitud.service';
import { HomologoSugerenciaModalComponent } from './homologo-sugerencia-modal/homologo-sugerencia-modal.component';
import { HomologosTablaComponent } from './homologos-tabla/homologos-tabla.component';
import { HomologoResumenImportacionComponent } from './homologo-resumen-importacion/homologo-resumen-importacion.component';
import { environment } from '../../../environments/environment.development';


@Component({
  selector: 'app-solicitudes',
  standalone: true,
  imports: [CommonModule, FormsModule,
    NombrarArchivoModalComponent,
    ConfirmacionModalComponent,
    TablaArticulosComponent,
    RouterModule,
    KitModalComponent,
    CpmModalComponent,
    HomologoSugerenciaModalComponent,
    HomologosTablaComponent,
    HomologoResumenImportacionComponent
  ],
  templateUrl: './solicitudes.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SolicitudesComponent implements OnInit, AfterViewInit, OnDestroy {
  datosClues = {} as DatosClues;
  mostrarModal = false;
  modalVisible = false;
  modalTitulo = '';
  modalMensaje = '';
  modalConfirmarTexto = '';
  modalCancelarTexto = '';
  modalCallback?: () => void;
  modalSoloInfo = false;
  articulosSolicitados: ArticuloSolicitud[] = [];
  private invIndex = new Map<string, InventarioDisponibles>();
  private cpmIndex = new Map<string, number>();

  claveInput = '';
  descripcionInput = '';
  unidadInput = '';
  cantidadInput!: number;

  modalPedirNombreArchivo = false;
  nombreArchivo = '';
  modoStandalone = false;

  autocompleteResults: any[] = [];
  moreResults = false;
  totalResults = 0;

  selectedIndex = -1;

  private searchSubject = new Subject<string>();
  articulosService = inject(ArticulosService);
  excelService = inject(ExcelService);
  toast = inject(NgFastToastService);
  trazabilidadService = inject(TrazabilidadService);
  bitacoraService = inject(SolicitudesBitacoraService);

  @ViewChildren('resultItem') resultItems!: QueryList<ElementRef>;
  @ViewChild('inputClave') inputClaveRef!: ElementRef<HTMLInputElement>;

  modoEdicionIndex: number | null = null;
  cantidadTemporal: number = 0;

  generarPrecarga: boolean = true;

  //mensajeImportacion: string | null = null;
  // dentro de la clase:
  private survey = inject(SurveyService);

  private cdRef = inject(ChangeDetectorRef);
  private router = inject(Router);
  public storageSolicitudService = inject(StorageSolicitudService);
  private cpmService = inject(CpmService);

  // behaviorSubject para desuscribirme de todos los observables
  private onDestroy$ = new Subject<void>();
  private flags = inject(FeatureFlagsService);
  // cachecito opcional para no pedir siempre
  private surveyFlagCache = new Map<string, boolean>();

  private existTemp = inject(ExistenciasTempService);

  existUnidadIndex = new Map<string, number>();
  get hasUnidadExistencias(): boolean { return this.existUnidadIndex.size > 0; }

  // dentro de la clase SolicitudesComponent
  // ============= Inyección de servicios =============
  private homologosSolicitudService = inject(HomologosSolicitudService);

  // ============= FLUJO 1: Properties para Agregar Manual =============
  homologoModalVisible = false;
  homologoModalData: { sugerencias: MiniBalanceHomologoCand[]; clave: string; cantidad: number; inventarioDisponible: InventarioDisponibles[] } | null = null;
  private listaNegraHomologos = new Set<string>();

  // ============= FLUJO 2: Properties para Importación =============
  importResumenHomologosVisible = false;
  articulosConHomologos: SugerenciaHomologoItem[] = [];

  // ============= FLUJO 3: Properties para Modales CPM/KIT =============
  mostrarOportunidadesEnTabla = false;
  oportunidadesDisponibles: SugerenciaHomologoItem[] = [];

  public tituloUnidad$ = this.storageSolicitudService.nombreUnidad$.pipe(
    map((nombre) => {
      const raw = this.storageSolicitudService.getDatosCluesFromLocalStorage();
      let municipio = '';
      try {
        municipio = (JSON.parse(raw || '{}')?.hospital?.municipio) ?? '';
      } catch { /* noop */ }
      const temp = [...this.articulosSolicitados];
      this.articulosSolicitados = [];
      this.articulosSolicitados = temp;

      const esPrimerNivel =
        this.storageSolicitudService.getModoCapturaSolicitud() === ModoCapturaSolicitud.PRIMER_NIVEL;

      return esPrimerNivel && municipio ? `${nombre} (${municipio})` : nombre;
    })
  );

  constructor() {
  }
  ngOnDestroy(): void {
    // desuscribirme usando un behaviorSubject
    this.onDestroy$.next();
    this.onDestroy$.complete();
  }

  @HostListener('document:keydown.escape', ['$event'])
  onKeydownHandler(event: KeyboardEvent) {
    if (this.modalVisible) {
      this.cerrarModal();
    }
  }

  public inventarioService = inject(InventarioService);
  inventario: Inventario[] = [];
  inventarioDisponible: InventarioDisponibles[] = [];
  cpmsDeCluesActual: CPMS[] = [];

  async ngOnInit() {
    if (this.router.url === '/solicitudv1') {
      this.modoStandalone = true;
    } else {
      this.modoStandalone = false;
      this.cpmService.cpmsForImport(this.cluesimbActual)
        .pipe(takeUntil(this.onDestroy$))
        .subscribe((rows: CpmUnionRow[]) => {
          const clues = this.cluesimbActual;
          this.cpmsDeCluesActual = this.mapCpmRowsToCPMS(rows as any, clues);
          this.cpmIndex.clear();
          for (const r of this.cpmsDeCluesActual) {
            this.cpmIndex.set(this.normClave(r.clave), Number(r.cantidad) || 0);
          }
          this.cdRef.detectChanges();
        });
    }

    const guardados = this.storageSolicitudService.getArticulosSolicitadosFromLocalStorage();
    if (guardados) {
      const articulosGuardados: ArticuloSolicitud[] = JSON.parse(guardados);
      // Normalizar claves
      this.articulosSolicitados = articulosGuardados.map(art => {
        const claveNormalizada = this.inventarioService.normalizarClave(art.clave);
        return {
          ...art,
          clave: claveNormalizada
        };
      });
      this.rebuildExistingClaves();
    }

    // ⬇️ (Robustez) si el usuario llega directo a esta ruta,
    // levanta CPM de la unidad guardada en localStorage.
    const cluesStr = this.storageSolicitudService.getDatosCluesFromLocalStorage();
    if (cluesStr) {
      this.datosClues = JSON.parse(cluesStr) as DatosClues;
      const cluesimb = this.datosClues?.hospital?.cluesimb || '';
      if (cluesimb) {
        // no hace daño si Layout ya lo cargó: usa caché del CpmService
        this.cpmService.ensureForCluesimb(cluesimb).subscribe();
        this.loadExistenciasUnidad(cluesimb);
      }
    }

    this.searchSubject.pipe(debounceTime(1000), takeUntil(this.onDestroy$))
      .subscribe(texto => {
        if (texto.length > 2) {
          this.buscarEnDB(texto);
        } else {
          this.autocompleteResults = [];
          this.selectedIndex = -1;
          this.moreResults = false;
          this.totalResults = 0;
        }
      });

    // TODO: Comentar esto si no se desea mostrar info de inventario
    this.inventarioService.inventario$
      .pipe(takeUntil(this.onDestroy$))
      .subscribe({
        next: (data) => {
          this.inventario = [...data];
          this.calcularInventarioDisponible();
          this.cdRef.detectChanges();
        },
        error: (error) => {
          console.error('Error al obtener el inventario:', error);
        }
      });
  }

  // ⬇️ Adaptador de filas del endpoint a tu tipo CPMS (lo que use tu ExcelService)
  // Asumo CPMS = { clave: string; cpm: number }.
  // Si tu interfaz CPMS tiene más campos, ajústalos aquí.
  private mapCpmRowsToCPMS(rows: CpmRowLite[], cluesimbFallback?: string): CPMS[] {
    // Consolidamos por clave (si una clave aparece varias veces por distintos kits, tomamos el mayor CPM)
    const byClave = new Map<string, CPMS>();

    for (const r of rows) {
      const clave = (r.clave_cnis || '').toUpperCase();
      if (!clave) continue;

      const cpmVal = Number(r.cpm ?? 0);
      if (cpmVal <= 0) continue; // solo nos interesan CPMS > 0

      const cluesimb = (r.cluesimb || cluesimbFallback || '').toUpperCase();
      const prev = byClave.get(clave);

      if (!prev || cpmVal > prev.cantidad) {
        byClave.set(clave, {
          clave,
          cluesimb,
          cantidad: cpmVal,   // 👈 aquí ‘cantidad’ = CPM
        });
      }
    }

    return Array.from(byClave.values());
  }

  calcularInventarioDisponible() {
    this.inventarioDisponible = [];
    this.invIndex.clear(); // ⬅️ importante

    const arregloClavesInventario = this.inventario.map(item => item.clave);
    arregloClavesInventario.forEach(clave => {
      const existencia: InventarioDisponibles = {
        clave: clave,
        existenciasAZM: 0,
        existenciasAZE: 0,
        existenciasAZT: 0
      };
      const inventarioItem = this.inventario.filter(item => item.clave === clave);
      inventarioItem.forEach(item => {
        if (item.almacen.toLowerCase().includes('almacen estatal zona mexicali') ||
          item.almacen.toLowerCase().includes('almacen zona mexicali')) {
          existencia.existenciasAZM += item.disponible - item.comprometidos;
        } else if (item.almacen.toLowerCase().includes('almacen zona ensenada')) {
          existencia.existenciasAZE += item.disponible - item.comprometidos;
        } else if (item.almacen.toLowerCase().includes('almacen zona tijuana')) {
          existencia.existenciasAZT += item.disponible - item.comprometidos;
        }
      });

      this.inventarioDisponible.push(existencia);
      // ⬇️ llenar índice para consultas rápidas
      this.invIndex.set(clave, existencia);
    });
  }

  ngAfterViewInit(): void {
    this.cdRef.detectChanges();
  }

  onClaveInput() {
    this.searchSubject.next(this.claveInput);
  }

  buscarEnDB(texto: string) {
    this.buscarArticulosConFallback(texto);
  }

  estaCapturandoPrimerNivel() {
    return this.storageSolicitudService.getModoCapturaSolicitud() === ModoCapturaSolicitud.PRIMER_NIVEL;
  }

  buscarArticulosConFallback(texto: string) {
    const timestampFallback = localStorage.getItem('usarFallbackLocal');
    const ahora = Date.now();
    const unDiaMs = 24 * 60 * 60 * 1000;

    if (timestampFallback && ahora - Number(timestampFallback) < unDiaMs) {
      // 🔁 Usa fallback directamente
      this.usarBusquedaLocal(texto);
      return;
    }

    // forzar recarga de this.datosClues de localstorageService porque este componente no lo recarga
    this.datosClues = JSON.parse(this.storageSolicitudService.getDatosCluesFromLocalStorage() || '{}');
    // forzo recarga
    this.loadExistenciasUnidad(this.cluesimbActual);

    // 🔌 Intenta con backend koyeb
    this.articulosService.buscarArticulos(texto).subscribe({
      next: (data) => {
        // this.autocompleteResults = data.resultados.sort((a, b) => a.clave.localeCompare(b.clave)) || [];
        const base = (data.resultados || []).sort((a, b) => a.clave.localeCompare(b.clave));
        this.autocompleteResults = this.enrichWithExistencias(base);

        if (this.hasUnidadExistencias) {
          this.autocompleteResults = this.autocompleteResults.map(it => ({
            ...it,
            _existUnidad: this.existUnidadIndex.get(it.clave) ?? 0
          }));
        }
        this.totalResults = data.total || 0;
        this.moreResults = this.totalResults > 24;
        this.selectedIndex = 0;
        this.cdRef.detectChanges();
        setTimeout(() => this.focusSelectedItem(), 0);
      },
      error: (error) => {
        console.warn('⚠️ Backend no disponible, usando fallback por 24h');
        localStorage.setItem('usarFallbackLocal', ahora.toString());
        this.usarBusquedaLocal(texto);
      }
    });
  }

  usarBusquedaLocal(texto: string) {
    this.articulosService.buscarArticulosv2(texto).subscribe({
      next: (data) => {
        const base = (data.resultados || []).sort((a, b) => a.clave.localeCompare(b.clave));
        this.autocompleteResults = this.enrichWithExistencias(base);
        if (this.hasUnidadExistencias) {
          this.autocompleteResults = this.autocompleteResults.map(it => ({
            ...it,
            _existUnidad: this.existUnidadIndex.get(it.clave) ?? 0
          }));
        }
        this.totalResults = data.total || 0;
        this.moreResults = this.totalResults > 24;
        this.selectedIndex = 0;
        this.cdRef.detectChanges();
        setTimeout(() => this.focusSelectedItem(), 0);
      },
      error: (fallbackError) => {
        console.error('Error en búsqueda local:', fallbackError);
        this.autocompleteResults = [];
        this.totalResults = 0;
      }
    });
  }

  // TODO: Eliminar hasta que sea oficial. Pero si es seguro que esto se eliminaria o modificaria en caso de requerirlo
  /* buscarArticulosPrimerNivel(texto: string) {
     this.articulosService.buscarArticulosPrimerNivel(texto).subscribe({
       next: (data) => {
         const base = data.resultados || [];
         this.autocompleteResults = this.enrichWithExistencias(base);
         this.totalResults = data.total || 0;
         this.moreResults = this.totalResults > 24;
         this.selectedIndex = 0;
         this.cdRef.detectChanges();
         setTimeout(() => this.focusSelectedItem(), 0);
       },
       error: (fallbackError) => {
         console.error('Error en búsqueda local:', fallbackError);
         this.autocompleteResults = [];
         this.totalResults = 0;
       }
     });
   }*/


  async selectArticulo(item: any) {
    this.claveInput = item.clave;
    this.descripcionInput = item.descripcion ?? '';
    this.unidadInput = item.unidadMedida ?? (item.presentacion ?? '');
    this.autocompleteResults = [];
    this.selectedIndex = -1;
  }

  onInputKeyDown(event: KeyboardEvent) {
    if (!this.autocompleteResults.length) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectedIndex = (this.selectedIndex + 1) % this.autocompleteResults.length;
        this.focusSelectedItem();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.selectedIndex =
          (this.selectedIndex - 1 + this.autocompleteResults.length) % this.autocompleteResults.length;
        this.focusSelectedItem();
        break;
      case 'Enter':
        event.preventDefault();
        if (this.autocompleteResults[this.selectedIndex]) {
          this.selectArticulo(this.autocompleteResults[this.selectedIndex]);
        }
        break;
      case 'Escape':
        this.autocompleteResults = [];
        this.selectedIndex = -1;
        break;
    }
  }

  focusSelectedItem() {
    const itemsArray = this.resultItems.toArray();
    if (itemsArray[this.selectedIndex]) {
      itemsArray[this.selectedIndex].nativeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }

  async agregarArticulo() {
    const clave = this.claveInput.trim().toUpperCase();
    try {
      await this.cpmService.ensureAllowedOrThrow(clave);
      // proceder con la captura…
    } catch {
      this.toast.warn({
        title: 'Clave fuera de KIT',
        content: 'La clave no pertenece al KIT de la unidad (flag activa).',
        duration: 5
      });
      return;
    }
    const cpm = this.cpmIndex.get(this.normClave(clave)) ?? 0;

    if (!clave || !this.descripcionInput || !this.unidadInput || this.cantidadInput <= 0) {
      return; // Validación básica
    }

    // Evitar duplicados por clave (case-insensitive)
    const existe = this.articulosSolicitados.some(a => a.clave.toUpperCase() === clave);
    if (existe) {
      this.abrirModalInfo(
        'Clave repetida',
        `Ya capturaste un artículo con la clave "${clave}".`
      );
      return;
    }

    // Validar que si estoy capturando en modo primer nivel solo admita artículos de primer nivel
    // Parte por eliminar hasta que sea oficial
    /*if (this.storageSolicitudService.getModoCapturaSolicitud() === ModoCapturaSolicitud.PRIMER_NIVEL) {
      const esPrimerNivel = this.articulosService.esPrimerNivel(clave);
      if (!esPrimerNivel) {
        this.abrirModalInfo(
          'Clave no permitida',
          `El artículos con la clave "${clave}" no se captura en modo primer nivel.`);
        return;
      }
    }*/


    this.articulosSolicitados.push({
      clave,
      descripcion: this.descripcionInput.trim(),
      unidadMedida: this.unidadInput.trim(),
      cantidad: this.cantidadInput,
      cpm,
      presentacion: '',
      observaciones: ''
    });

    // ✨ FLUJO 1: NUEVO - Detectar homologos para este artículo
    this.detectarYMostrarHomologoParaArticulo(clave, this.cantidadInput);

    this.storageSolicitudService
      .setArticulosSolicitadosInLocalStorage(
        JSON.stringify(this.articulosSolicitados));

    // Limpiar inputs
    this.claveInput = '';
    this.descripcionInput = '';
    this.unidadInput = '';
    this.cantidadInput = 0;
    this.selectedIndex = -1;

    this.cdRef.detectChanges();

    setTimeout(() => {
      this.inputClaveRef?.nativeElement.focus();
    }, 0);
  }

  // ============================================
  // FLUJO 1: Métodos para Agregar Manual
  // ============================================

  /**
   * Detecta homologos y muestra el modal si hay sugerencias
   */
  private async detectarYMostrarHomologoParaArticulo(clave: string, cantidad: number) {
    // No sugerir si está en lista negra
    if (this.esClaveEnListaNegra(clave)) return;

    try {
      const sugerencias = await this.homologosSolicitudService.obtenerMejoresHomologos(
        clave,
        cantidad,
        this.inventarioDisponible,
        this.cluesimbActual
      );

      if (sugerencias?.length) {
        this.homologoModalData = { sugerencias, clave, cantidad, inventarioDisponible: this.inventarioDisponible };
        this.homologoModalVisible = true;
        this.cdRef.detectChanges();
      }
    } catch (error) {
      console.error('Error detectando homologos:', error);
      // Fallar silenciosamente - la captura continúa normalmente
    }
  }

  /**
   * Maneja el reemplazo por homólogo sugerido
   */
  async onReemplazarHomologo(candidato: MiniBalanceHomologoCand) {
    const originalClave = this.homologoModalData?.clave;
    if (!originalClave) return;

    // Encontrar y reemplazar el artículo más reciente agregado
    const index = this.articulosSolicitados.findIndex(a => a.clave === originalClave);
    if (index >= 0) {
      const originalCantidad = this.articulosSolicitados[index].cantidad;
      const nuevaCantidad = Math.round(originalCantidad * Number(candidato.factor));

      // Reemplazar
      this.articulosSolicitados[index].clave = candidato.sustituto;
      this.articulosSolicitados[index].cantidad = nuevaCantidad;

      // Buscar descripción del nuevo artículo
      try {
        const resp = await firstValueFrom(this.articulosService
          .buscarArticulos(candidato.sustituto));
        console.log('resp de modal de homologos', resp);
        if (resp?.resultados && resp.resultados.length > 0) {
          const art = resp.resultados[0];
          this.articulosSolicitados[index].descripcion = art.descripcion ?? '';
          this.articulosSolicitados[index].unidadMedida = art.unidadMedida ??
            (art.presentacion ?? '');
          this.articulosSolicitados[index].observaciones = 
            `Reemplaza ${originalClave} por ser homólogo.`;
        }
      } catch {
        // Silencio si falla
      }

      this.storageSolicitudService.setArticulosSolicitadosInLocalStorage(
        JSON.stringify(this.articulosSolicitados)
      );

      this.toast.success({
        title: 'Artículo reemplazado',
        content: `${originalClave} → ${candidato.sustituto} (${nuevaCantidad} un.)`,
        duration: 4
      });
    }

    this.homologoModalVisible = false;
    this.cdRef.detectChanges();
  }

  /**
   * Mantiene el artículo original
   */
  onMantenerOriginal() {
    this.homologoModalVisible = false;
    this.cdRef.detectChanges();
  }

  /**
   * Agrega una clave a la lista negra (no sugerir más)
   */
  agregarAListaNegra(clave: string) {
    this.listaNegraHomologos.add(clave.toUpperCase());
    this.toast.warn({
      title: 'Anotado',
      content: `No se sugerirán alternativas para ${clave}`,
      duration: 3
    });
  }

  /**
   * Verifica si una clave está en lista negra
   */
  private esClaveEnListaNegra(clave: string): boolean {
    return this.listaNegraHomologos.has(clave.toUpperCase());
  }

  // ============================================
  // FLUJO 2: Métodos para Importación
  // ============================================

  /**
   * Detecta homologos para artículos importados y muestra resumen
   */
  private async detectarYMostrarHomologosImport() {
    try {
      const sugerencias = await this.homologosSolicitudService.detectarHomologosParaArticulos(
        this.articulosSolicitados,
        this.inventarioDisponible,
        this.cluesimbActual
      );

      if (sugerencias?.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Espera a que se cierre el primer modal
        this.articulosConHomologos = sugerencias;
        this.importResumenHomologosVisible = true;
        this.cdRef.detectChanges();
      }
    } catch (error) {
      console.error('Error detectando homologos en importación:', error);
      // Fallar silenciosamente
    }
  }

  /**
   * Maneja el reemplazo múltiple desde el resumen de importación
   */
  async onReemplazarMultiplesDesdeResumen(sugerencias: SugerenciaHomologoItem[]) {
    for (const sug of sugerencias) {
      const candidates = sug.mejores;
      if (!candidates?.length) continue;

      const topCandidate = candidates[0];
      const index = this.articulosSolicitados.findIndex(a => a.clave === sug.originalClave);

      if (index >= 0) {
        const nuevaCantidad = Math.round(sug.originalCantidad * Number(topCandidate.factor));

        this.articulosSolicitados[index].clave = topCandidate.sustituto;
        this.articulosSolicitados[index].cantidad = nuevaCantidad;

        // Buscar descripción
        try {
          const resp = await this.articulosService.buscarArticulos(topCandidate.sustituto).toPromise();
          if (resp?.resultados && resp.resultados.length > 0) {
            const art = resp.resultados[0];
            this.articulosSolicitados[index].descripcion = art.descripcion ?? '';
            this.articulosSolicitados[index].unidadMedida = art.unidadMedida ?? '';
          }
        } catch {
          // Silencio
        }
      }
    }

    this.storageSolicitudService.setArticulosSolicitadosInLocalStorage(
      JSON.stringify(this.articulosSolicitados)
    );

    this.importResumenHomologosVisible = false;
    this.toast.success({
      title: 'Homologos aplicados',
      content: `Se reemplazaron ${sugerencias.length} artículos`,
      duration: 4
    });
    this.cdRef.detectChanges();
  }

  abrirModal() {
    this.mostrarModal = true;
  }

  confirmarLimpieza() {
    this.articulosSolicitados = [];
    this.storageSolicitudService.limpiarArticulosSolicitadosInLocalStorage();
    this.existingClavesList = [];
    this.cerrarModal();
  }

  abrirModalInfo(titulo: string, mensaje: string, confirmarTexto = 'Aceptar') {
    this.modalTitulo = titulo;
    this.modalMensaje = mensaje;
    this.modalConfirmarTexto = confirmarTexto;
    this.modalSoloInfo = true;
    this.modalVisible = true;
    this.cdRef.detectChanges();
  }

  abrirModalConfirmacion(
    titulo: string,
    mensaje: string,
    confirmarTexto: string,
    cancelarTexto: string,
    callback: () => void
  ) {
    this.modalTitulo = titulo;
    this.modalMensaje = mensaje;
    this.modalConfirmarTexto = confirmarTexto;
    this.modalCancelarTexto = cancelarTexto;
    this.modalCallback = callback;
    this.modalSoloInfo = false;
    this.modalVisible = true;
  }

  cerrarModal() {
    this.modalVisible = false;
    this.modalCallback = undefined;
  }

  modalAceptar() {
    if (this.modalCallback) {
      this.modalCallback();
    }
    this.cerrarModal();
    void this.mostrarSurveySiEsNecesario();
  }

  private async mostrarSurveySiEsNecesario() {
    // si se limpio captura de articulos no mostrar survey
    if (this.articulosSolicitados.length === 0) return;

    const cluesimb = this.datosClues?.hospital?.cluesimb ?? '';
    if (!cluesimb) return;

    // 👇 aquí se valida el flag efectivo
    const puede = await this.shouldAskSurvey(cluesimb);
    if (!puede) return;

    const APP_VERSION = (globalThis as any).process?.env?.NG_APP_VERSION ?? 'dev';
    this.survey.maybeShow('export_success', { cluesimb, appVersion: APP_VERSION });
  }

  confirmarLimpiezaModal() {
    this.abrirModalConfirmacion(
      '¿Estás seguro?',
      'Esta acción eliminará todos los artículos capturados. ¿Deseas continuar?',
      'Sí, limpiar todo',
      'Cancelar',
      () => this.confirmarLimpieza()
    );
  }

  async exportarExcelConTemplate(nombreArchivo: string) {
    const restrict = await this.isImportRestricted();

    let items = this.articulosSolicitados;
    let fueraDeKit: string[] = [];

    if (restrict) {
      const enKit = items.filter(a => this.cpmService.isClaveInKit(this.normClave(a.clave), this.cluesimbActual));
      fueraDeKit = items.filter(a => !this.cpmService.isClaveInKit(this.normClave(a.clave), this.cluesimbActual)).map(a => a.clave);
      items = enKit;
    }

    // ✅ arma payload desde aquí (tienes datosClues, items y modoStandalone)
    // Asegura tener datosClues fresco:
    if (!this.modoStandalone) {
      const cluesStr = this.storageSolicitudService.getDatosCluesFromLocalStorage();
      if (cluesStr) this.datosClues = JSON.parse(cluesStr) as DatosClues;
    }


    const enProduccion = environment.production;
    const payload = this.bitacoraService.buildPayload(this.datosClues, items, this.modoStandalone);

    // 🚀 best-effort: no bloquea el Excel
    if (payload && enProduccion) void this.bitacoraService.registrar(payload);

    this.excelService.exportarExcelConTemplate(
      'template.xlsx',
      nombreArchivo,
      items, // ya filtrados si aplica la bandera
      this.modoStandalone,
      this.inventarioDisponible,
      this.cpmsDeCluesActual,
      // ⬇️ predicado para saber si la clave está en el KIT
      (clave) => this.cpmService.isClaveInKit(this.normClave(clave), this.cluesimbActual)
    );
    this.abrirModalInfo(
      this.generarPrecarga ? 'Archivos generados' : 'Archivo generado',
      'Por favor cerciórese que la información esté en buen estado y sirva para sus necesidades. Presione "Limpiar captura" para iniciar una nueva.'
    );

    if (restrict && fueraDeKit.length) {
      this.toast.warn({
        title: 'Exportación filtrada',
        content: `Se excluyeron ${fueraDeKit.length} claves fuera de KIT (flag activa).`,
        duration: 5
      });
    }

    if (this.generarPrecarga) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Espera 1 segundo
      let nombreArchivPrecarga = 'Precarga';
      if (!this.modoStandalone) {
        nombreArchivPrecarga += '-' + this.datosClues.hospital?.cluesimb!;
        nombreArchivPrecarga += '-' + this.datosClues.tipoInsumo.split('-');
        nombreArchivPrecarga += '-' + this.datosClues.tipoPedido;
      }
      nombreArchivPrecarga += '_' + new Date().toISOString().slice(0, 7);
      this.excelService.exportarExcelPrecarga(nombreArchivPrecarga, items);
    }
  }

  mostrarModalExportar() {
    this.nombreArchivo = `Solicitud-${new Date().toISOString().slice(0, 7)}`;
    const cluesStr = this.storageSolicitudService.getDatosCluesFromLocalStorage();
    let nombreArchivoCompleto = this.nombreArchivo;
    if (cluesStr && !this.modoStandalone) {
      this.datosClues = JSON.parse(cluesStr) as DatosClues;

      nombreArchivoCompleto = this.datosClues.hospital?.cluesimb!; // this.iniciales(this.datosClues.nombreHospital);
      nombreArchivoCompleto += '-' + this.datosClues.tipoInsumo.split('-');
      nombreArchivoCompleto += '-' + this.datosClues.tipoPedido;
      nombreArchivoCompleto += '_' + this.datosClues.periodo.replace(/\s+/g, '-');
      this.nombreArchivo = nombreArchivoCompleto;
    }
    this.modalPedirNombreArchivo = true;
  }

  todosLosArticulosConCantidadMayorACero(): boolean {
    return this.articulosSolicitados.every(articulo => articulo.cantidad > 0);
  }

  iniciales(original: string): string {
    // 1. Filtrar palabras relevantes (ignorando "de", "y", "el", etc.)
    const palabrasRelevantes = original
      .split(' ')
      .filter(palabra => !['de', 'y', 'el', 'la', 'los'].includes(palabra.toLowerCase()));

    // 2. Obtener iniciales y ponerlas en mayúscula
    const iniciales = palabrasRelevantes
      .map(palabra => palabra.charAt(0).toUpperCase())
      .join('');

    return iniciales;
  }

  confirmarExportacion() {
    this.modalPedirNombreArchivo = false;
    this.exportarExcelConTemplate(this.nombreArchivo);
  }

  eliminarArticulo(index: number) {
    this.articulosSolicitados.splice(index, 1);
    this.storageSolicitudService
      .setArticulosSolicitadosInLocalStorage(
        JSON.stringify(this.articulosSolicitados));
  }

  eliminarArticuloConConfirmacion(index: number) {
    this.abrirModalConfirmacion(
      '¿Eliminar artículo?',
      `¿Deseas eliminar el artículo "${this.articulosSolicitados[index].clave}"?`,
      'Sí, eliminar',
      'Cancelar',
      () => this.eliminarArticulo(index)
    );
  }

  get formularioValido(): boolean {
    return (
      this.claveInput.trim().length > 0 &&
      this.descripcionInput.trim().length > 0 &&
      this.unidadInput.trim().length > 0 &&
      this.cantidadInput > 0 &&
      this.cantidadInput < 99999
    );
  }

  activarEdicion(index: number) {
    this.modoEdicionIndex = index;
    this.cantidadTemporal = this.articulosSolicitados[index].cantidad;
  }

  cambiarCantidad(cantidad: number) {
    this.cantidadTemporal = cantidad;
  }

  cancelarEdicion() {
    this.modoEdicionIndex = null;
    this.cantidadTemporal = 0;
  }

  confirmarEdicion(index: number) {
    this.articulosSolicitados[index].cantidad = this.cantidadTemporal;
    this.modoEdicionIndex = null;
    this.storageSolicitudService
      .setArticulosSolicitadosInLocalStorage(
        JSON.stringify(this.articulosSolicitados));
  }

  esCantidadInvalida(): boolean {
    return this.cantidadTemporal <= 0 || this.cantidadTemporal > 99999;
  }

  cerrarModalArchivo() {
    this.modalPedirNombreArchivo = false;
  }

  buscarArchivo(fileInput: HTMLInputElement) {
    if (this.articulosSolicitados.length > 0) {
      this.abrirModalConfirmacion(
        'Precarga detectada',
        'Esto reemplazará los artículos ya capturados. ¿Deseas continuar?',
        'Sí, reemplazar',
        'Cancelar',
        () => fileInput.click()
      );
    } else {
      fileInput.click();
    }
  }


  async manejarArchivoPrecarga(event: Event) {
    const input = event.target as HTMLInputElement;
    const archivo = (event.target as HTMLInputElement).files?.[0];
    if (!archivo) return;

    let usandoTemplate = false;

    try {
      // limpio lista de articulos capturados 
      this.articulosSolicitados = [];
      this.existingClavesList = [];
      const datosCluesStorage = JSON.parse(this.storageSolicitudService.getDatosCluesFromLocalStorage() || '{}') as DatosClues;
      // a veces se pierde el this.datosClues y se queda en un clues elegido anteriormente
      if (datosCluesStorage && this.datosClues?.hospital?.cluesimb !== datosCluesStorage?.hospital?.cluesimb) {
        // tiene prioridad el localstorage, asi que actualizo el this.datosClues
        this.datosClues = datosCluesStorage;
      }
      // 1) Asegura KIT en memoria (silencioso si falla)
      const cluesimbActual = this.datosClues?.hospital?.cluesimb;

      if (cluesimbActual) {
        try {
          await firstValueFrom(this.cpmService.ensureForCluesimb(cluesimbActual));
          this.loadExistenciasUnidad(cluesimbActual);
        } catch { }
      }

      // 2) Lee archivo
      let datos = await this.excelService.leerArchivoPrecarga(archivo);
      if (!datos || datos.length === 0) {
        this.abrirModalInfo('Archivo vacío', 'El archivo está vacío o no contiene datos válidos.');
        return;
      }

      // 3) Detecta columnas
      let headers = Object.keys(datos[0]).map(h => h.toLowerCase().trim());
      let colClave = headers.find(h => h.includes('clave'));
      let colCantidad = headers.find(h => (h.includes('cantidad') || h.includes('solicitado') || h.includes('total')) &&
        !h.includes('cantidad_propuesta'));

      if (!colClave) {
        if (datos.length < 8) {
          this.abrirModalInfo('Encabezado faltante', 'El archivo no contiene encabezado o formato no es válido.');
          return;
        }
        headers = Object.values(datos[7]).map((h: any) => (h + '').toLowerCase().trim());
        colClave = headers.find(h => h.includes('clave'));
        colCantidad = headers.find(h => (h.includes('cantidad') || h.includes('solicitado') || h.includes('total')) &&
          !h.includes('cantidad_propuesta'));
        if (!colClave) {
          this.abrirModalInfo('Encabezado faltante', 'El archivo no contiene columna con clave CNIS o formato no es válido.');
          return;
        }
        datos = datos.slice(8);
        usandoTemplate = true;
      }

      // 4) Parseo + acumulación de duplicadas
      const nuevos: ArticuloSolicitud[] = [];
      const repetidas: Record<string, number> = {};

      for (const renglon of datos) {
        let fila: any = { ...renglon };
        if (usandoTemplate) fila = Object.values(fila);

        let clave: string = ((!usandoTemplate ? (fila[colClave!] || fila[colClave!.toLocaleUpperCase()]) : fila[2]) ?? '')
          .toString().trim().toUpperCase();
        if (!clave) continue;

        clave = this.inventarioService.normalizarClave(clave);
        let cantidad = colCantidad ? parseInt(!usandoTemplate ? fila[colCantidad!] : fila[5]) || 0 : 0;

        if (cantidad <= 0) {
          cantidad = colCantidad ? parseInt(!usandoTemplate ? fila[colCantidad!.toLocaleUpperCase()] : fila[5]) || 0 : 0;
          if (cantidad <= 0) continue;
        }

        const existente = nuevos.find(a => a.clave === clave);
        if (existente) {
          existente.cantidad += cantidad;
          repetidas[clave] = (repetidas[clave] || 0) + cantidad;
        } else {
          nuevos.push({
            clave, descripcion: '', unidadMedida: '', cantidad, cpm: 0,
            presentacion: '',
            observaciones: ''
          });
        }
      }

      // 5) Filtrar por flag (si está ON, sólo claves del KIT)
      const restrict = await this.isImportRestricted();
      let bloqueadas: string[] = [];

      if (restrict) {
        const permitidas: ArticuloSolicitud[] = [];
        for (const a of nuevos) {
          const ok = this.cpmService.isClaveInKit(this.normClave(a.clave), this.cluesimbActual);
          if (ok) permitidas.push(a); else bloqueadas.push(a.clave);
        }
        this.articulosSolicitados = permitidas;
      } else {
        this.articulosSolicitados = nuevos;
      }
      this.storageSolicitudService.setArticulosSolicitadosInLocalStorage(
        JSON.stringify(this.articulosSolicitados)
      );

      // 6) Completar desc/unidad + poner CPM
      this.autocompletarDatos();

      // 7) Métricas del KIT
      const kitTotal = this.cpmService.getKitCountFor(this.cluesimbActual);
      const clavesNorm = this.articulosSolicitados.map(a => this.normClave(a.clave));
      const enKit = clavesNorm.filter(c => this.cpmService.isClaveInKit(c, this.cluesimbActual)).length;
      const fueraKit = this.articulosSolicitados.length - enKit;

      // 8) Duplicadas (preview bonito)
      const dupKeys = Object.keys(repetidas);
      const dupPreview = dupKeys.length > 0
        ? (() => {
          const top = dupKeys.slice(0, 10).join(', ');
          const extra = dupKeys.length > 10 ? ` y ${dupKeys.length - 10} más…` : '';
          return `${top}${extra}`;
        })()
        : '';

      // 9) ÚNICO modal de resumen
      const lineas: string[] = [];
      lineas.push(`✔ Claves Importadas: ${this.articulosSolicitados.length}`);
      /*lineas.push(`✔ En KIT: ${enKit}/${kitTotal || '¿?'}`);
      if (bloqueadas.length) {
        lineas.push(`⛔ Bloqueadas por bandera: ${bloqueadas.length}`);
      } else {
        lineas.push(`• Fuera de KIT: ${fueraKit}`);
      }*/
      if (dupKeys.length > 0) lineas.push(`ℹ Duplicadas combinadas (${dupKeys.length}): ${dupPreview}`);

      // ✨ FLUJO 2: NUEVO - Detectar homologos para artículos importados
      this.detectarYMostrarHomologosImport();

      this.abrirModalInfo('Importación completada', lineas.join('\n'));

    } catch (error) {
      console.error('Error al leer archivo:', error);
      this.abrirModalInfo('Error al importar', 'Hubo un problema al procesar el archivo.');
    } finally {
      input.value = '';
    }
  }

  autocompletarDatos() {
    this.articulosService.buscarArticulosv2('').subscribe({
      next: (data) => {
        const catalogo = data.resultados;
        for (const art of this.articulosSolicitados) {
          const encontrado = catalogo.find(c => c.clave.toLowerCase() === art.clave.toLowerCase());
          if (encontrado) {
            art.descripcion = encontrado.descripcion;
            art.unidadMedida = encontrado.unidadMedida;
            const cpm = this.cpmIndex.get(this.normClave(art.clave)) ?? 0;
            art.cpm = cpm;
          }
        }

        this.storageSolicitudService
          .setArticulosSolicitadosInLocalStorage(
            JSON.stringify(this.articulosSolicitados));
        this.cdRef.detectChanges();
      },
      error: (err) => {
        console.error('Error en autocompletarDatos():', err);
        this.abrirModalInfo('Error', 'No se pudieron autocompletar los datos de los insumos.');
      }
    });
  }

  private async shouldAskSurvey(cluesimb: string): Promise<boolean> {
    if (!cluesimb) return false;

    const nivel: Nivel = this.estaCapturandoPrimerNivel() ? 'PRIMER_NIVEL' : 'SEGUNDO_NIVEL';
    const cacheKey = `${cluesimb}|${nivel}`;
    if (this.surveyFlagCache.has(cacheKey)) {
      return this.surveyFlagCache.get(cacheKey)!;
    }

    try {
      const flags = await this.flags.getEffective({ cluesimb, nivel });
      const allowed = !!flags['APLICAR_ENCUESTAS'];
      this.surveyFlagCache.set(cacheKey, allowed);
      return allowed;
    } catch (err) {
      console.warn('No se pudo consultar flags; se omite encuesta.', err);
      return false; // fail-closed: sin flags -> no encuesta
    }
  }

  /** Normaliza CNIS para usar como llave en inventario */
  private normClave(clave: string | undefined | null): string {
    return this.inventarioService.normalizarClave((clave ?? '').toString().toUpperCase());
  }

  /** Enriquecer items del autocomplete con existencias AZM/AZE/AZT (si hay inventario) */
  private enrichWithExistencias<T extends Record<string, any>>(items: T[]): Array<T & EnrichedProps> {
    if (!items?.length) return items as Array<T & EnrichedProps>;

    return items.map((it) => {
      const base = it as Record<string, any>;     // ← asegura que es "object" para el spread
      const clave = this.normClave(base['clave']);

      const inv = this.invIndex.get(clave);
      const azm = inv?.existenciasAZM ?? 0;
      const aze = inv?.existenciasAZE ?? 0;
      const azt = inv?.existenciasAZT ?? 0;
      const total = azm + aze + azt;

      const cpm = this.cpmIndex.get(clave) ?? this.cpmService.getCpmForClave(clave, this.cluesimbActual) ?? 0;
      const enKit = this.cpmService.isClaveInKit(clave, this.cluesimbActual);

      return {
        ...base,               // ✅ ya es un object
        _azm: azm,
        _aze: aze,
        _azt: azt,
        _totalExistencias: total,
        _cpm: cpm,
        _enKit: enKit,
      } as T & EnrichedProps;
    });
  }

  private async isImportRestricted(): Promise<boolean> {
    const cluesimb =
      this.datosClues?.hospital?.cluesimb ||
      (JSON.parse(this.storageSolicitudService.getDatosCluesFromLocalStorage() || '{}')?.hospital?.cluesimb ?? '');

    // const nivel: Nivel = this.estaCapturandoPrimerNivel() ? 'PRIMER_NIVEL' : 'SEGUNDO_NIVEL';

    try {
      // const eff = await this.flags.getEffective({ cluesimb, nivel });
      const eff = await this.flags.getEffective({ cluesimb });
      return !!eff['IMPORT_LIMIT_TO_KIT'];
    } catch {
      // si no se pudo consultar el flag, no bloquees (comportamiento actual)
      return false;
    }
  }

  private loadExistenciasUnidad(cluesimb: string) {
    if (!cluesimb) { this.existUnidadIndex.clear(); return; }

    this.existTemp.byUnidad(cluesimb).subscribe(async rows => {
      const idx = new Map<string, number>();
      for (const r of rows) {
        // obteniendo factor de conversion
        const factor = await this.trazabilidadService
          .getFactorConversionPorUnidad(r.clave_cnis, cluesimb);
        if (factor && factor.cantidad_fc > 0 && r.existencia_total > 0) {
          const existenciaConvertida = (r.existencia_total) / factor.cantidad_fc;
          idx.set(r.clave_cnis, Math.floor(existenciaConvertida));
        } else {
          idx.set(r.clave_cnis, r.existencia_total ?? 0);
        }
      }
      this.existUnidadIndex = idx;

      // Enriquecer el autocomplete actual (si ya hay resultados en pantalla)
      this.autocompleteResults = (this.autocompleteResults || []).map(it => ({
        ...it,
        _existUnidad: idx.get(it.clave) ?? 0
      }));
    });
  }

  /*************************************************************************************/
  /*************************************************************************************/
  /*************************************************************************************/
  kitModalVisible = false;
  cpmModalVisible = false;

  /** PARA MODAL DE CLAVES POR CPM */
  abrirCpmModal() {
    // forzar recarga de this.datosClues de localstorageService porque este componente no lo recarga
    this.datosClues = JSON.parse(this.storageSolicitudService.getDatosCluesFromLocalStorage() || '{}');
    this.cpmModalVisible = true;
  }

  /** PARA MODAL DE CLAVES DE KIT */
  abrirKitModal() {
    // forzar recarga de this.datosClues de localstorageService porque este componente no lo recarga
    this.datosClues = JSON.parse(this.storageSolicitudService.getDatosCluesFromLocalStorage() || '{}');
    this.kitModalVisible = true;
  }

  /** Recibe lo que emite el modal (por CPM o por kit) y
   * lo integra (respetando tu flujo actual)
   */
  onKitAdd(items: ArticuloSolicitud[]) {
    if (!items?.length) return;
    const ya = new Set(this.existingClavesList);
    const nuevos = items.filter(i => !ya.has(this.normClave(i.clave)));
    if (!nuevos.length) return;

    this.articulosSolicitados = [...this.articulosSolicitados, ...nuevos];
    this.rebuildExistingClaves();
    this.storageSolicitudService.setArticulosSolicitadosInLocalStorage(
      JSON.stringify(this.articulosSolicitados)
    );

    // ✨ FLUJO 3: NUEVO - Detectar homologos para artículos recién agregados
    this.detectarYMostrarOportunidadesModales(nuevos);

    // this.autocompletarDatos();
  }

  // ============================================
  // FLUJO 3: Métodos para Modales CPM/KIT
  // ============================================

  /**
   * Detecta homologos para artículos agregados desde modales y muestra sección de oportunidades
   */
  private async detectarYMostrarOportunidadesModales(artículos: ArticuloSolicitud[]) {
    try {
      const sugerencias = await this.homologosSolicitudService.detectarHomologosParaArticulos(
        artículos,
        this.inventarioDisponible,
        this.cluesimbActual
      );

      if (sugerencias?.length > 0) {
        this.oportunidadesDisponibles = sugerencias;
        this.mostrarOportunidadesEnTabla = true;

        this.toast.warn({
          title: `${sugerencias.length} oportunidad(es)`,
          content: 'Se detectaron alternativas mejores disponibles',
          duration: 5
        });

        this.cdRef.detectChanges();
      }
    } catch (error) {
      console.error('Error detectando oportunidades en modales:', error);
      // Fallar silenciosamente
    }
  }

  /**
   * Maneja el reemplazo desde la tabla de oportunidades
   */
  async onReemplazarDesdeOportunidades(event: any) {
    const { original, candidato } = event;
    if (!original || !candidato) return;

    const index = this.articulosSolicitados.findIndex(a => a.clave === original.originalClave);
    if (index < 0) return;

    const nuevaCantidad = Math.round(original.originalCantidad * Number(candidato.factor));

    this.articulosSolicitados[index].clave = candidato.sustituto;
    this.articulosSolicitados[index].cantidad = nuevaCantidad;

    // Buscar descripción del nuevo artículo
    try {
      const resp = await this.articulosService.buscarArticulos(candidato.sustituto).toPromise();
      if (resp?.resultados && resp.resultados.length > 0) {
        const art = resp.resultados[0];
        this.articulosSolicitados[index].descripcion = art.descripcion ?? '';
        this.articulosSolicitados[index].unidadMedida = art.unidadMedida ?? '';
      }
    } catch {
      // Silencio
    }

    this.storageSolicitudService.setArticulosSolicitadosInLocalStorage(
      JSON.stringify(this.articulosSolicitados)
    );

    // Remover de oportunidades
    this.oportunidadesDisponibles = this.oportunidadesDisponibles.filter(
      o => o.originalClave !== original.originalClave
    );

    if (this.oportunidadesDisponibles.length === 0) {
      this.mostrarOportunidadesEnTabla = false;
    }

    this.toast.success({
      title: 'Artículo reemplazado',
      content: `${original.originalClave} → ${candidato.sustituto}`,
      duration: 3
    });

    this.cdRef.detectChanges();
  }

  /**
   * Cierra la sección de oportunidades
   */
  cerrarOportunidades() {
    this.mostrarOportunidadesEnTabla = false;
    this.cdRef.detectChanges();
  }

  existingClavesList: string[] = [];
  private rebuildExistingClaves() {
    this.existingClavesList = this.articulosSolicitados.map(a => this.normClave(a.clave));
  }

  get cluesimbActual(): string {
    // si datosClues es null regresa ''
    if (!this.datosClues) return '';
    // si el hospital es null regresa ''
    if (!this.datosClues.hospital) return '';
    // si el cluesimb es null regresa ''
    if (!this.datosClues.hospital.cluesimb) return '';
    return this.datosClues.hospital.cluesimb;
  }
  /*************************************************************************************/
  /*************************************************************************************/
  /*************************************************************************************/

  /**
 * Maneja Enter en los inputs del formulario de captura.
 * Si el formulario es válido, no hay edición activa y no hay autocomplete abierto,
 * dispara agregarArticulo().
 */
  onFormularioEnter(event?: Event) {
    const keyboardEvent = event as KeyboardEvent | undefined;

    keyboardEvent?.preventDefault();
    keyboardEvent?.stopPropagation();

    // No hacer nada si el formulario no está listo
    if (!this.formularioValido) return;

    // No permitir mientras se edita un renglón
    if (this.modoEdicionIndex !== null) return;

    // Si sigue abierto el autocomplete, que primero se seleccione la clave
    if (this.autocompleteResults?.length) return;

    // Disparar alta
    void this.agregarArticulo();
  }

  /**
   * Actualiza la lista de CPMS por unidad desde el componente hijo.
   * @param $event 
   */
  actualizarCPMsPorUnidad($event: CPMS[]) {
    this.cpmsDeCluesActual = $event;
  }
}
