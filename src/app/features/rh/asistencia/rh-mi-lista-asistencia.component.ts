import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  signal,
  SimpleChanges,
} from '@angular/core';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Info,
  LucideAngularModule,
  RefreshCw,
  Sparkles,
} from 'lucide-angular';
import {
  RhAdscripcionEstadoVigencia,
  RhMiContextoAdscripcionPropia,
  RhMiContextoResponse,
} from '../../../services/rh.service';
import { RhAsistenciaCalendarService } from './rh-asistencia-calendar.service';
import { RhAsistenciaDocxService } from './rh-asistencia-docx.service';
import {
  RH_ASISTENCIA_DEFAULT_PLACEHOLDERS,
  RH_ASISTENCIA_MONTHS_CATALOG,
} from './rh-asistencia-holidays.data';

export const RH_ASISTENCIA_AVAILABLE_YEARS: ReadonlyArray<number> = [
  2026,
  2027,
  2028,
  2029,
  2030,
];

@Component({
  selector: 'app-rh-mi-lista-asistencia',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rh-mi-lista-asistencia.component.html',
})
export class RhMiListaAsistenciaComponent implements OnChanges, OnDestroy {
  private readonly calendarService = inject(RhAsistenciaCalendarService);
  private readonly docxService = inject(RhAsistenciaDocxService);

  @Input({ required: true }) contexto: RhMiContextoResponse | null = null;

  readonly icons = {
    calendar: Calendar,
    clock: Clock,
    download: Download,
    fileText: FileText,
    info: Info,
    sparkles: Sparkles,
    alertTriangle: AlertTriangle,
    checkCircle: CheckCircle2,
    refreshCw: RefreshCw,
  };

  readonly monthsCatalog = RH_ASISTENCIA_MONTHS_CATALOG;
  readonly availableYears = RH_ASISTENCIA_AVAILABLE_YEARS;
  readonly defaultSuggestions = RH_ASISTENCIA_DEFAULT_PLACEHOLDERS;

  private readonly contextoSig = signal<RhMiContextoResponse | null>(null);

  /** ID de la adscripción seleccionada para precargar datos laborales (o null si ninguna) */
  readonly selectedAdscripcionId = signal<number | null>(null);

  /** Campos editables del formulario de impresión (exclusivamente en memoria local) */
  readonly draftNombre = signal('');
  readonly draftPuesto = signal('');
  readonly draftAdscripcion = signal('');
  readonly draftJornada = signal('');
  readonly draftHorario = signal('');

  /** Periodo seleccionado (inicializado dinámicamente al mes y año actuales dentro del rango soportado) */
  readonly selectedYear = signal<number>(this.resolveInitialYear());
  readonly selectedMonth = signal<number>(this.resolveInitialMonth());

  /** Estado de generación y mensajes del documento Word */
  readonly isGenerating = signal(false);
  readonly validationError = signal<string | null>(null);
  readonly generationError = signal<string | null>(null);
  readonly lastDownloadedFile = signal<string | null>(null);

  /** Adscripciones propias disponibles en el contexto */
  readonly adscripciones = computed<RhMiContextoAdscripcionPropia[]>(() => {
    return this.contextoSig()?.adscripciones ?? [];
  });

  readonly adscripcionesVigentes = computed<RhMiContextoAdscripcionPropia[]>(() => {
    return this.adscripciones().filter((a) => a.estado_vigencia === 'VIGENTE');
  });

  readonly hasVigenteAdscripcion = computed(() => this.adscripcionesVigentes().length > 0);

  readonly hasMultipleVigentes = computed(() => this.adscripcionesVigentes().length > 1);

  readonly hasOnlyNonVigentes = computed(
    () => this.adscripciones().length > 0 && this.adscripcionesVigentes().length === 0
  );

