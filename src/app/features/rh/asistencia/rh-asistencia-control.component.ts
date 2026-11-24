import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  EventEmitter,
  HostListener,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  signal,
  SimpleChanges,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  Loader2,
  LucideAngularModule,
  RefreshCw,
  Search,
  X,
} from 'lucide-angular';
import {
  RhAsistenciaEstadoFiltro,
  RhAsistenciaMotivoExcepcion,
  RhAsistenciaResumenMensualDto,
  RhAsistenciaSeguimientoItemDto,
  RhService,
  RhSituacionPersonalFiltro,
  RhUnidadAutorizada,
} from '../../../services/rh.service';
import { RhUnidadAutocompleteComponent } from '../shared/rh-unidad-autocomplete.component';

export type RhAsistenciaModalMode = 'OBSERVADA' | 'NO_APLICA' | 'CORREGIR' | 'CONFIRMAR_CON_MOTIVO';

export const RH_ASISTENCIA_MESES: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
];

export const RH_ASISTENCIA_ANIOS: ReadonlyArray<number> = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

export const RH_ASISTENCIA_MOTIVOS_CATALOGO: ReadonlyArray<{
  value: RhAsistenciaMotivoExcepcion;
  label: string;
}> = [
  { value: 'INGRESO_POSTERIOR', label: 'Ingreso posterior al mes' },
  { value: 'BAJA_PREVIA', label: 'Baja previa al mes' },
  { value: 'TRANSFERENCIA', label: 'Transferencia a otra unidad' },
  { value: 'COMISION_EXTERNA', label: 'Comisión externa' },
  { value: 'LICENCIA_INCAPACIDAD', label: 'Licencia o incapacidad' },
  { value: 'EXENCION_ADMINISTRATIVA', label: 'Exención administrativa' },
  { value: 'OTRO', label: 'Otro motivo justificado' },
];

export function resolveBajaCaliforniaYearMonth(now: Date = new Date()): { anio: number; mes: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Tijuana',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(now);
    const y = Number(parts.find((p) => p.type === 'year')?.value);
    const m = Number(parts.find((p) => p.type === 'month')?.value);
    if (Number.isInteger(y) && Number.isInteger(m) && m >= 1 && m <= 12) {
      return { anio: y, mes: m };
    }
  } catch {
    // Fallback a fecha local
  }
  return { anio: now.getFullYear(), mes: now.getMonth() + 1 };
}

@Component({
  selector: 'app-rh-asistencia-control',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, RhUnidadAutocompleteComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rh-asistencia-control.component.html',
})
export class RhAsistenciaControlComponent implements OnInit, OnChanges, OnDestroy {
  private readonly rhService = inject(RhService);

  @Input() unidades: RhUnidadAutorizada[] = [];
  @Input() defaultUnidadId: number | null = null;
  @Input() canAdminister = true;
  @Output() unauthorized = new EventEmitter<void>();

  readonly icons = {
    calendar: Calendar,
    check: CheckCircle2,
    clipboard: ClipboardCheck,
    alert: AlertCircle,
    warning: AlertTriangle,
    ban: Ban,
    edit: Edit3,
    search: Search,
    clear: X,
    refresh: RefreshCw,
    loader: Loader2,
  };

  readonly meses = RH_ASISTENCIA_MESES;
  readonly anios = RH_ASISTENCIA_ANIOS;
  readonly motivosCatalogo = RH_ASISTENCIA_MOTIVOS_CATALOGO;

  private readonly initialPeriod = resolveBajaCaliforniaYearMonth();

  // Filtros y paginación
  readonly selectedAnio = signal<number>(this.initialPeriod.anio);
  readonly selectedMes = signal<number>(this.initialPeriod.mes);
  readonly selectedUnidadId = signal<number | null>(null);
  readonly selectedEstado = signal<RhAsistenciaEstadoFiltro | ''>('');
  readonly selectedSituacion = signal<RhSituacionPersonalFiltro>('ACTIVOS');
  readonly exportingXlsx = signal<boolean>(false);
  readonly searchQuery = signal<string>('');
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(20);

