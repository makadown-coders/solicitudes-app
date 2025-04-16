import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-confirmacion-modal',
  imports: [CommonModule],
  templateUrl: './confirmacion-modal.component.html',
  styleUrl: './confirmacion-modal.component.css'
})
export class ConfirmacionModalComponent {
  @Input() titulo: string = '';
  @Input() mensaje: string = '';
  @Input() textoCancelar: string = '';
  @Input() textoConfirmar: string = '';
  @Input() soloInfo: boolean = false;

  @Output() confirmar = new EventEmitter<void>();
  @Output() cancelar = new EventEmitter<void>();
}
