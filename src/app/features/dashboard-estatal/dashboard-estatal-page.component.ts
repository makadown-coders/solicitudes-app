import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { catchError, debounceTime, distinctUntilChanged, of, Subject, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { LucideAngularModule, Search } from 'lucide-angular';
import {
  DashboardEstatalClave,
  DashboardEstatalResumenClave,
  RiesgoFaltante,
  RiesgoSobreabasto,
} from '../../models/dashboard-estatal';
import { DashboardEstatalService } from '../../services/dashboard-estatal.service';

interface DashboardEstatalKpi {
  label: string;
  value: number | string;
  emphasis?: 'risk' | 'plain';
  risk?: RiesgoFaltante | RiesgoSobreabasto;
}

@Component({
  selector: 'app-dashboard-estatal-page',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './dashboard-estatal-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardEstatalPageComponent {
  private dashboardEstatalService = inject(DashboardEstatalService);
  private destroyRef = inject(DestroyRef);
  private searchTerms = new Subject<string>();

  readonly SearchIcon = Search;
  readonly windowDays = signal(120);

  searchText = signal('');
  suggestions = signal<DashboardEstatalClave[]>([]);
  selectedClave = signal<DashboardEstatalClave | null>(null);
  resumen = signal<DashboardEstatalResumenClave | null>(null);
  topSobreabasto = signal<DashboardEstatalResumenClave[]>([]);
  topFaltantes = signal<DashboardEstatalResumenClave[]>([]);

  loadingSearch = signal(false);
  loadingResumen = signal(false);
  loadingTop = signal(false);
  errorSearch = signal<string | null>(null);
  errorResumen = signal<string | null>(null);
  errorTop = signal<string | null>(null);

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
      { label: 'Ordenes pendientes', value: row.ordenes_pendientes },
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
          return of({ ok: true, count: 0, data: [] });
        }

        this.loadingSearch.set(true);
        return this.dashboardEstatalService.buscarClaves(cleanTerm, 20).pipe(
          catchError(() => {
            this.errorSearch.set('No se pudieron buscar claves.');
            return of({ ok: false, count: 0, data: [] });
          })
        );
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(response => {
      this.suggestions.set(response.data ?? []);
      this.loadingSearch.set(false);
    });

    void this.cargarTop();
  }

  onSearchChange(value: string): void {
    this.searchText.set(value);
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
}
