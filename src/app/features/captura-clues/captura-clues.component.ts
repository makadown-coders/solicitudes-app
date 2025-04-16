import { Component, EventEmitter, Output } from '@angular/core';
import { DatosClues } from '../../models/datos-clues';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { hospitalesData } from '../../models/hospitalesData';
import { LucideAngularModule, HospitalIcon } from 'lucide-angular';

@Component({
  selector: 'app-captura-clues',
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './captura-clues.component.html',
  styleUrl: './captura-clues.component.css'
})
export class CapturaCluesComponent {
  readonly HospitalIcon = HospitalIcon;
  nombreHospital = '';
  tipoInsumo = '';
  periodo = '';

  selectedHospital: any = null;
  autocompleteHospitales: any[] = [];
  selectedIndex = -1;

  @Output() datosCapturados = new EventEmitter<DatosClues>();
  @Output() irASolicitud = new EventEmitter<void>();

  avanzar() {
    this.datosCapturados.emit({
      nombreHospital: this.nombreHospital,
      tipoInsumo: this.tipoInsumo,
      periodo: this.periodo,
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

}
