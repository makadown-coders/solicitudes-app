import { Component, Input, Output, EventEmitter, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { clasificacionMedicamentosData } from '../../models/clasificacionMedicamentosData';
import { ClasificadorVEN } from '../../models/clasificador-ven';

@Component({
  selector: 'app-tabla-articulos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tabla-articulos.component.html',
})
export class TablaArticulosComponent {

  @Input() articulosSolicitados: any[] = [];
  @Input() modoEdicionIndex: number | null = null;
  @Input() cantidadTemporal: number = 0;

  @Output() cantidadTemporalChange = new EventEmitter<number>();
  @Output() confirmar = new EventEmitter<number>();
  @Output() cancelar = new EventEmitter<void>();
  @Output() editar = new EventEmitter<number>();
  @Output() eliminar = new EventEmitter<number>();

  esCantidadInvalida(): boolean {
    const esInvalida = this.cantidadTemporal <= 0 || this.cantidadTemporal > 99999;
    return esInvalida;
  }

  mandarConfirmacion(index: number) {
    this.cantidadTemporalChange.emit(this.cantidadTemporal);
    this.confirmar.emit(index);
  }

  clasificacion(clave: string) {
    const clasificacion = clasificacionMedicamentosData.find(c => c.clave === clave);
    return clasificacion ? ClasificadorVEN[clasificacion.ven] : '';
  }
}
