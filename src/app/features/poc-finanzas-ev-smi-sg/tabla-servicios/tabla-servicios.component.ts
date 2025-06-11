import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EvaluacionServicio } from '../../../models/evaluacion-servicio';
import { ServicioEvaluado } from '../../../models/articulo-solicitud';

@Component({
  selector: 'app-tabla-servicios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tabla-servicios.component.html',
  styleUrl: './tabla-servicios.component.css'
})
export class TablaServiciosComponent {
  @Input() servicios: ServicioEvaluado[] = [];
  @Input() tipo: 'SMI' | 'SG' = 'SMI';
  @Output() eliminar =
   new EventEmitter<{ index: number; servicio: ServicioEvaluado }>();

  eliminarServicio(index: number, servicio: ServicioEvaluado) {
    this.eliminar.emit({ index, servicio }); // Emitir el evento con el servicio eliminado y su index
  }
}