  readonly selectedAdscripcion = computed<RhMiContextoAdscripcionPropia | null>(() => {
    const id = this.selectedAdscripcionId();
    if (id === null) {
      return null;
    }
    return this.adscripciones().find((a) => a.adscripcion_laboral_id === id) ?? null;
  });

  /**
   * Indica si el campo «Adscripción» actual proviene únicamente de la unidad de referencia
   * del directorio institucional (sin una adscripción RH seleccionada).
   */
  readonly isUsingDirectorioReference = computed<boolean>(() => {
    const ctx = this.contextoSig();
    if (!ctx) {
      return false;
    }
    return (
      this.selectedAdscripcion() === null &&
      ctx.unidad_referencia !== null &&
      ctx.unidad_referencia.origen === 'DIRECTORIO'
    );
  });

  /** Resumen reactivo del calendario mensual calculado por `RhAsistenciaCalendarService` */
  readonly calendarSummary = computed(() =>
    this.calendarService.buildMonthCalendar(this.selectedYear(), this.selectedMonth())
  );

  readonly firstSectionDays = computed(() => {
    const summary = this.calendarSummary();
    return summary.days.filter((d) => d.day < summary.secondSectionStartDay);
  });

  readonly secondSectionDays = computed(() => {
    const summary = this.calendarSummary();
    return summary.days.filter((d) => d.day >= summary.secondSectionStartDay);
  });

  ngOnChanges(changes: SimpleChanges): void {
    if ('contexto' in changes) {
      this.applyContexto(this.contexto);
    }
  }

  ngOnDestroy(): void {
    this.clearState();
  }

  private resolveInitialYear(): number {
    const currentYear = new Date().getFullYear();
    if (RH_ASISTENCIA_AVAILABLE_YEARS.includes(currentYear)) {
      return currentYear;
    }
    if (currentYear < RH_ASISTENCIA_AVAILABLE_YEARS[0]) {
      return RH_ASISTENCIA_AVAILABLE_YEARS[0];
    }
    return RH_ASISTENCIA_AVAILABLE_YEARS[RH_ASISTENCIA_AVAILABLE_YEARS.length - 1];
  }

  private resolveInitialMonth(): number {
    const currentMonth = new Date().getMonth() + 1;
    return currentMonth >= 1 && currentMonth <= 12 ? currentMonth : 1;
  }

  /**
   * Limpia por completo los campos y estados locales del generador
   * (invocado al cambiar/limpiar contexto, cerrar sesión o destruir el componente).
   */
  clearState(): void {
    this.contextoSig.set(null);
    this.selectedAdscripcionId.set(null);
    this.draftNombre.set('');
    this.draftPuesto.set('');
    this.draftAdscripcion.set('');
    this.draftJornada.set('');
    this.draftHorario.set('');
    this.isGenerating.set(false);
    this.validationError.set(null);
    this.generationError.set(null);
    this.lastDownloadedFile.set(null);
  }

