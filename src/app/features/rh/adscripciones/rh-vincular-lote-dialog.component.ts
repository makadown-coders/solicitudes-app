import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  OnDestroy,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  LucideAngularModule,
  Search,
  SlidersHorizontal,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-angular';
import {
  RhLoteAdscripcionCamposLaborales,
  RhLoteAdscripcionEjecucionResponse,
  RhLoteAdscripcionItemPayload,
  RhLoteAdscripcionResultadoEstado,
  RhLoteAdscripcionesPayload,
  RhLoteAdscripcionValidacionEstado,
  RhLoteAdscripcionValidarResponse,
  RhPersonaAdminDto,
  RhService,
} from '../../../services/rh.service';

export type RhLoteWizardStep = 1 | 2 | 3;

export interface RhLoteOverrideDraft {
  vigente_desde?: string | null;
  vigente_hasta?: string | null;
  matricula?: string | null;
  puesto?: string | null;
  turno?: string | null;
  jornada?: string | null;
  horario?: string | null;
  observaciones?: string | null;
}

const MAX_LOTE_ITEMS = 100;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const FIELD_MAX_LENGTHS: Readonly<Record<keyof RhLoteAdscripcionCamposLaborales, number>> = {
  vigente_desde: 10,
  vigente_hasta: 10,
  matricula: 50,
  puesto: 120,
  turno: 60,
  jornada: 60,
  horario: 120,
  observaciones: 500,
};

@Component({
  selector: 'app-rh-vincular-lote-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rh-vincular-lote-dialog.component.html',
})
export class RhVincularLoteDialogComponent implements OnDestroy {
  private readonly rhService = inject(RhService);

  readonly open = input<boolean>(false);
  readonly unidadId = input<number | null>(null);
  readonly unidadNombre = input<string>('');
  readonly unidadClues = input<string | null>(null);

  readonly closed = output<void>();
  readonly completed = output<RhLoteAdscripcionEjecucionResponse>();
  readonly unauthorized = output<void>();

  readonly maxItems = MAX_LOTE_ITEMS;

  readonly icons = {
    users: Users,
    userCheck: UserCheck,
    search: Search,
    clear: X,
    loader: Loader2,
    alert: AlertCircle,
    warning: AlertTriangle,
    checkCircle: CheckCircle2,
    arrowLeft: ArrowLeft,
    arrowRight: ArrowRight,
    first: ChevronsLeft,
    prev: ChevronLeft,
    next: ChevronRight,
    last: ChevronsRight,
    sliders: SlidersHorizontal,
    chevronDown: ChevronDown,
    chevronUp: ChevronUp,
    trash: Trash2,
  };

  /** Paso actual del asistente (1: Selección, 2: Datos laborales, 3: Revisar y confirmar) */
  readonly currentStep = signal<RhLoteWizardStep>(1);

  /** Paso 1: Candidatos desde Plantilla institucional */
  readonly searchDraft = signal('');
  readonly appliedSearch = signal('');
  readonly candidates = signal<RhPersonaAdminDto[]>([]);
  readonly loadingCandidates = signal(false);
  readonly errorCandidates = signal<string | null>(null);
  readonly page = signal(1);
  readonly pageSize = signal(20);
  readonly totalCandidates = signal(0);

  /** Selección deduplicada persistente entre páginas y filtros */
  readonly selectedMap = signal<Record<number, RhPersonaAdminDto>>({});
  readonly selectingAllFiltered = signal(false);
  readonly selectionNotice = signal<string | null>(null);

  /** Paso 2: Valores comunes (sin autocompletar fecha ni cargo) */
  readonly defaultVigenteDesde = signal('');
  readonly defaultVigenteHasta = signal('');
  readonly defaultMatricula = signal('');
  readonly defaultPuesto = signal('');
  readonly defaultTurno = signal('');
  readonly defaultJornada = signal('');
  readonly defaultHorario = signal('');
  readonly defaultObservaciones = signal('');

