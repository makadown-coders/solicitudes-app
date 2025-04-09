import { ArticuloSolicitud } from '../models/articulo-solicitud';
import { Component, OnInit, ViewChildren, QueryList, ElementRef, HostListener, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { debounceTime, Subject } from 'rxjs';
import { CommonModule } from '@angular/common';
import * as XLSX from 'xlsx';
import { environment } from '../../environments/environment';


@Component({
  selector: 'app-solicitudes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './solicitudes.component.html'
})
export class SolicitudesComponent implements OnInit {
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

  @ViewChildren('resultItem') resultItems!: QueryList<ElementRef>;
  @ViewChild('inputClave') inputClaveRef!: ElementRef<HTMLInputElement>;

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

  onClaveInput() {
    this.searchSubject.next(this.claveInput.trim());
  }

  buscarEnDB(texto: string) {
    fetch(`${environment.apiUrl}/api/articulos?q=${encodeURIComponent(texto)}`)
    .then(res => res.json())
    .then(data => {
      this.autocompleteResults = data.resultados || [];
      this.totalResults = data.total || 0;
      this.moreResults = this.totalResults > 12;
      this.selectedIndex = 0;
      setTimeout(() => this.focusSelectedItem(), 0);
    })
    .catch(err => {
      console.error('Error al consultar el backend:', err);
      this.autocompleteResults = [];
    });
  }

  selectArticulo(item: any) {
    this.claveInput = item.clave;
    this.descripcionInput = item.descripcion;
    this.unidadInput = item.presentacion;
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
    const worksheet = XLSX.utils.json_to_sheet(this.articulosSolicitados);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Solicitudes');

    const nombreFinal = nombreArchivo.endsWith('.xlsx') ? nombreArchivo : `${nombreArchivo}.xlsx`;

    XLSX.writeFile(workbook, nombreFinal);

    this.abrirModalInfo(
      'Archivo descargado',
      'Por favor cerciórese que la información esté en buen estado y sirva para sus necesidades. Presione "Limpiar captura" para iniciar una nueva.'
    );
  }

  mostrarModalExportar() {
    this.nombreArchivo = `HGT-Medicamento-${new Date().toISOString().slice(0, 7)}`;
    this.modalPedirNombreArchivo = true;
  }

  confirmarExportacion() {
    this.modalPedirNombreArchivo = false;
    this.exportarExcel(this.nombreArchivo);
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
      this.cantidadInput < 32000
    );
  }

}
