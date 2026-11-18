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
  SimpleChanges,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  LucideAngularModule,
  Pencil,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  User,
  X,
} from 'lucide-angular';
import {
  RhService,
  RhTrabajadorFichaLaboral,
  RhTrabajadorFichaPersonal,
  RhTrabajadorFichaResponse,
  RhUpdateAdscripcionLaboralPayload,
  RhUpdatePersonaIdentificacionPayload,
} from '../../services/rh.service';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const RFC_PERSONA_FISICA_REGEX =
  /^[A-ZÑ&]{4}(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([A-Z\d]{3})?$/;
const CURP_REGEX =
  /^[A-Z][AEIOUX][A-Z]{2}(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HMX][A-Z]{2}[A-Z\d]{3}[A-Z\d]\d$/;

function isValidTwoDigitMonthDay(mmStr: string, ddStr: string): boolean {
  const month = Number(mmStr);
  const day = Number(ddStr);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const dt = new Date(Date.UTC(2000, month - 1, day));
  return dt.getUTCMonth() + 1 === month && dt.getUTCDate() === day;
}

function normalizeCollapsedPersonNamePart(raw: string): string | null {
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  return collapsed.length > 0 ? collapsed : null;
}

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
export class RhFichaTrabajadorDialogComponent implements OnChanges, OnDestroy {
  private readonly rhService = inject(RhService);

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

  /** Estado del guardado de identificación personal (RH-2B.4H.2) gestionado desde RhShellComponent */
  @Input() savingIdentificacion = false;
  @Input() saveIdentificacionError: string | null = null;
  @Input() saveIdentificacionIsConflict = false;
  @Input() saveIdentificacionSuccess: string | null = null;

  @Output() readonly closeDialog = new EventEmitter<void>();
  @Output() readonly retryLoad = new EventEmitter<void>();
  @Output() readonly saveLaboral = new EventEmitter<RhUpdateAdscripcionLaboralPayload>();
  @Output() readonly saveIdentificacion = new EventEmitter<RhUpdatePersonaIdentificacionPayload>();
  @Output() readonly reloadFichaOnConflict = new EventEmitter<void>();
  @Output() readonly clearSaveFeedback = new EventEmitter<void>();
  @Output() readonly revealAuthLoss = new EventEmitter<401 | 403>();

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
    eye: Eye,
    eyeOff: EyeOff,
    trash: Trash2,
  };

  /**
   * Estado volátil y local al componente de ficha para la revelación temporal de RFC/CURP (RH-2B.4H.1).
   * Nunca se persiste en localStorage, sessionStorage, IndexedDB, servicios compartidos ni parámetros de URL.
   */
  readonly revealedIds = signal<{ personaId: number; rfc: string | null; curp: string | null } | null>(
    null
  );
  readonly revealingIds = signal(false);
  readonly revealError = signal<string | null>(null);
  private revealSeq = 0;

  /** Señal interna de modo edición para la sección A de identificación personal (RH-2B.4H.2) */
  readonly editIdentificacionMode = signal(false);

  /** Copia inmutable de `data.personal` al entrar en modo edición de identificación */
  readonly originalPersonal = signal<RhTrabajadorFichaPersonal | null>(null);

  /** Borradores editables para la sección A (RFC y CURP siempre inician vacíos) */
  readonly draftNombres = signal('');
  readonly draftApellidos = signal('');
  readonly draftNombreCompleto = signal('');
  readonly draftRfcNew = signal('');
  readonly draftCurpNew = signal('');

  /** Flujo de confirmación explícita para eliminar un identificador registrado (RFC / CURP) */
  readonly confirmClearRfcPrompt = signal(false);
  readonly markClearRfc = signal(false);
  readonly confirmClearCurpPrompt = signal(false);
  readonly markClearCurp = signal(false);
  readonly localIdentificacionError = signal<string | null>(null);

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
  private trackedUnidadId: number | null = null;
  private trackedPersonaId: number | null = null;

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
    if (!this.editMode() || this.savingLaboral || this.savingIdentificacion) {
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

  // ==================== LÓGICA DE EDICIÓN DE IDENTIFICACIÓN PERSONAL (RH-2B.4H.2) ====================

  get isBusySaving(): boolean {
    return this.savingLaboral || this.savingIdentificacion;
  }

  get canEditIdentificacion(): boolean {
    return Boolean(this.ficha?.permisos?.puede_editar_identificacion === true);
  }

  readonly hadOriginalStructuredNames = computed<boolean>(() => {
    const orig = this.originalPersonal();
    if (!orig) {
      return false;
    }
    const n = orig.nombres != null ? orig.nombres.trim() : '';
    const a = orig.apellidos != null ? orig.apellidos.trim() : '';
    return n.length > 0 || a.length > 0;
  });

  readonly willHaveStructuredNames = computed<boolean>(() => {
    const n = normalizeCollapsedPersonNamePart(this.draftNombres());
    const a = normalizeCollapsedPersonNamePart(this.draftApellidos());
    return n !== null || a !== null;
  });

  readonly derivedNombreCompletoPreview = computed<string>(() => {
    const n = normalizeCollapsedPersonNamePart(this.draftNombres()) ?? '';
    const a = normalizeCollapsedPersonNamePart(this.draftApellidos()) ?? '';
    return `${n} ${a}`.trim();
  });

  readonly computedIdentificacionPatch = computed<RhUpdatePersonaIdentificacionPayload>(() => {
    const orig = this.originalPersonal();
    if (!orig) {
      return {};
    }

    const patch: RhUpdatePersonaIdentificacionPayload = {};

    const origNombres =
      orig.nombres != null && orig.nombres.trim() !== ''
        ? orig.nombres.trim().replace(/\s+/g, ' ')
        : null;
    const origApellidos =
      orig.apellidos != null && orig.apellidos.trim() !== ''
        ? orig.apellidos.trim().replace(/\s+/g, ' ')
        : null;
    const origNombreCompleto = (orig.nombre_completo ?? '').trim().replace(/\s+/g, ' ');

    const nextNombres = normalizeCollapsedPersonNamePart(this.draftNombres());
    const nextApellidos = normalizeCollapsedPersonNamePart(this.draftApellidos());

    if (nextNombres !== origNombres) {
      patch.nombres = nextNombres;
    }
    if (nextApellidos !== origApellidos) {
      patch.apellidos = nextApellidos;
    }

    const hasStructured = nextNombres !== null || nextApellidos !== null;
    if (!hasStructured) {
      // Caso legado donde nombres y apellidos son NULL y solo se edita nombre_completo
      const nextFull = normalizeCollapsedPersonNamePart(this.draftNombreCompleto());
      if (nextFull !== null && nextFull !== origNombreCompleto) {
        patch.nombre_completo = nextFull;
      }
    }

    // Semántica estricta de RFC: omitir si no se capturó ni se confirmó eliminar
    if (this.markClearRfc() && orig.tiene_rfc) {
      patch.rfc = null;
    } else {
      const rfcInput = this.draftRfcNew().trim().toUpperCase();
      if (rfcInput.length > 0) {
        patch.rfc = rfcInput;
      }
    }

    // Semántica estricta de CURP: omitir si no se capturó ni se confirmó eliminar
    if (this.markClearCurp() && orig.tiene_curp) {
      patch.curp = null;
    } else {
      const curpInput = this.draftCurpNew().trim().toUpperCase();
      if (curpInput.length > 0) {
        patch.curp = curpInput;
      }
    }

    return patch;
  });

  readonly hasEffectiveIdentificacionChanges = computed<boolean>(
    () => Object.keys(this.computedIdentificacionPatch()).length > 0
  );

  readonly identificacionNamesValidationError = computed<string | null>(() => {
    if (!this.editIdentificacionMode()) {
      return null;
    }

    const n = normalizeCollapsedPersonNamePart(this.draftNombres());
    const a = normalizeCollapsedPersonNamePart(this.draftApellidos());

    if (n && n.length > 150) {
      return 'El campo «Nombres» no puede exceder 150 caracteres.';
    }
    if (a && a.length > 150) {
      return 'El campo «Apellidos» no puede exceder 150 caracteres.';
    }

    const hadStructured = this.hadOriginalStructuredNames();
    const willHaveStructured = n !== null || a !== null;

    if (hadStructured && !willHaveStructured) {
      return 'No se permite vaciar simultáneamente «Nombres» y «Apellidos» en un registro que ya cuenta con nombre estructurado.';
    }

    if (willHaveStructured) {
      const derived = `${n ?? ''} ${a ?? ''}`.trim();
      if (!derived) {
        return 'El nombre resultante del trabajador no puede quedar vacío.';
      }
      if (derived.length > 150) {
        return 'La combinación de «Nombres» y «Apellidos» no puede exceder 150 caracteres en «Nombre completo».';
      }
    } else {
      const full = normalizeCollapsedPersonNamePart(this.draftNombreCompleto());
      if (!full) {
        return 'El campo «Nombre completo» no puede quedar vacío.';
      }
      if (full.length > 150) {
        return 'El campo «Nombre completo» no puede exceder 150 caracteres.';
      }
    }

    return null;
  });

  readonly identificacionRfcValidationError = computed<string | null>(() => {
    if (!this.editIdentificacionMode() || this.markClearRfc()) {
      return null;
    }
    const raw = this.draftRfcNew().trim().toUpperCase();
    if (!raw) {
      return null;
    }
    if (raw.includes('*')) {
      return 'No se permite capturar un RFC enmascarado con asteriscos; ingresa el RFC completo.';
    }
    if (raw.length === 12) {
      return 'No se admite RFC de persona moral (12 caracteres); captura un RFC de persona física (10 o 13 caracteres).';
    }
    const match = RFC_PERSONA_FISICA_REGEX.exec(raw);
    if (!match || !isValidTwoDigitMonthDay(match[2], match[3])) {
      return 'El RFC debe cumplir el formato estructural de persona física (10 o 13 caracteres con fecha válida).';
    }
    return null;
  });

  readonly identificacionCurpValidationError = computed<string | null>(() => {
    if (!this.editIdentificacionMode() || this.markClearCurp()) {
      return null;
    }
    const raw = this.draftCurpNew().trim().toUpperCase();
    if (!raw) {
      return null;
    }
    if (raw.includes('*')) {
      return 'No se permite capturar una CURP enmascarada con asteriscos; ingresa la CURP completa.';
    }
    const match = CURP_REGEX.exec(raw);
    if (!match || !isValidTwoDigitMonthDay(match[2], match[3])) {
      return 'La CURP debe tener exactamente 18 caracteres con estructura oficial y fecha calendario válida.';
    }
    return null;
  });

  readonly canSaveIdentificacion = computed<boolean>(() => {
    if (!this.editIdentificacionMode() || this.savingIdentificacion || this.savingLaboral) {
      return false;
    }
    if (this.ficha?.permisos?.puede_editar_identificacion !== true) {
      return false;
    }
    if (this.confirmClearRfcPrompt() || this.confirmClearCurpPrompt()) {
      return false;
    }
    if (
      this.identificacionNamesValidationError() !== null ||
      this.identificacionRfcValidationError() !== null ||
      this.identificacionCurpValidationError() !== null
    ) {
      return false;
    }
    return this.hasEffectiveIdentificacionChanges();
  });

  /**
   * Indica si la acción «Mostrar identificadores» / «Ocultar identificadores» está disponible:
   * - Exige estrictamente `data.permisos.puede_revelar_sensibles === true`.
   * - Exige que al menos uno de `data.personal.tiene_rfc` o `data.personal.tiene_curp` sea `true`.
   */
  get canRevealIdentificadores(): boolean {
    const f = this.ficha;
    if (!f || f.permisos?.puede_revelar_sensibles !== true) {
      return false;
    }
    return Boolean(f.personal?.tiene_rfc || f.personal?.tiene_curp);
  }

  /**
   * Verifica que exista una revelación activa y que su `personaId` coincida exactamente
   * con `ficha.personal.persona_id` y con el permiso vigente.
   */
  get isIdentificadoresRevealed(): boolean {
    const rev = this.revealedIds();
    const f = this.ficha;
    if (!rev || !f || f.permisos?.puede_revelar_sensibles !== true) {
      return false;
    }
    return rev.personaId === f.personal?.persona_id;
  }

  get displayedRfc(): string | null {
    const f = this.ficha;
    if (!f) {
      return null;
    }
    if (this.isIdentificadoresRevealed) {
      return this.revealedIds()?.rfc ?? null;
    }
    return f.personal?.tiene_rfc && f.personal?.rfc_masked ? f.personal.rfc_masked : null;
  }

  get displayedCurp(): string | null {
    const f = this.ficha;
    if (!f) {
      return null;
    }
    if (this.isIdentificadoresRevealed) {
      return this.revealedIds()?.curp ?? null;
    }
    return f.personal?.tiene_curp && f.personal?.curp_masked ? f.personal.curp_masked : null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && !this.open) {
      this.resetEditMode();
      this.resetIdentificacionEditMode();
      this.clearRevealedIdentificadores();
      this.trackedAdscripcionId = null;
      this.trackedUnidadId = null;
      this.trackedPersonaId = null;
      return;
    }

    if (changes['ficha']) {
      const currentAdscripcionId = this.ficha?.laboral?.adscripcion_laboral_id ?? null;
      const currentUnidadId =
        this.ficha?.unidad?.id ?? this.ficha?.laboral?.unidad_medica_id ?? null;
      const currentPersonaId = this.ficha?.personal?.persona_id ?? null;
      const canStillReveal = this.ficha?.permisos?.puede_revelar_sensibles === true;
      const canStillEditIdentificacion =
        this.ficha?.permisos?.puede_editar_identificacion === true;

      const contextChanged =
        !this.ficha ||
        currentAdscripcionId !== this.trackedAdscripcionId ||
        currentUnidadId !== this.trackedUnidadId ||
        currentPersonaId !== this.trackedPersonaId;

      if (contextChanged) {
        this.trackedAdscripcionId = currentAdscripcionId;
        this.trackedUnidadId = currentUnidadId;
        this.trackedPersonaId = currentPersonaId;
        this.resetEditMode();
        this.resetIdentificacionEditMode();
        this.clearRevealedIdentificadores();
      } else {
        if (!canStillReveal) {
          this.clearRevealedIdentificadores();
        }
        if (!canStillEditIdentificacion) {
          this.resetIdentificacionEditMode();
        }
        if (this.editMode() && this.saveLaboralSuccess) {
          // Cuando el padre actualiza `ficha` tras un PATCH laboral 200 exitoso, regresar a modo consulta
          this.resetEditMode();
        }
        if (this.editIdentificacionMode() && this.saveIdentificacionSuccess) {
          // Cuando el padre actualiza `ficha` tras un PATCH de identificación 200 exitoso, limpiar borrador y regresar a modo consulta
          this.resetIdentificacionEditMode();
          this.clearRevealedIdentificadores();
        }
      }
    }
  }

  ngOnDestroy(): void {
    this.resetIdentificacionEditMode();
    this.clearRevealedIdentificadores();
  }

  // ==================== ACCIONES DE EDICIÓN DE IDENTIFICACIÓN PERSONAL (RH-2B.4H.2) ====================

  startEditIdentificacion(): void {
    if (
      !this.ficha ||
      this.ficha.permisos?.puede_editar_identificacion !== true ||
      this.isBusySaving ||
      this.editMode()
    ) {
      return;
    }

    // Regla 8: Al iniciar edición personal, ocultar y limpiar cualquier RFC/CURP completo revelado anteriormente
    // y nunca trasladar valores de `revealedIds` ni máscaras al borrador
    this.clearRevealedIdentificadores();

    const per = this.ficha.personal;
    this.originalPersonal.set({ ...per });
    this.draftNombres.set(per.nombres ?? '');
    this.draftApellidos.set(per.apellidos ?? '');
    this.draftNombreCompleto.set(per.nombre_completo ?? '');
    this.draftRfcNew.set('');
    this.draftCurpNew.set('');
    this.confirmClearRfcPrompt.set(false);
    this.markClearRfc.set(false);
    this.confirmClearCurpPrompt.set(false);
    this.markClearCurp.set(false);
    this.localIdentificacionError.set(null);
    this.clearSaveFeedback.emit();
    this.editIdentificacionMode.set(true);
  }

  cancelEditIdentificacion(): void {
    if (this.isBusySaving) {
      return;
    }
    this.resetIdentificacionEditMode();
    this.clearSaveFeedback.emit();
  }

  onDraftRfcInput(raw: string): void {
    const normalized = raw.toUpperCase();
    this.draftRfcNew.set(normalized);
    if (normalized.trim().length > 0) {
      this.confirmClearRfcPrompt.set(false);
      this.markClearRfc.set(false);
    }
  }

  onDraftCurpInput(raw: string): void {
    const normalized = raw.toUpperCase();
    this.draftCurpNew.set(normalized);
    if (normalized.trim().length > 0) {
      this.confirmClearCurpPrompt.set(false);
      this.markClearCurp.set(false);
    }
  }

  requestClearRfc(): void {
    if (this.isBusySaving || !this.originalPersonal()?.tiene_rfc) {
      return;
    }
    this.confirmClearRfcPrompt.set(true);
  }

  cancelClearRfcPrompt(): void {
    this.confirmClearRfcPrompt.set(false);
  }

  confirmClearRfc(): void {
    if (this.isBusySaving || !this.originalPersonal()?.tiene_rfc) {
      return;
    }
    this.draftRfcNew.set('');
    this.confirmClearRfcPrompt.set(false);
    this.markClearRfc.set(true);
  }

  undoClearRfc(): void {
    if (this.isBusySaving) {
      return;
    }
    this.confirmClearRfcPrompt.set(false);
    this.markClearRfc.set(false);
  }

  requestClearCurp(): void {
    if (this.isBusySaving || !this.originalPersonal()?.tiene_curp) {
      return;
    }
    this.confirmClearCurpPrompt.set(true);
  }

  cancelClearCurpPrompt(): void {
    this.confirmClearCurpPrompt.set(false);
  }

  confirmClearCurp(): void {
    if (this.isBusySaving || !this.originalPersonal()?.tiene_curp) {
      return;
    }
    this.draftCurpNew.set('');
    this.confirmClearCurpPrompt.set(false);
    this.markClearCurp.set(true);
  }

  undoClearCurp(): void {
    if (this.isBusySaving) {
      return;
    }
    this.confirmClearCurpPrompt.set(false);
    this.markClearCurp.set(false);
  }

  onSubmitEditIdentificacion(): void {
    if (this.isBusySaving || !this.editIdentificacionMode()) {
      return;
    }

    this.localIdentificacionError.set(null);

    if (this.ficha?.permisos?.puede_editar_identificacion !== true) {
      this.localIdentificacionError.set(
        'No cuentas con permiso para editar los datos de identificación personal.'
      );
      return;
    }

    if (this.confirmClearRfcPrompt() || this.confirmClearCurpPrompt()) {
      this.localIdentificacionError.set(
        'Confirma o cancela la eliminación pendiente de RFC o CURP antes de guardar.'
      );
      return;
    }

    const nameErr = this.identificacionNamesValidationError();
    if (nameErr) {
      this.localIdentificacionError.set(nameErr);
      return;
    }

    const rfcErr = this.identificacionRfcValidationError();
    if (rfcErr) {
      this.localIdentificacionError.set(rfcErr);
      return;
    }

    const curpErr = this.identificacionCurpValidationError();
    if (curpErr) {
      this.localIdentificacionError.set(curpErr);
      return;
    }

    const patch = this.computedIdentificacionPatch();
    if (Object.keys(patch).length === 0) {
      return;
    }

    this.saveIdentificacion.emit(patch);
  }

  resetIdentificacionEditMode(): void {
    this.editIdentificacionMode.set(false);
    this.originalPersonal.set(null);
    this.draftNombres.set('');
    this.draftApellidos.set('');
    this.draftNombreCompleto.set('');
    this.draftRfcNew.set('');
    this.draftCurpNew.set('');
    this.confirmClearRfcPrompt.set(false);
    this.markClearRfc.set(false);
    this.confirmClearCurpPrompt.set(false);
    this.markClearCurp.set(false);
    this.localIdentificacionError.set(null);
  }

  /**
   * Solicita explícitamente al backend la revelación auditada de RFC y CURP completos
   * (`POST /api/rh/unidades/:unidadId/personal/:adscripcionId/revelar-identificadores`).
   * - Impide invocación programática si `puede_revelar_sensibles !== true` o si no hay RFC/CURP.
   * - Evita solicitudes duplicadas mientras `revealingIds()` es `true`.
   * - Verifica que `persona_id` en la respuesta coincida con la persona de la ficha vigente.
   * - Nunca realiza reintentos automáticos (cada intento genera un evento de auditoría).
   */
  async onMostrarIdentificadores(): Promise<void> {
    if (this.revealingIds() || !this.open) {
      return;
    }

    const currentFicha = this.ficha;
    if (
      !currentFicha ||
      currentFicha.permisos?.puede_revelar_sensibles !== true ||
      (!currentFicha.personal?.tiene_rfc && !currentFicha.personal?.tiene_curp)
    ) {
      return;
    }

    const unidadId = currentFicha.unidad?.id ?? currentFicha.laboral?.unidad_medica_id;
    const adscripcionId = currentFicha.laboral?.adscripcion_laboral_id;
    const expectedPersonaId = currentFicha.personal?.persona_id;

    if (
      typeof unidadId !== 'number' ||
      !Number.isInteger(unidadId) ||
      unidadId <= 0 ||
      typeof adscripcionId !== 'number' ||
      !Number.isInteger(adscripcionId) ||
      adscripcionId <= 0 ||
      typeof expectedPersonaId !== 'number' ||
      !Number.isInteger(expectedPersonaId) ||
      expectedPersonaId <= 0
    ) {
      return;
    }

    const seq = ++this.revealSeq;
    this.revealingIds.set(true);
    this.revealError.set(null);

    try {
      const res = await this.rhService.revelarIdentificadoresUnidad(unidadId, adscripcionId);

      // Si el usuario pulsó «Ocultar», cerró la ficha, cambió de trabajador/unidad o perdió permisos mientras cargaba,
      // descartar la respuesta tardía sin exponer los valores
      const latestFicha = this.ficha;
      const latestUnidadId = latestFicha?.unidad?.id ?? latestFicha?.laboral?.unidad_medica_id;
      const latestAdscripcionId = latestFicha?.laboral?.adscripcion_laboral_id;
      const latestPersonaId = latestFicha?.personal?.persona_id;

      if (
        seq !== this.revealSeq ||
        !this.open ||
        !latestFicha ||
        latestFicha.permisos?.puede_revelar_sensibles !== true ||
        latestUnidadId !== unidadId ||
        latestAdscripcionId !== adscripcionId ||
        latestPersonaId !== expectedPersonaId
      ) {
        return;
      }

      // Verificar que `persona_id` devuelto por el backend coincida exactamente con la persona de la ficha vigente
      if (!res || Number(res.persona_id) !== expectedPersonaId) {
        this.revealedIds.set(null);
        this.revealError.set(
          'La respuesta recibida no corresponde al trabajador de la ficha actual.'
        );
        return;
      }

      const rfcClean =
        typeof res.rfc === 'string' && res.rfc.trim().length > 0 ? res.rfc.trim() : null;
      const curpClean =
        typeof res.curp === 'string' && res.curp.trim().length > 0 ? res.curp.trim() : null;

      this.revealedIds.set({
        personaId: expectedPersonaId,
        rfc: rfcClean,
        curp: curpClean,
      });
    } catch (err: unknown) {
      if (seq !== this.revealSeq) {
        return;
      }

      // Ante cualquier error, limpiar inmediatamente cualquier dato completo previo y conservar máscaras
      this.revealedIds.set(null);

      const status = err instanceof HttpErrorResponse ? err.status : null;

      if (status === 401 || status === 403) {
        this.clearRevealedIdentificadores();
        this.revealAuthLoss.emit(status);
        return;
      }

      if (status === 400) {
        this.revealError.set(
          'Solicitud inválida para revelar identificadores del trabajador (HTTP 400).'
        );
        return;
      }

      if (status === 404) {
        this.revealError.set(
          'La adscripción laboral ya no se encuentra disponible en la unidad seleccionada (HTTP 404).'
        );
        return;
      }

      this.revealError.set(
        'No fue posible revelar los identificadores en este momento. Se conservan los valores protegidos.'
      );
    } finally {
      if (seq === this.revealSeq) {
        this.revealingIds.set(false);
      }
    }
  }

  /**
   * Oculta inmediatamente los identificadores completos limpiando el estado volátil local,
   * invalida cualquier solicitud de revelación en curso y regresa a `rfc_masked` / `curp_masked`
   * sin emitir ninguna petición HTTP adicional.
   */
  onOcultarIdentificadores(): void {
    this.clearRevealedIdentificadores();
  }

  clearRevealedIdentificadores(): void {
    this.revealSeq++;
    this.revealingIds.set(false);
    this.revealedIds.set(null);
    this.revealError.set(null);
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
    if (
      !this.ficha ||
      !this.ficha.permisos?.puede_editar_laboral ||
      this.isBusySaving ||
      this.editIdentificacionMode()
    ) {
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
    if (this.isBusySaving) {
      return;
    }
    this.resetEditMode();
    this.clearSaveFeedback.emit();
  }

  onSubmitEditLaboral(): void {
    if (this.isBusySaving || !this.editMode()) {
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
    if (this.isBusySaving) {
      return;
    }
    this.resetEditMode();
    this.resetIdentificacionEditMode();
    this.clearRevealedIdentificadores();
    this.reloadFichaOnConflict.emit();
  }

  onClose(): void {
    if (this.isBusySaving) {
      return;
    }
    this.resetEditMode();
    this.resetIdentificacionEditMode();
    this.clearRevealedIdentificadores();
    this.closeDialog.emit();
  }

  onRetry(): void {
    if (this.isBusySaving) {
      return;
    }
    this.resetIdentificacionEditMode();
    this.clearRevealedIdentificadores();
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