  /**
   * Precarga el formulario exclusivamente a partir del contexto propio (`GET /api/rh/mi-contexto`).
   *
   * Reglas de precarga:
   * - `nombre`: siempre `ctx.persona.nombre_completo`.
   * - Si existe al menos una adscripción `VIGENTE`: selecciona la primera `VIGENTE` por defecto
   *   y precarga sus datos laborales reales (`puesto`, `unidad.nombre`, `jornada`, `horario`),
   *   dejando vacíos los campos que vengan `null` (sin inventar datos).
   * - Si SOLO existen adscripciones `FUTURA` o `HISTORICA`: NO selecciona ninguna silenciosamente
   *   como si fuera vigente (`selectedAdscripcionId = null`). Presenta la unidad de referencia del
   *   directorio si existe, y permite al trabajador seleccionar explícitamente una de sus
   *   adscripciones futuras o históricas indicando su situación y fechas.
   * - Si está en `PENDIENTE_ADSCRIPCION_RH`: presenta la unidad del directorio como referencia
   *   y deja `puesto`, `jornada` y `horario` vacíos y editables.
   */
  applyContexto(ctx: RhMiContextoResponse | null): void {
    if (!ctx) {
      this.clearState();
      return;
    }

    this.contextoSig.set(ctx);
    this.clearFeedbackMessages();

    this.draftNombre.set((ctx.persona?.nombre_completo ?? '').trim());

    const vigentes = (ctx.adscripciones ?? []).filter((a) => a.estado_vigencia === 'VIGENTE');

    if (vigentes.length > 0) {
      const primaryVigente = vigentes[0];
      this.selectedAdscripcionId.set(primaryVigente.adscripcion_laboral_id);
      this.populateFromAdscripcion(primaryVigente);
      return;
    }

    // Sin adscripción vigente (PENDIENTE_ADSCRIPCION_RH, o solo FUTURA / HISTORICA):
    // No seleccionar silenciosamente una adscripción futura o histórica como vigente.
    this.selectedAdscripcionId.set(null);
    this.draftPuesto.set('');
    this.draftJornada.set('');
    this.draftHorario.set('');

    if (ctx.unidad_referencia?.origen === 'DIRECTORIO' && ctx.unidad_referencia.nombre) {
      this.draftAdscripcion.set(ctx.unidad_referencia.nombre.trim());
    } else {
      this.draftAdscripcion.set('');
    }
  }

  /**
   * Permite al trabajador elegir explícitamente cuál de sus adscripciones registradas
   * utilizar para rellenar los campos laborales del documento (o limpiar la selección).
   */
  onSelectAdscripcion(rawValue: string | number | null): void {
    this.clearFeedbackMessages();

    if (rawValue === null || rawValue === '' || rawValue === 'NONE') {
      this.selectedAdscripcionId.set(null);
      const ctx = this.contextoSig();
      this.draftPuesto.set('');
      this.draftJornada.set('');
      this.draftHorario.set('');
      if (ctx?.unidad_referencia?.origen === 'DIRECTORIO' && ctx.unidad_referencia.nombre) {
        this.draftAdscripcion.set(ctx.unidad_referencia.nombre.trim());
      } else {
        this.draftAdscripcion.set('');
      }
      return;
    }

    const parsedId = Number(rawValue);
    const target = this.adscripciones().find((a) => a.adscripcion_laboral_id === parsedId) ?? null;
    if (!target) {
      return;
    }

    this.selectedAdscripcionId.set(target.adscripcion_laboral_id);
    this.populateFromAdscripcion(target);
  }

  private populateFromAdscripcion(adscripcion: RhMiContextoAdscripcionPropia): void {
    this.draftPuesto.set((adscripcion.puesto ?? '').trim());
    this.draftAdscripcion.set((adscripcion.unidad?.nombre ?? '').trim());
    this.draftJornada.set((adscripcion.jornada ?? '').trim());
    this.draftHorario.set((adscripcion.horario ?? '').trim());
  }

  onNombreInput(value: string): void {
    this.draftNombre.set(value);
    this.clearFeedbackMessages();
  }

  onPuestoInput(value: string): void {
    this.draftPuesto.set(value);
    this.clearFeedbackMessages();
  }

  onAdscripcionInput(value: string): void {
    this.draftAdscripcion.set(value);
    this.clearFeedbackMessages();
  }

  onJornadaInput(value: string): void {
    this.draftJornada.set(value);
    this.clearFeedbackMessages();
  }

  onHorarioInput(value: string): void {
    this.draftHorario.set(value);
    this.clearFeedbackMessages();
  }

  /**
   * Permite aplicar explícitamente una sugerencia editable basada en el formato institucional
   * sin presentarla como dato confirmado por RH.
   */
  applyJornadaSuggestion(): void {
    this.draftJornada.set(this.defaultSuggestions.jornada);
    this.clearFeedbackMessages();
  }

  applyHorarioSuggestion(): void {
    this.draftHorario.set(this.defaultSuggestions.horario);
    this.clearFeedbackMessages();
  }