  // Datos y estado de carga
  readonly loading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly feedbackSuccess = signal<string | null>(null);
  readonly items = signal<RhAsistenciaSeguimientoItemDto[]>([]);
  readonly total = signal<number>(0);
  readonly resumen = signal<RhAsistenciaResumenMensualDto | null>(null);

  // Control de concurrencia y doble envío
  readonly busyPersonaId = signal<number | null>(null);
  private requestSeq = 0;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private hasManualUnidadChange = false;

  // Modal de acciones secundarias / corrección
  readonly modalOpen = signal<boolean>(false);
  readonly modalMode = signal<RhAsistenciaModalMode>('OBSERVADA');
  readonly modalTarget = signal<RhAsistenciaSeguimientoItemDto | null>(null);
  readonly modalNuevoEstado = signal<'PENDIENTE' | 'OBSERVADA' | 'NO_APLICA'>('PENDIENTE');
  readonly modalMotivoExcepcion = signal<RhAsistenciaMotivoExcepcion | ''>('');
  readonly modalObservaciones = signal<string>('');
  readonly modalMotivoAdmin = signal<string>('');
  readonly modalError = signal<string | null>(null);
  readonly modalSubmitting = signal<boolean>(false);

  readonly totalPages = computed<number>(() => {
    const t = this.total();
    const ps = this.pageSize();
    return t <= 0 ? 1 : Math.max(1, Math.ceil(t / ps));
  });

  readonly pageNumbers = computed<number[]>(() => {
    const tp = this.totalPages();
    return Array.from({ length: tp }, (_, idx) => idx + 1);
  });

