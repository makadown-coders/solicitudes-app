import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Cita } from '../../models/Cita';

@Component({
  selector: 'app-detalle-ordenes-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './detalle-ordenes-modal.component.html',
})
export class DetalleOrdenesModalComponent {
  @Input() visible = false;
  @Input() registros: Cita[] = [];
  @Output() cerrar = new EventEmitter<void>();

  cerrarModal() {
    this.cerrar.emit();
  }
}
