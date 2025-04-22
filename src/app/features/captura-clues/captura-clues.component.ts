import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { DatosClues } from '../../models/datos-clues';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { hospitalesData } from '../../models/hospitalesData';
import { LucideAngularModule, HospitalIcon } from 'lucide-angular';
import { PeriodoPickerComponent } from '../../shared/periodo-picker/periodo-picker.component';
import { Hospital } from '../../models/articulo-solicitud';

@Component({
  selector: 'app-captura-clues',
  imports: [CommonModule, FormsModule, LucideAngularModule, PeriodoPickerComponent],
  templateUrl: './captura-clues.component.html',
  styleUrl: './captura-clues.component.css'
})
export class CapturaCluesComponent implements OnInit {
  readonly HospitalIcon = HospitalIcon;
  nombreHospital = '';
  tipoInsumo = '';
  periodo = '';
  fechaInicio: Date | null = null;
  fechaFin: Date | null = null;
  //@Output() cluesValido = new EventEmitter<DatosClues>();

  selectedHospital: Hospital | null = null;

  autocompleteHospitales: any[] = [];
  selectedIndex = -1;

  @Output() datosCapturados = new EventEmitter<DatosClues>();
  @Output() irASolicitud = new EventEmitter<void>();

  tiposInsumoDisponibles: string[] = [
    'Medicamento',
    'Material de Curación',
    'Laboratorio'
  ];

  tipoPedido = 'Ordinario';
  responsableCaptura = '';

  tiposInsumoSeleccionados: string[] = [];

  toggleTipoInsumo(tipo: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;

    if (checked && !this.tiposInsumoSeleccionados.includes(tipo)) {
      this.tiposInsumoSeleccionados.push(tipo);
    } else if (!checked) {
      this.tiposInsumoSeleccionados = this.tiposInsumoSeleccionados.filter(t => t !== tipo);
    }
  }

  ngOnInit() {

    const cluesStr = localStorage.getItem('datosClues');
    if (cluesStr) {
      const datosClues = JSON.parse(cluesStr) as DatosClues;
      console.log('datosClues en captura-clues', datosClues);
      this.nombreHospital = datosClues.nombreHospital;
      this.tiposInsumoSeleccionados = datosClues.tipoInsumo.split(', ');
      this.periodoFormateado = datosClues.periodo;
      if (datosClues.fechaInicio) {
        this.fechaInicio = new Date(datosClues.fechaInicio);
      }
      if (datosClues.fechaFin) {
        this.fechaFin = new Date(datosClues.fechaFin);
      }
      if (!this.selectedHospital) {
        this.selectedHospital = datosClues.hospital;
      }
      this.tipoPedido = datosClues?.tipoPedido ?? 'Ordinario';
      this.responsableCaptura = datosClues?.responsableCaptura ?? '';

    }
  }


  avanzar() {
    this.datosCapturados.emit({
      nombreHospital: this.nombreHospital,
      tipoInsumo: this.tiposInsumoSeleccionados.join(', '),
      periodo: this.periodoFormateado,
      hospital: this.selectedHospital,
      fechaInicio: this.fechaInicio,
      fechaFin: this.fechaFin,
      tipoPedido: this.tipoPedido,
      responsableCaptura: this.responsableCaptura,
    });
    this.irASolicitud.emit();
  }

  onInputHospital(query: string) {
    if (query.length < 3) {
      this.autocompleteHospitales = [];
      this.selectedIndex = 0;
      return;
    }

    const term = query.toLowerCase();
    this.autocompleteHospitales = hospitalesData.filter(h =>
      h.cluesssa?.toLowerCase().includes(term) ||
      h.cluesimb?.toLowerCase().includes(term) ||
      h.nombre?.toLowerCase().includes(term)
    ).slice(0, 12);
  }

  selectHospital(hospital: any) {
    this.selectedHospital = hospital;
    this.nombreHospital = hospital.nombre;
    this.autocompleteHospitales = [];
  }

  onHospitalKeyDown(event: KeyboardEvent) {
    const len = this.autocompleteHospitales.length;

    if (event.key === 'ArrowDown') {
      this.selectedIndex = (this.selectedIndex + 1) % len;
      event.preventDefault();
    }

    if (event.key === 'ArrowUp') {
      this.selectedIndex = (this.selectedIndex - 1 + len) % len;
      event.preventDefault();
    }

    if (event.key === 'Enter' && this.selectedIndex >= 0) {
      this.selectHospital(this.autocompleteHospitales[this.selectedIndex]);
      event.preventDefault();
    }
  }

  periodoFormateado = '';

  onPeriodoSeleccionado(texto: string, fechaInicio: Date, fechaFin: Date) {
    this.periodoFormateado = texto;
    this.fechaInicio = fechaInicio;
    this.fechaFin = fechaFin;
  }

  get esValido(): boolean {
    return !!(
      this.selectedHospital &&
      this.tiposInsumoSeleccionados.length > 0 &&
      this.periodoFormateado
    );
  }

}