  ngOnInit(): void {
    if (this.defaultUnidadId !== null && this.selectedUnidadId() === null && !this.hasManualUnidadChange) {
      this.selectedUnidadId.set(this.defaultUnidadId);
    }
    void this.loadSeguimiento();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      'defaultUnidadId' in changes &&
      !changes['defaultUnidadId'].firstChange &&
      !this.hasManualUnidadChange &&
      this.selectedUnidadId() === null &&
      this.defaultUnidadId !== null
    ) {
      this.selectedUnidadId.set(this.defaultUnidadId);
      this.page.set(1);
      void this.loadSeguimiento();
    }
  }

  ngOnDestroy(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.modalOpen() && !this.modalSubmitting()) {
      this.closeModal();
    }
  }

  onAnioChange(rawValue: string | number): void {
    const val = Number(rawValue);
    if (Number.isInteger(val) && val >= 2020 && val <= 2100) {
      this.selectedAnio.set(val);
      this.page.set(1);
      this.feedbackSuccess.set(null);
      void this.loadSeguimiento();
    }
  }

  onMesChange(rawValue: string | number): void {
    const val = Number(rawValue);
    if (Number.isInteger(val) && val >= 1 && val <= 12) {
      this.selectedMes.set(val);
      this.page.set(1);
      this.feedbackSuccess.set(null);
      void this.loadSeguimiento();
    }
  }

  onUnidadChange(rawValue: string | number | null): void {
    this.hasManualUnidadChange = true;
    if (rawValue === null || rawValue === '') {
      this.selectedUnidadId.set(null);
    } else {
      const parsed = Number(rawValue);
      this.selectedUnidadId.set(Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null);
    }
    this.page.set(1);
    this.feedbackSuccess.set(null);
    void this.loadSeguimiento();
  }

  onEstadoChange(rawValue: string): void {
    this.selectedEstado.set((rawValue ?? '').trim() as RhAsistenciaEstadoFiltro | '');
    this.page.set(1);
    this.feedbackSuccess.set(null);
    void this.loadSeguimiento();
  }

  onSituacionChange(rawValue: string): void {
    const norm = (rawValue ?? '').trim().toUpperCase() as RhSituacionPersonalFiltro;
    if (norm === 'ACTIVOS' || norm === 'BAJAS' || norm === 'TODOS') {
      this.selectedSituacion.set(norm);
      this.page.set(1);
      this.feedbackSuccess.set(null);
      void this.loadSeguimiento();
    }
  }

  async onExportarControlXlsx(): Promise<void> {
    if (this.exportingXlsx()) return;
    this.exportingXlsx.set(true);
    this.errorMessage.set(null);
    try {
      const blob = await this.rhService.exportarReporteAnualAsistenciaXlsx({
        anio: this.selectedAnio(),
        unidadId: this.selectedUnidadId(),
        situacion: this.selectedSituacion(),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `control-asistencias-${this.selectedAnio()}-${this.selectedSituacion().toLowerCase()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      this.feedbackSuccess.set(`Reporte anual ${this.selectedAnio()} exportado en formato Excel.`);
    } catch (err: unknown) {
      this.errorMessage.set(
        this.extractErrorMessage(err, 'No fue posible exportar el reporte de control de asistencias.')
      );
    } finally {
      this.exportingXlsx.set(false);
    }
  }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => {
      this.page.set(1);
      void this.loadSeguimiento();
    }, 300);
  }

  clearSearch(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.searchQuery.set('');
    this.page.set(1);
    void this.loadSeguimiento();
  }

  goToPage(targetPage: number): void {
    const tp = this.totalPages();
    const clamped = Math.min(tp, Math.max(1, Number(targetPage) || 1));
    if (clamped === this.page()) {
      return;
    }
    this.page.set(clamped);
    void this.loadSeguimiento();
  }

  async loadSeguimiento(): Promise<void> {
    const seq = ++this.requestSeq;
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      const resp = await this.rhService.getAsistenciaSeguimiento({
        anio: this.selectedAnio(),
        mes: this.selectedMes(),
        unidadId: this.selectedUnidadId(),
        estado: this.selectedEstado() || null,
        situacion: this.selectedSituacion(),
        q: this.searchQuery().trim() || null,
        page: this.page(),
        pageSize: this.pageSize(),
      });

      if (seq !== this.requestSeq) {
        return; // Descartar respuesta obsoleta
      }

      this.items.set(resp.items ?? []);
      this.total.set(resp.total ?? 0);
      this.resumen.set(resp.resumen ?? null);
    } catch (err: unknown) {
      if (seq !== this.requestSeq) {
        return;
      }
      if (err instanceof HttpErrorResponse && (err.status === 401 || err.status === 403)) {
        this.unauthorized.emit();
      }
      this.errorMessage.set(
        this.extractErrorMessage(err, 'No fue posible consultar el seguimiento mensual de asistencia.')
      );
    } finally {
      if (seq === this.requestSeq) {
        this.loading.set(false);
      }
    }
  }

  /**
   * Acción principal: confirmar recepción física.
   * Si el trabajador ya tenía un estado administrativo previo (OBSERVADA o NO_APLICA),
   * solicita motivo administrativo en modal para evitar sobrescritura silenciosa.
   */
  async onConfirmarRecepcion(item: RhAsistenciaSeguimientoItemDto): Promise<void> {
    if (!this.canAdminister || this.busyPersonaId() !== null) {
      return;
    }

    if (item.estado_control === 'OBSERVADA' || item.estado_control === 'NO_APLICA') {
      this.openModal('CONFIRMAR_CON_MOTIVO', item);
      return;
    }

    this.busyPersonaId.set(item.persona_id);
    this.errorMessage.set(null);
    this.feedbackSuccess.set(null);

    try {
      const resp = await this.rhService.confirmarRecepcionAsistencia(
        item.persona_id,
        this.selectedAnio(),
        this.selectedMes(),
        {
          unidad_medica_id: item.unidad_medica_id,
          adscripcion_laboral_id: item.adscripcion_laboral_id,
        }
      );
      this.feedbackSuccess.set(
        resp.idempotente
          ? `La recepción de ${item.nombre_completo} ya estaba registrada.`
          : `Recepción confirmada para ${item.nombre_completo}.`
      );
      await this.loadSeguimiento();
    } catch (err: unknown) {
      if (err instanceof HttpErrorResponse && (err.status === 401 || err.status === 403)) {
        this.unauthorized.emit();
      }
      this.errorMessage.set(
        this.extractErrorMessage(err, `No fue posible confirmar la recepción de ${item.nombre_completo}.`)
      );
    } finally {
      this.busyPersonaId.set(null);
    }
  }

  openModal(mode: RhAsistenciaModalMode, item: RhAsistenciaSeguimientoItemDto): void {
    if (!this.canAdminister) {
      return;
    }
    this.modalMode.set(mode);
    this.modalTarget.set(item);
    this.modalError.set(null);
    this.modalMotivoAdmin.set('');
    this.modalObservaciones.set(item.observaciones ?? '');
    this.modalMotivoExcepcion.set(item.motivo_excepcion ?? '');

    if (mode === 'OBSERVADA') {
      this.modalNuevoEstado.set('OBSERVADA');
    } else if (mode === 'NO_APLICA') {
      this.modalNuevoEstado.set('NO_APLICA');
    } else {
      this.modalNuevoEstado.set('PENDIENTE');
    }

    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.modalTarget.set(null);
    this.modalError.set(null);
    this.modalSubmitting.set(false);
  }

  async submitModal(): Promise<void> {
    if (!this.canAdminister || this.modalSubmitting()) {
      return;
    }
    const target = this.modalTarget();
    if (!target) {
      return;
    }

    const mode = this.modalMode();
    const obs = this.modalObservaciones().trim();
    const motivoAdmin = this.modalMotivoAdmin().trim();
    const motivoExcepcion = this.modalMotivoExcepcion();
    const requiereMotivoAdmin = target.tiene_registro_control;

    if (mode === 'CONFIRMAR_CON_MOTIVO') {
      if (!motivoAdmin) {
        this.modalError.set('Debes capturar el motivo administrativo para cambiar el estado previo a RECIBIDA.');
        return;
      }
    } else {
      const estadoDestino = mode === 'CORREGIR' ? this.modalNuevoEstado() : mode;
      if (estadoDestino === 'OBSERVADA' && !obs) {
        this.modalError.set('Las observaciones son obligatorias para marcar como OBSERVADA.');
        return;
      }
      if (estadoDestino === 'NO_APLICA') {
        if (!motivoExcepcion) {
          this.modalError.set('Debes seleccionar un motivo de excepción del catálogo.');
          return;
        }
        if (motivoExcepcion === 'OTRO' && !obs) {
          this.modalError.set('Cuando el motivo es OTRO, debes capturar observaciones.');
          return;
        }
      }
      if (requiereMotivoAdmin && !motivoAdmin) {
        this.modalError.set('Para corregir o cambiar un estado ya registrado es obligatorio capturar el motivo administrativo.');
        return;
      }
    }

    this.modalSubmitting.set(true);
    this.modalError.set(null);
    this.feedbackSuccess.set(null);

    try {
      if (mode === 'CONFIRMAR_CON_MOTIVO') {
        await this.rhService.confirmarRecepcionAsistencia(
          target.persona_id,
          this.selectedAnio(),
          this.selectedMes(),
          {
            unidad_medica_id: target.unidad_medica_id,
            adscripcion_laboral_id: target.adscripcion_laboral_id,
            observaciones: obs || null,
            motivo_administrativo: motivoAdmin,
          }
        );
        this.feedbackSuccess.set(`Recepción confirmada para ${target.nombre_completo}.`);
      } else {
        const estadoDestino = mode === 'CORREGIR' ? this.modalNuevoEstado() : mode;
        await this.rhService.actualizarEstadoAsistencia(
          target.persona_id,
          this.selectedAnio(),
          this.selectedMes(),
          {
            estado: estadoDestino,
            motivo_excepcion: estadoDestino === 'NO_APLICA' ? (motivoExcepcion as RhAsistenciaMotivoExcepcion) : null,
            observaciones: obs || null,
            unidad_medica_id: target.unidad_medica_id,
            adscripcion_laboral_id: target.adscripcion_laboral_id,
            motivo_administrativo: motivoAdmin || null,
          }
        );
        this.feedbackSuccess.set(`Estado actualizado a ${this.getEstadoLabel(estadoDestino)} para ${target.nombre_completo}.`);
      }

      this.closeModal();
      await this.loadSeguimiento();
    } catch (err: unknown) {
      if (err instanceof HttpErrorResponse && (err.status === 401 || err.status === 403)) {
        this.unauthorized.emit();
      }
      this.modalError.set(this.extractErrorMessage(err, 'No fue posible guardar el cambio administrativo.'));
      this.modalSubmitting.set(false);
    }
  }

  getBadgeInfo(item: RhAsistenciaSeguimientoItemDto): { label: string; classes: string; isCalculated: boolean } {
    if (item.estado_control === 'RECIBIDA') {
      return { label: 'Recibida', classes: 'bg-emerald-50 text-emerald-800 border-emerald-200', isCalculated: false };
    }
    if (item.estado_control === 'PENDIENTE') {
      return { label: 'Pendiente', classes: 'bg-amber-50 text-amber-800 border-amber-200', isCalculated: false };
    }
    if (item.estado_control === 'ENTREGADA_DECLARADA') {
      return { label: 'Declarada (sin confirmar)', classes: 'bg-sky-50 text-sky-800 border-sky-200', isCalculated: false };
    }
    if (item.estado_control === 'OBSERVADA') {
      return { label: 'Observada', classes: 'bg-rose-50 text-rose-800 border-rose-200', isCalculated: false };
    }
    if (item.estado_control === 'NO_APLICA') {
      return { label: 'No aplica', classes: 'bg-slate-100 text-slate-700 border-slate-300', isCalculated: false };
    }
    if (item.situacion_seguimiento === 'ELEGIBILIDAD_INCIERTA') {
      return { label: 'Elegibilidad incierta', classes: 'bg-purple-50 text-purple-800 border-purple-200', isCalculated: true };
    }
    return { label: 'Sin registro', classes: 'bg-gray-100 text-gray-700 border-gray-200', isCalculated: true };
  }

  getEstadoLabel(estado: string | null): string {
    switch (estado) {
      case 'RECIBIDA': return 'Recibida';
      case 'PENDIENTE': return 'Pendiente';
      case 'ENTREGADA_DECLARADA': return 'Declarada (sin confirmar)';
      case 'OBSERVADA': return 'Observada';
      case 'NO_APLICA': return 'No aplica';
      default: return 'Sin registro';
    }
  }

  getUnidadOrigenLabel(origen: RhAsistenciaSeguimientoItemDto['unidad_origen']): string {
    switch (origen) {
      case 'CONTROL_MENSUAL': return 'Registrada en control';
      case 'ADSCRIPCION_VIGENTE': return 'Adscripción de referencia';
      case 'DIRECTORIO_REFERENCIA': return 'Directorio (referencia)';
      default: return 'Sin unidad';
    }
  }

  getMotivoExcepcionLabel(motivo: RhAsistenciaMotivoExcepcion | null): string {
    if (!motivo) return '';
    return this.motivosCatalogo.find((m) => m.value === motivo)?.label ?? motivo;
  }

  formatFechaRecepcion(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Tijuana',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  }

  private extractErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const apiErr = err.error?.error;
      if (typeof apiErr === 'string' && apiErr.trim()) {
        return apiErr.trim();
      }
    }
    if (err instanceof Error && err.message.trim()) {
      return err.message.trim();
    }
    return fallback;
  }
}
