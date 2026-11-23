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
  Briefcase,
  Calendar,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Loader2,
  LucideAngularModule,
  RefreshCw,
  ShieldAlert,
  User,
  X,
} from 'lucide-angular';
import {
  RhAdscripcionesPersonaEstadoFilter,
  RhAdscripcionPersonaDto,
  RhComisionLaboralDto,
  RhPersonasPadronItem,
  RhService,
  RhVacacionFechaDto,
  RhVacacionKardexMovimientoDto,
  RhVacacionRegistroDto,
} from '../../../services/rh.service';
import {
  formatFechaVacacionCortaEs,
  formatFechaVacacionLargaEs,
  sortFechasVacacionCronologico,
} from '../vacaciones/rh-vacaciones-fecha.utils';

export const formatFechaVacacionEs = formatFechaVacacionCortaEs;

export type RhExpedienteTab = 'generales' | 'laboral' | 'vacaciones';

@Component({
  selector: 'app-rh-expediente-consolidado',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rh-expediente-consolidado.component.html',
})
export class RhExpedienteConsolidadoComponent implements OnChanges, OnDestroy {
  private readonly rhService = inject(RhService);

  @Input({ required: true }) persona!: RhPersonasPadronItem;
  @Input() canManage = true;

  @Output() closed = new EventEmitter<void>();
  @Output() unauthorized = new EventEmitter<void>();
  @Output() openComisiones = new EventEmitter<RhPersonasPadronItem>();
  @Output() openVacaciones = new EventEmitter<RhPersonasPadronItem>();

  readonly icons = {
    folder: FolderOpen,
    user: User,
    briefcase: Briefcase,
    comision: ArrowRightLeft,
    calendar: Calendar,
    close: X,
    refresh: RefreshCw,
    loader: Loader2,
    alert: AlertCircle,
    shieldAlert: ShieldAlert,
    prev: ChevronLeft,
    next: ChevronRight,
  };

  readonly activeTab = signal<RhExpedienteTab>('generales');
  readonly forbiddenError = signal<string | null>(null);

  /** Situación laboral: adscripciones laborales oficiales cargadas bajo demanda */
  readonly adscripciones = signal<RhAdscripcionPersonaDto[]>([]);
  readonly adscripcionesLoaded = signal(false);
  readonly adscripcionesLoading = signal(false);
  readonly adscripcionesError = signal<string | null>(null);
  readonly adscripcionesEstadoFilter = signal<RhAdscripcionesPersonaEstadoFilter>('todas');
  readonly adscripcionesPage = signal(1);
  readonly adscripcionesPageSize = signal(10);
  readonly adscripcionesTotal = signal(0);

  /** Situación laboral: comisiones cargadas bajo demanda */
  readonly comisiones = signal<RhComisionLaboralDto[]>([]);
  readonly comisionesLoaded = signal(false);
  readonly comisionesLoading = signal(false);
  readonly comisionesError = signal<string | null>(null);

  /** Vacaciones: historial cargado bajo demanda */
  readonly vacaciones = signal<RhVacacionRegistroDto[]>([]);
  readonly vacacionDetalleById = signal<Record<number, RhVacacionKardexMovimientoDto>>({});
  readonly vacacionesLoaded = signal(false);
  readonly vacacionesLoading = signal(false);
  readonly vacacionesError = signal<string | null>(null);

  private adscripcionesSeq = 0;
  private comisionesSeq = 0;
  private vacacionesSeq = 0;

  readonly adscripcionesTotalPages = computed(() => {
    const t = this.adscripcionesTotal();
    const s = this.adscripcionesPageSize();
    return t > 0 && s > 0 ? Math.ceil(t / s) : 1;
  });

  readonly canGoAdsPrev = computed(() => this.adscripcionesPage() > 1 && !this.adscripcionesLoading());
  readonly canGoAdsNext = computed(
    () => this.adscripcionesPage() < this.adscripcionesTotalPages() && !this.adscripcionesLoading()
  );

  readonly comisionesVigentes = computed(() =>
    this.comisiones().filter((c) => c.estado_vigencia === 'VIGENTE')
  );
  readonly comisionesFuturas = computed(() =>
    this.comisiones().filter((c) => c.estado_vigencia === 'FUTURA')
  );
  readonly comisionesConcluidas = computed(() =>
    this.comisiones().filter((c) => c.estado_vigencia === 'CONCLUIDA')
  );

