import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { debounceTime, Subject } from 'rxjs';
import { CitasService } from '../../services/citas.service';
import { ExcelService } from '../../services/excel.service';
import { ConfirmacionModalComponent } from '../../shared/confirmacion-modal/confirmacion-modal.component';

/**
 * @deprecated
 */
@Component({
  selector: 'app-suministros',
  imports: [CommonModule, FormsModule, ConfirmacionModalComponent],
  templateUrl: './suministros.component.html',
  styleUrl: './suministros.component.css'
})
export class SuministrosComponent implements OnInit {
  private STORAGE_KEY = 'capturaSuministros';

  highlightedIndex: number | null = null;
  mostrarModalInfo = false;
  mostrarModalLimpiar = false;
  mensajeModalInfo = '';

  autocompleteIndex = -1;
  autocompleteActivo = false;


  private ordenSubject = new Subject<string>();
  private citasService = inject(CitasService);
  private excelService = inject(ExcelService);

  // --- Datos del formulario ---
  ordenDeSuministro = '';
  autocompleteResults: any[] = [];
  /**
   * Campos editables del formulario superior
   */
  filtros = {
    tarimas: '',
    fecha: '',
    hora: '',
    cita_atendida: 'SI',
    estatus_excel: 'Pendiente'
  };

  /**
   * Campos editables para renglón de tabla al editar
   */
  filtrosEdit = {
    tarimas: '',
    fecha: '',
    hora: '',
    cita_atendida: 'SI',
    estatus_excel: 'Pendiente'
  };

  seleccionActual: any = null;
  registrosCapturados: any[] = [];
  isEditingIndex: number | null = null;

  // --- Estados ---
  isLoading = false;
  showModalFinalizar = false;
  encabezadoExcel = 'AGENDA DE CITAS 2025';
  nombreArchivoExcel = 'agenda-citas.xlsx';

  constructor() {
    this.ordenSubject.pipe(debounceTime(300)).subscribe((q) => {
      if (q.length >= 3) {
        this.isLoading = true;
        this.citasService.buscarOrdenes(q).subscribe({
          next: (data) => {
            this.autocompleteResults = data;
            this.isLoading = false;
          },
          error: () => {
            this.autocompleteResults = [];
            this.isLoading = false;
          }
        });
      } else {
        this.autocompleteResults = [];
      }
    });
  }

  ngOnInit(): void {
    const guardado = localStorage.getItem(this.STORAGE_KEY);
    if (guardado) {
      this.registrosCapturados = JSON.parse(guardado);
    }
  }

  // Métodos ---

  buscarOrdenDebounced(): void {
    this.ordenSubject.next(this.ordenDeSuministro.trim());
  }

