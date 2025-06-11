import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SelectorCluesComponent } from '../../shared/selector-clues/selector-clues.component';
import { Unidad } from '../../models/articulo-solicitud';
import { EvaluadorSmiSgComponent } from './evaluador-smi-sg/evaluador-smi-sg.component';

@Component({
    selector: 'app-poc-finanzas-ev-smi-sg',
    standalone: true,
    imports: [CommonModule, EvaluadorSmiSgComponent, SelectorCluesComponent],
    templateUrl: './poc-finanzas-ev-smi-sg.component.html',
})
export class PocFinanzasEvSmiSgComponent {
    unidadSeleccionada = signal<Unidad | null>(null);

  actualizarUnidad(unidad: Unidad) {
    this.unidadSeleccionada.set(unidad);
  }
}
