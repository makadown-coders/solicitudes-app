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
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  LucideAngularModule,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  X,
  XCircle,
} from 'lucide-angular';
import {
  RhPersonasPadronItem,
  RhService,
  RhVacacionFechaInput,
  RhVacacionKardexMovimientoDto,
  RhVacacionKardexResponse,
  RhVacacionPeriodoDto,
} from '../../../services/rh.service';

export interface RhCalendarCell {
  iso: string | null;
  dayNumber: number | null;
  inPeriod: boolean;
}

const MONTH_NAMES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

@Component({
  selector: 'app-rh-vacaciones-kardex-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rh-vacaciones-kardex-panel.component.html',
})
export class RhVacacionesKardexPanelComponent implements OnDestroy {
  private readonly rhService = inject(RhService);

  readonly persona = input.required<RhPersonasPadronItem>();
  readonly canManage = input<boolean>(true);
  readonly unauthorized = output<void>();

  readonly icons = {
    calendar: Calendar,
    plus: Plus,
    close: X,
    anular: XCircle,
    refresh: RefreshCw,
    loader: Loader2,
    alert: AlertCircle,
    warning: AlertTriangle,
    checkCircle: CheckCircle2,
    prev: ChevronLeft,
    next: ChevronRight,
    sliders: SlidersHorizontal,
    trash: Trash2,
  };

  /** Catálogo de periodos institucionales */
  readonly periodos = signal<RhVacacionPeriodoDto[]>([]);
  readonly loadingPeriodos = signal(false);
  readonly errorPeriodos = signal<string | null>(null);
  readonly selectedAnio = signal<number | null>(null);
  readonly selectedPeriodoId = signal<number | null>(null);

  /** Kardex consolidado del periodo seleccionado */
  readonly kardex = signal<RhVacacionKardexResponse | null>(null);
  readonly loadingKardex = signal(false);
  readonly errorKardex = signal<string | null>(null);
  readonly successBanner = signal<string | null>(null);

  /** Panel de configuración / ajuste de bolsa */
  readonly bolsaFormOpen = signal(false);
  readonly draftBolsaDias = signal<string>('10');
  readonly draftBolsaEstado = signal<'PROVISIONAL' | 'CONFIRMADA' | 'AJUSTADA'>('PROVISIONAL');
  readonly draftBolsaJustificacion = signal('');
  readonly bolsaSubmitting = signal(false);
  readonly bolsaError = signal<string | null>(null);

  /** Panel de registro con fechas discontinuas */
  readonly registroFormOpen = signal(false);
  readonly calendarYear = signal<number>(2026);
  readonly calendarMonth = signal<number>(1); // 1..12
  readonly selectedFechas = signal<RhVacacionFechaInput[]>([]);
  readonly draftDocumento = signal('');
  readonly draftObservaciones = signal('');
  readonly registroSubmitting = signal(false);
  readonly registroError = signal<string | null>(null);

  /** Anulación de movimiento */
  readonly anularTarget = signal<RhVacacionKardexMovimientoDto | null>(null);
  readonly anularMotivo = signal('');
  readonly anularSubmitting = signal(false);
  readonly anularError = signal<string | null>(null);

  private periodosSeq = 0;
  private kardexSeq = 0;
  private lastPersonaId: number | null = null;

  readonly availableYears = computed<number[]>(() => {
    const years = new Set<number>();
    for (const p of this.periodos()) {
      years.add(p.anio);
    }
    return Array.from(years).sort((a, b) => b - a);
  });

  readonly periodosForSelectedYear = computed<RhVacacionPeriodoDto[]>(() => {
    const anio = this.selectedAnio();
    if (anio === null) {
      return this.periodos();
    }
    return this.periodos().filter((p) => p.anio === anio);
  });

  readonly selectedPeriodo = computed<RhVacacionPeriodoDto | null>(() => {
    const pid = this.selectedPeriodoId();
    if (pid === null) {
      return null;
    }
    return this.periodos().find((p) => p.id === pid) ?? null;
  });

  readonly calendarMonthLabel = computed<string>(() => {
    const m = this.calendarMonth();
    const y = this.calendarYear();
    return `${MONTH_NAMES_ES[Math.max(0, Math.min(11, m - 1))]} ${y}`;
  });

