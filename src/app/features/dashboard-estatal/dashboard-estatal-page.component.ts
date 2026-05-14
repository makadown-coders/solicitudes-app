// src/app/features/dashboard-estatal/dashboard-estatal-page.component.ts
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { catchError, debounceTime, distinctUntilChanged, forkJoin, map, of, Subject, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { Download, LucideAngularModule, Search } from 'lucide-angular';
import {
  DashboardEstatalClave,
  DashboardEstatalOrdenPendiente,
  DashboardEstatalResumenClave,
  RiesgoFaltante,
  RiesgoSobreabasto,
} from '../../models/dashboard-estatal';
import { DashboardEstatalService } from '../../services/dashboard-estatal.service';
import { OrdenesPendientesModalComponent } from './ordenes-pendientes-modal.component';
import { DashboardEstatalExcelExporter } from '../../services/excel/dashboard-estatal-excel-exporter';

interface DashboardEstatalKpi {
  label: string;
  value: number | string;
  emphasis?: 'risk' | 'plain';
  risk?: RiesgoFaltante | RiesgoSobreabasto;
}

@Component({
  selector: 'app-dashboard-estatal-page',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, OrdenesPendientesModalComponent],
  templateUrl: './dashboard-estatal-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardEstatalPageComponent {
  private dashboardEstatalService = inject(DashboardEstatalService);
  private destroyRef = inject(DestroyRef);
  private searchTerms = new Subject<string>();
  private readonly excelFaltantesLimit = 10000;

  readonly SearchIcon = Search;
  readonly DownloadIcon = Download;
  readonly windowDays = signal(120);

  searchText = signal('');
  suggestions = signal<DashboardEstatalClave[]>([]);
  searchedTerm = signal('');
  selectedClave = signal<DashboardEstatalClave | null>(null);
  resumen = signal<DashboardEstatalResumenClave | null>(null);
  topSobreabasto = signal<DashboardEstatalResumenClave[]>([]);
  topFaltantes = signal<DashboardEstatalResumenClave[]>([]);
  modalOrdenesClave = signal<DashboardEstatalClave | null>(null);

  loadingSearch = signal(false);
  loadingResumen = signal(false);
  loadingTop = signal(false);
  exportingExcel = signal(false);
  errorSearch = signal<string | null>(null);
  errorResumen = signal<string | null>(null);
  errorTop = signal<string | null>(null);
  errorExport = signal<string | null>(null);

  hasNoSearchResults = computed(() => {
    const term = this.searchText().trim();

    return term.length >= 2
      && this.searchedTerm() === term
      && !this.loadingSearch()
      && !this.errorSearch()
      && this.suggestions().length === 0;
  });

  hasSearchPanel = computed(() =>
    this.suggestions().length > 0
    || this.loadingSearch()
    || !!this.errorSearch()
    || this.hasNoSearchResults()
  );

  kpis = computed<DashboardEstatalKpi[]>(() => {
    const row = this.resumen();
    if (!row) return [];

    return [
      { label: 'Riesgo faltante', value: row.riesgo_faltante, emphasis: 'risk', risk: row.riesgo_faltante },
      { label: 'Riesgo sobreabasto', value: row.riesgo_sobreabasto, emphasis: 'risk', risk: row.riesgo_sobreabasto },
      { label: 'Piezas pendientes', value: row.piezas_pendientes },
      { label: 'Existencia estatal', value: row.existencia_estatal },
      { label: 'CPM estatal', value: row.cpm_estatal },
      { label: 'CPM x3 estatal', value: row.cpm_x_3_estatal },
      { label: 'CPMs equivalentes', value: row.cpms_equivalentes ?? 'N/A' },
      { label: 'Órdenes pendientes', value: row.ordenes_pendientes },
    ];
  });

  constructor() {
    this.searchTerms.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(term => {
        const cleanTerm = term.trim();
        this.errorSearch.set(null);

        if (cleanTerm.length < 2) {
          this.loadingSearch.set(false);
          this.searchedTerm.set('');
          return of({ term: cleanTerm, response: { ok: true, count: 0, data: [] } });
        }

        this.loadingSearch.set(true);
        return this.dashboardEstatalService.buscarClaves(cleanTerm, 20).pipe(
          map(response => ({ term: cleanTerm, response })),
          catchError(() => {
            this.errorSearch.set('No se pudieron buscar claves.');
            return of({ term: cleanTerm, response: { ok: false, count: 0, data: [] } });
          })
        );
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(({ term, response }) => {
      this.suggestions.set(response.data ?? []);
      this.searchedTerm.set(term);
      this.loadingSearch.set(false);
    });

    void this.cargarTop();
  }

  onSearchChange(value: string): void {
    this.searchText.set(value);
    this.suggestions.set([]);
    this.searchedTerm.set('');
    this.selectedClave.set(null);
    this.resumen.set(null);
    this.searchTerms.next(value);
  }

  async seleccionarClave(item: DashboardEstatalClave): Promise<void> {
    this.selectedClave.set(item);
    this.searchText.set(`${item.clave_cnis} - ${item.descripcion ?? ''}`.trim());
    this.suggestions.set([]);
    await this.cargarResumenClave(item.clave_cnis);
  }

  async cargarResumenClave(claveCnis: string): Promise<void> {
    this.loadingResumen.set(true);
    this.errorResumen.set(null);
    this.resumen.set(null);

    try {
      const response = await firstValueFrom(
        this.dashboardEstatalService.obtenerResumenClave(claveCnis, this.windowDays())
      );
      this.resumen.set(response.data ?? null);
    } catch {
      this.errorResumen.set('No se pudo cargar el resumen estatal de la clave.');
    } finally {
      this.loadingResumen.set(false);
    }
  }

  async cargarTop(): Promise<void> {
    this.loadingTop.set(true);
    this.errorTop.set(null);

    try {
      const response = await firstValueFrom(
        this.dashboardEstatalService.obtenerTop(this.windowDays(), 10)
      );
      this.topSobreabasto.set(response.data?.top_sobreabasto ?? []);
      this.topFaltantes.set(response.data?.top_faltantes ?? []);
    } catch {
      this.errorTop.set('No se pudieron cargar los tops estatales.');
      this.topSobreabasto.set([]);
      this.topFaltantes.set([]);
    } finally {
      this.loadingTop.set(false);
    }
  }

  abrirOrdenesPendientes(row: DashboardEstatalResumenClave): void {
    if (!row.ordenes_pendientes || row.ordenes_pendientes <= 0) return;
    this.modalOrdenesClave.set({ clave_cnis: row.clave_cnis, descripcion: row.descripcion });
  }

  cerrarOrdenesPendientes(): void {
    this.modalOrdenesClave.set(null);
  }

  async exportarExcel(): Promise<void> {
    this.exportingExcel.set(true);
    this.errorExport.set(null);

    try {
      const faltantesParaExport = await this.cargarFaltantesParaExport();
      const [ordenesFaltantes, ordenesSobreabasto] = await Promise.all([
        this.cargarOrdenesParaExport(faltantesParaExport),
        this.cargarOrdenesParaExport(this.topSobreabasto()),
      ]);

      const notas: string[] = [];
      notas.push('La hoja de faltantes incluye claves con CPMs equivalentes >= 0 y < 1, solicitadas al backend con un limite amplio para exportacion.');
      if (faltantesParaExport.length >= this.excelFaltantesLimit) {
        notas.push(`El listado de faltantes llego al limite de ${this.excelFaltantesLimit} registros; podria requerir un endpoint paginado/dedicado para garantizar universo completo.`);
      }
      if (ordenesFaltantes.errorCount + ordenesSobreabasto.errorCount > 0) {
        notas.push('No se pudieron cargar algunas órdenes pendientes. Verifica que el endpoint /dashboard-estatal/ordenes-pendientes esté disponible en backend.');
      }

      const exporter = new DashboardEstatalExcelExporter();
      await exporter.exportar(
        `Dashboard_Estatal_${this.dateStamp()}.xlsx`,
        {
          windowDays: this.windowDays(),
          topFaltantes: faltantesParaExport,
          topSobreabasto: this.topSobreabasto(),
          ordenesFaltantes: ordenesFaltantes.rows,
          ordenesSobreabasto: ordenesSobreabasto.rows,
          notas,
        }
      );
    } catch {
      this.errorExport.set('No se pudo generar el Excel del dashboard estatal.');
    } finally {
      this.exportingExcel.set(false);
    }
  }

  riskClass(risk: RiesgoFaltante | RiesgoSobreabasto | string | null | undefined): string {
    if (risk === 'CRITICO') return 'bg-red-100 text-red-900 border-red-200';
    if (risk === 'ALTO') return 'bg-red-50 text-red-800 border-red-200';
    if (risk === 'MEDIO') return 'bg-amber-50 text-amber-800 border-amber-200';
    return 'bg-emerald-50 text-emerald-800 border-emerald-100';
  }

  riskRowClass(risk: RiesgoFaltante | RiesgoSobreabasto | string | null | undefined): string {
    if (risk === 'CRITICO') return 'bg-red-50/60';
    if (risk === 'ALTO') return 'bg-orange-50/60';
    if (risk === 'MEDIO') return 'bg-amber-50/60';
    return '';
  }

  trackClave(row: DashboardEstatalClave): string {
    return row.clave_cnis;
  }

  trackResumen(row: DashboardEstatalResumenClave): string {
    return row.clave_cnis;
  }

  private async cargarOrdenesParaExport(rows: DashboardEstatalResumenClave[]): Promise<{
    rows: DashboardEstatalOrdenPendiente[];
    errorCount: number;
  }> {
    const rowsConOrdenes = rows.filter(row => row.ordenes_pendientes > 0);
    if (rowsConOrdenes.length === 0) {
      return { rows: [], errorCount: 0 };
    }

    const requests = rowsConOrdenes.map(row =>
      this.dashboardEstatalService.obtenerOrdenesPendientes(row.clave_cnis, this.windowDays()).pipe(
        map(response => ({
          rows: (response.data ?? []).map(order => ({
            ...order,
            clave_cnis: order.clave_cnis || row.clave_cnis,
            descripcion: order.descripcion ?? row.descripcion,
          })),
          failed: false,
        })),
        catchError(() => of({ rows: [] as DashboardEstatalOrdenPendiente[], failed: true }))
      )
    );

    const responses = await firstValueFrom(forkJoin(requests));
    return {
      rows: responses.flatMap(response => response.rows),
      errorCount: responses.filter(response => response.failed).length,
    };
  }

  private async cargarFaltantesParaExport(): Promise<DashboardEstatalResumenClave[]> {
    const response = await firstValueFrom(
      this.dashboardEstatalService.obtenerTop(this.windowDays(), this.excelFaltantesLimit)
    );

    return (response.data?.top_faltantes ?? [])
      .filter(row => this.esFaltantePorCpmsEquivalentes(row));
  }

  private esFaltantePorCpmsEquivalentes(row: DashboardEstatalResumenClave): boolean {
    const cpmsEquivalentes = Number(row.cpms_equivalentes);
    return Number.isFinite(cpmsEquivalentes) && cpmsEquivalentes >= 0 && cpmsEquivalentes < 1;
  }

  private dateStamp(): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');

    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  }
}
