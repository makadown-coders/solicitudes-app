import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-nombrar-archivo-modal',
  imports: [CommonModule, FormsModule],
  templateUrl: './nombrar-archivo-modal.component.html',
  styleUrl: './nombrar-archivo-modal.component.css'
})
export class NombrarArchivoModalComponent {
  @Input() nombreArchivo: string = '';
  @Output() nombreArchivoChange = new EventEmitter<string>();

  @Output() aceptar = new EventEmitter<void>();
  @Output() cancelarCerrar = new EventEmitter<void>();

  @Input() generarPrecarga: boolean = true;
  @Output() generarPrecargaChange = new EventEmitter<boolean>();
  confirmar() {
    this.nombreArchivoChange.emit(this.nombreArchivo);
    this.aceptar.emit();
  }

  cancelar() {
    this.cancelarCerrar.emit();
  }
}
