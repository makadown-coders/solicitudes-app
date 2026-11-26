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
  ArrowRightLeft,
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
  RhComisionesEstadoFilter,
  RhComisionLaboralDto,
  RhCreateComisionPayload,
  RhPersonasPadronItem,
  RhService,
  RhUnidadAutorizada,
} from '../../../services/rh.service';

import { RhUnidadAutocompleteComponent } from '../shared/rh-unidad-autocomplete.component';

@Component({
  selector: 'app-rh-comisiones-laborales',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, RhUnidadAutocompleteComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rh-comisiones-laborales.component.html',
})
export class RhComisionesLaboralesComponent implements OnChanges, OnDestroy {
  private readonly rhService = inject(RhService);

  @Input({ required: true }) persona!: RhPersonasPadronItem;
  @Input() unidades: RhUnidadAutorizada[] = [];
  @Input() canManage = true;

  @Output() closed = new EventEmitter<void>();
  @Output() unauthorized = new EventEmitter<void>();

  readonly icons = {
    comision: ArrowRightLeft,
    calendar: Calendar,
    plus: Plus,
    close: X,
    concluir: XCircle,
    refresh: RefreshCw,
    loader: Loader2,
    alert: AlertCircle,
    shieldAlert: ShieldAlert,
    checkCircle: CheckCircle2,
    prev: ChevronLeft,
    next: ChevronRight,
  };

  /** Listado paginado de comisiones */
  readonly items = signal<RhComisionLaboralDto[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly forbiddenError = signal<string | null>(null);
  readonly successBanner = signal<string | null>(null);
  readonly estadoFilter = signal<RhComisionesEstadoFilter>('todas');
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly total = signal(0);

  /** Formulario «Registrar comisión» */
  readonly createOpen = signal(false);
  readonly draftAdscripcionOrigenId = signal('');
  readonly draftUnidadDestinoId = signal('');
  readonly draftAreaDestinoTexto = signal('');
  readonly draftFechaInicio = signal('');
  readonly draftFechaFin = signal('');
  readonly draftMotivo = signal('');
  readonly draftOficioReferencia = signal('');
  readonly draftObservaciones = signal('');
  readonly createSubmitting = signal(false);
  readonly createError = signal<string | null>(null);
  readonly createIsConflict = signal(false);

  /** Confirmación «Concluir comisión» */
  readonly concluirTarget = signal<RhComisionLaboralDto | null>(null);
  readonly concluirFechaFin = signal('');
  readonly concluirObservaciones = signal('');
  readonly concluirSubmitting = signal(false);
  readonly concluirError = signal<string | null>(null);

  private listSeq = 0;

  readonly todayIso = computed(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  readonly totalPages = computed(() => {
    const t = this.total();
    const s = this.pageSize();
    return t > 0 && s > 0 ? Math.ceil(t / s) : 1;
  });

  readonly canGoPrev = computed(() => this.page() > 1 && !this.loading());
  readonly canGoNext = computed(() => this.page() < this.totalPages() && !this.loading());

  readonly createValidationError = computed<string | null>(() => {
    const unidadRaw = this.draftUnidadDestinoId().trim();
    const area = this.draftAreaDestinoTexto().trim();
    if (!unidadRaw && !area) {
      return 'Debes especificar al menos una unidad médica de destino o un área administrativa de destino.';
    }
    if (area.length > 160) {
      return 'El área administrativa de destino no puede exceder 160 caracteres.';
    }

    const adsRaw = this.draftAdscripcionOrigenId().trim();
    if (adsRaw.length > 0 && (!/^\d+$/.test(adsRaw) || Number(adsRaw) <= 0)) {
      return 'El identificador de adscripción de origen debe ser un número entero positivo.';
    }

    const inicio = this.draftFechaInicio().trim();
    if (!inicio) {
      return 'La fecha de inicio es obligatoria.';
    }

    const fin = this.draftFechaFin().trim();
    if (fin && fin < inicio) {
      return 'La fecha de término no puede ser anterior a la fecha de inicio.';
    }

    if (this.draftMotivo().trim().length > 200) {
      return 'El motivo no puede exceder 200 caracteres.';
    }
    if (this.draftOficioReferencia().trim().length > 120) {
      return 'El oficio de referencia no puede exceder 120 caracteres.';
    }
    if (this.draftObservaciones().trim().length > 2000) {
      return 'Las observaciones no pueden exceder 2000 caracteres.';
    }

    return null;
  });

  readonly canSubmitCreate = computed(
    () => this.canManage && !this.createSubmitting() && this.createValidationError() === null
  );

  readonly concluirValidationError = computed<string | null>(() => {
    const target = this.concluirTarget();
    if (!target) {
      return 'No hay comisión seleccionada.';
    }
    const fin = this.concluirFechaFin().trim();
    if (!fin) {
      return 'La fecha de conclusión es obligatoria.';
    }
    if (fin < target.fecha_inicio) {
      return 'La fecha de conclusión no puede ser anterior a la fecha de inicio de la comisión.';
    }
    if (fin > this.todayIso()) {
      return 'El cierre administrativo es inmediato y solo admite fechas iguales o anteriores a hoy.';
    }
    if (this.concluirObservaciones().trim().length > 2000) {
      return 'Las observaciones no pueden exceder 2000 caracteres.';
    }
    return null;
  });

  readonly canSubmitConcluir = computed(
    () => this.canManage && !this.concluirSubmitting() && this.concluirValidationError() === null
  );

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['persona'] && this.persona?.persona_id) {
      this.resetAllForms();
      this.estadoFilter.set('todas');
      this.page.set(1);
      this.successBanner.set(null);
      if (this.canManage) {
        void this.loadComisiones();
      } else {
        this.items.set([]);
        this.total.set(0);
        this.forbiddenError.set(
          'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para consultar y administrar comisiones laborales.'
        );
      }
    }
  }