  readonly diasVacacionesRegistrados = computed(() =>
    this.vacaciones()
      .filter((v) => v.estado === 'REGISTRADO')
      .reduce((acc, v) => acc + (Number(v.dias_registrados) || 0), 0)
  );

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['persona'] && this.persona?.persona_id) {
      this.resetState();
      if (!this.canManage) {
        this.forbiddenError.set(
          'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para consultar el expediente administrativo consolidado.'
        );
      }
    }
  }

  ngOnDestroy(): void {
    this.resetState();
  }

  onSelectTab(tab: RhExpedienteTab): void {
    this.activeTab.set(tab);
    if (!this.canManage || this.forbiddenError()) {
      return;
    }
    if (tab === 'laboral') {
      if (!this.adscripcionesLoaded() && !this.adscripcionesLoading()) {
        void this.loadAdscripciones();
      }
      if (!this.comisionesLoaded() && !this.comisionesLoading()) {
        void this.loadComisiones();
      }
    }
    if (tab === 'vacaciones' && !this.vacacionesLoaded() && !this.vacacionesLoading()) {
      void this.loadVacaciones();
    }
  }

  async loadAdscripciones(): Promise<void> {
    if (!this.persona?.persona_id || !this.canManage) {
      return;
    }
    const targetPersonaId = this.persona.persona_id;
    const seq = ++this.adscripcionesSeq;
    this.adscripcionesLoading.set(true);
    this.adscripcionesError.set(null);

    try {
      const res = await this.rhService.listAdscripcionesPorPersona(targetPersonaId, {
        estado: this.adscripcionesEstadoFilter(),
        page: this.adscripcionesPage(),
        pageSize: this.adscripcionesPageSize(),
      });
      if (seq !== this.adscripcionesSeq || this.persona?.persona_id !== targetPersonaId) return;
      this.adscripciones.set(Array.isArray(res.items) ? res.items : []);
      this.adscripcionesTotal.set(typeof res.total === 'number' ? res.total : 0);
      if (typeof res.page === 'number' && res.page > 0) {
        this.adscripcionesPage.set(res.page);
      }
      if (typeof res.pageSize === 'number' && res.pageSize > 0) {
        this.adscripcionesPageSize.set(res.pageSize);
      }
      this.adscripcionesLoaded.set(true);
    } catch (err) {
      if (seq !== this.adscripcionesSeq || this.persona?.persona_id !== targetPersonaId) return;
      if (err instanceof HttpErrorResponse) {
        if (err.status === 401) {
          this.unauthorized.emit();
          return;
        }
        if (err.status === 403) {
          this.forbiddenError.set(
            'No cuentas con permiso RECURSOS_HUMANOS GLOBAL para consultar el expediente administrativo.'
          );
          return;
        }
      }
      this.adscripcionesError.set('No fue posible cargar las adscripciones laborales oficiales.');
    } finally {
      if (seq === this.adscripcionesSeq) {
        this.adscripcionesLoading.set(false);
      }
    }
  }

  onSelectAdscripcionesFilter(estado: RhAdscripcionesPersonaEstadoFilter): void {
    if (this.adscripcionesEstadoFilter() === estado) return;
    this.adscripcionesEstadoFilter.set(estado);
    this.adscripcionesPage.set(1);
    void this.loadAdscripciones();
  }

  onAdsPrevPage(): void {
    if (!this.canGoAdsPrev()) return;
    this.adscripcionesPage.update((p) => Math.max(1, p - 1));
    void this.loadAdscripciones();
  }

  onAdsNextPage(): void {
    if (!this.canGoAdsNext()) return;
    this.adscripcionesPage.update((p) => p + 1);
    void this.loadAdscripciones();
  }

  async loadComisiones(): Promise<void> {
    if (!this.persona?.persona_id || !this.canManage) {
      return;
    }
    const seq = ++this.comisionesSeq;
    this.comisionesLoading.set(true);
    this.comisionesError.set(null);

    try {
      const res = await this.rhService.listComisionesPorPersona(this.persona.persona_id, {
        estado: 'todas',
        page: 1,
        pageSize: 50,
      });
      if (seq !== this.comisionesSeq) return;
      this.comisiones.set(Array.isArray(res.items) ? res.items : []);
      this.comisionesLoaded.set(true);
    } catch (err) {
      if (seq !== this.comisionesSeq) return;
      if (err instanceof HttpErrorResponse) {
        if (err.status === 401) {
          this.unauthorized.emit();
          return;
        }
        if (err.status === 403) {
          this.forbiddenError.set(
            'No cuentas con permiso RECURSOS_HUMANOS GLOBAL para consultar el expediente administrativo.'
          );
          return;
        }
      }
      this.comisionesError.set('No fue posible cargar las comisiones laborales.');
    } finally {
      if (seq === this.comisionesSeq) {
        this.comisionesLoading.set(false);
      }
    }
  }

  async loadVacaciones(): Promise<void> {
    if (!this.persona?.persona_id || !this.canManage) {
      return;
    }
    const seq = ++this.vacacionesSeq;
    this.vacacionesLoading.set(true);
    this.vacacionesError.set(null);

    try {
      const res = await this.rhService.listVacacionesPorPersona(this.persona.persona_id, {
        estado: 'todos',
        page: 1,
        pageSize: 50,
      });
      if (seq !== this.vacacionesSeq) return;
      const items = Array.isArray(res.items) ? res.items : [];
      this.vacaciones.set(items);
      this.vacacionesLoaded.set(true);

      if (items.length > 0) {
        void this.enrichVacacionesConFechasDetalladas(this.persona.persona_id, seq);
      } else {
        this.vacacionDetalleById.set({});
      }
    } catch (err) {
      if (seq !== this.vacacionesSeq) return;
      if (err instanceof HttpErrorResponse) {
        if (err.status === 401) {
          this.unauthorized.emit();
          return;
        }
        if (err.status === 403) {
          this.forbiddenError.set(
            'No cuentas con permiso RECURSOS_HUMANOS GLOBAL para consultar el expediente administrativo.'
          );
          return;
        }
      }
      this.vacacionesError.set('No fue posible cargar el historial vacacional.');
    } finally {
      if (seq === this.vacacionesSeq) {
        this.vacacionesLoading.set(false);
      }
    }
  }

  onOpenComisionesGestion(): void {
    if (!this.canManage || !this.persona) return;
    this.openComisiones.emit(this.persona);
  }

  onOpenVacacionesGestion(): void {
    if (!this.canManage || !this.persona) return;
    this.openVacaciones.emit(this.persona);
  }

  formatFechaDetalle(iso: string): string {
    return formatFechaVacacionCortaEs(iso);
  }

  formatFechaDetalleLarga(iso: string): string {
    return formatFechaVacacionLargaEs(iso);
  }

  getModoRegistroVacacion(v: RhVacacionRegistroDto): 'FECHAS_DETALLADAS' | 'RANGO_HISTORICO' {
    const det = this.vacacionDetalleById()[v.id];
    if (det && det.modo_registro === 'FECHAS_DETALLADAS' && det.fechas.length > 0) {
      return 'FECHAS_DETALLADAS';
    }
    return 'RANGO_HISTORICO';
  }

  getFechasComputables(v: RhVacacionRegistroDto): RhVacacionFechaDto[] {
    const det = this.vacacionDetalleById()[v.id];
    return det ? sortFechasVacacionCronologico(det.fechas.filter((f) => f.computable)) : [];
  }

  getFechasExcluidas(v: RhVacacionRegistroDto): RhVacacionFechaDto[] {
    const det = this.vacacionDetalleById()[v.id];
    return det ? sortFechasVacacionCronologico(det.fechas.filter((f) => !f.computable)) : [];
  }

  private async enrichVacacionesConFechasDetalladas(personaId: number, seq: number): Promise<void> {
    try {
      const perRes = await this.rhService.listVacacionPeriodos();
      if (seq !== this.vacacionesSeq) return;
      const periodos = Array.isArray(perRes?.items) ? perRes.items : [];
      if (periodos.length === 0) return;

      const detalleMap: Record<number, RhVacacionKardexMovimientoDto> = {};
      for (const per of periodos) {
        try {
          const kRes = await this.rhService.getVacacionKardexPorPersona(personaId, per.id);
          if (seq !== this.vacacionesSeq) return;
          for (const mov of kRes?.movimientos ?? []) {
            detalleMap[mov.id] = mov;
          }
        } catch {
          // Ignorar fallo individual por periodo para preservar la vista base
        }
      }
      if (seq === this.vacacionesSeq) {
        this.vacacionDetalleById.set(detalleMap);
      }
    } catch {
      // Silencioso: conserva la visualización base por rango si no hay catálogo de periodos
    }
  }

  onClose(): void {
    this.resetState();
    this.closed.emit();
  }

  private resetState(): void {
    this.adscripcionesSeq++;
    this.comisionesSeq++;
    this.vacacionesSeq++;
    this.activeTab.set('generales');
    this.forbiddenError.set(null);
    this.adscripciones.set([]);
    this.adscripcionesLoaded.set(false);
    this.adscripcionesLoading.set(false);
    this.adscripcionesError.set(null);
    this.adscripcionesEstadoFilter.set('todas');
    this.adscripcionesPage.set(1);
    this.adscripcionesTotal.set(0);
    this.comisiones.set([]);
    this.comisionesLoaded.set(false);
    this.comisionesLoading.set(false);
    this.comisionesError.set(null);
    this.vacaciones.set([]);
    this.vacacionesLoaded.set(false);
    this.vacacionesLoading.set(false);
    this.vacacionesError.set(null);
  }
}
