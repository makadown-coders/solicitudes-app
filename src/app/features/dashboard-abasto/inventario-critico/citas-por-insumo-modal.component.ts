import { ChangeDetectionStrategy, Component, HostListener, Input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Cita } from '../../../models/Cita';

/**
 * @deprecated
 * Este componente quedó en desuso a partir de NOV-2025.
 * Fue reemplazado conceptualmente por otros tabs del dashboard.
 * Si necesitas revivirlo, consulta el diseño original con el equipo de Abasto además que 
 * tiene pendiente adaptarlo a la nueva arquitectura.
 */
@Component({
  selector: 'app-citas-por-insumo-modal',
  standalone: true,
  imports: [DatePipe],
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

  @HostListener('document:keydown.escape', ['$event'])
    onEscapeKey(event: KeyboardEvent) {
        this.cerrar();
    }
}
