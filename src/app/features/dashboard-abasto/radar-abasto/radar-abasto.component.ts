import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  RadarEstadoEvento,
  RadarEventoDetalle,
  RadarEventoHeader,
  RadarRiesgoNivel
} from '../../../models/radar-abasto/RadarAbastoModels';
import { RadarAbastoService } from '../../../services/radar-abasto.service';
import { CitasService } from '../../../services/citas.service';

@Component({
  selector: 'app-radar-abasto',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './radar-abasto.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RadarAbastoComponent implements OnInit {
  private radarService = inject(RadarAbastoService);
  private citasService = inject(CitasService);

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
  ordenesByClave = signal<Map<string, { text: string; count: number }>>(new Map());
  ordenesLoadingByClave = signal<Set<string>>(new Set());
  ordenesErrorByClave = signal<Map<string, string>>(new Map());
  ordenesBulkLoading = signal(false);

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
    this.ordenesByClave.set(new Map());
    this.ordenesLoadingByClave.set(new Set());
    this.ordenesErrorByClave.set(new Map());
    this.ordenesBulkLoading.set(false);
    try {
      const d = await this.radarService.detalleEvento(row.id);
      this.detalle.set(d);
      this.editEstado.set(d.evento.estado);
      this.editObservaciones.set(d.evento.observaciones ?? '');
      void this.cargarOrdenesEvento();
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
    this.ordenesByClave.set(new Map());
    this.ordenesLoadingByClave.set(new Set());
    this.ordenesErrorByClave.set(new Map());
    this.ordenesBulkLoading.set(false);
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

  private keyClave(clave: string): string {
    return (clave ?? '').trim().toUpperCase();
  }

  private parseDateOrNull(value: unknown): Date | null {
    if (!value) return null;
    const d = new Date(value as any);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private formatDateYmd(value: unknown): string {
    if (!value) return '';
    if (typeof value === 'string') {
      const m = value.match(/^\d{4}-\d{2}-\d{2}/);
      if (m?.[0]) return m[0];
    }
    const d = this.parseDateOrNull(value);
    return d ? d.toISOString().slice(0, 10) : '';
  }

  private buildOrdenesTexto(rows: any[]): { text: string; count: number } {
    const hoy = new Date();
    hoy.setHours(23, 59, 59, 999);

    const limiteAtras = new Date();
    limiteAtras.setDate(limiteAtras.getDate() - 15);
    limiteAtras.setHours(0, 0, 0, 0);

    const out: string[] = [];
    const seen = new Set<string>();

    for (const cita of (rows ?? [])) {
      const fechaEntregado = this.parseDateOrNull((cita?.fecha_recepcion_lista && cita.fecha_recepcion_lista[0]) ?? null);
      const fechaLimite = this.parseDateOrNull(cita?.fecha_limite_de_entrega);

      const esEntregadaReciente = !!fechaEntregado && fechaEntregado >= limiteAtras && fechaEntregado <= hoy;
      const esPendiente = !fechaEntregado && !!fechaLimite && fechaLimite >= limiteAtras;
      if (!esEntregadaReciente && !esPendiente) continue;

      const orden = String(cita?.orden_de_suministro ?? '').trim();
      if (!orden) continue;

      const fechaTipo = esEntregadaReciente ? 'entregado' : 'fecha limite';
      const fecha = esEntregadaReciente ? this.formatDateYmd(fechaEntregado) : this.formatDateYmd(fechaLimite);
      const unidad = String(cita?.unidad ?? 'SIN UNIDAD').trim().toUpperCase();
      const tipoCompra = String(cita?.compra ?? 'Sin tipo').trim();
      const piezas = Number(cita?.no_de_piezas_emitidas ?? 0) || 0;

      const dedupeKey = `${orden}|${fechaTipo}|${fecha}|${unidad}|${piezas}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      out.push(`${unidad} - ${orden} (${tipoCompra} - ${piezas} piezas - ${fechaTipo} ${fecha})`);
    }

    out.sort((a, b) => a.localeCompare(b));
    return { text: out.join('\n'), count: out.length };
  }

  async cargarOrdenesClave(clave: string, forceRefresh = false) {
    const k = this.keyClave(clave);
    if (!k) return;

    const current = this.ordenesByClave();
    if (!forceRefresh && current.has(k)) return;

    const loadingSet = new Set(this.ordenesLoadingByClave());
    loadingSet.add(k);
    this.ordenesLoadingByClave.set(loadingSet);

    const errorMap = new Map(this.ordenesErrorByClave());
    errorMap.delete(k);
    this.ordenesErrorByClave.set(errorMap);

    try {
      const resp = await firstValueFrom(this.citasService.getCitasPorClaveXClave({
        clave: k,
        windowDays: 15,
        incluyeNoRecibidas: true,
        limit: 500
      }));

      const parsed = this.buildOrdenesTexto((resp?.rows ?? []) as any[]);
      const map = new Map(this.ordenesByClave());
      map.set(k, parsed);
      this.ordenesByClave.set(map);
    } catch {
      const err = new Map(this.ordenesErrorByClave());
      err.set(k, 'No se pudieron cargar órdenes para esta clave.');
      this.ordenesErrorByClave.set(err);
    } finally {
      const s = new Set(this.ordenesLoadingByClave());
      s.delete(k);
      this.ordenesLoadingByClave.set(s);
    }
  }

  async cargarOrdenesEvento(forceRefresh = false) {
    const d = this.detalle();
    if (!d) return;

    const claves = (d.claves ?? []).map(x => this.keyClave(x.clave_cnis)).filter(Boolean);
    if (!claves.length) return;

    this.ordenesBulkLoading.set(true);
    try {
      for (let i = 0; i < claves.length; i += 4) {
        const chunk = claves.slice(i, i + 4);
        await Promise.all(chunk.map(c => this.cargarOrdenesClave(c, forceRefresh)));
      }
    } finally {
      this.ordenesBulkLoading.set(false);
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
