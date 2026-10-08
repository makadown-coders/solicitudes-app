import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, ClipboardCheck, Trash2, X } from 'lucide-angular';
import { SandboxSolicitudItem } from '../../solicitud-unidad-sandbox.models';

@Component({
  selector: 'app-solicitud-resumen-sandbox',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './solicitud-resumen.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SolicitudResumenSandboxComponent {
  @Input({ required: true }) items: SandboxSolicitudItem[] = [];
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
}