  /** Sobrescrituras por persona (`undefined` = heredar, `null` = limpiar explícitamente, `string` = sobrescribir) */
  readonly overridesByPersona = signal<Record<number, RhLoteOverrideDraft>>({});
  readonly expandedOverridePersonaId = signal<number | null>(null);

  /** Paso 3: Prevalidación y ejecución */
  readonly validating = signal(false);
  readonly validationError = signal<string | null>(null);
  readonly validationResult = signal<RhLoteAdscripcionValidarResponse | null>(null);

  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly submitUncertainWarning = signal<string | null>(null);
  readonly executionResult = signal<RhLoteAdscripcionEjecucionResponse | null>(null);

  private candidatesRequestSeq = 0;
  private selectAllRequestSeq = 0;
  private validateRequestSeq = 0;
  private submitRequestSeq = 0;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private lastOpenedUnidadId: number | null = null;
  private wasOpen = false;

  readonly selectedList = computed<RhPersonaAdminDto[]>(() => {
    const map = this.selectedMap();
    return Object.values(map).sort((a, b) =>
      this.formatPersonaNombre(a).localeCompare(this.formatPersonaNombre(b), 'es-MX')
    );
  });

  readonly selectedCount = computed<number>(() => Object.keys(this.selectedMap()).length);

  readonly totalPages = computed<number>(() => {
    const total = this.totalCandidates();
    const size = this.pageSize();
    return Math.max(1, Math.ceil(total / Math.max(1, size)));
  });

  readonly pageOptions = computed<number[]>(() => {
    const count = this.totalPages();
    const pages: number[] = [];
    for (let i = 1; i <= count; i += 1) {
      pages.push(i);
    }
    return pages;
  });

  readonly rangeLabel = computed<string>(() => {
    const total = this.totalCandidates();
    if (total === 0) {
      return 'Mostrando 0 de 0 personas';
    }
    const start = (this.page() - 1) * this.pageSize() + 1;
    const end = Math.min(total, this.page() * this.pageSize());
    return `Mostrando ${start}–${end} de ${total} personas`;
  });

  readonly allCurrentPageSelected = computed<boolean>(() => {
    const items = this.candidates();
    if (items.length === 0) {
      return false;
    }
    const map = this.selectedMap();
    return items.every((item) => Boolean(map[item.persona_id]));
  });

