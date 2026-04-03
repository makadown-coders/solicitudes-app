// src/app/features/cpms-dif/resumen/resumen.component.ts
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Building2, ChartColumnBig, Scale } from 'lucide-angular';
import { firstValueFrom } from 'rxjs';
import { CpmsDifService } from '../cpms-dif.service';
import { CpmsDifResponse, CpmsDifResumenRow, CpmsDifRow } from '../models';

@Component({
  selector: 'app-resumen',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './resumen.component.html',
  styles: []
})
export class ResumenComponent {
  data = signal<CpmsDifResponse<CpmsDifResumenRow> | null>(null);
  cargando = signal(false);
  modifiedSplit = signal<Record<string, { positivos: number; negativos: number }>>({});

  readonly totalUnidades = computed(() => this.data()?.rows.length ?? 0);
  readonly totalDiferencias = computed(() =>
    (this.data()?.rows ?? []).reduce((acc, row) => acc + row.total_diferencias, 0)
  );
  readonly impactoTotal = computed(() =>
    (this.data()?.rows ?? []).reduce((acc, row) => acc + row.impacto_absoluto_total, 0)
  );

  constructor(private service: CpmsDifService) {
    this.load();
  }

  readonly Building2Icon = Building2;
  readonly ChartColumnBigIcon = ChartColumnBig;
  readonly ScaleIcon = Scale;

  async load() {
    this.cargando.set(true);
    try {
      const [resumen, modificados] = await Promise.all([
        firstValueFrom(this.service.getResumen({})),
        this.fetchAllModificados(),
      ]);

      this.data.set(resumen);
      this.modifiedSplit.set(this.buildModifiedSplit(modificados));
    } catch (err) {
      console.error('Error loading resumen:', err);
    } finally {
      this.cargando.set(false);
    }
  }

  getModificadosPositivos(cluesimb: string): number {
    return this.modifiedSplit()[cluesimb]?.positivos ?? 0;
  }

  getModificadosNegativos(cluesimb: string): number {
    return this.modifiedSplit()[cluesimb]?.negativos ?? 0;
  }

  private async fetchAllModificados(limit = 1000): Promise<CpmsDifRow[]> {
    const first = await firstValueFrom(
      this.service.getDetalle({ page: 1, limit, observacion: 'MODIFICADO' })
    );
    const rows = [...(first.rows ?? [])];

    for (let page = 2; page <= (first.totalPages || 1); page++) {
      const next = await firstValueFrom(
        this.service.getDetalle({ page, limit, observacion: 'MODIFICADO' })
      );
      rows.push(...(next.rows ?? []));
    }

    return rows;
  }

  private buildModifiedSplit(rows: CpmsDifRow[]): Record<string, { positivos: number; negativos: number }> {
    const split: Record<string, { positivos: number; negativos: number }> = {};

    for (const row of rows) {
      const key = row.cluesimb;
      if (!split[key]) {
        split[key] = { positivos: 0, negativos: 0 };
      }

      if (row.diferencia > 0) {
        split[key].positivos++;
      } else if (row.diferencia < 0) {
        split[key].negativos++;
      }
    }

    return split;
  }
}