  applyAdscripcionSuggestion(): void {
    this.draftAdscripcion.set(this.defaultSuggestions.adscripcion);
    this.clearFeedbackMessages();
  }

  onMonthChange(rawValue: string | number): void {
    const month = Number(rawValue);
    if (Number.isInteger(month) && month >= 1 && month <= 12) {
      this.selectedMonth.set(month);
      this.clearFeedbackMessages();
    }
  }

  onYearChange(rawValue: string | number): void {
    const year = Number(rawValue);
    if (Number.isInteger(year) && this.availableYears.includes(year)) {
      this.selectedYear.set(year);
      this.clearFeedbackMessages();
    }
  }

  formatAdscripcionOptionLabel(item: RhMiContextoAdscripcionPropia): string {
    const estadoLabel = this.getEstadoVigenciaLabel(item.estado_vigencia);
    const unidadNombre = item.unidad?.nombre ?? 'Unidad';
    const cluesPart = this.isCluesConvencional(item.unidad?.cluesimb)
      ? ` (${item.unidad.cluesimb!.trim().toUpperCase()})`
      : ' (Sin CLUES convencional)';
    const puestoPart = item.puesto?.trim() ? ` · ${item.puesto.trim()}` : '';
    const desde = this.formatIsoDate(item.vigente_desde);
    const hasta = item.vigente_hasta ? this.formatIsoDate(item.vigente_hasta) : 'Sin término';
    return `[${estadoLabel}] ${unidadNombre}${cluesPart}${puestoPart} · Vigencia: ${desde} a ${hasta}`;
  }

  getEstadoVigenciaLabel(estado: RhAdscripcionEstadoVigencia): string {
    switch (estado) {
      case 'VIGENTE':
        return 'Vigente';
      case 'FUTURA':
        return 'Programada (futura)';
      case 'HISTORICA':
        return 'Histórica';
    }
  }

  isCluesConvencional(cluesimb: string | null | undefined): boolean {
    if (!cluesimb) {
      return false;
    }
    const normalized = cluesimb.trim().toUpperCase();
    return normalized.length > 0 && normalized !== 'N/A';
  }

  formatIsoDate(isoDate: string | null | undefined): string {
    if (!isoDate) {
      return 'Sin fecha de término';
    }
    const trimmed = isoDate.trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
    if (!match) {
      return trimmed;
    }
    const [, year, month, day] = match;
    return `${day}/${month}/${year}`;
  }

  async onDownloadDocx(): Promise<void> {
    if (this.isGenerating()) {
      return;
    }

    this.clearFeedbackMessages();

    const nombre = this.draftNombre().trim();
    const puesto = this.draftPuesto().trim();

    if (!nombre) {
      this.validationError.set(
        'El campo «Nombre completo» es obligatorio para generar tu lista de asistencia.'
      );
      return;
    }

    if (!puesto) {
      this.validationError.set(
        'El campo «Puesto» es obligatorio para generar tu lista de asistencia. Ingresa el puesto o área que debe aparecer impreso.'
      );
      return;
    }

    this.isGenerating.set(true);

    try {
      const fileName = await this.docxService.downloadAttendanceDocxFromParams({
        nombre,
        puesto,
        adscripcion: this.draftAdscripcion().trim() || null,
        jornada: this.draftJornada().trim() || null,
        horario: this.draftHorario().trim() || null,
        mes: this.selectedMonth(),
        anio: this.selectedYear(),
      });
      this.lastDownloadedFile.set(fileName);
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message.trim().length > 0
          ? err.message.trim()
          : 'No fue posible generar el documento Word de tu lista de asistencia. Intenta nuevamente.';
      this.generationError.set(message);
    } finally {
      this.isGenerating.set(false);
    }
  }

  private clearFeedbackMessages(): void {
    this.validationError.set(null);
    this.generationError.set(null);
    this.lastDownloadedFile.set(null);
  }
}
