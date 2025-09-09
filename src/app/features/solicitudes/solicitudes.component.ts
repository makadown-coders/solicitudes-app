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
import { CpmUnionRow } from '../../models/CpmUnionRow';
// import { CpmExpectedRow } from '../../models/CpmExpectedRow';


@Component({
  selector: 'app-solicitudes',
  standalone: true,
  imports: [CommonModule, FormsModule,
    NombrarArchivoModalComponent,
    ConfirmacionModalComponent,
    TablaArticulosComponent,
    RouterModule],
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

  // dentro de la clase SolicitudesComponent
  public tituloUnidad$ = this.storageSolicitudService.nombreUnidad$.pipe(
    map((nombre) => {
      const raw = this.storageSolicitudService.getDatosCluesFromLocalStorage();
      let municipio = '';
      try {
        municipio = (JSON.parse(raw || '{}')?.hospital?.municipio) ?? '';
      } catch { /* noop */ }

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
      // ✅ AHORA: escuchar CPM desde CpmService y adaptar a CPMS[]
      this.cpmService.cpmsForImport$ // cpms$
        .pipe(takeUntil(this.onDestroy$))
        .subscribe((rows: CpmRowLite[]) => {        // ⬅️ aquí el tipo flexible
          const clues = this.datosClues?.hospital?.cluesimb || '';
          this.cpmsDeCluesActual = this.mapCpmRowsToCPMS(rows, clues);
          // reconstruir índice CPM para autocomplete
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
      }
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
    /*
    if (this.estaCapturandoPrimerNivel()) {
      this.buscarArticulosPrimerNivel(texto);
      return;
    }
    */

    const timestampFallback = localStorage.getItem('usarFallbackLocal');
    const ahora = Date.now();
    const unDiaMs = 24 * 60 * 60 * 1000;

    if (timestampFallback && ahora - Number(timestampFallback) < unDiaMs) {
      // 🔁 Usa fallback directamente
      this.usarBusquedaLocal(texto);
      return;
    }

    // 🔌 Intenta con backend koyeb
    this.articulosService.buscarArticulos(texto).subscribe({
      next: (data) => {
        // this.autocompleteResults = data.resultados.sort((a, b) => a.clave.localeCompare(b.clave)) || [];
        const base = (data.resultados || []).sort((a, b) => a.clave.localeCompare(b.clave));
        this.autocompleteResults = this.enrichWithExistencias(base);
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
      cpm
    });

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

  abrirModal() {
    this.mostrarModal = true;
  }

  confirmarLimpieza() {
    this.articulosSolicitados = [];
    this.storageSolicitudService.limpiarArticulosSolicitadosInLocalStorage();
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
      const enKit = items.filter(a => this.cpmService.isClaveInKit(this.normClave(a.clave)));
      fueraDeKit = items.filter(a => !this.cpmService.isClaveInKit(this.normClave(a.clave))).map(a => a.clave);
      items = enKit;
    }

    this.excelService.exportarExcelConTemplate(
      'template.xlsx',
      nombreArchivo,
      items, // ya filtrados si aplica la bandera
      this.modoStandalone,
      this.inventarioDisponible,
      this.cpmsDeCluesActual,
      // ⬇️ predicado para saber si la clave está en el KIT
      (clave) => this.cpmService.isClaveInKit(this.normClave(clave))
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
      this.excelService.exportarExcelPrecarga(nombreArchivo, items);
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
      const datosCluesStorage = JSON.parse(this.storageSolicitudService.getDatosCluesFromLocalStorage() || '{}') as DatosClues;
      // a veces se pierde el this.datosClues y se queda en un clues elegido anteriormente
      if (datosCluesStorage && this.datosClues?.hospital?.cluesimb !== datosCluesStorage?.hospital?.cluesimb) {
        // tiene prioridad el localstorage, asi que actualizo el this.datosClues
        this.datosClues = datosCluesStorage;
      }
      // 1) Asegura KIT en memoria (silencioso si falla)
      const cluesimbActual = this.datosClues?.hospital?.cluesimb;

      if (cluesimbActual) {
        try { await firstValueFrom(this.cpmService.ensureForCluesimb(cluesimbActual)); } catch { }
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
      let colCantidad = headers.find(h => h.includes('cantidad') || h.includes('solicitado'));

      if (!colClave) {
        if (datos.length < 8) {
          this.abrirModalInfo('Encabezado faltante', 'El archivo no contiene encabezado o formato no es válido.');
          return;
        }
        headers = Object.values(datos[7]).map((h: any) => (h + '').toLowerCase().trim());
        colClave = headers.find(h => h.includes('clave'));
        colCantidad = headers.find(h => h.includes('cantidad') || h.includes('solicitado'));
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

        let clave: string = ((!usandoTemplate ? fila[colClave!] : fila[2]) ?? '')
          .toString().trim().toUpperCase();
        if (!clave) continue;

        clave = this.inventarioService.normalizarClave(clave);
        const cantidad = colCantidad ? parseInt(!usandoTemplate ? fila[colCantidad!] : fila[5]) || 0 : 0;

        const existente = nuevos.find(a => a.clave === clave);
        if (existente) {
          existente.cantidad += cantidad;
          repetidas[clave] = (repetidas[clave] || 0) + cantidad;
        } else {
          nuevos.push({ clave, descripcion: '', unidadMedida: '', cantidad, cpm: 0 });
        }
      }

      // 5) Filtrar por flag (si está ON, sólo claves del KIT)
      const restrict = await this.isImportRestricted();
      let bloqueadas: string[] = [];

      if (restrict) {
        const permitidas: ArticuloSolicitud[] = [];
        for (const a of nuevos) {
          const ok = this.cpmService.isClaveInKit(this.normClave(a.clave));
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
      const kitTotal = this.cpmService.getKitCount();
      const clavesNorm = this.articulosSolicitados.map(a => this.normClave(a.clave));
      const enKit = clavesNorm.filter(c => this.cpmService.isClaveInKit(c)).length;
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
      lineas.push(`✔ Importadas (distintas): ${this.articulosSolicitados.length}`);
      lineas.push(`✔ En KIT: ${enKit}/${kitTotal || '¿?'}`);
      if (bloqueadas.length) {
        lineas.push(`⛔ Bloqueadas por bandera: ${bloqueadas.length}`);
      } else {
        lineas.push(`• Fuera de KIT: ${fueraKit}`);
      }
      if (dupKeys.length > 0) lineas.push(`ℹ Duplicadas combinadas (${dupKeys.length}): ${dupPreview}`);

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

      const cpm = this.cpmIndex.get(clave) ?? this.cpmService.getCpmForClave(clave) ?? 0;
      const enKit = this.cpmService.isClaveInKit(clave);

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

  /*************************************************************************************/
  /*************************************************************************************/
  /*************************************************************************************/
  /** PARA MODAL DE CLAVES DE KIT */
  kitModalVisible = false;
  kitFiltro = '';
  kitSoloSinCpm = false;
  kitSoloSinExistencia = false;

  kitRows: Array<{ clave: string; cpm: number; azm: number; aze: number; azt: number; total: number }> = [];
  kitStats = { total: 0, conCpm: 0, sinCpm: 0, conExist: 0, sinExist: 0, existTotal: 0 };

  // ====== ABRIR/CERRAR ======
  async abrirKitModal() {
    try {
      // 1) Toma unión y filtra SOLO KIT
      const rows = await firstValueFrom(this.cpmService.cpms$ as any);
      const kit = (rows as any[])
        .filter(r => r.en_kit)
        .map(r => {
          const clave = String(r.clave_cnis || '').toUpperCase();
          const cpm = Number(r.cpm || 0);

          // 2) Trae existencias desde tu índice local (invIndex)
          const inv = this.invIndex.get(clave);
          const azm = inv?.existenciasAZM ?? 0;
          const aze = inv?.existenciasAZE ?? 0;
          const azt = inv?.existenciasAZT ?? 0;
          const total = azm + aze + azt;

          return { clave, cpm, azm, aze, azt, total };
        })
        .sort((a, b) => a.clave.localeCompare(b.clave));

      // 3) Stats
      const conCpm = kit.filter(r => r.cpm > 0).length;
      const conExist = kit.filter(r => r.total > 0).length;
      const existTotal = kit.reduce((acc, r) => acc + r.total, 0);

      this.kitRows = kit;
      this.kitStats = {
        total: kit.length,
        conCpm,
        sinCpm: kit.length - conCpm,
        conExist,
        sinExist: kit.length - conExist,
        existTotal
      };

      // 4) Reset filtros y muestra
      this.kitFiltro = '';
      this.kitSoloSinCpm = false;
      this.kitSoloSinExistencia = false;
      this.kitModalVisible = true;
      this.cdRef.detectChanges();
    } catch (e) {
      this.toast.warn({ title: 'Sin datos', content: 'No fue posible cargar el KIT de la unidad.', duration: 5 });
    }
  }

  cerrarKitModal() {
    this.kitModalVisible = false;
  }

  // ====== FILTRO EN VIVO ======
  get kitRowsFiltrados() {
    const f = this.kitFiltro.trim().toUpperCase();
    return this.kitRows.filter(r =>
      (!this.kitSoloSinCpm || r.cpm <= 0) &&
      (!this.kitSoloSinExistencia || r.total <= 0) &&
      (!f || r.clave.includes(f))
    );
  }

  // ====== ACCIONES ======
  copiarKitAlPortapapeles() {
    const texto = this.kitRowsFiltrados.map(r => r.clave).join('\n');
    navigator.clipboard.writeText(texto)
      .then(() => this.toast.success({ title: 'Copiado', content: 'Claves del KIT copiadas.', duration: 5 }))
      .catch(() => this.toast.error({ title: 'Error', content: 'No se pudieron copiar las claves.', duration: 5 }));
  }

  exportarKitCsv() {
    const rows = this.kitRowsFiltrados;
    const csv = [
      'clave,cpm,azm,aze,azt,total',
      ...rows.map(r => `${r.clave},${r.cpm},${r.azm},${r.aze},${r.azt},${r.total}`)
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const clues = this.datosClues?.hospital?.cluesimb || 'UNIDAD';
    a.href = url;
    a.download = `KIT-${clues}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // helper genérico para copiar texto (con fallback)
  private async copyText(text: string): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch { /* fallback abajo */ }

    // Fallback para contextos inseguros / navegadores viejos
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
    } finally {
      document.body.removeChild(ta);
    }
  }

  // ya tienes copiarKitAlPortapapeles(); mantenla para “solo claves”

  // NUEVO: copiar TODA la tabla (filtrada) como TSV para Excel/Sheets
  async copiarTablaKitAlPortapapeles() {
    const rows = this.kitRowsFiltrados; // respeta filtros (buscar, sin CPM, sin existencias)
    const headers = ['clave', 'cpm', 'azm', 'aze', 'azt', 'total'];
    const lines = rows.map(r => [
      r.clave,
      (r.cpm ?? 0),
      (r.azm ?? 0),
      (r.aze ?? 0),
      (r.azt ?? 0),
      (r.total ?? 0),
    ].join('\t'));
    const tsv = [headers.join('\t'), ...lines].join('\n');

    try {
      await this.copyText(tsv);
      this.toast.success({ title: 'Copiado', content: `Se copiaron ${rows.length} renglones (tabla completa).`, duration: 5 });
    } catch {
      this.toast.error({ title: 'Error', content: 'No se pudo copiar la tabla al portapapeles.', duration: 5 });
    }
  }


  /*************************************************************************************/
  /*************************************************************************************/
  /*************************************************************************************/
}