  readonly step2ValidationErrors = computed<string[]>(() => {
    const errors: string[] = [];
    const selected = this.selectedList();
    if (selected.length === 0) {
      errors.push('Selecciona al menos un trabajador en el Paso 1.');
      return errors;
    }
    if (selected.length > MAX_LOTE_ITEMS) {
      errors.push(`El lote no puede superar ${MAX_LOTE_ITEMS} trabajadores.`);
    }

    const defDesde = this.defaultVigenteDesde().trim();
    const defHasta = this.defaultVigenteHasta().trim();

    if (defDesde && !DATE_REGEX.test(defDesde)) {
      errors.push('La fecha común «Vigente desde» debe tener formato AAAA-MM-DD.');
    }
    if (defHasta && !DATE_REGEX.test(defHasta)) {
      errors.push('La fecha común «Vigente hasta» debe tener formato AAAA-MM-DD.');
    }
    if (defDesde && defHasta && DATE_REGEX.test(defDesde) && DATE_REGEX.test(defHasta) && defHasta < defDesde) {
      errors.push('La fecha común «Vigente hasta» no puede ser anterior a «Vigente desde».');
    }

    const commonTextChecks: Array<[string, string, number]> = [
      ['Matrícula común', this.defaultMatricula().trim(), FIELD_MAX_LENGTHS.matricula],
      ['Puesto común', this.defaultPuesto().trim(), FIELD_MAX_LENGTHS.puesto],
      ['Turno común', this.defaultTurno().trim(), FIELD_MAX_LENGTHS.turno],
      ['Jornada común', this.defaultJornada().trim(), FIELD_MAX_LENGTHS.jornada],
      ['Horario común', this.defaultHorario().trim(), FIELD_MAX_LENGTHS.horario],
      ['Observaciones comunes', this.defaultObservaciones().trim(), FIELD_MAX_LENGTHS.observaciones],
    ];
    for (const [label, value, maxLen] of commonTextChecks) {
      if (value.length > maxLen) {
        errors.push(`${label} excede el máximo de ${maxLen} caracteres.`);
      }
    }

    const overrides = this.overridesByPersona();
    let missingVigenteDesdeCount = 0;
    let invalidRangeCount = 0;

    for (const persona of selected) {
      const ov = overrides[persona.persona_id];
      const effDesde =
        ov && Object.prototype.hasOwnProperty.call(ov, 'vigente_desde')
          ? (ov.vigente_desde ?? '').trim()
          : defDesde;
      const effHasta =
        ov && Object.prototype.hasOwnProperty.call(ov, 'vigente_hasta')
          ? (ov.vigente_hasta ?? '').trim()
          : defHasta;

      if (!effDesde || !DATE_REGEX.test(effDesde)) {
        missingVigenteDesdeCount += 1;
      } else if (effHasta) {
        if (!DATE_REGEX.test(effHasta) || effHasta < effDesde) {
          invalidRangeCount += 1;
        }
      }

      if (ov) {
        for (const key of ['matricula', 'puesto', 'turno', 'jornada', 'horario', 'observaciones'] as const) {
          const val = ov[key];
          if (typeof val === 'string' && val.trim().length > FIELD_MAX_LENGTHS[key]) {
            errors.push(
              `El campo «${key}» para ${this.formatPersonaNombre(persona)} excede ${FIELD_MAX_LENGTHS[key]} caracteres.`
            );
          }
        }
      }
    }

    if (missingVigenteDesdeCount > 0) {
      errors.push(
        missingVigenteDesdeCount === 1
          ? 'Falta capturar la fecha «Vigente desde» (obligatoria) para 1 trabajador.'
          : `Falta capturar la fecha «Vigente desde» (obligatoria) para ${missingVigenteDesdeCount} trabajadores.`
      );
    }

    if (invalidRangeCount > 0) {
      errors.push(
        invalidRangeCount === 1
          ? '1 trabajador tiene una fecha «Vigente hasta» anterior o inválida respecto a «Vigente desde».'
          : `${invalidRangeCount} trabajadores tienen una fecha «Vigente hasta» anterior o inválida respecto a «Vigente desde».`
      );
    }

    return errors;
  });

  readonly canProceedToStep2 = computed<boolean>(
    () => this.selectedCount() > 0 && this.selectedCount() <= MAX_LOTE_ITEMS && !this.selectingAllFiltered()
  );

  readonly canProceedToStep3 = computed<boolean>(
    () => this.selectedCount() > 0 && this.step2ValidationErrors().length === 0
  );

  readonly canConfirmExecution = computed<boolean>(() => {
    const val = this.validationResult();
    return Boolean(
      val &&
        val.elegibles > 0 &&
        !this.validating() &&
        !this.submitting() &&
        this.executionResult() === null &&
        this.unidadId() !== null
    );
  });

  readonly personaLookupById = computed<Record<number, RhPersonaAdminDto>>(() => this.selectedMap());

  constructor() {
    effect(() => {
      const isOpen = this.open();
      const uid = this.unidadId();

      if (isOpen && (!this.wasOpen || this.lastOpenedUnidadId !== uid)) {
        this.wasOpen = true;
        this.lastOpenedUnidadId = uid;
        this.resetWizardState();
        if (uid !== null) {
          void this.cargarCandidatos(1);
        }
      } else if (!isOpen && this.wasOpen) {
        this.wasOpen = false;
        this.clearSearchTimer();
        this.candidatesRequestSeq += 1;
        this.selectAllRequestSeq += 1;
        this.validateRequestSeq += 1;
      }
    });
  }

  ngOnDestroy(): void {
    this.clearSearchTimer();
    this.candidatesRequestSeq += 1;
    this.selectAllRequestSeq += 1;
    this.validateRequestSeq += 1;
    this.submitRequestSeq += 1;
  }

