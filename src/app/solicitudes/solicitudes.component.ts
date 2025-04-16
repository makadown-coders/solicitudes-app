import { ArticuloSolicitud } from '../models/articulo-solicitud';
import { Component, OnInit, ViewChildren, QueryList, ElementRef, HostListener, ViewChild, inject, ChangeDetectorRef, AfterViewInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { debounceTime, Subject } from 'rxjs';
import { CommonModule } from '@angular/common';
import { NombrarArchivoModalComponent } from '../shared/nombrar-archivo-modal/nombrar-archivo-modal.component';
import { ConfirmacionModalComponent } from '../shared/confirmacion-modal/confirmacion-modal.component';
import { TablaArticulosComponent } from '../features/tabla-articulos/tabla-articulos.component';
import { ArticulosService } from '../services/articulos.service';
import { ExcelService } from '../services/excel.service';


@Component({
  selector: 'app-solicitudes',
  standalone: true,
  imports: [CommonModule, FormsModule, 
            NombrarArchivoModalComponent,
            ConfirmacionModalComponent,
            TablaArticulosComponent],
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

  usarTemplate: boolean = true;

  private cdRef = inject(ChangeDetectorRef);

  @HostListener('document:keydown.escape', ['$event'])
  onKeydownHandler(event: KeyboardEvent) {
    if (this.modalVisible) {
      this.cerrarModal();
    }
  }

  async ngOnInit() {
    const guardados = localStorage.getItem('articulosSolicitados');
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
  }

  ngAfterViewInit(): void {
    this.cdRef.detectChanges();
  }

  onClaveInput() {
    this.searchSubject.next(this.claveInput.trim());
  }

  buscarEnDB(texto: string) {
    this.buscarArticulosConFallback(texto);
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
  
    // 🔌 Intenta con backend Railway
    this.articulosService.buscarArticulos(texto).subscribe({
      next: (data) => {
        this.autocompleteResults = data.resultados || [];
        this.totalResults = data.total || 0;
        this.moreResults = this.totalResults > 12;
        this.selectedIndex = 0;
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
  

  selectArticulo(item: any) {
    this.claveInput = item.clave;
    this.descripcionInput = item.descripcion??'';
    this.unidadInput = item.unidadMedida?? (item.presentacion??'');
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

    localStorage.setItem('articulosSolicitados', JSON.stringify(this.articulosSolicitados));

    // Limpiar inputs
    this.claveInput = '';
    this.descripcionInput = '';
    this.unidadInput = '';
    this.cantidadInput = 0;
    this.selectedIndex = -1;

    setTimeout(() => {
      this.inputClaveRef?.nativeElement.focus();
    }, 0);
  }

  abrirModal() {
    this.mostrarModal = true;
  }

  confirmarLimpieza() {
    this.articulosSolicitados = [];
    localStorage.removeItem('articulosSolicitados');
    this.cerrarModal();
  }

  abrirModalInfo(titulo: string, mensaje: string, confirmarTexto = 'Aceptar') {
    this.modalTitulo = titulo;
    this.modalMensaje = mensaje;
    this.modalConfirmarTexto = confirmarTexto;
    this.modalSoloInfo = true;
    this.modalVisible = true;
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

  exportarExcel(nombreArchivo: string) {
    this.excelService.exportarExcel(nombreArchivo, this.articulosSolicitados);

    this.abrirModalInfo(
      'Archivo descargado',
      'Por favor cerciórese que la información esté en buen estado y sirva para sus necesidades. Presione "Limpiar captura" para iniciar una nueva.'
    );
  }

  exportarExcelConTemplate(nombreArchivo: string): void {
    this.excelService.exportarExcelConTemplate('template.xlsx', nombreArchivo, this.articulosSolicitados);
    /*const B1 = 'Aquí va el nombre del hospital!';
    const D4 = 'Aquí va tipos de insumo!';
    const E5 = 'Aquí va periodo!';
    ExcelTable.replaceInExcel("template.xlsx", {  
      B1,  
      D4,  
      E5,
      data: JSON.stringify(this.articulosSolicitados),
    }, {
      fileName: nombreArchivo
    });*/
  /*
    fetch('template.xlsx')
      .then((res) => res.arrayBuffer())
      .then((buffer) => {
        const workbook = XLSX.read(buffer, { type: 'array' });
        const hoja = workbook.Sheets[workbook.SheetNames[0]];
  
        // 👉 Insertar valores clave
        hoja['B1'] = { t: 's', v: B1 };
        hoja['D4'] = { t: 's', v: D4 };
        hoja['E5'] = { t: 's', v: E5 };
  
        // 👉 Insertar los artículos comenzando desde B13
        const startRow = 13;
  
        this.articulosSolicitados.forEach((articulo, index) => {
          const fila = startRow + index;
  
          hoja[`B${fila}`] = { t: 's', v: articulo.clave };
          hoja[`C${fila}`] = { t: 's', v: articulo.descripcion };
          hoja[`D${fila}`] = { t: 's', v: articulo.unidadMedida };
          hoja[`E${fila}`] = { t: 'n', v: articulo.cantidad };
        });
  
        // Generar nombre final con .xlsx si no lo incluye
        const nombreFinal = nombreArchivo.endsWith('.xlsx') ? nombreArchivo : `${nombreArchivo}.xlsx`;
  
        // Descargar archivo
        const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/octet-stream' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = nombreFinal;
        a.click();
  
        // Modal final de info
        this.abrirModalInfo(
          'Archivo descargado',
          'Por favor cerciórese que la información descargada esté en buen estado y sirva para sus necesidades. Presione "Limpiar captura" para iniciar una nueva.'
        );
      })
      .catch((error) => {
        console.error('❌ Error al exportar con template:', error);
        this.abrirModalInfo('Error', 'No se pudo generar el archivo usando la plantilla.');
      });*/
  }
  

  mostrarModalExportar() {
    this.nombreArchivo = `Solicitud-${new Date().toISOString().slice(0, 7)}`;
    this.modalPedirNombreArchivo = true;
  }

  confirmarExportacion() {
    this.modalPedirNombreArchivo = false;
  
    if (this.usarTemplate) {
      this.exportarExcelConTemplate(this.nombreArchivo);
    } else {
      this.exportarExcel(this.nombreArchivo);
    }
  }

  eliminarArticulo(index: number) {
    this.articulosSolicitados.splice(index, 1);
    localStorage.setItem('articulosSolicitados', JSON.stringify(this.articulosSolicitados));
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
    localStorage.setItem('articulosSolicitados', JSON.stringify(this.articulosSolicitados));
  }

  esCantidadInvalida(): boolean {
    return this.cantidadTemporal <= 0 || this.cantidadTemporal > 99999;
  } 

  cerrarModalArchivo() {
    this.modalPedirNombreArchivo = false;
  }

}
