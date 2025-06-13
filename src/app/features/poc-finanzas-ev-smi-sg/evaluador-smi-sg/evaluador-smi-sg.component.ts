import { Component, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ServicioEvaluado, Unidad } from '../../../models/articulo-solicitud';
import { TablaServiciosComponent } from '../tabla-servicios/tabla-servicios.component';
import { FormsModule } from '@angular/forms';
import { StorageVariables } from '../../../shared/storage-variables';

@Component({
  selector: 'app-evaluador-smi-sg',
  standalone: true,
  imports: [CommonModule, FormsModule, TablaServiciosComponent],
  templateUrl: './evaluador-smi-sg.component.html',
})
export class EvaluadorSmiSgComponent  {
  @Input() unidad!: Unidad;
  tabActivo = signal<'SMI' | 'SG'>('SMI');

  cambiarTab(tab: 'SMI' | 'SG') {
    this.tabActivo.set(tab);
  }
}
