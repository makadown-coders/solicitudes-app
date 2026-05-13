import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { LucideAngularModule, X } from 'lucide-angular';

import { DashboardEstatalOrdenPendiente } from '../../models/dashboard-estatal';
import { DashboardEstatalService } from '../../services/dashboard-estatal.service';

@Component({
  selector: 'app-dashboard-estatal-ordenes-pendientes-modal',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ordenes-pendientes-modal.component.html',
})
export class OrdenesPendientesModalComponent implements OnChanges {
  private dashboardEstatalService = inject(DashboardEstatalService);

  @Input() visible = false;
  @Input() claveCnis: string | null = null;
  @Input() descripcion: string | null = null;
  @Input() windowDays = 120;
  @Output() closed = new EventEmitter<void>();

  readonly CloseIcon = X;

  ordenes = signal<DashboardEstatalOrdenPendiente[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['visible'] || changes['claveCnis']) && this.visible && this.claveCnis) {
      void this.cargarOrdenes();
    }
  }

  close(): void {
    this.closed.emit();
  }

  async cargarOrdenes(): Promise<void> {
    const clave = this.claveCnis;
    if (!clave) return;

    this.loading.set(true);
    this.error.set(null);
    this.ordenes.set([]);

    try {
      const response = await firstValueFrom(
        this.dashboardEstatalService.obtenerOrdenesPendientes(clave, this.windowDays)
      );
      this.ordenes.set(response.data ?? []);
    } catch {
      this.error.set('No se pudieron cargar las órdenes pendientes de esta clave.');
    } finally {
      this.loading.set(false);
    }
  }

  totalPiezas(): number {
    return this.ordenes().reduce((sum, row) => sum + (Number(row.piezas_pendientes) || 0), 0);
  }

  totalImporte(): number {
    return this.ordenes().reduce((sum, row) => sum + (Number(row.importe_pendiente) || 0), 0);
  }

  trackOrden(index: number, row: DashboardEstatalOrdenPendiente): string {
    return `${row.clave_cnis}-${row.orden_compra ?? row.folio ?? index}`;
  }
}