  resetWizardState(): void {
    this.clearSearchTimer();
    this.candidatesRequestSeq += 1;
    this.selectAllRequestSeq += 1;
    this.validateRequestSeq += 1;
    this.submitRequestSeq += 1;

    this.currentStep.set(1);
    this.searchDraft.set('');
    this.appliedSearch.set('');
    this.candidates.set([]);
    this.loadingCandidates.set(false);
    this.errorCandidates.set(null);
    this.page.set(1);
    this.pageSize.set(20);
    this.totalCandidates.set(0);

    this.selectedMap.set({});
    this.selectingAllFiltered.set(false);
    this.selectionNotice.set(null);

    this.defaultVigenteDesde.set('');
    this.defaultVigenteHasta.set('');
    this.defaultMatricula.set('');
    this.defaultPuesto.set('');
    this.defaultTurno.set('');
    this.defaultJornada.set('');
    this.defaultHorario.set('');
    this.defaultObservaciones.set('');

    this.overridesByPersona.set({});
    this.expandedOverridePersonaId.set(null);

    this.validating.set(false);
    this.validationError.set(null);
    this.validationResult.set(null);

    this.submitting.set(false);
    this.submitError.set(null);
    this.submitUncertainWarning.set(null);
    this.executionResult.set(null);
  }

  requestClose(): void {
    if (this.submitting()) {
      return;
    }
    this.closed.emit();
  }

  // ---------------------------------------------------------------------------
  // Paso 1: Búsqueda dinámica, paginación completa y selección
  // ---------------------------------------------------------------------------