  readonly calendarCells = computed<RhCalendarCell[]>(() => {
    const year = this.calendarYear();
    const month = this.calendarMonth();
    const periodo = this.selectedPeriodo();
    const firstDay = new Date(Date.UTC(year, month - 1, 1));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    // Lunes = 0 .. Domingo = 6
    const startOffset = (firstDay.getUTCDay() + 6) % 7;

    const cells: RhCalendarCell[] = [];
    for (let i = 0; i < startOffset; i += 1) {
      cells.push({ iso: null, dayNumber: null, inPeriod: false });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const inPeriod = periodo ? iso >= periodo.fecha_inicio && iso <= periodo.fecha_fin : false;
      cells.push({ iso, dayNumber: day, inPeriod });
    }
    return cells;
  });

  readonly selectedFechasMap = computed<Record<string, RhVacacionFechaInput>>(() => {
    const map: Record<string, RhVacacionFechaInput> = {};
    for (const f of this.selectedFechas()) {
      map[f.fecha] = f;
    }
    return map;
  });

  readonly computablesCount = computed<number>(
    () => this.selectedFechas().filter((f) => f.computable).length
  );

  readonly excluidasCount = computed<number>(
    () => this.selectedFechas().filter((f) => !f.computable).length
  );

  readonly saldoDespuesPreview = computed<number | null>(() => {
    const saldoActual = this.kardex()?.resumen.saldo_administrativo ?? null;
    if (saldoActual === null) {
      return null;
    }
    return saldoActual - this.computablesCount();
  });

  readonly registroValidationError = computed<string | null>(() => {
    const fechas = this.selectedFechas();
    if (fechas.length === 0) {
      return 'Selecciona al menos una fecha en el calendario.';
    }
    if (this.computablesCount() === 0) {
      return 'Debe existir al menos una fecha computable para registrar el movimiento.';
    }
    for (const f of fechas) {
      if (!f.computable && !(f.motivo_exclusion ?? '').trim()) {
        return `La fecha excluida ${f.fecha} requiere un motivo administrativo de exclusión.`;
      }
    }
    return null;
  });

  readonly canSubmitRegistro = computed<boolean>(() => {
    return Boolean(
      this.canManage() &&
        this.persona().activo &&
        this.selectedPeriodo() !== null &&
        this.kardex()?.resumen.estado_bolsa !== 'INEXISTENTE' &&
        this.registroValidationError() === null &&
        !this.registroSubmitting()
    );
  });

  constructor() {
    effect(() => {
      const p = this.persona();
      if (!p) {
        return;
      }
      if (this.lastPersonaId !== p.persona_id) {
        this.lastPersonaId = p.persona_id;
        this.resetTransientForms();
        void this.cargarPeriodosYKardex();
      }
    });
  }

  ngOnDestroy(): void {
    this.periodosSeq += 1;
    this.kardexSeq += 1;
  }

