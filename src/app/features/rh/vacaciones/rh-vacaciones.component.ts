import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  signal,
  SimpleChanges,
} from '@angular/core';
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  LucideAngularModule,
  Plus,
  RefreshCw,
  ShieldAlert,
  X,
  XCircle,
} from 'lucide-angular';
import {
  RhCreateVacacionPayload,
  RhPersonasPadronItem,
  RhService,
  RhVacacionesEstadoFilter,
  RhVacacionRegistroDto,
} from '../../../services/rh.service';

@Component({
  selector: 'app-rh-vacaciones',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rh-vacaciones.component.html',
})
export class RhVacacionesComponent implements OnChanges, OnDestroy {
  private readonly rhService = inject(RhService);

  @Input({ required: true }) persona!: RhPersonasPadronItem;
  @Input() canManage = true;

  @Output() closed = new EventEmitter<void>();
  @Output() unauthorized = new EventEmitter<void>();

  readonly icons = {
    calendar: Calendar,
    plus: Plus,
    close: X,
    anular: XCircle,
    refresh: RefreshCw,
    loader: Loader2,
    alert: AlertCircle,
    warning: AlertTriangle,
    shieldAlert: ShieldAlert,
    checkCircle: CheckCircle2,
    prev: ChevronLeft,
    next: ChevronRight,
  };