  onSearchInput(value: string): void {
    this.searchDraft.set(value);
    this.clearSearchTimer();
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      this.appliedSearch.set(this.searchDraft().trim());
      void this.cargarCandidatos(1);
    }, 300);
  }

  clearSearch(): void {
    this.clearSearchTimer();
    this.searchDraft.set('');
    this.appliedSearch.set('');
    void this.cargarCandidatos(1);
  }

  async cargarCandidatos(targetPage?: number): Promise<void> {
    const uid = this.unidadId();
    if (uid === null) {
      return;
    }
    const nextPage = targetPage ?? this.page();
    this.page.set(Math.max(1, nextPage));
    const seq = ++this.candidatesRequestSeq;

    this.loadingCandidates.set(true);
    this.errorCandidates.set(null);

    try {
      const response = await this.rhService.listarPersonasPadron({
        estado: 'activas',
        unidadId: uid,
        q: this.appliedSearch() || undefined,
        page: this.page(),
        pageSize: this.pageSize(),
      });

      if (seq !== this.candidatesRequestSeq) {
        return;
      }

      const items = Array.isArray(response?.items) ? response.items : [];
      const total = typeof response?.total === 'number' ? response.total : items.length;
      const resolvedPage = typeof response?.page === 'number' && response.page > 0 ? response.page : this.page();

      this.candidates.set(items);
      this.totalCandidates.set(total);
      this.page.set(resolvedPage);
    } catch (err) {
      if (seq !== this.candidatesRequestSeq) {
        return;
      }
      if (this.isUnauthorizedError(err)) {
        this.unauthorized.emit();
        return;
      }
      this.errorCandidates.set(
        this.extractErrorMessage(err, 'No se pudo consultar la lista de personas activas de la unidad.')
      );
    } finally {
      if (seq === this.candidatesRequestSeq) {
        this.loadingCandidates.set(false);
      }
    }
  }

  onPageSizeChange(rawSize: number | string): void {
    const parsed = Number(rawSize);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    this.pageSize.set(parsed);
    void this.cargarCandidatos(1);
  }

  goToPage(targetPage: number | string): void {
    const parsed = Number(targetPage);
    if (!Number.isFinite(parsed)) {
      return;
    }
    const clamped = Math.max(1, Math.min(this.totalPages(), Math.trunc(parsed)));
    if (clamped === this.page()) {
      return;
    }
    void this.cargarCandidatos(clamped);
  }

  isSelected(personaId: number): boolean {
    return Boolean(this.selectedMap()[personaId]);
  }

  togglePersonaSelection(persona: RhPersonaAdminDto): void {
    this.selectionNotice.set(null);
    const current = { ...this.selectedMap() };
    if (current[persona.persona_id]) {
      delete current[persona.persona_id];
      this.selectedMap.set(current);
      this.invalidateValidation();
      return;
    }

    if (Object.keys(current).length >= MAX_LOTE_ITEMS) {
      this.selectionNotice.set(
        `Has alcanzado el límite máximo de ${MAX_LOTE_ITEMS} trabajadores por lote.`
      );
      return;
    }

    current[persona.persona_id] = persona;
    this.selectedMap.set(current);
    this.invalidateValidation();
  }

  toggleCurrentPageSelection(): void {
    this.selectionNotice.set(null);
    const items = this.candidates();
    if (items.length === 0) {
      return;
    }

    const current = { ...this.selectedMap() };
    if (this.allCurrentPageSelected()) {
      for (const item of items) {
        delete current[item.persona_id];
      }
      this.selectedMap.set(current);
      this.invalidateValidation();
      return;
    }

    let skippedLimit = 0;
    for (const item of items) {
      if (current[item.persona_id]) {
        continue;
      }
      if (Object.keys(current).length >= MAX_LOTE_ITEMS) {
        skippedLimit += 1;
        continue;
      }
      current[item.persona_id] = item;
    }

    this.selectedMap.set(current);
    this.invalidateValidation();

    if (skippedLimit > 0) {
      this.selectionNotice.set(
        `Se alcanzó el límite de ${MAX_LOTE_ITEMS} trabajadores por lote (${skippedLimit} persona(s) de esta página no se agregaron).`
      );
    }
  }

  async selectAllFilteredEligible(): Promise<void> {
    const uid = this.unidadId();
    if (uid === null || this.selectingAllFiltered()) {
      return;
    }

    const seq = ++this.selectAllRequestSeq;
    this.selectingAllFiltered.set(true);
    this.selectionNotice.set(null);

    try {
      const current = { ...this.selectedMap() };
      const fetchPageSize = 50;
      let nextPage = 1;
      let totalReported = 0;
      let reachedLimit = false;

      while (true) {
        const res = await this.rhService.listarPersonasPadron({
          estado: 'activas',
          unidadId: uid,
          q: this.appliedSearch() || undefined,
          page: nextPage,
          pageSize: fetchPageSize,
        });

        if (seq !== this.selectAllRequestSeq) {
          return;
        }

        const items = Array.isArray(res?.items) ? res.items : [];
        totalReported = typeof res?.total === 'number' ? res.total : items.length;

        for (const item of items) {
          if (current[item.persona_id]) {
            continue;
          }
          if (Object.keys(current).length >= MAX_LOTE_ITEMS) {
            reachedLimit = true;
            break;
          }
          current[item.persona_id] = item;
        }

        if (Object.keys(current).length >= MAX_LOTE_ITEMS) {
          reachedLimit = true;
        }

        if (reachedLimit || items.length < fetchPageSize || nextPage * fetchPageSize >= totalReported) {
          break;
        }
        nextPage += 1;
      }

      this.selectedMap.set(current);
      this.invalidateValidation();

      if (reachedLimit || totalReported > MAX_LOTE_ITEMS) {
        this.selectionNotice.set(
          `El filtro devuelve ${totalReported} personas activas. Se seleccionaron las primeras ${Object.keys(current).length} (límite máximo de ${MAX_LOTE_ITEMS} por lote).`
        );
      } else {
        this.selectionNotice.set(
          `Se seleccionaron ${Object.keys(current).length} trabajador(es) activo(s) con el filtro actual.`
        );
      }
    } catch (err) {
      if (seq !== this.selectAllRequestSeq) {
        return;
      }
      if (this.isUnauthorizedError(err)) {
        this.unauthorized.emit();
        return;
      }
      this.selectionNotice.set(
        this.extractErrorMessage(err, 'No se pudo completar la selección de todos los filtrados.')
      );
    } finally {
      if (seq === this.selectAllRequestSeq) {
        this.selectingAllFiltered.set(false);
      }
    }
  }

  clearSelection(): void {
    this.selectedMap.set({});
    this.overridesByPersona.set({});
    this.expandedOverridePersonaId.set(null);
    this.selectionNotice.set(null);
    this.invalidateValidation();
  }

  removeSelectedPersona(personaId: number): void {
    const current = { ...this.selectedMap() };
    delete current[personaId];
    this.selectedMap.set(current);

    const overrides = { ...this.overridesByPersona() };
    delete overrides[personaId];
    this.overridesByPersona.set(overrides);

    if (this.expandedOverridePersonaId() === personaId) {
      this.expandedOverridePersonaId.set(null);
    }
    this.invalidateValidation();
  }

  // ---------------------------------------------------------------------------
  // Paso 2: Datos laborales comunes y sobrescrituras por persona
  // ---------------------------------------------------------------------------

  onDefaultFieldChange(field: keyof RhLoteAdscripcionCamposLaborales, value: string): void {
    switch (field) {
      case 'vigente_desde':
        this.defaultVigenteDesde.set(value);
        break;
      case 'vigente_hasta':
        this.defaultVigenteHasta.set(value);
        break;
      case 'matricula':
        this.defaultMatricula.set(value);
        break;
      case 'puesto':
        this.defaultPuesto.set(value);
        break;
      case 'turno':
        this.defaultTurno.set(value);
        break;
      case 'jornada':
        this.defaultJornada.set(value);
        break;
      case 'horario':
        this.defaultHorario.set(value);
        break;
      case 'observaciones':
        this.defaultObservaciones.set(value);
        break;
    }
    this.invalidateValidation();
  }

  toggleOverridePanel(personaId: number): void {
    this.expandedOverridePersonaId.set(
      this.expandedOverridePersonaId() === personaId ? null : personaId
    );
  }

  getOverrideMode(
    personaId: number,
    field: keyof RhLoteAdscripcionCamposLaborales
  ): 'inherit' | 'custom' | 'null' {
    const ov = this.overridesByPersona()[personaId];
    if (!ov || !Object.prototype.hasOwnProperty.call(ov, field) || ov[field] === undefined) {
      return 'inherit';
    }
    if (ov[field] === null) {
      return 'null';
    }
    return 'custom';
  }

  getOverrideValue(personaId: number, field: keyof RhLoteAdscripcionCamposLaborales): string {
    const ov = this.overridesByPersona()[personaId];
    if (!ov || typeof ov[field] !== 'string') {
      return '';
    }
    return ov[field] as string;
  }

  setOverrideValue(
    personaId: number,
    field: keyof RhLoteAdscripcionCamposLaborales,
    value: string
  ): void {
    const overrides = { ...this.overridesByPersona() };
    const current = { ...(overrides[personaId] ?? {}) };
    const trimmed = value;
    if (trimmed === '') {
      delete current[field];
    } else {
      current[field] = trimmed;
    }
    if (Object.keys(current).length === 0) {
      delete overrides[personaId];
    } else {
      overrides[personaId] = current;
    }
    this.overridesByPersona.set(overrides);
    this.invalidateValidation();
  }

  setOverrideNull(personaId: number, field: keyof RhLoteAdscripcionCamposLaborales): void {
    const overrides = { ...this.overridesByPersona() };
    const current = { ...(overrides[personaId] ?? {}) };
    current[field] = null;
    overrides[personaId] = current;
    this.overridesByPersona.set(overrides);
    this.invalidateValidation();
  }

  clearOverrideField(personaId: number, field: keyof RhLoteAdscripcionCamposLaborales): void {
    const overrides = { ...this.overridesByPersona() };
    const current = { ...(overrides[personaId] ?? {}) };
    delete current[field];
    if (Object.keys(current).length === 0) {
      delete overrides[personaId];
    } else {
      overrides[personaId] = current;
    }
    this.overridesByPersona.set(overrides);
    this.invalidateValidation();
  }

  countOverridesForPersona(personaId: number): number {
    const ov = this.overridesByPersona()[personaId];
    return ov ? Object.keys(ov).length : 0;
  }

  // ---------------------------------------------------------------------------
  // Navegación entre pasos
  // ---------------------------------------------------------------------------

  goToStep(step: RhLoteWizardStep): void {
    if (this.submitting()) {
      return;
    }
    if (step === 2 && !this.canProceedToStep2()) {
      return;
    }
    if (step === 3) {
      if (!this.canProceedToStep3()) {
        return;
      }
      this.currentStep.set(3);
      if (this.validationResult() === null && this.executionResult() === null) {
        void this.ejecutarPrevalidacion();
      }
      return;
    }
    this.currentStep.set(step);
  }

  // ---------------------------------------------------------------------------
  // Construcción de payload, prevalidación y ejecución
  // ---------------------------------------------------------------------------

  buildPayload(): RhLoteAdscripcionesPayload {
    const defaults: RhLoteAdscripcionCamposLaborales = {};
    const addDefault = (key: keyof RhLoteAdscripcionCamposLaborales, raw: string) => {
      const trimmed = raw.trim();
      if (trimmed) {
        defaults[key] = trimmed;
      }
    };

    addDefault('vigente_desde', this.defaultVigenteDesde());
    addDefault('vigente_hasta', this.defaultVigenteHasta());
    addDefault('matricula', this.defaultMatricula());
    addDefault('puesto', this.defaultPuesto());
    addDefault('turno', this.defaultTurno());
    addDefault('jornada', this.defaultJornada());
    addDefault('horario', this.defaultHorario());
    addDefault('observaciones', this.defaultObservaciones());

    const overrides = this.overridesByPersona();
    const items: RhLoteAdscripcionItemPayload[] = this.selectedList().map((persona) => {
      const item: RhLoteAdscripcionItemPayload = {
        persona_id: persona.persona_id,
      };
      const ov = overrides[persona.persona_id];
      if (ov) {
        for (const key of [
          'vigente_desde',
          'vigente_hasta',
          'matricula',
          'puesto',
          'turno',
          'jornada',
          'horario',
          'observaciones',
        ] as const) {
          if (Object.prototype.hasOwnProperty.call(ov, key) && ov[key] !== undefined) {
            item[key] = ov[key] === null ? null : String(ov[key]).trim();
          }
        }
      }
      return item;
    });

    const payload: RhLoteAdscripcionesPayload = { items };
    if (Object.keys(defaults).length > 0) {
      payload.defaults = defaults;
    }
    return payload;
  }

  async ejecutarPrevalidacion(): Promise<void> {
    const uid = this.unidadId();
    if (uid === null || !this.canProceedToStep3()) {
      return;
    }

    const seq = ++this.validateRequestSeq;
    this.validating.set(true);
    this.validationError.set(null);
    this.validationResult.set(null);
    this.submitError.set(null);
    this.submitUncertainWarning.set(null);

    try {
      const payload = this.buildPayload();
      const response = await this.rhService.validarLoteAdscripcionesPorUnidad(uid, payload);

      if (seq !== this.validateRequestSeq) {
        return;
      }
      this.validationResult.set(response);
    } catch (err) {
      if (seq !== this.validateRequestSeq) {
        return;
      }
      if (this.isUnauthorizedError(err)) {
        this.unauthorized.emit();
        return;
      }
      this.validationError.set(
        this.extractErrorMessage(err, 'No se pudo completar la prevalidación del lote.')
      );
    } finally {
      if (seq === this.validateRequestSeq) {
        this.validating.set(false);
      }
    }
  }

  async confirmarVinculacionLote(): Promise<void> {
    const uid = this.unidadId();
    if (uid === null || !this.canConfirmExecution()) {
      return;
    }

    const seq = ++this.submitRequestSeq;
    this.submitting.set(true);
    this.submitError.set(null);
    this.submitUncertainWarning.set(null);

    try {
      const payload = this.buildPayload();
      const response = await this.rhService.crearLoteAdscripcionesPorUnidad(uid, payload);

      if (seq !== this.submitRequestSeq) {
        return;
      }

      this.executionResult.set(response);
      this.completed.emit(response);
    } catch (err) {
      if (seq !== this.submitRequestSeq) {
        return;
      }
      if (this.isUnauthorizedError(err)) {
        this.unauthorized.emit();
        return;
      }
      if (this.isUncertainNetworkOrTimeoutError(err)) {
        this.submitUncertainWarning.set(
          'La conexión se interrumpió o excedió el tiempo de espera. El resultado de la operación es incierto y no se reintentó automáticamente. Actualiza «Personal por unidad» para verificar qué adscripciones se registraron antes de volver a intentarlo.'
        );
      } else {
        this.submitError.set(
          this.extractErrorMessage(err, 'No se pudo ejecutar la vinculación múltiple de trabajadores.')
        );
      }
    } finally {
      if (seq === this.submitRequestSeq) {
        this.submitting.set(false);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers de formato y estado
  // ---------------------------------------------------------------------------

  formatPersonaNombre(persona: RhPersonaAdminDto | undefined | null): string {
    if (!persona) {
      return 'Trabajador';
    }
    const full = (persona.nombre_completo ?? '').trim();
    if (full) {
      return full;
    }
    return `${persona.nombres ?? ''} ${persona.apellidos ?? ''}`.trim() || `Persona #${persona.persona_id}`;
  }

  getPersonaNombreById(personaId: number): string {
    return this.formatPersonaNombre(this.personaLookupById()[personaId]);
  }

  getValidacionBadgeClass(estado: RhLoteAdscripcionValidacionEstado): string {
    switch (estado) {
      case 'ELEGIBLE':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'YA_VINCULADA':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'PERSONA_INACTIVA':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'CONFLICTO_ADSCRIPCION':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'DATOS_INVALIDOS':
        return 'bg-red-100 text-red-800 border-red-200';
    }
  }

  getValidacionLabel(estado: RhLoteAdscripcionValidacionEstado): string {
    switch (estado) {
      case 'ELEGIBLE':
        return 'Elegible';
      case 'YA_VINCULADA':
        return 'Ya vinculada';
      case 'PERSONA_INACTIVA':
        return 'Persona inactiva';
      case 'CONFLICTO_ADSCRIPCION':
        return 'Conflicto de adscripción';
      case 'DATOS_INVALIDOS':
        return 'Datos inválidos';
    }
  }

  getResultadoBadgeClass(resultado: RhLoteAdscripcionResultadoEstado): string {
    switch (resultado) {
      case 'CREADA':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'OMITIDA_DUPLICADO':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'PERSONA_INACTIVA':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'ERROR_VALIDACION':
      case 'ERROR_INTERNO':
        return 'bg-red-100 text-red-800 border-red-200';
    }
  }

  getResultadoLabel(resultado: RhLoteAdscripcionResultadoEstado): string {
    switch (resultado) {
      case 'CREADA':
        return 'Creada';
      case 'OMITIDA_DUPLICADO':
        return 'Omitida (duplicado)';
      case 'PERSONA_INACTIVA':
        return 'Persona inactiva';
      case 'ERROR_VALIDACION':
        return 'Error de validación';
      case 'ERROR_INTERNO':
        return 'Error interno';
    }
  }

  private invalidateValidation(): void {
    this.validateRequestSeq += 1;
    this.validationResult.set(null);
    this.validationError.set(null);
    this.submitError.set(null);
    this.submitUncertainWarning.set(null);
  }

  private clearSearchTimer(): void {
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
  }

  private isUnauthorizedError(err: unknown): boolean {
    return err instanceof HttpErrorResponse && err.status === 401;
  }

  private isUncertainNetworkOrTimeoutError(err: unknown): boolean {
    if (err instanceof HttpErrorResponse) {
      return err.status === 0 || err.status === 408 || err.status === 504;
    }
    return false;
  }

  private extractErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error;
      if (body && typeof body === 'object') {
        const msg = (body as { message?: unknown; error?: unknown }).message ?? (body as { error?: unknown }).error;
        if (typeof msg === 'string' && msg.trim()) {
          return msg.trim();
        }
      }
      if (typeof err.message === 'string' && err.message.trim()) {
        return err.message.trim();
      }
    }
    return fallback;
  }
}
