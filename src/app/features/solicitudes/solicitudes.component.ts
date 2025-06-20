import { ArticuloSolicitud } from '../../models/articulo-solicitud';
import { Component, OnInit, ViewChildren, QueryList, ElementRef, HostListener, ViewChild, inject, ChangeDetectorRef, AfterViewInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { debounceTime, Subject } from 'rxjs';
import { CommonModule } from '@angular/common';
import { NombrarArchivoModalComponent } from '../../shared/nombrar-archivo-modal/nombrar-archivo-modal.component';
import { ConfirmacionModalComponent } from '../../shared/confirmacion-modal/confirmacion-modal.component';
import { TablaArticulosComponent } from '../tabla-articulos/tabla-articulos.component';
import { ArticulosService } from '../../services/articulos.service';
import { ExcelService } from '../../services/excel.service';
import { DatosClues } from '../../models/datos-clues';
import { Router, RouterModule } from '@angular/router';
import { InventarioService } from '../../services/inventario.service';
import { Inventario } from '../../models/Inventario';
import { StorageSolicitudService } from '../../services/storage-solicitud.service';
import { ModoCapturaSolicitud } from '../../shared/modo-captura-solicitud';


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
export class SolicitudesComponent implements OnInit, AfterViewInit {

  mostrarModal = false;
  modalVisible = false;
  modalTitulo = '';
  modalMensaje = '';
  modalConfirmarTexto = '';
  modalCancelarTexto = '';
  modalCallback?: () => void;
  modalSoloInfo = false;
  articulosSolicitados: ArticuloSolicitud[] = [];

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

  @ViewChildren('resultItem') resultItems!: QueryList<ElementRef>;
  @ViewChild('inputClave') inputClaveRef!: ElementRef<HTMLInputElement>;

  modoEdicionIndex: number | null = null;
  cantidadTemporal: number = 0;

  generarPrecarga: boolean = true;

  mensajeImportacion: string | null = null;

  private cdRef = inject(ChangeDetectorRef);
  private router = inject(Router);
  private storageSolicitudService = inject(StorageSolicitudService);

  @HostListener('document:keydown.escape', ['$event'])
  onKeydownHandler(event: KeyboardEvent) {
    if (this.modalVisible) {
      this.cerrarModal();
    }
  }

  private inventarioService = inject(InventarioService);
  inventario: Inventario[] = [];

  async ngOnInit() {
    if (this.router.url === '/solicitudv1') {
      // Podrías activar un modo simplificado si lo deseas
      this.modoStandalone = true;
    } else {
      this.modoStandalone = false;
    }

    const guardados = this.storageSolicitudService.getArticulosSolicitadosFromLocalStorage();
    if (guardados) {
      this.articulosSolicitados = JSON.parse(guardados);
    }

    this.searchSubject.pipe(debounceTime(1000)).subscribe(texto => {
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
    this.inventarioService.inventario$.subscribe({
      next: (data) => {
        this.inventario = [...data];
        this.cdRef.detectChanges();
      },
      error: (error) => {
        console.error('Error al obtener el inventario:', error);
      }
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

  buscarArticulosConFallback(texto: string) {
    if (this.storageSolicitudService.getModoCapturaSolicitud() === ModoCapturaSolicitud.PRIMER_NIVEL) {
      this.buscarArticulosPrimerNivel(texto);
      return;
    }

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
        this.autocompleteResults = data.resultados || [];
        this.totalResults = data.total || 0;
        this.moreResults = this.totalResults > 12;
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
        this.autocompleteResults = data.resultados || [];
        this.totalResults = data.total || 0;
        this.moreResults = this.totalResults > 12;
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

  buscarArticulosPrimerNivel(texto: string) {
    this.articulosService.buscarArticulosPrimerNivel(texto).subscribe({
      next: (data) => {
        this.autocompleteResults = data.resultados || [];
        this.totalResults = data.total || 0;
        this.moreResults = this.totalResults > 12;
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


  selectArticulo(item: any) {
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

  agregarArticulo() {
    const clave = this.claveInput.trim().toUpperCase();

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


    this.articulosSolicitados.push({
      clave,
      descripcion: this.descripcionInput.trim(),
      unidadMedida: this.unidadInput.trim(),
      cantidad: this.cantidadInput
    });

    this.storageSolicitudService
      .setArticulosSolicitadosInLocalStorage(
        JSON.stringify(this.articulosSolicitados));

    // Buscar en this.inventario filtrando por clave y regresando
    // { almacen, disponible(sumatoria), comprometidos (sumatorio) }
    const invDisp = this.inventario.filter(inventario => inventario.clave === clave)
      .sort((a, b) => a.almacen.localeCompare(b.almacen));
    // agrupar invDisp por almacen y sumar disponible y comprometidos
    const invDispAgrupado: any[] = [];
    let agrupadin = { almacen: '', disponible: 0, comprometidos: 0 };

    for (let i = 0; i < invDisp.length; i++) {
      const almacen = invDisp[i].almacen;

      if (almacen !== agrupadin.almacen) {
        if (i > 0) {
          invDispAgrupado.push({ ...agrupadin }); // Clonar 
        }
        agrupadin.almacen = almacen;
        agrupadin.disponible = invDisp[i].disponible;
        agrupadin.comprometidos = invDisp[i].comprometidos;
      } else {
        agrupadin.disponible += invDisp[i].disponible;
        agrupadin.comprometidos += invDisp[i].comprometidos;
      }
      if (i === invDisp.length - 1) {
        invDispAgrupado.push({ ...agrupadin });
      }
    }

    if (invDispAgrupado && invDispAgrupado.length > 0) {
      console.log('En inventario:', invDisp);
      console.log('En inventario agrupado:', invDispAgrupado);
    } else {
      console.log(`No se encontró en inventario: ${clave}`);
    }

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

  exportarExcelPrecarga(nombreArchivo: string) {
    this.excelService.exportarExcelPrecarga(nombreArchivo, this.articulosSolicitados);
  }

  async exportarExcelConTemplate(nombreArchivo: string) {
    this.excelService.exportarExcelConTemplate('template.xlsx', nombreArchivo, this.articulosSolicitados, this.modoStandalone);
    this.abrirModalInfo(
      this.generarPrecarga ? 'Archivos generados' : 'Archivo generado',
      'Por favor cerciórese que la información esté en buen estado y sirva para sus necesidades. Presione "Limpiar captura" para iniciar una nueva.'
    );
    if (this.generarPrecarga) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Espera 1 segundo
      let nombreArchivPrecarga = 'Precarga';
      const cluesStr = this.storageSolicitudService.getDatosCluesFromLocalStorage();
      if (cluesStr && !this.modoStandalone) {
        const datosClues = JSON.parse(cluesStr) as DatosClues;
        nombreArchivPrecarga += '-' + this.iniciales(datosClues.nombreHospital);
        nombreArchivPrecarga += '-' + datosClues.tipoInsumo.split('-');
        nombreArchivPrecarga += '-' + datosClues.tipoPedido;
      }
      nombreArchivPrecarga += '_' + new Date().toISOString().slice(0, 7);
      this.exportarExcelPrecarga(nombreArchivPrecarga);
    }
  }


  mostrarModalExportar() {
    this.nombreArchivo = `Solicitud-${new Date().toISOString().slice(0, 7)}`;
    const cluesStr = this.storageSolicitudService.getDatosCluesFromLocalStorage();
    let nombreArchivoCompleto = this.nombreArchivo;
    if (cluesStr && !this.modoStandalone) {
      const datosClues = JSON.parse(cluesStr) as DatosClues;

      nombreArchivoCompleto = this.iniciales(datosClues.nombreHospital);
      nombreArchivoCompleto += '-' + datosClues.tipoInsumo.split('-');
      nombreArchivoCompleto += '-' + datosClues.tipoPedido;
      nombreArchivoCompleto += '_' + datosClues.periodo.replace(/\s+/g, '-');
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

    try {
      const datos = await this.excelService.leerArchivoPrecarga(archivo); // ⚠️ este método lo definiremos en el servicio

      if (!datos || datos.length === 0) {
        this.abrirModalInfo('Archivo vacío', 'El archivo no contiene datos válidos.');
        return;
      }

      // Intentar identificar columnas por nombres flexibles
      const headers = Object.keys(datos[0]).map(h => h.toLowerCase().trim());
      const colClave = headers.find(h => h.includes('clave'));
      const colCantidad = headers.find(h => h.includes('cantidad'));
      if (!colClave) {
        this.abrirModalInfo('Encabezado faltante', 'El archivo no contiene columna con clave CNIS.');
        return;
      }

      const nuevos: ArticuloSolicitud[] = [];
      const repetidas: Record<string, number> = {};

      for (const fila of datos) {
        const clave = (fila[colClave] ?? '').toString().trim().toUpperCase();
        if (!clave) continue;

        const cantidad = colCantidad ? parseInt(fila[colCantidad]) || 0 : 0;

        const existente = nuevos.find(a => a.clave === clave);
        if (existente) {
          existente.cantidad += cantidad;
          repetidas[clave] = (repetidas[clave] || existente.cantidad);
        } else {
          nuevos.push({
            clave,
            descripcion: '',
            unidadMedida: '',
            cantidad
          });
        }
      }

      if (nuevos.length === 0) {
        this.abrirModalInfo('Archivo inválido', 'No se encontraron claves válidas para importar.');
        return;
      }

      this.articulosSolicitados = nuevos;
      this.storageSolicitudService
        .setArticulosSolicitadosInLocalStorage(
          JSON.stringify(this.articulosSolicitados));

      const clavesRepetidas = Object.keys(repetidas).length;
      // ⚠️ Opcional: aquí podrías invocar this.autocompletarDatos() si quieres precargar descripción/unidad
      if (clavesRepetidas > 0) {
        const claves = Object.keys(repetidas).join(', ');
        this.abrirModalInfo('Claves repetidas detectadas',
          `Se importaron ${this.articulosSolicitados.length} artículos correctamente.
           Se acumularon cantidades para las siguientes claves duplicadas:\n${claves}`);
      }
      this.autocompletarDatos(); // 👈 Aquí se llena lo demás

      if (clavesRepetidas === 0) {
        this.mensajeImportacion = `Se importaron ${this.articulosSolicitados.length} artículos correctamente.`;
        setTimeout(() => {
          this.mensajeImportacion = null;
          this.cdRef.detectChanges(); // Forzar actualización si es necesario
        }, 4000);
      }

    } catch (error) {
      console.error('Error al leer archivo:', error);
      this.abrirModalInfo('Error al importar', 'Hubo un problema al procesar el archivo.');
    } finally {
      input.value = ''; // 👈 resetear input para permitir cargar el mismo archivo otra vez
    }
  }

  autocompletarDatos() {
    const claves = this.articulosSolicitados.map(a => a.clave.toLowerCase());

    this.articulosService.buscarArticulosv2('').subscribe({
      next: (data) => {
        const catalogo = data.resultados;
        for (const art of this.articulosSolicitados) {
          const encontrado = catalogo.find(c => c.clave.toLowerCase() === art.clave.toLowerCase());
          if (encontrado) {
            art.descripcion = encontrado.descripcion;
            art.unidadMedida = encontrado.unidadMedida;
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
}
