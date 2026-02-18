import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { HomologosTablaComponent } from '../homologos-tabla/homologos-tabla.component';
import { SugerenciaHomologoItem } from '../../../services/homologos-solicitud.service';
import { InventarioDisponibles } from '../../../models/Inventario';

@Component({
  selector: 'app-homologo-resumen-importacion',
  standalone: true,
  imports: [CommonModule, HomologosTablaComponent],
  templateUrl: './homologo-resumen-importacion.component.html',
  styleUrls: ['./homologo-resumen-importacion.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomologoResumenImportacionComponent {
  @Input() sugerencias: SugerenciaHomologoItem[] = [];
  @Input() totalImportados: number = 0;
  @Input() inventarioDisponible: InventarioDisponibles[] = [];

  @Output() reemplazarTodos = new EventEmitter<SugerenciaHomologoItem[]>();
  @Output() personalizarSeleccion = new EventEmitter<SugerenciaHomologoItem[]>();
  @Output() ignorar = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  // UI state
  mostrarDetalles = false;

  /**
   * Emite reemplazo de todos los TOP candidatos
   */
  onReemplazarTodos() {
    this.reemplazarTodos.emit(this.sugerencias);
    this.close.emit();
  }

  /**
   * Muestra tabla para personalizar selección
   */
  onPersonalizarSeleccion() {
    this.mostrarDetalles = true;
  }

  /**
   * Ignora sugerencias y continúa
   */
  onIgnorar() {
    this.ignorar.emit();
    this.close.emit();
  }

  /**
   * Manejo de reemplazo desde la tabla
   */
  onReemplazarDesdeTabla(event: any) {
    // La tabla emite { original, candidato }
    this.reemplazarTodos.emit([event.original]);
  }

  /**
   * Calcula los artículos sin sugerencias
   */
  get sinSugerencias(): number {
    return Math.max(0, this.totalImportados - this.sugerencias.length);
  }
}
