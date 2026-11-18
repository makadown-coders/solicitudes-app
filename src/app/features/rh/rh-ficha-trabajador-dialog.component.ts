import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  FileText,
  Loader2,
  LucideAngularModule,
  Pencil,
  RefreshCw,
  Save,
  ShieldCheck,
  User,
  X,
} from 'lucide-angular';
import {
  RhTrabajadorFichaLaboral,
  RhTrabajadorFichaResponse,
  RhUpdateAdscripcionLaboralPayload,
} from '../../services/rh.service';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoCalendarDate(raw: string): boolean {
  const trimmed = raw.trim();
  if (!ISO_DATE_REGEX.test(trimmed)) {
    return false;
  }
  const [yStr, mStr, dStr] = trimmed.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() + 1 === month &&
    dt.getUTCDate() === day
  );
}

function normalizeNullableText(raw: string): string | null {
  const clean = raw.trim();
  return clean.length > 0 ? clean : null;
}

@Component({
  selector: 'app-rh-ficha-trabajador-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rh-ficha-trabajador-dialog.component.html',
})
export class RhFichaTrabajadorDialogComponent implements OnChanges {
  @Input({ required: true }) open = false;
  @Input() loading = false;
  @Input() error: string | null = null;
  @Input() canRetry = true;
  @Input() ficha: RhTrabajadorFichaResponse | null = null;
  @Input() fallbackNombre = '';
  @Input() fallbackUnidadNombre = '';

  /** Estado del guardado laboral (RH-2B.4F) gestionado desde RhShellComponent */
  @Input() savingLaboral = false;
  @Input() saveLaboralError: string | null = null;
  @Input() saveLaboralIsConflict = false;
  @Input() saveLaboralSuccess: string | null = null;

  @Output() readonly closeDialog = new EventEmitter<void>();
  @Output() readonly retryLoad = new EventEmitter<void>();
  @Output() readonly saveLaboral = new EventEmitter<RhUpdateAdscripcionLaboralPayload>();
  @Output() readonly reloadFichaOnConflict = new EventEmitter<void>();
  @Output() readonly clearSaveFeedback = new EventEmitter<void>();

  readonly icons = {
    user: User,
    building: Building2,
    fileText: FileText,
    shieldCheck: ShieldCheck,
    alert: AlertCircle,
    checkCircle: CheckCircle2,
    loader: Loader2,
    refresh: RefreshCw,
    clear: X,
    pencil: Pencil,
    save: Save,
  };

  /** Señal interna de modo edición para la sección laboral */
  readonly editMode = signal(false);

  /** Copia inmutable de los valores originales de `data.laboral` al entrar en modo edición */
  readonly originalLaboral = signal<RhTrabajadorFichaLaboral | null>(null);

  /** Borrador editable de los 9 campos laborales permitidos */
  readonly draftMatricula = signal('');
  readonly draftPuesto = signal('');
  readonly draftTurno = signal('');
  readonly draftJornada = signal('');
  readonly draftHorario = signal('');
  readonly draftVigenteDesde = signal('');
  readonly draftVigenteHasta = signal('');
  readonly draftActivo = signal(true);
  readonly draftObservaciones = signal('');

  /** Error de validación local si se intenta enviar de forma programática */
  readonly localValidationError = signal<string | null>(null);

  private trackedAdscripcionId: number | null = null;

