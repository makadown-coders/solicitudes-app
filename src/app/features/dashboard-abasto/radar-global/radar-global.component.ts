import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { RadarGlobalClaveRiesgoRow, RadarGlobalSolicitudRow } from '../../../models/radar-abasto/RadarAbastoModels';
import { ArticulosService } from '../../../services/articulos.service';
import { RadarAbastoService } from '../../../services/radar-abasto.service';
import { UnidadesService } from '../../../services/unidades.service';
import { MaxLengthPipe } from '../../../shared/max-length.pipe';

@Component({
  selector: 'app-radar-global',
  standalone: true,
  imports: [CommonModule, FormsModule, MaxLengthPipe],
  templateUrl: './radar-global.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RadarGlobalComponent implements OnInit {
  private radarService = inject(RadarAbastoService);
  private unidadesService = inject(UnidadesService);
  private articulosService = inject(ArticulosService);

  mode = signal<'snapshot' | 'timeline' | 'claves-riesgo'>('snapshot');
  vistaRiesgo = signal<'desabasto' | 'sobreabasto'>('desabasto');
  loading = signal(false);
  errorMsg = signal<string | null>(null);
  rows = signal<RadarGlobalSolicitudRow[]>([]);
  riesgoRows = signal<RadarGlobalClaveRiesgoRow[]>([]);
  previewClavesRows = signal<RadarGlobalClaveRiesgoRow[]>([]);
  topDesabasto = signal<RadarGlobalClaveRiesgoRow[]>([]);
  topSobreabasto = signal<RadarGlobalClaveRiesgoRow[]>([]);

  clues = signal('');
  tipoPedido = signal('');
  tiposInsumo = signal('');
  months = signal(3);
  minSolicitado = signal(1);

  page = signal(1);
  pageSize = signal(25);
  total = signal(0);

  summaryCombinaciones = signal(0);
  summaryRegistros = signal(0);
  summaryRenglones = signal(0);
  summaryPiezas = signal(0);
  topLimit = 5;
  unidadesByClues = signal<Map<string, string>>(new Map());
  articulosMap = signal<Record<string, { descripcion: string; presentacion?: string }>>({});
  topRiesgoVisible = computed(() => this.vistaRiesgo() === 'desabasto' ? this.topDesabasto() : this.topSobreabasto());

  topCluesConTopClaves = computed(() => {
    const byClues = new Map<string, {
      cluesimb: string;
      total_solicitado: number;
      claves_distintas: number;
      top_claves: Array<{ clave: string; solicitado: number }>;
    }>();
    const byCluesClave = new Map<string, Map<string, number>>();

    for (const row of this.previewClavesRows()) {
      const clues = (row.cluesimb || '').trim().toUpperCase();
      const clave = (row.clave || '').trim().toUpperCase();
      if (!clues || !clave) continue;

      const solicitado = Number(row.solicitado_periodo ?? 0) || 0;
      const mapClave = byCluesClave.get(clues) ?? new Map<string, number>();
      mapClave.set(clave, (mapClave.get(clave) ?? 0) + solicitado);
      byCluesClave.set(clues, mapClave);
    }

    for (const [clues, mapClave] of byCluesClave.entries()) {
      const topClaves = Array.from(mapClave.entries())
        .map(([clave, solicitado]) => ({ clave, solicitado }))
        .sort((a, b) => b.solicitado - a.solicitado || a.clave.localeCompare(b.clave))
        .slice(0, 5);

      byClues.set(clues, {
        cluesimb: clues,
        total_solicitado: Array.from(mapClave.values()).reduce((acc, n) => acc + n, 0),
        claves_distintas: mapClave.size,
        top_claves: topClaves,
      });
    }

    return Array.from(byClues.values())
      .sort((a, b) => b.total_solicitado - a.total_solicitado || b.claves_distintas - a.claves_distintas || a.cluesimb.localeCompare(b.cluesimb))
      .slice(0, this.topLimit);
  });

  topClavesGlobales = computed(() => {
    const byClave = new Map<string, number>();

    for (const row of this.previewClavesRows()) {
      const clave = (row.clave || '').trim().toUpperCase();
      if (!clave) continue;
      const solicitado = Number(row.solicitado_periodo ?? 0) || 0;
      byClave.set(clave, (byClave.get(clave) ?? 0) + solicitado);
    }

    return Array.from(byClave.entries())
      .map(([clave, solicitado]) => ({ clave, solicitado }))
      .sort((a, b) => b.solicitado - a.solicitado || a.clave.localeCompare(b.clave))
      .slice(0, this.topLimit);
  });

  topClavesPorRiesgo = computed(() => {
    const byClave = new Map<string, {
      clave: string;
      criticos: number;
      altos_desabasto: number;
      altos_sobreabasto: number;
      solicitado: number;
      score: number;
    }>();

    for (const row of this.previewClavesRows()) {
      const clave = (row.clave || '').trim().toUpperCase();
      if (!clave) continue;

      const current = byClave.get(clave) ?? {
        clave,
        criticos: 0,
        altos_desabasto: 0,
        altos_sobreabasto: 0,
        solicitado: 0,
        score: 0,
      };

      current.solicitado += Number(row.solicitado_periodo ?? 0) || 0;
      if (row.nivel_desabasto === 'CRITICO') current.criticos += 1;
      if (row.nivel_desabasto === 'ALTO') current.altos_desabasto += 1;
      if (row.nivel_sobreabasto === 'ALTO') current.altos_sobreabasto += 1;
      current.score += Math.max(Number(row.puntaje_desabasto ?? 0) || 0, Number(row.puntaje_sobreabasto ?? 0) || 0);

      byClave.set(clave, current);
    }

    return Array.from(byClave.values())
      .sort((a, b) =>
        b.criticos - a.criticos
        || b.altos_desabasto - a.altos_desabasto
        || b.altos_sobreabasto - a.altos_sobreabasto
        || b.score - a.score
        || b.solicitado - a.solicitado
        || a.clave.localeCompare(b.clave))
      .slice(0, this.topLimit);
  });

  ngOnInit(): void {
    void this.cargarNombresUnidades();
    void this.cargarMapaArticulos();
    void this.cargar();
  }

  private async cargarNombresUnidades(): Promise<void> {
    try {
      const rows = await firstValueFrom(this.unidadesService.load());
      const map = new Map<string, string>();
      for (const row of rows ?? []) {
        const clues = (row.cluesimb || '').trim().toUpperCase();
        const nombre = (row.nombre || '').trim();
        if (clues && nombre) map.set(clues, nombre);
      }
      this.unidadesByClues.set(map);
    } catch {
      this.unidadesByClues.set(new Map());
    }
  }

  nombreUnidad(cluesimb: string | null | undefined): string {
    const key = (cluesimb || '').trim().toUpperCase();
    if (!key) return '';
    return this.unidadesByClues().get(key) ?? '';
  }

  private async cargarMapaArticulos(): Promise<void> {
    try {
      const map = await firstValueFrom(this.articulosService.getArticulosMapa());
      this.articulosMap.set(map ?? {});
    } catch {
      try {
        const fallback = await firstValueFrom(this.articulosService.getArticulosMapaLegacy());
        this.articulosMap.set(fallback ?? {});
      } catch {
        this.articulosMap.set({});
      }
    }
  }

  descripcionClave(clave: string | null | undefined): string {
    const key = String(clave ?? '').trim().toUpperCase();
    if (!key) return '';
    return this.articulosMap()[key]?.descripcion ?? '';
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total() / this.pageSize()));
  }

  async cargar(resetPage = false): Promise<void> {
    if (resetPage) this.page.set(1);

    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      if (this.mode() === 'snapshot') {
        const out = await this.radarService.listarGlobalSnapshot({
          clues: (this.clues() || '').trim().toUpperCase(),
          tipo_pedido: (this.tipoPedido() || '').trim().toUpperCase(),
          tipos_insumo: (this.tiposInsumo() || '').trim().toUpperCase(),
          page: this.page(),
          pageSize: this.pageSize(),
        });

        this.rows.set(out.data ?? []);
        this.total.set(Number(out.total ?? 0));
        this.summaryCombinaciones.set(Number(out.summary?.total_combinaciones ?? 0));
        this.summaryRegistros.set(0);
        this.summaryRenglones.set(Number(out.summary?.total_renglones ?? 0));
        this.summaryPiezas.set(Number(out.summary?.total_piezas ?? 0));
        this.riesgoRows.set([]);
        this.topDesabasto.set([]);
        this.topSobreabasto.set([]);
        await this.cargarPreviewClaves();
      } else {
        if (this.mode() === 'timeline') {
          const out = await this.radarService.listarGlobalTimeline({
            clues: (this.clues() || '').trim().toUpperCase(),
            tipo_pedido: (this.tipoPedido() || '').trim().toUpperCase(),
            tipos_insumo: (this.tiposInsumo() || '').trim().toUpperCase(),
            months: this.months(),
            page: this.page(),
            pageSize: this.pageSize(),
          });

          this.rows.set(out.data ?? []);
          this.total.set(Number(out.total ?? 0));
          this.summaryCombinaciones.set(0);
          this.summaryRegistros.set(Number(out.summary?.total_registros ?? 0));
          this.summaryRenglones.set(Number(out.summary?.total_renglones ?? 0));
          this.summaryPiezas.set(Number(out.summary?.total_piezas ?? 0));
          this.riesgoRows.set([]);
          this.topDesabasto.set([]);
          this.topSobreabasto.set([]);
          await this.cargarPreviewClaves();
        } else {
          const out = await this.radarService.listarGlobalClavesRiesgo({
            clues: (this.clues() || '').trim().toUpperCase(),
            tipo_pedido: (this.tipoPedido() || '').trim().toUpperCase(),
            tipos_insumo: (this.tiposInsumo() || '').trim().toUpperCase(),
            months: this.months(),
            minSolicitado: this.minSolicitado(),
            page: this.page(),
            pageSize: this.pageSize(),
          });

          this.rows.set([]);
          this.riesgoRows.set(out.data ?? []);
          this.previewClavesRows.set(out.data ?? []);
          this.topDesabasto.set(out.top_desabasto ?? []);
          this.topSobreabasto.set(out.top_sobreabasto ?? []);
          this.total.set(Number(out.total ?? 0));
          this.summaryCombinaciones.set(0);
          this.summaryRegistros.set(Number(out.total ?? 0));
          this.summaryRenglones.set(
            (out.data ?? []).reduce((acc, row) => acc + (Number(row.renglones_solicitados ?? 0) || 0), 0)
          );
          this.summaryPiezas.set(
            (out.data ?? []).reduce((acc, row) => acc + (Number(row.solicitado_periodo ?? 0) || 0), 0)
          );
        }
      }
    } catch {
      this.errorMsg.set('No se pudo cargar el radar global.');
      this.rows.set([]);
      this.total.set(0);
      this.summaryCombinaciones.set(0);
      this.summaryRegistros.set(0);
      this.summaryRenglones.set(0);
      this.summaryPiezas.set(0);
      this.riesgoRows.set([]);
      this.previewClavesRows.set([]);
      this.topDesabasto.set([]);
      this.topSobreabasto.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private async cargarPreviewClaves(): Promise<void> {
    try {
      const out = await this.radarService.listarGlobalClavesRiesgo({
        clues: (this.clues() || '').trim().toUpperCase(),
        tipo_pedido: (this.tipoPedido() || '').trim().toUpperCase(),
        tipos_insumo: (this.tiposInsumo() || '').trim().toUpperCase(),
        months: this.months(),
        minSolicitado: 0,
        page: 1,
        pageSize: 400,
      });
      this.previewClavesRows.set(out.data ?? []);
    } catch {
      this.previewClavesRows.set([]);
    }
  }

  cambiarModo(nextMode: 'snapshot' | 'timeline' | 'claves-riesgo'): void {
    if (this.mode() === nextMode) return;
    this.mode.set(nextMode);
    if (nextMode !== 'claves-riesgo') this.vistaRiesgo.set('desabasto');
    void this.cargar(true);
  }

  cambiarVistaRiesgo(next: 'desabasto' | 'sobreabasto'): void {
    this.vistaRiesgo.set(next);
  }

  prevPage(): void {
    this.goTo(this.page() - 1);
  }

  nextPage(): void {
    this.goTo(this.page() + 1);
  }

  goTo(targetPage: number): void {
    const next = Math.min(this.totalPages, Math.max(1, Math.trunc(targetPage)));
    if (next === this.page()) return;
    this.page.set(next);
    void this.cargar();
  }

  jump(delta: number): void {
    this.goTo(this.page() + delta);
  }

  changePageSize(nextPageSize: number): void {
    const n = Number(nextPageSize);
    if (!Number.isFinite(n) || n <= 0) return;
    const safeSize = Math.trunc(n);
    if (safeSize === this.pageSize() && this.page() === 1) return;
    this.pageSize.set(safeSize);
    this.page.set(1);
    void this.cargar();
  }

  badgeDesabasto(level: RadarGlobalClaveRiesgoRow['nivel_desabasto']): string {
    if (level === 'CRITICO') return 'bg-red-100 text-red-800 border-red-200';
    if (level === 'ALTO') return 'bg-orange-100 text-orange-800 border-orange-200';
    if (level === 'MEDIO') return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  }

  badgeSobreabasto(level: RadarGlobalClaveRiesgoRow['nivel_sobreabasto']): string {
    if (level === 'ALTO') return 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200';
    if (level === 'MEDIO') return 'bg-indigo-100 text-indigo-800 border-indigo-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  }

  rowClassRiesgo(row: RadarGlobalClaveRiesgoRow): string {
    if (this.vistaRiesgo() === 'desabasto') {
      if (row.nivel_desabasto === 'CRITICO') return 'bg-red-50/70 dark:bg-red-950/20';
      if (row.nivel_desabasto === 'ALTO') return 'bg-orange-50/70 dark:bg-orange-950/20';
      if (row.nivel_desabasto === 'MEDIO') return 'bg-amber-50/70 dark:bg-amber-950/20';
      return '';
    }

    if (row.nivel_sobreabasto === 'ALTO') return 'bg-fuchsia-50/70 dark:bg-fuchsia-950/20';
    if (row.nivel_sobreabasto === 'MEDIO') return 'bg-indigo-50/70 dark:bg-indigo-950/20';
    return '';
  }

  iconoDesabasto(level: RadarGlobalClaveRiesgoRow['nivel_desabasto']): string {
    if (level === 'CRITICO') return '▲';
    if (level === 'ALTO') return '▲';
    if (level === 'MEDIO') return '◆';
    return '●';
  }

  iconoSobreabasto(level: RadarGlobalClaveRiesgoRow['nivel_sobreabasto']): string {
    if (level === 'ALTO') return '⬤';
    if (level === 'MEDIO') return '◉';
    return '○';
  }
}