  navegarAutocomplete(event: KeyboardEvent): void {
    const total = this.autocompleteResults.length;

    if (!total) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.autocompleteActivo = true;
        this.autocompleteIndex = (this.autocompleteIndex + 1) % total;
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.autocompleteActivo = true;
        this.autocompleteIndex = (this.autocompleteIndex - 1 + total) % total;
        break;

      case 'Enter':
        if (this.autocompleteActivo && this.autocompleteIndex >= 0) {
          this.seleccionarOrden(this.autocompleteResults[this.autocompleteIndex]);
          event.preventDefault();
        }
        break;

      case 'Escape':
        this.autocompleteResults = [];
        this.autocompleteIndex = -1;
        this.autocompleteActivo = false;
        break;
    }
  }


  seleccionarOrden(result: any): void {
    this.seleccionActual = result;
    this.ordenDeSuministro = result.orden_de_suministro;
    // limpiar campos editables
    this.filtros = {
      tarimas: '',
      fecha: '',
      hora: '',
      cita_atendida: 'SI',
      estatus_excel: 'Pendiente'
    };
    this.autocompleteIndex = -1;
    this.autocompleteActivo = false;
    this.autocompleteResults = [];
  }

  agregarRegistro(): void {
    const orden = this.seleccionActual?.orden_de_suministro;
    const duplicadoIndex = this.registrosCapturados.findIndex(
      r => r.orden_de_suministro === orden
    );

    if (duplicadoIndex !== -1) {
      this.highlightedIndex = duplicadoIndex;

      this.abrirModalInfo('⚠️ Esta orden de suministro ya fue agregada.');

      setTimeout(() => {
        this.highlightedIndex = null;
      }, 2000);

      return;
    }

    this.registrosCapturados.push({
      ...this.seleccionActual!,
      tarimas: this.filtros.tarimas || '',
      fecha: this.filtros.fecha,
      hora: this.filtros.hora,
      cita_atendida: this.filtros.cita_atendida,
      estatus_excel: this.filtros.estatus_excel
    });
    this.guardarEnLocalStorage();

    this.limpiarFormulario();
  }


  eliminar(index: number): void {
    this.registrosCapturados.splice(index, 1);
    this.guardarEnLocalStorage();
  }

  editar(index: number): void {
    this.isEditingIndex = index;
  
    const r = this.registrosCapturados[index];
    this.filtrosEdit = {
      tarimas: r.tarimas,
      fecha: r.fecha,
      hora: r.hora,
      cita_atendida: r.cita_atendida,
      estatus_excel: r.estatus_excel
    };
  }
  

  guardarEdicion(index: number): void {
    if (!this.validarFechaInput(this.filtrosEdit.fecha) || !this.validarHoraInput(this.filtrosEdit.hora)) {
      this.abrirModalInfo('⚠️ Fecha u hora con formato incorrecto.');
      return;
    }
  
    const cita = this.registrosCapturados[index];
    cita.tarimas = this.filtrosEdit.tarimas;
    cita.fecha = this.filtrosEdit.fecha;
    cita.hora = this.filtrosEdit.hora;
    cita.cita_atendida = this.filtrosEdit.cita_atendida;
    cita.estatus_excel = this.filtrosEdit.estatus_excel;
  
    this.guardarEnLocalStorage();
    this.isEditingIndex = null;
  }

  abrirModalInfo(mensaje: string) {
    this.mensajeModalInfo = mensaje;
    this.mostrarModalInfo = true;
  }
  

  cancelarEdicion(): void {
    this.isEditingIndex = null;
    this.filtrosEdit = {
      tarimas: '',
      fecha: '',
      hora: '',
      cita_atendida: 'SI',
      estatus_excel: 'Pendiente'
    };
  }

  limpiarFormulario(): void {
    this.ordenDeSuministro = '';
    this.autocompleteResults = [];
    this.autocompleteIndex = -1;
    this.autocompleteActivo = false;
    this.seleccionActual = null;
    this.filtros = {
      tarimas: '',
      fecha: '',
      hora: '',
      cita_atendida: 'SI',
      estatus_excel: 'Pendiente'
    };
  }

  /*limpiarListado(): void {
    if (confirm('¿Estás seguro que deseas borrar todos los registros capturados?')) {
      this.registrosCapturados = [];
      this.guardarEnLocalStorage();
    }
  }  */

  exportarExcel(): void {
    const template = 'template-citas.xlsx';
    const nombreFinal = this.nombreArchivoExcel.endsWith('.xlsx')
      ? this.nombreArchivoExcel
      : `${this.nombreArchivoExcel}.xlsx`;

    this.excelService.exportarCitasConTemplate(
      template,
      nombreFinal,
      this.encabezadoExcel,
      this.registrosCapturados
    );

    this.showModalFinalizar = false;
  }

  formatearFecha(fecha: string | Date | null): string {
    if (!fecha) return '';
    const date = new Date(fecha);
    return isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-MX');
  }

  formatoDDMMYYYY(fecha: string | null): string {
    if (!fecha) return '';
    const date = new Date(fecha);
    if (isNaN(date.getTime())) return '';
    const dia = String(date.getDate()).padStart(2, '0');
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const anio = date.getFullYear();
    return `${dia}/${mes}/${anio}`;
  }

  validarFechaInput(valor: string): boolean {
    const regex = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/;
    return regex.test(valor);
  }

  validarHoraInput(valor: string): boolean {
    const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    return regex.test(valor);
  }

  puedeAgregar(): boolean {
    const fechaOk = this.validarFechaInput(this.filtros.fecha);
    const horaOk = this.validarHoraInput(this.filtros.hora);
    /*const noDuplicada = !this.registrosCapturados.some(
      r => r.orden_de_suministro === this.seleccionActual?.orden_de_suministro
    );*/
    return this.seleccionActual !== null && fechaOk && horaOk /*&& noDuplicada*/;
  }

  guardarEnLocalStorage(): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.registrosCapturados));
  }

  confirmarLimpiarListado(): void {
    this.registrosCapturados = [];
    this.guardarEnLocalStorage();
    this.limpiarFormulario();
    this.mostrarModalLimpiar = false;
  }


}
