import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertCircle,
  Calendar,
  Loader2,
  LucideAngularModule,
  RefreshCw,
} from 'lucide-angular';
import {
  RhService,
  RhVacacionFechaDto,
  RhVacacionKardexResponse,
  RhVacacionPeriodoDto,
} from '../../../services/rh.service';
import {
  formatFechaVacacionCortaEs,
  formatFechaVacacionLargaEs,
  selectPeriodoVigentePorFecha,
  sortFechasVacacionCronologico,
} from './rh-vacaciones-fecha.utils';

@Component({
  selector: 'app-rh-mis-vacaciones',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rh-mis-vacaciones.component.html',
})
export class RhMisVacacionesComponent implements OnInit, OnDestroy {
  private readonly rhService = inject(RhService);

  readonly icons = {
    calendar: Calendar,
    loader: Loader2,
    alert: AlertCircle,
    refresh: RefreshCw,
  };

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly periodos = signal<RhVacacionPeriodoDto[]>([]);
  readonly selectedAnio = signal<number | null>(null);
  readonly selectedPeriodoId = signal<number | null>(null);
  readonly kardex = signal<RhVacacionKardexResponse | null>(null);

  private requestSeq = 0;

  readonly availableYears = computed<number[]>(() => {
    const years = new Set<number>();
    for (const p of this.periodos()) {
      years.add(p.anio);
    }
    return Array.from(years).sort((a, b) => b - a);
  });

  readonly periodosForYear = computed<RhVacacionPeriodoDto[]>(() => {
    const anio = this.selectedAnio();
    if (anio === null) {
      return this.periodos();
    }
    return this.periodos().filter((p) => p.anio === anio);
  });

  ngOnInit(): void {
    void this.cargar();
  }

  ngOnDestroy(): void {
    this.requestSeq += 1;
  }

  async cargar(periodoId?: number | null): Promise<void> {
    const seq = ++this.requestSeq;
    this.loading.set(true);
    this.error.set(null);

    try {
      const res = await this.rhService.obtenerMisVacacionesRh(periodoId ?? this.selectedPeriodoId());
      if (seq !== this.requestSeq) {
        return;
      }
      const list = Array.isArray(res?.periodos) ? res.periodos : [];
      this.periodos.set(list);

      const explicitPeriodoId = periodoId ?? this.selectedPeriodoId();
      if (explicitPeriodoId === null && list.length > 0) {
        const { periodo: vigente } = selectPeriodoVigentePorFecha(list);
        if (vigente && res?.kardex?.periodo?.id !== vigente.id) {
          this.selectedAnio.set(vigente.anio);
          this.selectedPeriodoId.set(vigente.id);
          const resVigente = await this.rhService.obtenerMisVacacionesRh(vigente.id);
          if (seq !== this.requestSeq) {
            return;
          }
          this.kardex.set(resVigente?.kardex ?? null);
          return;
        }
      }

      this.kardex.set(res?.kardex ?? null);

      const resolvedPeriodo = res?.kardex?.periodo ?? selectPeriodoVigentePorFecha(list).periodo ?? list[0] ?? null;
      if (resolvedPeriodo) {
        this.selectedAnio.set(resolvedPeriodo.anio);
        this.selectedPeriodoId.set(resolvedPeriodo.id);
      } else {
        this.selectedAnio.set(null);
        this.selectedPeriodoId.set(null);
      }
    } catch (err) {
      if (seq !== this.requestSeq) {
        return;
      }
      if (err instanceof HttpErrorResponse) {
        const msg =
          (err.error && typeof err.error === 'object' && typeof err.error.error === 'string'
            ? err.error.error
            : null) ?? 'No se pudo consultar tu información vacacional.';
        this.error.set(msg);
      } else {
        this.error.set('No se pudo consultar tu información vacacional.');
      }
    } finally {
      if (seq === this.requestSeq) {
        this.loading.set(false);
      }
    }
  }

  onAnioChange(rawAnio: number | string): void {
    const anio = Number(rawAnio);
    if (!Number.isFinite(anio)) {
      return;
    }
    this.selectedAnio.set(anio);
    const matching = this.periodos().filter((p) => p.anio === anio);
    if (matching.length > 0) {
      this.selectedPeriodoId.set(matching[0].id);
      void this.cargar(matching[0].id);
    }
  }

  onPeriodoChange(rawPeriodoId: number | string): void {
    const pid = Number(rawPeriodoId);
    if (!Number.isFinite(pid)) {
      return;
    }
    this.selectedPeriodoId.set(pid);
    void this.cargar(pid);
  }

  getBolsaEstadoLabel(estado: string): string {
    switch (estado) {
      case 'INEXISTENTE':
        return 'Bolsa no configurada';
      case 'PROVISIONAL':
        return 'Provisional';
      case 'CONFIRMADA':
        return 'Confirmada';
      case 'AJUSTADA':
        return 'Ajustada';
      default:
        return estado;
    }
  }

  formatFechaLarga(iso: string): string {
    return formatFechaVacacionLargaEs(iso);
  }

  formatFechaCorta(iso: string): string {
    return formatFechaVacacionCortaEs(iso);
  }

  getFechasOrdenadas(fechas: readonly RhVacacionFechaDto[]): RhVacacionFechaDto[] {
    return sortFechasVacacionCronologico(fechas);
  }

  isExcepcionFueraPeriodo(observaciones: string | null): boolean {
    return Boolean(observaciones && observaciones.includes('[EXCEPCIÓN FUERA DE PERIODO]'));
  }
}