  /**
   * Calcula el payload parcial con EXCLUSIVAMENTE las propiedades que cambiaron
   * respecto a `originalLaboral()`.
   */
  readonly computedPartialPatch = computed<RhUpdateAdscripcionLaboralPayload>(() => {
    const orig = this.originalLaboral();
    if (!orig) {
      return {};
    }

    const patch: RhUpdateAdscripcionLaboralPayload = {};

    const nextMatricula = normalizeNullableText(this.draftMatricula());
    if (nextMatricula !== (orig.matricula ?? null)) {
      patch.matricula = nextMatricula;
    }

    const nextPuesto = normalizeNullableText(this.draftPuesto());
    if (nextPuesto !== (orig.puesto ?? null)) {
      patch.puesto = nextPuesto;
    }

    const nextTurno = normalizeNullableText(this.draftTurno());
    if (nextTurno !== (orig.turno ?? null)) {
      patch.turno = nextTurno;
    }

    const nextJornada = normalizeNullableText(this.draftJornada());
    if (nextJornada !== (orig.jornada ?? null)) {
      patch.jornada = nextJornada;
    }

    const nextHorario = normalizeNullableText(this.draftHorario());
    if (nextHorario !== (orig.horario ?? null)) {
      patch.horario = nextHorario;
    }

    const nextDesde = this.draftVigenteDesde().trim();
    if (nextDesde !== (orig.vigente_desde ?? '')) {
      patch.vigente_desde = nextDesde;
    }

    const nextHasta = normalizeNullableText(this.draftVigenteHasta());
    if (nextHasta !== (orig.vigente_hasta ?? null)) {
      patch.vigente_hasta = nextHasta;
    }

    const nextActivo = Boolean(this.draftActivo());
    if (nextActivo !== Boolean(orig.activo)) {
      patch.activo = nextActivo;
    }

    const nextObservaciones = normalizeNullableText(this.draftObservaciones());
    if (nextObservaciones !== (orig.observaciones ?? null)) {
      patch.observaciones = nextObservaciones;
    }

    return patch;
  });

  readonly hasEffectiveChanges = computed<boolean>(
    () => Object.keys(this.computedPartialPatch()).length > 0
  );

  readonly fieldLengthError = computed<string | null>(() => {
    if (this.draftMatricula().trim().length > 64) {
      return 'El campo «Matrícula» no puede exceder 64 caracteres.';
    }
    if (this.draftPuesto().trim().length > 160) {
      return 'El campo «Puesto» no puede exceder 160 caracteres.';
    }
    if (this.draftTurno().trim().length > 60) {
      return 'El campo «Turno» no puede exceder 60 caracteres.';
    }
    if (this.draftJornada().trim().length > 80) {
      return 'El campo «Jornada» no puede exceder 80 caracteres.';
    }
    if (this.draftHorario().trim().length > 120) {
      return 'El campo «Horario» no puede exceder 120 caracteres.';
    }
    if (this.draftObservaciones().trim().length > 2000) {
      return 'El campo «Observaciones» no puede exceder 2000 caracteres.';
    }
    return null;
  });

  readonly datesValidationError = computed<string | null>(() => {
    const desde = this.draftVigenteDesde().trim();
    if (!desde) {
      return 'La fecha «Vigente desde» es obligatoria.';
    }
    if (!isValidIsoCalendarDate(desde)) {
      return 'La fecha «Vigente desde» debe ser una fecha calendario válida (YYYY-MM-DD).';
    }

    const hasta = this.draftVigenteHasta().trim();
    if (hasta) {
      if (!isValidIsoCalendarDate(hasta)) {
        return 'La fecha «Vigente hasta» debe ser una fecha calendario válida (YYYY-MM-DD).';
      }
      if (hasta < desde) {
        return 'La fecha «Vigente hasta» no puede ser anterior a «Vigente desde».';
      }
    }
    return null;
  });

  readonly canSaveLaboral = computed<boolean>(() => {
    if (!this.editMode() || this.savingLaboral) {
      return false;
    }
    if (!this.ficha?.permisos?.puede_editar_laboral) {
      return false;
    }
    if (this.fieldLengthError() !== null || this.datesValidationError() !== null) {
      return false;
    }
    return this.hasEffectiveChanges();
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && !this.open) {
      this.resetEditMode();
      this.trackedAdscripcionId = null;
      return;
    }

    if (changes['ficha']) {
      const currentAdscripcionId = this.ficha?.laboral?.adscripcion_laboral_id ?? null;
      if (!this.ficha || currentAdscripcionId !== this.trackedAdscripcionId) {
        this.trackedAdscripcionId = currentAdscripcionId;
        this.resetEditMode();
      } else if (this.editMode() && this.saveLaboralSuccess) {
        // Cuando el padre actualiza `ficha` tras un PATCH 200 exitoso, regresar a modo consulta
        this.resetEditMode();
      }
    }
  }

