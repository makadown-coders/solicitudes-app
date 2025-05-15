import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Cita } from '../../models/Cita';


@Component({
  selector: 'app-detalle-cita-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './detalle-cita-modal.component.html',
  styleUrls: ['./detalle-cita-modal.component.css']
})
export class DetalleCitaModalComponent {
  @Input() cita: Cita | null = null;
  @Input() visible = false;
  @Output() cerrar = new EventEmitter<void>();

  cerrarModal() {
    this.cerrar.emit();
  }
}
