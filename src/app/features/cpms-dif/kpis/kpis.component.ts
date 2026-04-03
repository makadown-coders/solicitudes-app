import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { LucideAngularModule, Activity, Building2, CircleGauge, ShieldAlert, TrendingUp } from 'lucide-angular';
import { CpmsDifComposicionUnidadRow, CpmsDifIndicadoresResponse } from '../models';
import { CpmsDifService } from '../cpms-dif.service';

@Component({
  selector: 'app-kpis',
  standalone: true,
  imports: [CommonModule, BaseChartDirective, LucideAngularModule],
  templateUrl: './kpis.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KpisComponent {
  cargando = signal(false);
  indicadores = signal<CpmsDifIndicadoresResponse | null>(null);

  readonly kpis = computed(() => this.indicadores()?.kpis ?? null);
  readonly charts = computed(() => this.indicadores()?.charts ?? null);
  readonly insightPrincipal = computed(() =>
    this.indicadores()?.lectura_ejecutiva || 'No se detectan diferencias cargadas en este momento.'
  );

  doughnutChartData: ChartConfiguration<'doughnut'>['data'] = {
    labels: ['Agregados', 'Eliminados', 'Modificados'],
    datasets: [{ data: [0, 0, 0] }]
  };

  doughnutChartOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' }
    }
  };

  topDiferenciasChartData: ChartConfiguration<'bar'>['data'] = {
    labels: [],
    datasets: []
  };

  topImpactoChartData: ChartConfiguration<'bar'>['data'] = {
    labels: [],
    datasets: []
  };

  stackedChartData: ChartConfiguration<'bar'>['data'] = {
    labels: [],
    datasets: []
  };

  barChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { display: false }
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: { color: 'rgba(148, 163, 184, 0.18)' }
      },
      y: {
        grid: { display: false }
      }
    }
  };

  stackedBarOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' }
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false }
      },
      y: {
        stacked: true,
        beginAtZero: true,
        grid: { color: 'rgba(148, 163, 184, 0.18)' }
      }
    }
  };

  readonly ActivityIcon = Activity;
  readonly Building2Icon = Building2;
  readonly CircleGaugeIcon = CircleGauge;
  readonly ShieldAlertIcon = ShieldAlert;
  readonly TrendingUpIcon = TrendingUp;

  constructor(private service: CpmsDifService) {
    this.load();
  }

  load() {
    this.cargando.set(true);
    this.service.getIndicadores().subscribe({
      next: (res) => {
        this.indicadores.set(res);
        this.buildCharts(res);
        this.cargando.set(false);
      },
      error: (err) => {
        console.error('Error loading indicadores de CPMS DIF:', err);
        this.cargando.set(false);
      }
    });
  }

  private buildCharts(indicadores: CpmsDifIndicadoresResponse) {
    const topDiferencias = indicadores.charts.top_unidades_por_diferencias ?? [];
    const topImpacto = indicadores.charts.top_unidades_por_impacto ?? [];
    const topStacked = (indicadores.charts.composicion_por_unidad ?? [])
      .filter((row) => row.total_diferencias > 0)
      .slice(0, 8);

    const shortLabel = (row: { nombre_de_unidad: string; cluesimb: string }) =>
      (row.nombre_de_unidad || row.cluesimb || '').slice(0, 32);

    this.doughnutChartData = {
      labels: (indicadores.charts.distribucion_acciones ?? []).map((item) => item.label),
      datasets: [{
        data: (indicadores.charts.distribucion_acciones ?? []).map((item) => item.value),
        backgroundColor: ['#16a34a', '#e11d48', '#f59e0b'],
        borderColor: ['#dcfce7', '#ffe4e6', '#fef3c7'],
        borderWidth: 2
      }]
    };

    this.topDiferenciasChartData = {
      labels: topDiferencias.map(shortLabel),
      datasets: [{
        data: topDiferencias.map((row) => row.total_diferencias),
        label: 'Diferencias',
        backgroundColor: '#0f766e',
        borderRadius: 8,
      }]
    };

    this.topImpactoChartData = {
      labels: topImpacto.map(shortLabel),
      datasets: [{
        data: topImpacto.map((row) => row.impacto_absoluto_total),
        label: 'Impacto absoluto',
        backgroundColor: '#2563eb',
        borderRadius: 8,
      }]
    };

    this.stackedChartData = {
      labels: topStacked.map(shortLabel),
      datasets: [
        {
          label: 'Agregados',
          data: topStacked.map((row: CpmsDifComposicionUnidadRow) => row.agregados),
          backgroundColor: '#16a34a',
          borderRadius: 6,
        },
        {
          label: 'Eliminados',
          data: topStacked.map((row: CpmsDifComposicionUnidadRow) => row.eliminados),
          backgroundColor: '#e11d48',
          borderRadius: 6,
        },
        {
          label: 'Modificados (+)',
          data: topStacked.map((row: CpmsDifComposicionUnidadRow) => row.modificados_mas),
          backgroundColor: '#f59e0b',
          borderRadius: 6,
        },
        {
          label: 'Modificados (-)',
          data: topStacked.map((row: CpmsDifComposicionUnidadRow) => row.modificados_menos),
          backgroundColor: '#fbbf24',
          borderRadius: 6,
        },
      ]
    };
  }
}
