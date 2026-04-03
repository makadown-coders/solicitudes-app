import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Filter, RefreshCcw, Search, SlidersHorizontal } from 'lucide-angular';
import { CpmsDifObservacion, CpmsDifResponse, CpmsDifRow } from '../models';
import { CpmsDifService } from '../cpms-dif.service';
import { map, of, switchMap } from 'rxjs';
import { ArticulosService } from '../../../services/articulos.service';

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
  private articulosMapa = signal<Record<string, { descripcion?: string; presentacion?: string }>>({});
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  page = signal(1);
  limit = 20;
  readonly observacionOptions: CpmsDifObservacion[] = ['AGREGADO', 'ELIMINADO', 'MODIFICADO'];
  readonly filtroObservacion = signal<CpmsDifObservacion | ''>('');
  readonly filtroTexto = signal('');

  readonly rowsFiltradas = computed(() => {
    return this.data()?.rows ?? [];
  });

  constructor(
    private service: CpmsDifService,
    private articulosService: ArticulosService
  ) {
    this.articulosService.getArticulosMapa().subscribe({
      next: (mapa) => {
        this.articulosMapa.set(mapa ?? {});
        this.rehidratarDescripciones();
      },
      error: (err) => console.error('Error loading articulos map:', err)
    });
    this.load();
  }

  load() {
    this.cargando.set(true);
    this.service.getDetalle({
      page: this.page(),
      limit: this.limit,
      observacion: this.filtroObservacion(),
      search: this.filtroTexto().trim()
    }).pipe(
      switchMap((res) => {
        const requiereFallback = res.rows.some((row) => !row.nombre_de_unidad?.trim());
        if (!requiereFallback) return of(res);

        return this.service.getResumen({}).pipe(
          map((resumen) => {
            const unidadesPorClues = new Map(
              resumen.rows.map((row) => [row.cluesimb, row.nombre_de_unidad])
            );

            return this.enriquecerRows(res.rows, unidadesPorClues, res);
          })
        );
      })
    ).subscribe({
      next: res => {
        const unidadesPorClues = new Map(
          (res.rows ?? []).map((row) => [row.cluesimb, row.nombre_de_unidad])
        );
        this.data.set(this.enriquecerRows(res.rows, unidadesPorClues, res));
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

  onFiltroTextoChange(value: string) {
    this.filtroTexto.set(value);
    this.page.set(1);

    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    this.searchDebounceTimer = setTimeout(() => {
      this.load();
      this.searchDebounceTimer = null;
    }, 300);
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

  private enriquecerRows(
    rows: CpmsDifRow[],
    unidadesPorClues: Map<string, string>,
    res: CpmsDifResponse<CpmsDifRow>
  ): CpmsDifResponse<CpmsDifRow> {
    return {
      ...res,
      rows: rows.map((row) => ({
        ...row,
        nombre_de_unidad: row.nombre_de_unidad?.trim() || unidadesPorClues.get(row.cluesimb) || row.nombre_de_unidad,
        descripcion: row.descripcion?.trim() || this.getDescripcionClave(row.clave_cnis),
      }))
    };
  }

  private getDescripcionClave(rawClave: string): string {
    const clave = String(rawClave || '').trim();
    if (!clave) return '';

    const mapa = this.articulosMapa();
    return mapa[clave]?.descripcion
      || mapa[clave.toUpperCase()]?.descripcion
      || Object.entries(mapa).find(([k]) => k.toLowerCase() === clave.toLowerCase())?.[1]?.descripcion
      || '';
  }

  private rehidratarDescripciones() {
    const actual = this.data();
    if (!actual?.rows?.length) return;

    this.data.set({
      ...actual,
      rows: actual.rows.map((row) => ({
        ...row,
        descripcion: row.descripcion?.trim() || this.getDescripcionClave(row.clave_cnis),
      }))
    });
  }

  ngOnDestroy() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
  }
}
