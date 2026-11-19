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
  FolderOpen,
  Loader2,
  LucideAngularModule,
  RefreshCw,
  ShieldAlert,
  User,
  X,
} from 'lucide-angular';
import {
  RhComisionLaboralDto,
  RhPersonasPadronItem,
  RhService,
  RhVacacionRegistroDto,
} from '../../../services/rh.service';

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
  };

  readonly activeTab = signal<RhExpedienteTab>('generales');
  readonly forbiddenError = signal<string | null>(null);

  /** Situación laboral: comisiones cargadas bajo demanda */
  readonly comisiones = signal<RhComisionLaboralDto[]>([]);
  readonly comisionesLoaded = signal(false);
  readonly comisionesLoading = signal(false);
  readonly comisionesError = signal<string | null>(null);

  /** Vacaciones: historial cargado bajo demanda */
  readonly vacaciones = signal<RhVacacionRegistroDto[]>([]);
  readonly vacacionesLoaded = signal(false);
  readonly vacacionesLoading = signal(false);
  readonly vacacionesError = signal<string | null>(null);

  private comisionesSeq = 0;
  private vacacionesSeq = 0;

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
    if (tab === 'laboral' && !this.comisionesLoaded() && !this.comisionesLoading()) {
      void this.loadComisiones();
    }
    if (tab === 'vacaciones' && !this.vacacionesLoaded() && !this.vacacionesLoading()) {
      void this.loadVacaciones();
    }
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
      this.vacaciones.set(Array.isArray(res.items) ? res.items : []);
      this.vacacionesLoaded.set(true);
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

  onClose(): void {
    this.resetState();
    this.closed.emit();
  }

  private resetState(): void {
    this.activeTab.set('generales');
    this.forbiddenError.set(null);
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