  ngOnDestroy(): void {
    this.resetAllForms();
  }

  async loadComisiones(): Promise<void> {
    if (!this.persona?.persona_id) {
      return;
    }
    if (!this.canManage) {
      this.forbiddenError.set(
        'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para consultar y administrar comisiones laborales.'
      );
      return;
    }

    const seq = ++this.listSeq;
    this.loading.set(true);
    this.error.set(null);
    this.forbiddenError.set(null);

    try {
      const res = await this.rhService.listComisionesPorPersona(this.persona.persona_id, {
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
            'No cuentas con permiso RECURSOS_HUMANOS GLOBAL para consultar comisiones laborales.'
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
      this.error.set('No fue posible cargar las comisiones laborales. Intenta de nuevo.');
    } finally {
      if (seq === this.listSeq) {
        this.loading.set(false);
      }
    }
  }

  onSelectEstadoFilter(estado: RhComisionesEstadoFilter): void {
    if (this.estadoFilter() === estado) {
      return;
    }
    this.estadoFilter.set(estado);
    this.page.set(1);
    void this.loadComisiones();
  }

  onPrevPage(): void {
    if (!this.canGoPrev()) {
      return;
    }
    this.page.update((p) => Math.max(1, p - 1));
    void this.loadComisiones();
  }

  onNextPage(): void {
    if (!this.canGoNext()) {
      return;
    }
    this.page.update((p) => p + 1);
    void this.loadComisiones();
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

    const payload: RhCreateComisionPayload = {
      fecha_inicio: this.draftFechaInicio().trim(),
    };

    const adsRaw = this.draftAdscripcionOrigenId().trim();
    payload.adscripcion_origen_id = adsRaw ? Number(adsRaw) : null;

    const unidadRaw = this.draftUnidadDestinoId().trim();
    payload.unidad_destino_id = unidadRaw ? Number(unidadRaw) : null;

    const area = this.draftAreaDestinoTexto().trim();
    payload.area_destino_texto = area || null;

    const fin = this.draftFechaFin().trim();
    payload.fecha_fin = fin || null;

    const motivo = this.draftMotivo().trim();
    payload.motivo = motivo || null;

    const oficio = this.draftOficioReferencia().trim();
    payload.oficio_referencia = oficio || null;

    const obs = this.draftObservaciones().trim();
    payload.observaciones = obs || null;

    try {
      await this.rhService.crearComisionPersona(this.persona.persona_id, payload);
      this.closeCreateForm();
      this.successBanner.set('Comisión laboral registrada correctamente.');
      this.page.set(1);
      await this.loadComisiones();
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
            serverMsg || 'El periodo de la comisión se superpone con otra comisión activa.'
          );
          return;
        }
        if (err.status === 400 || err.status === 403 || err.status === 404) {
          this.createError.set(serverMsg || 'No fue posible registrar la comisión laboral.');
          return;
        }
      }
      this.createError.set('Ocurrió un error al registrar la comisión laboral. Intenta de nuevo.');
    } finally {
      this.createSubmitting.set(false);
    }
  }

  canConcluirItem(item: RhComisionLaboralDto): boolean {
    return this.canManage && item.activo && item.estado_vigencia !== 'CONCLUIDA';
  }

  openConcluirDialog(item: RhComisionLaboralDto): void {
    if (!this.canConcluirItem(item)) {
      return;
    }
    this.concluirTarget.set(item);
    const defaultDate =
      this.todayIso() >= item.fecha_inicio ? this.todayIso() : item.fecha_inicio;
    this.concluirFechaFin.set(defaultDate);
    this.concluirObservaciones.set(item.observaciones ?? '');
    this.concluirError.set(null);
    this.concluirSubmitting.set(false);
  }

  closeConcluirDialog(): void {
    this.concluirTarget.set(null);
    this.concluirFechaFin.set('');
    this.concluirObservaciones.set('');
    this.concluirError.set(null);
    this.concluirSubmitting.set(false);
  }

  async submitConcluir(): Promise<void> {
    const target = this.concluirTarget();
    if (!target || !this.canSubmitConcluir() || !this.persona?.persona_id) {
      return;
    }

    this.concluirSubmitting.set(true);
    this.concluirError.set(null);
    this.successBanner.set(null);

    try {
      const res = await this.rhService.concluirComisionPersona(
        this.persona.persona_id,
        target.id,
        {
          fecha_fin: this.concluirFechaFin().trim(),
          observaciones: this.concluirObservaciones().trim() || null,
        }
      );
      this.closeConcluirDialog();
      this.successBanner.set(
        res.idempotente
          ? 'La comisión ya se encontraba concluida previamente (sin cambios adicionales).'
          : 'Comisión laboral concluida administrativamente.'
      );
      await this.loadComisiones();
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
        if (
          err.status === 400 ||
          err.status === 403 ||
          err.status === 404 ||
          err.status === 409
        ) {
          this.concluirError.set(serverMsg || 'No fue posible concluir la comisión laboral.');
          return;
        }
      }
      this.concluirError.set('Ocurrió un error al concluir la comisión laboral. Intenta de nuevo.');
    } finally {
      this.concluirSubmitting.set(false);
    }
  }

  onClose(): void {
    this.resetAllForms();
    this.closed.emit();
  }

  formatUnidadOption(u: RhUnidadAutorizada): string {
    const clues = u.cluesimb ? u.cluesimb : 'N/A';
    return `${u.nombre} (${clues})`;
  }

  private resetCreateForm(): void {
    this.draftAdscripcionOrigenId.set('');
    this.draftUnidadDestinoId.set('');
    this.draftAreaDestinoTexto.set('');
    this.draftFechaInicio.set('');
    this.draftFechaFin.set('');
    this.draftMotivo.set('');
    this.draftOficioReferencia.set('');
    this.draftObservaciones.set('');
    this.createError.set(null);
    this.createIsConflict.set(false);
    this.createSubmitting.set(false);
  }

  private resetAllForms(): void {
    this.createOpen.set(false);
    this.resetCreateForm();
    this.closeConcluirDialog();
  }
}