  /** Listado paginado / kardex */
  readonly items = signal<RhVacacionRegistroDto[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly forbiddenError = signal<string | null>(null);
  readonly successBanner = signal<string | null>(null);
  readonly overlapWarningBanner = signal<string | null>(null);

  /** Filtros y paginación */
  readonly anioFilter = signal<string>('');
  readonly estadoFilter = signal<RhVacacionesEstadoFilter>('todos');
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly total = signal(0);

  /** Formulario «Registrar periodo vacacional» */
  readonly createOpen = signal(false);
  readonly draftAnioCiclo = signal(String(new Date().getFullYear()));
  readonly draftPeriodoReferencia = signal('');
  readonly draftAdscripcionId = signal('');
  readonly draftFechaInicio = signal('');
  readonly draftFechaFin = signal('');
  readonly draftDiasRegistrados = signal('');
  readonly draftDocumentoReferencia = signal('');
  readonly draftObservaciones = signal('');
  readonly createSubmitting = signal(false);
  readonly createError = signal<string | null>(null);
  readonly createIsConflict = signal(false);

  /** Confirmación «Anular registro» */
  readonly anularTarget = signal<RhVacacionRegistroDto | null>(null);
  readonly anularMotivo = signal('');
  readonly anularSubmitting = signal(false);
  readonly anularError = signal<string | null>(null);

  private listSeq = 0;

  readonly totalPages = computed(() => {
    const t = this.total();
    const s = this.pageSize();
    return t > 0 && s > 0 ? Math.ceil(t / s) : 1;
  });

  readonly canGoPrev = computed(() => this.page() > 1 && !this.loading());
  readonly canGoNext = computed(() => this.page() < this.totalPages() && !this.loading());

  /** Suma estrictamente informativa de días registrados (no representa saldo ni derecho) */
  readonly diasRegistradosEnVista = computed(() =>
    this.items()
      .filter((i) => i.estado === 'REGISTRADO')
      .reduce((acc, i) => acc + (Number(i.dias_registrados) || 0), 0)
  );

  readonly createValidationError = computed<string | null>(() => {
    const anioRaw = this.draftAnioCiclo().trim();
    if (!/^\d{4}$/.test(anioRaw)) {
      return 'El año o ciclo vacacional debe ser un número de 4 dígitos (1990-2100).';
    }
    const anio = Number(anioRaw);
    if (anio < 1990 || anio > 2100) {
      return 'El año o ciclo vacacional debe estar entre 1990 y 2100.';
    }

    const periodo = this.draftPeriodoReferencia().trim();
    if (!periodo) {
      return 'El periodo de referencia es obligatorio.';
    }
    if (periodo.length > 80) {
      return 'El periodo de referencia no puede exceder 80 caracteres.';
    }

    const adsRaw = this.draftAdscripcionId().trim();
    if (adsRaw.length > 0 && (!/^\d+$/.test(adsRaw) || Number(adsRaw) <= 0)) {
      return 'El identificador de adscripción laboral debe ser un entero positivo.';
    }

    const inicio = this.draftFechaInicio().trim();
    const fin = this.draftFechaFin().trim();
    if (!inicio || !fin) {
      return 'Las fechas de inicio y término son obligatorias.';
    }
    if (fin < inicio) {
      return 'La fecha de término no puede ser anterior a la fecha de inicio.';
    }

    const diasRaw = this.draftDiasRegistrados().trim();
    if (!/^\d+$/.test(diasRaw)) {
      return 'Los días registrados deben ser un número entero entre 1 y 366.';
    }
    const dias = Number(diasRaw);
    if (!Number.isInteger(dias) || dias < 1 || dias > 366) {
      return 'Los días registrados deben estar entre 1 y 366.';
    }

    if (this.draftDocumentoReferencia().trim().length > 120) {
      return 'El documento de referencia no puede exceder 120 caracteres.';
    }
    if (this.draftObservaciones().trim().length > 2000) {
      return 'Las observaciones no pueden exceder 2000 caracteres.';
    }

    return null;
  });

  readonly canSubmitCreate = computed(
    () => this.canManage && !this.createSubmitting() && this.createValidationError() === null
  );

  readonly anularValidationError = computed<string | null>(() => {
    const motivo = this.anularMotivo().trim();
    if (!motivo) {
      return 'El motivo de anulación es obligatorio.';
    }
    if (motivo.length > 300) {
      return 'El motivo de anulación no puede exceder 300 caracteres.';
    }
    return null;
  });

  readonly canSubmitAnular = computed(
    () =>
      this.canManage &&
      this.anularTarget() !== null &&
      !this.anularSubmitting() &&
      this.anularValidationError() === null
  );

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['persona'] && this.persona?.persona_id) {
      this.resetAllForms();
      this.anioFilter.set('');
      this.estadoFilter.set('todos');
      this.page.set(1);
      this.successBanner.set(null);
      this.overlapWarningBanner.set(null);
      if (this.canManage) {
        void this.loadVacaciones();
      } else {
        this.items.set([]);
        this.total.set(0);
        this.forbiddenError.set(
          'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para consultar y administrar vacaciones.'
        );
      }
    }
  }

  ngOnDestroy(): void {
    this.resetAllForms();
  }

  async loadVacaciones(): Promise<void> {
    if (!this.persona?.persona_id) {
      return;
    }
    if (!this.canManage) {
      this.forbiddenError.set(
        'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para consultar y administrar vacaciones.'
      );
      return;
    }

    const seq = ++this.listSeq;
    this.loading.set(true);
    this.error.set(null);
    this.forbiddenError.set(null);

    const anioRaw = this.anioFilter().trim();
    const anioCiclo = /^\d{4}$/.test(anioRaw) ? Number(anioRaw) : null;

    try {
      const res = await this.rhService.listVacacionesPorPersona(this.persona.persona_id, {
        anio_ciclo: anioCiclo,
        estado: this.estadoFilter(),
        page: this.page(),
        pageSize: this.pageSize(),
      });
      if (seq !== this.listSeq) {
        return;
      }
      this.items.set(Array.isArray(res.items) ? res.items : []);
      this.total.set(typeof res.total === 'number' ? res.total : 0);
      if (typeof res.page === 'number' && res.page > 0) {
        this.page.set(res.page);
      }
      if (typeof res.pageSize === 'number' && res.pageSize > 0) {
        this.pageSize.set(res.pageSize);
      }
    } catch (err) {
      if (seq !== this.listSeq) {
        return;
      }
      if (err instanceof HttpErrorResponse) {
        if (err.status === 401) {
          this.unauthorized.emit();
          return;
        }
        if (err.status === 403) {
          this.items.set([]);
          this.total.set(0);
          this.forbiddenError.set(
            'No cuentas con permiso RECURSOS_HUMANOS GLOBAL para consultar vacaciones.'
          );
          return;
        }
        if (err.status === 404) {
          this.items.set([]);
          this.total.set(0);
          this.error.set('La persona seleccionada no fue encontrada en el directorio institucional.');
          return;
        }
      }
      this.error.set('No fue posible cargar el historial vacacional. Intenta de nuevo.');
    } finally {
      if (seq === this.listSeq) {
        this.loading.set(false);
      }
    }
  }

  onSelectEstadoFilter(estado: RhVacacionesEstadoFilter): void {
    if (this.estadoFilter() === estado) {
      return;
    }
    this.estadoFilter.set(estado);
    this.page.set(1);
    void this.loadVacaciones();
  }

  onApplyAnioFilter(): void {
    this.page.set(1);
    void this.loadVacaciones();
  }

  onClearAnioFilter(): void {
    this.anioFilter.set('');
    this.page.set(1);
    void this.loadVacaciones();
  }

  onPrevPage(): void {
    if (!this.canGoPrev()) {
      return;
    }
    this.page.update((p) => Math.max(1, p - 1));
    void this.loadVacaciones();
  }

  onNextPage(): void {
    if (!this.canGoNext()) {
      return;
    }
    this.page.update((p) => p + 1);
    void this.loadVacaciones();
  }

  openCreateForm(): void {
    if (!this.canManage) {
      return;
    }
    this.resetCreateForm();
    this.createOpen.set(true);
  }

  closeCreateForm(): void {
    this.createOpen.set(false);
    this.resetCreateForm();
  }

  async submitCreate(): Promise<void> {
    if (!this.canSubmitCreate() || !this.persona?.persona_id) {
      return;
    }

    this.createSubmitting.set(true);
    this.createError.set(null);
    this.createIsConflict.set(false);
    this.successBanner.set(null);
    this.overlapWarningBanner.set(null);

    const adsRaw = this.draftAdscripcionId().trim();
    const payload: RhCreateVacacionPayload = {
      adscripcion_id: adsRaw ? Number(adsRaw) : null,
      anio_ciclo: Number(this.draftAnioCiclo().trim()),
      periodo_referencia: this.draftPeriodoReferencia().trim(),
      fecha_inicio: this.draftFechaInicio().trim(),
      fecha_fin: this.draftFechaFin().trim(),
      dias_registrados: Number(this.draftDiasRegistrados().trim()),
      documento_referencia: this.draftDocumentoReferencia().trim() || null,
      observaciones: this.draftObservaciones().trim() || null,
    };

    try {
      const res = await this.rhService.crearVacacionPersona(this.persona.persona_id, payload);
      this.closeCreateForm();
      this.successBanner.set('Periodo vacacional registrado correctamente.');
      if (res.tiene_superposicion) {
        const idsText = Array.isArray(res.registros_superpuestos_ids)
          ? res.registros_superpuestos_ids.map((id) => `#${id}`).join(', ')
          : '';
        this.overlapWarningBanner.set(
          `Advertencia administrativa: el periodo registrado se superpone parcialmente con otros registros activos (${idsText || 'revisar historial'}). Verifica si corresponde anular o ajustar alguno.`
        );
      }
      this.page.set(1);
      await this.loadVacaciones();
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 401) {
          this.unauthorized.emit();
          return;
        }
        const serverMsg =
          typeof err.error?.error === 'string' && err.error.error.trim().length > 0
            ? err.error.error.trim()
            : null;
        if (err.status === 409) {
          this.createIsConflict.set(true);
          this.createError.set(
            serverMsg || 'Ya existe un registro vacacional activo idéntico para ese ciclo y fechas.'
          );
          return;
        }
        if (err.status === 400 || err.status === 403 || err.status === 404) {
          this.createError.set(serverMsg || 'No fue posible registrar el periodo vacacional.');
          return;
        }
      }
      this.createError.set('Ocurrió un error al registrar el periodo vacacional. Intenta de nuevo.');
    } finally {
      this.createSubmitting.set(false);
    }
  }

  canAnularItem(item: RhVacacionRegistroDto): boolean {
    return this.canManage && item.estado === 'REGISTRADO';
  }

  openAnularDialog(item: RhVacacionRegistroDto): void {
    if (!this.canAnularItem(item)) {
      return;
    }
    this.anularTarget.set(item);
    this.anularMotivo.set('');
    this.anularError.set(null);
    this.anularSubmitting.set(false);
  }

  closeAnularDialog(): void {
    this.anularTarget.set(null);
    this.anularMotivo.set('');
    this.anularError.set(null);
    this.anularSubmitting.set(false);
  }

  async submitAnular(): Promise<void> {
    const target = this.anularTarget();
    if (!target || !this.canSubmitAnular() || !this.persona?.persona_id) {
      return;
    }

    this.anularSubmitting.set(true);
    this.anularError.set(null);
    this.successBanner.set(null);

    try {
      const res = await this.rhService.anularVacacionPersona(
        this.persona.persona_id,
        target.id,
        { motivo_anulacion: this.anularMotivo().trim() }
      );
      this.closeAnularDialog();
      this.successBanner.set(
        res.idempotente
          ? 'El registro vacacional ya se encontraba anulado previamente (sin cambios adicionales).'
          : 'Registro vacacional anulado administrativamente (conservado en historial).'
      );
      await this.loadVacaciones();
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 401) {
          this.unauthorized.emit();
          return;
        }
        const serverMsg =
          typeof err.error?.error === 'string' && err.error.error.trim().length > 0
            ? err.error.error.trim()
            : null;
        if (err.status === 400 || err.status === 403 || err.status === 404 || err.status === 409) {
          this.anularError.set(serverMsg || 'No fue posible anular el registro vacacional.');
          return;
        }
      }
      this.anularError.set('Ocurrió un error al anular el registro vacacional. Intenta de nuevo.');
    } finally {
      this.anularSubmitting.set(false);
    }
  }

  onClose(): void {
    this.resetAllForms();
    this.closed.emit();
  }

  private resetCreateForm(): void {
    this.draftAnioCiclo.set(String(new Date().getFullYear()));
    this.draftPeriodoReferencia.set('');
    this.draftAdscripcionId.set('');
    this.draftFechaInicio.set('');
    this.draftFechaFin.set('');
    this.draftDiasRegistrados.set('');
    this.draftDocumentoReferencia.set('');
    this.draftObservaciones.set('');
    this.createError.set(null);
    this.createIsConflict.set(false);
    this.createSubmitting.set(false);
  }

  private resetAllForms(): void {
    this.createOpen.set(false);
    this.resetCreateForm();
    this.closeAnularDialog();
  }
}
