import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RadarGlobalV2Row, RadarGlobalV2Segmento } from '../../../models/radar-abasto/RadarAbastoModels';
import { RadarAbastoService } from '../../../services/radar-abasto.service';

@Component({
  selector: 'app-radar-global-v2',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './radar-global-v2.component.html',
  styleUrl: './radar-global-v2.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RadarGlobalV2Component implements OnInit {
  private radar = inject(RadarAbastoService);
  loading = signal(false);
  error = signal('');
  rows = signal<RadarGlobalV2Row[]>([]);
  total = signal(0);
  page = signal(1);
  pageSize = signal(25);
  search = signal('');
  clues = signal('');
  months = signal(3);
  segmento = signal<RadarGlobalV2Segmento | ''>('');
  summary = signal({ criticas_cpm: 0, atencion_cpm: 0, demanda_sin_cpm: 0, cpm_sin_solicitud: 0, cubiertas: 0 });

  readonly segmentos: Array<{ value: RadarGlobalV2Segmento | ''; label: string }> = [
    { value: '', label: 'Todos los segmentos' },
    { value: 'CRITICA_CPM', label: 'Críticas con CPM' },
    { value: 'ATENCION_CPM', label: 'Atención con CPM' },
    { value: 'DEMANDA_SIN_CPM', label: 'Demanda sin CPM' },
    { value: 'CPM_SIN_SOLICITUD', label: 'CPM sin solicitud observada' },
    { value: 'CUBIERTA', label: 'Cubiertas' },
    { value: 'OBSERVAR', label: 'Por observar' }
  ];

  ngOnInit(): void { void this.cargar(); }
  get totalPages(): number { return Math.max(1, Math.ceil(this.total() / this.pageSize())); }

  async cargar(reset = false): Promise<void> {
    if (reset) this.page.set(1);
    this.loading.set(true); this.error.set('');
    try {
      const out = await this.radar.listarGlobalV2({
        search: this.search().trim(), clues: this.clues().trim(), segmento: this.segmento(),
        months: this.months(), page: this.page(), pageSize: this.pageSize()
      });
      this.rows.set(out.data ?? []); this.total.set(Number(out.total ?? 0));
      this.summary.set(out.summary ?? this.summary());
    } catch {
      this.rows.set([]); this.total.set(0);
      this.error.set('No fue posible cargar el radar. Verifica que el backend V2 esté disponible.');
    } finally { this.loading.set(false); }
  }

  filtrar(segmento: RadarGlobalV2Segmento | ''): void { this.segmento.set(segmento); void this.cargar(true); }
  anterior(): void { if (this.page() > 1) { this.page.update(v => v - 1); void this.cargar(); } }
  siguiente(): void { if (this.page() < this.totalPages) { this.page.update(v => v + 1); void this.cargar(); } }
  porcentaje(row: RadarGlobalV2Row): number { return Math.round((row.frecuencia_solicitud || 0) * 100); }
  etiqueta(segmento: RadarGlobalV2Segmento): string {
    return this.segmentos.find(x => x.value === segmento)?.label ?? segmento;
  }
}