  get headerNombre(): string {
    return (
      this.ficha?.personal?.nombre_completo?.trim() ||
      this.fallbackNombre.trim() ||
      'Trabajador seleccionado'
    );
  }

  get headerUnidad(): string {
    return (
      this.ficha?.unidad?.nombre?.trim() ||
      this.fallbackUnidadNombre.trim() ||
      'Unidad de trabajo'
    );
  }

  /**
   * Formatea fechas YYYY-MM-DD de forma legible sin crear instancias de `Date` con zona horaria local
   * que puedan desplazar accidentalmente el día calendario.
   */
  formatIsoDateDisplay(raw: string | null | undefined, emptyFallback: string): string {
    if (typeof raw !== 'string') {
      return emptyFallback;
    }
    const clean = raw.trim();
    if (!clean) {
      return emptyFallback;
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
    if (!match) {
      return clean;
    }
    const [, yyyy, mm, dd] = match;
    return `${dd}/${mm}/${yyyy} (${clean})`;
  }

  startEditLaboral(): void {
    if (!this.ficha || !this.ficha.permisos?.puede_editar_laboral || this.savingLaboral) {
      return;
    }

    const lab = this.ficha.laboral;
    this.originalLaboral.set({ ...lab });
    this.draftMatricula.set(lab.matricula ?? '');
    this.draftPuesto.set(lab.puesto ?? '');
    this.draftTurno.set(lab.turno ?? '');
    this.draftJornada.set(lab.jornada ?? '');
    this.draftHorario.set(lab.horario ?? '');
    this.draftVigenteDesde.set(lab.vigente_desde ?? '');
    this.draftVigenteHasta.set(lab.vigente_hasta ?? '');
    this.draftActivo.set(Boolean(lab.activo));
    this.draftObservaciones.set(lab.observaciones ?? '');
    this.localValidationError.set(null);
    this.clearSaveFeedback.emit();
    this.editMode.set(true);
  }

  cancelEditLaboral(): void {
    if (this.savingLaboral) {
      return;
    }
    this.resetEditMode();
    this.clearSaveFeedback.emit();
  }

  onSubmitEditLaboral(): void {
    if (this.savingLaboral || !this.editMode()) {
      return;
    }

    this.localValidationError.set(null);

    if (!this.ficha?.permisos?.puede_editar_laboral) {
      this.localValidationError.set('No cuentas con permiso para editar la información laboral.');
      return;
    }

    const lenErr = this.fieldLengthError();
    if (lenErr) {
      this.localValidationError.set(lenErr);
      return;
    }

    const dateErr = this.datesValidationError();
    if (dateErr) {
      this.localValidationError.set(dateErr);
      return;
    }

    const patch = this.computedPartialPatch();
    if (Object.keys(patch).length === 0) {
      return;
    }

    this.saveLaboral.emit(patch);
  }

  onReloadAfterConflict(): void {
    if (this.savingLaboral) {
      return;
    }
    this.resetEditMode();
    this.reloadFichaOnConflict.emit();
  }

  onClose(): void {
    if (this.savingLaboral) {
      return;
    }
    this.resetEditMode();
    this.closeDialog.emit();
  }

  onRetry(): void {
    if (this.savingLaboral) {
      return;
    }
    this.retryLoad.emit();
  }

  resetEditMode(): void {
    this.editMode.set(false);
    this.originalLaboral.set(null);
    this.draftMatricula.set('');
    this.draftPuesto.set('');
    this.draftTurno.set('');
    this.draftJornada.set('');
    this.draftHorario.set('');
    this.draftVigenteDesde.set('');
    this.draftVigenteHasta.set('');
    this.draftActivo.set(true);
    this.draftObservaciones.set('');
    this.localValidationError.set(null);
  }
}
