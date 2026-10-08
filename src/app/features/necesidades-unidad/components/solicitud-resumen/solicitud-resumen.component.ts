import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, ClipboardCheck, Trash2, X } from 'lucide-angular';
import { NecesidadItem } from '../../necesidades-unidad.models';

@Component({
  selector: 'app-resumen-necesidades',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './solicitud-resumen.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResumenNecesidadesComponent {
  @Input({ required: true }) items: NecesidadItem[] = [];
  @Input() permitirCerrar = false;
  @Output() cantidadChange = new EventEmitter<{ clave: string; cantidad: number }>();
  @Output() eliminar = new EventEmitter<string>();
  @Output() limpiar = new EventEmitter<void>();
  @Output() revisar = new EventEmitter<void>();
  @Output() cerrar = new EventEmitter<void>();
  readonly TrashIcon = Trash2;
  readonly ReviewIcon = ClipboardCheck;
  readonly CloseIcon = X;

  actualizar(clave: string, valor: unknown): void {
    const cantidad = Math.max(1, Math.min(99999, Math.trunc(Number(valor) || 1)));
    this.cantidadChange.emit({ clave, cantidad });
  }

  descripcionVisible(descripcion: string): string {
    const texto = (descripcion || 'Descripción no disponible').trim();
    return texto.length <= 100 ? texto : `${texto.slice(0, 99).trimEnd()}…`;
  }
}
