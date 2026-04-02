import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Filter, RefreshCcw, Search, SlidersHorizontal } from 'lucide-angular';
import { CpmsDifObservacion, CpmsDifResponse, CpmsDifRow } from '../models';
import { CpmsDifService } from '../cpms-dif.service';
import { map, of, switchMap } from 'rxjs';

@Component({
  standalone: true,
  selector: 'app-detalle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './detalle.component.html'
})
export class DetalleComponent {
  data = signal<CpmsDifResponse<CpmsDifRow> | null>(null);
  cargando = signal(false);

  page = signal(1);
  limit = 20;
  readonly observacionOptions: CpmsDifObservacion[] = ['AGREGADO', 'ELIMINADO', 'MODIFICADO'];
  readonly filtroObservacion = signal<CpmsDifObservacion | ''>('');
  readonly filtroTexto = signal('');

  readonly rowsFiltradas = computed(() => {
    const rows = this.data()?.rows ?? [];
    const texto = this.filtroTexto().trim().toLowerCase();

    return rows.filter((row) => {
      const coincideTexto = !texto || [row.cluesimb, row.nombre_de_unidad, row.clave_cnis]
        .some((value) => value.toLowerCase().includes(texto));

      return coincideTexto;
    });
  });

  constructor(private service: CpmsDifService) {
    this.load();
  }

  load() {
    this.cargando.set(true);
    this.service.getDetalle({
      page: this.page(),
      limit: this.limit,
      observacion: this.filtroObservacion()
    }).pipe(
      switchMap((res) => {
        const requiereFallback = res.rows.some((row) => !row.nombre_de_unidad?.trim());
        if (!requiereFallback) return of(res);

        return this.service.getResumen({}).pipe(
          map((resumen) => {
            const unidadesPorClues = new Map(
              resumen.rows.map((row) => [row.cluesimb, row.nombre_de_unidad])
            );

            return {
              ...res,
              rows: res.rows.map((row) => ({
                ...row,
                nombre_de_unidad: row.nombre_de_unidad?.trim() || unidadesPorClues.get(row.cluesimb) || row.nombre_de_unidad
              }))
            };
          })
        );
      })
    ).subscribe({
      next: res => {
        this.data.set(res);
        this.cargando.set(false);
      },
      error: err => {
        console.error('Error loading detalle:', err);
        this.cargando.set(false);
      }
    });
  }

  next() {
    if (this.data()?.hasNextPage) {
      this.page.update(p => p + 1);
      this.load();
    }
  }

  prev() {
    if (this.data()?.hasPrevPage) {
      this.page.update(p => p - 1);
      this.load();
    }
  }

  setFiltroObservacion(value: CpmsDifObservacion | '') {
    this.filtroObservacion.set(value);
    this.page.set(1);
    this.load();
  }

  trackByRow(index: number, row: CpmsDifRow) {
    return `${row.cluesimb}-${row.clave_cnis}-${row.observacion}-${index}`;
  }

  rowClasses(observacion: CpmsDifObservacion) {
    return {
      'bg-emerald-50/90 hover:bg-emerald-100/80': observacion === 'AGREGADO',
      'bg-rose-50/90 hover:bg-rose-100/80': observacion === 'ELIMINADO',
      'bg-amber-50/95 hover:bg-amber-100/80': observacion === 'MODIFICADO',
    };
  }

  badgeClasses(observacion: CpmsDifObservacion) {
    return {
      'border border-emerald-200 bg-emerald-100 text-emerald-800': observacion === 'AGREGADO',
      'border border-rose-200 bg-rose-100 text-rose-800': observacion === 'ELIMINADO',
      'border border-amber-200 bg-amber-100 text-amber-800': observacion === 'MODIFICADO',
    };
  }

  readonly SearchIcon = Search;
  readonly FilterIcon = Filter;
  readonly RefreshCcwIcon = RefreshCcw;
  readonly SlidersHorizontalIcon = SlidersHorizontal;
}
