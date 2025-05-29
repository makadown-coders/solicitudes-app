import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgIf, NgFor, DatePipe } from '@angular/common';
import { Cita } from '../../../models/Cita';

@Component({
  selector: 'app-citas-por-insumo-modal',
  standalone: true,
  imports: [NgIf, NgFor, DatePipe],
  templateUrl: './citas-por-insumo-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CitasPorInsumoModalComponent {
  @Input() visible: boolean = false;
  @Input() citasFiltradas: Cita[] = [];
  @Input() cerrar: () => void = () => {};
  @Input() exportar: () => void = () => {};

  ordenarPorUnidadYFecha(citas: Cita[]): Cita[] {
    return citas.slice().sort((a, b) => {
      if (a.unidad !== b.unidad) return a.unidad.localeCompare(b.unidad);
      return new Date(a.fecha_recepcion_almacen || '').getTime() - new Date(b.fecha_recepcion_almacen || '').getTime();
    });
  }
}
