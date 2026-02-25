import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  RadarEstadoEvento,
  RadarEventoDetalle,
  RadarEventoHeader,
  RadarRiesgoNivel
} from '../../../models/radar-abasto/RadarAbastoModels';
import { RadarAbastoService } from '../../../services/radar-abasto.service';

@Component({
  selector: 'app-radar-abasto',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './radar-abasto.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RadarAbastoComponent implements OnInit {
  private radarService = inject(RadarAbastoService);

  loading = signal(false);
  errorMsg = signal<string | null>(null);
  rows = signal<RadarEventoHeader[]>([]);

  page = signal(1);
  pageSize = signal(20);
  total = signal(0);

  desde = signal(this.isoDateDaysAgo(30));
  hasta = signal(this.isoDateDaysAgo(0));
  clues = signal('');
  estado = signal<RadarEstadoEvento | ''>('');
  riesgoMin = signal<RadarRiesgoNivel | ''>('');

  detalleVisible = signal(false);
  detalleLoading = signal(false);
  detalleError = signal<string | null>(null);
  detalle = signal<RadarEventoDetalle | null>(null);
  editEstado = signal<RadarEstadoEvento>('abierto');
  editObservaciones = signal('');
  guardandoDetalle = signal(false);
  recalculando = signal(false);

  ngOnInit(): void {
    void this.cargar();
  }

  private isoDateDaysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }

  async cargar(resetPage = false) {
    if (resetPage) this.page.set(1);

    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      const out = await this.radarService.listarEventos({
        desde: this.desde(),
        hasta: this.hasta(),
        clues: (this.clues() || '').trim().toUpperCase(),
        estado: this.estado(),
        riesgoMin: this.riesgoMin(),
        page: this.page(),
        pageSize: this.pageSize()
      });
      this.rows.set(out.data ?? []);
      this.total.set(Number(out.total ?? 0));
    } catch {
      this.errorMsg.set('No se pudieron cargar los eventos del radar.');
      this.rows.set([]);
      this.total.set(0);
    } finally {
      this.loading.set(false);
    }
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total() / this.pageSize()));
  }

  nextPage() {
    if (this.page() >= this.totalPages) return;
    this.page.set(this.page() + 1);
    void this.cargar();
  }

  prevPage() {
    if (this.page() <= 1) return;
    this.page.set(this.page() - 1);
    void this.cargar();
  }

  async abrirDetalle(row: RadarEventoHeader) {
    this.detalleVisible.set(true);
    this.detalleLoading.set(true);
    this.detalleError.set(null);
    this.detalle.set(null);
    try {
      const d = await this.radarService.detalleEvento(row.id);
      this.detalle.set(d);
      this.editEstado.set(d.evento.estado);
      this.editObservaciones.set(d.evento.observaciones ?? '');
    } catch {
      this.detalleError.set('No se pudo cargar el detalle del evento.');
    } finally {
      this.detalleLoading.set(false);
    }
  }

  cerrarDetalle() {
    this.detalleVisible.set(false);
    this.detalleLoading.set(false);
    this.detalleError.set(null);
    this.detalle.set(null);
    this.guardandoDetalle.set(false);
    this.recalculando.set(false);
  }

  async guardarDetalle() {
    const d = this.detalle();
    if (!d) return;

    this.guardandoDetalle.set(true);
    this.detalleError.set(null);
    try {
      await this.radarService.patchEvento(d.evento.id, {
        estado: this.editEstado(),
        observaciones: this.editObservaciones()
      });
      await this.abrirDetalle(d.evento);
      await this.cargar();
    } catch {
      this.detalleError.set('No se pudo actualizar el evento.');
    } finally {
      this.guardandoDetalle.set(false);
    }
  }

  async recalcularActual() {
    const d = this.detalle();
    if (!d) return;

    this.recalculando.set(true);
    this.detalleError.set(null);
    try {
      await this.radarService.recalcularEvento(d.evento.id);
      await this.abrirDetalle(d.evento);
      await this.cargar();
    } catch {
      this.detalleError.set('No se pudo recalcular el evento.');
    } finally {
      this.recalculando.set(false);
    }
  }

  badgeRiesgoClass(nivel: RadarRiesgoNivel | null | undefined): string {
    if (nivel === 'CRITICO') return 'bg-red-100 text-red-800 border-red-200';
    if (nivel === 'ALTO') return 'bg-orange-100 text-orange-800 border-orange-200';
    if (nivel === 'MEDIO') return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  }

  badgeEstadoClass(estado: RadarEstadoEvento | null | undefined): string {
    if (estado === 'cerrado') return 'bg-slate-100 text-slate-800 border-slate-200';
    if (estado === 'en_seguimiento') return 'bg-blue-100 text-blue-800 border-blue-200';
    return 'bg-green-100 text-green-800 border-green-200';
  }
}