  async cargarPeriodosYKardex(): Promise<void> {
    const seq = ++this.periodosSeq;
    this.loadingPeriodos.set(true);
    this.errorPeriodos.set(null);

    try {
      const res = await this.rhService.listVacacionPeriodos();
      if (seq !== this.periodosSeq) {
        return;
      }
      const list = Array.isArray(res?.items) ? res.items : [];
      this.periodos.set(list);

      if (list.length === 0) {
        this.selectedAnio.set(null);
        this.selectedPeriodoId.set(null);
        this.kardex.set(null);
        return;
      }

      const currentSelected = this.selectedPeriodoId();
      const stillValid = currentSelected !== null && list.some((p) => p.id === currentSelected);
      const target = stillValid ? list.find((p) => p.id === currentSelected)! : list[0];
      this.selectedAnio.set(target.anio);
      this.selectedPeriodoId.set(target.id);
      this.syncCalendarToPeriodo(target);
      void this.cargarKardex(target.id);
    } catch (err) {
      if (seq !== this.periodosSeq) {
        return;
      }
      if (this.isUnauthorized(err)) {
        this.unauthorized.emit();
        return;
      }
      this.errorPeriodos.set(
        this.extractError(err, 'No se pudieron consultar los periodos vacacionales institucionales.')
      );
    } finally {
      if (seq === this.periodosSeq) {
        this.loadingPeriodos.set(false);
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
      this.selectPeriodo(matching[0].id);
    }
  }

  selectPeriodo(rawPeriodoId: number | string): void {
    const pid = Number(rawPeriodoId);
    if (!Number.isFinite(pid)) {
      return;
    }
    this.selectedPeriodoId.set(pid);
    this.resetTransientForms();
    const target = this.periodos().find((p) => p.id === pid) ?? null;
    if (target) {
      this.syncCalendarToPeriodo(target);
    }
    void this.cargarKardex(pid);
  }

  async cargarKardex(periodoId?: number): Promise<void> {
    const pid = periodoId ?? this.selectedPeriodoId();
    const personaId = this.persona().persona_id;
    if (pid === null) {
      return;
    }

    const seq = ++this.kardexSeq;
    this.loadingKardex.set(true);
    this.errorKardex.set(null);

    try {
      const res = await this.rhService.getVacacionKardexPorPersona(personaId, pid);
      if (seq !== this.kardexSeq) {
        return;
      }
      this.kardex.set(res);
    } catch (err) {
      if (seq !== this.kardexSeq) {
        return;
      }
      if (this.isUnauthorized(err)) {
        this.unauthorized.emit();
        return;
      }
      this.errorKardex.set(this.extractError(err, 'No se pudo cargar el kardex vacacional del periodo.'));
    } finally {
      if (seq === this.kardexSeq) {
        this.loadingKardex.set(false);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Bolsa individual
  // ---------------------------------------------------------------------------

  openBolsaForm(): void {
    const res = this.kardex()?.resumen;
    const base = this.selectedPeriodo()?.dias_base_provisionales ?? 10;
    this.draftBolsaDias.set(String(res?.dias_asignados ?? base));
    this.draftBolsaEstado.set(
      res && res.estado_bolsa !== 'INEXISTENTE' ? res.estado_bolsa : 'PROVISIONAL'
    );
    this.draftBolsaJustificacion.set(res?.justificacion_ajuste ?? '');
    this.bolsaError.set(null);
    this.bolsaFormOpen.set(true);
  }

  closeBolsaForm(): void {
    if (this.bolsaSubmitting()) {
      return;
    }
    this.bolsaFormOpen.set(false);
    this.bolsaError.set(null);
  }

  async guardarBolsa(): Promise<void> {
    const pid = this.selectedPeriodoId();
    if (pid === null || this.bolsaSubmitting()) {
      return;
    }
    const dias = Number(this.draftBolsaDias());
    if (!Number.isInteger(dias) || dias < 0 || dias > 60) {
      this.bolsaError.set('Los días asignados deben ser un número entero entre 0 y 60.');
      return;
    }
    const estado = this.draftBolsaEstado();
    const justif = this.draftBolsaJustificacion().trim();
    if (estado === 'AJUSTADA' && !justif) {
      this.bolsaError.set('La justificación es obligatoria cuando el estado de bolsa es AJUSTADA.');
      return;
    }

    this.bolsaSubmitting.set(true);
    this.bolsaError.set(null);

    try {
      await this.rhService.upsertVacacionBolsaPorPersona(this.persona().persona_id, pid, {
        dias_asignados: dias,
        estado_asignacion: estado,
        justificacion_ajuste: justif || null,
      });
      this.bolsaFormOpen.set(false);
      this.successBanner.set('Bolsa vacacional actualizada correctamente.');
      await this.cargarKardex(pid);
    } catch (err) {
      if (this.isUnauthorized(err)) {
        this.unauthorized.emit();
        return;
      }
      this.bolsaError.set(this.extractError(err, 'No se pudo actualizar la bolsa vacacional.'));
    } finally {
      this.bolsaSubmitting.set(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Calendario y fechas discontinuas
  // ---------------------------------------------------------------------------

  openRegistroForm(): void {
    const per = this.selectedPeriodo();
    if (per) {
      this.syncCalendarToPeriodo(per);
    }
    this.selectedFechas.set([]);
    this.draftDocumento.set('');
    this.draftObservaciones.set('');
    this.registroError.set(null);
    this.registroFormOpen.set(true);
  }

  closeRegistroForm(): void {
    if (this.registroSubmitting()) {
      return;
    }
    this.registroFormOpen.set(false);
    this.registroError.set(null);
  }

  shiftCalendarMonth(delta: number): void {
    let m = this.calendarMonth() + delta;
    let y = this.calendarYear();
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    this.calendarYear.set(y);
    this.calendarMonth.set(m);
  }

  toggleFecha(cell: RhCalendarCell): void {
    if (!cell.iso || !cell.inPeriod || this.registroSubmitting()) {
      return;
    }
    const iso = cell.iso;
    const current = this.selectedFechas();
    const exists = current.some((f) => f.fecha === iso);
    if (exists) {
      this.selectedFechas.set(current.filter((f) => f.fecha !== iso));
    } else {
      const next = [...current, { fecha: iso, computable: true, motivo_exclusion: null }].sort(
        (a, b) => a.fecha.localeCompare(b.fecha)
      );
      this.selectedFechas.set(next);
    }
    this.registroError.set(null);
  }

  toggleFechaComputable(iso: string): void {
    this.selectedFechas.set(
      this.selectedFechas().map((f) =>
        f.fecha === iso
          ? { ...f, computable: !f.computable, motivo_exclusion: !f.computable ? null : f.motivo_exclusion }
          : f
      )
    );
  }

  updateFechaMotivoExclusion(iso: string, motivo: string): void {
    this.selectedFechas.set(
      this.selectedFechas().map((f) => (f.fecha === iso ? { ...f, motivo_exclusion: motivo } : f))
    );
  }

  removeFecha(iso: string): void {
    this.selectedFechas.set(this.selectedFechas().filter((f) => f.fecha !== iso));
  }

  async confirmarRegistroFechas(): Promise<void> {
    const pid = this.selectedPeriodoId();
    if (pid === null || !this.canSubmitRegistro()) {
      return;
    }

    this.registroSubmitting.set(true);
    this.registroError.set(null);

    try {
      await this.rhService.crearVacacionFechasDetalladasPersona(this.persona().persona_id, {
        periodo_id: pid,
        fechas: this.selectedFechas().map((f) => ({
          fecha: f.fecha,
          computable: f.computable,
          motivo_exclusion: f.computable ? null : (f.motivo_exclusion ?? '').trim(),
        })),
        documento_referencia: this.draftDocumento().trim() || null,
        observaciones: this.draftObservaciones().trim() || null,
      });

      this.registroFormOpen.set(false);
      this.selectedFechas.set([]);
      this.successBanner.set('Movimiento vacacional registrado correctamente.');
      await this.cargarKardex(pid);
    } catch (err) {
      if (this.isUnauthorized(err)) {
        this.unauthorized.emit();
        return;
      }
      this.registroError.set(
        this.extractError(err, 'No se pudo registrar el movimiento vacacional.')
      );
    } finally {
      this.registroSubmitting.set(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Anulación de movimiento
  // ---------------------------------------------------------------------------

  openAnularDialog(mov: RhVacacionKardexMovimientoDto): void {
    this.anularTarget.set(mov);
    this.anularMotivo.set('');
    this.anularError.set(null);
  }

  closeAnularDialog(): void {
    if (this.anularSubmitting()) {
      return;
    }
    this.anularTarget.set(null);
    this.anularMotivo.set('');
    this.anularError.set(null);
  }

  async confirmarAnulacion(): Promise<void> {
    const target = this.anularTarget();
    const motivo = this.anularMotivo().trim();
    if (!target || this.anularSubmitting()) {
      return;
    }
    if (!motivo) {
      this.anularError.set('El motivo de anulación es obligatorio.');
      return;
    }

    this.anularSubmitting.set(true);
    this.anularError.set(null);

    try {
      await this.rhService.anularVacacionPersona(this.persona().persona_id, target.id, {
        motivo_anulacion: motivo,
      });
      this.anularTarget.set(null);
      this.successBanner.set('Movimiento anulado y días computables liberados.');
      await this.cargarKardex();
    } catch (err) {
      if (this.isUnauthorized(err)) {
        this.unauthorized.emit();
        return;
      }
      this.anularError.set(this.extractError(err, 'No se pudo anular el movimiento vacacional.'));
    } finally {
      this.anularSubmitting.set(false);
    }
  }

  getBolsaBadgeLabel(estado: string): string {
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

  private syncCalendarToPeriodo(periodo: RhVacacionPeriodoDto): void {
    const parts = periodo.fecha_inicio.split('-');
    if (parts.length === 3) {
      this.calendarYear.set(Number(parts[0]) || periodo.anio);
      this.calendarMonth.set(Number(parts[1]) || 1);
    }
  }

  private resetTransientForms(): void {
    this.bolsaFormOpen.set(false);
    this.bolsaError.set(null);
    this.registroFormOpen.set(false);
    this.selectedFechas.set([]);
    this.registroError.set(null);
    this.anularTarget.set(null);
    this.anularError.set(null);
    this.successBanner.set(null);
  }

  private isUnauthorized(err: unknown): boolean {
    return err instanceof HttpErrorResponse && err.status === 401;
  }

  private extractError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error;
      if (body && typeof body === 'object') {
        const msg = (body as { error?: unknown; message?: unknown }).error ?? (body as { message?: unknown }).message;
        if (typeof msg === 'string' && msg.trim()) {
          return msg.trim();
        }
      }
    }
    return fallback;
  }
}
