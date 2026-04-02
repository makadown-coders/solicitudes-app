// src/app/features/cpms-dif/resumen/resumen.component.ts
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Building2, ChartColumnBig, Scale } from 'lucide-angular';
import { CpmsDifService } from '../cpms-dif.service';
import { CpmsDifResponse, CpmsDifResumenRow } from '../models';

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

  readonly totalUnidades = computed(() => this.data()?.rows.length ?? 0);
  readonly totalDiferencias = computed(() =>
    (this.data()?.rows ?? []).reduce((acc, row) => acc + row.total_diferencias, 0)
  );
  readonly impactoTotal = computed(() =>
    (this.data()?.rows ?? []).reduce((acc, row) => acc + row.impacto_absoluto_total, 0)
  );

  constructor(private service: CpmsDifService) {
    this.cargando.set(true);
    this.service.getResumen({}).subscribe({
      next: res => {
        this.data.set(res);
        this.cargando.set(false);
      },
      error: err => {
        console.error('Error loading resumen:', err);
        this.cargando.set(false);
      }
    });
  }

  readonly Building2Icon = Building2;
  readonly ChartColumnBigIcon = ChartColumnBig;
  readonly ScaleIcon = Scale;
}
