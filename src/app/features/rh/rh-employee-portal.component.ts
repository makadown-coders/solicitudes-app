import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  AlertTriangle,
  Briefcase,
  Building2,
  Calendar,
  Clock,
  Info,
  KeyRound,
  LogOut,
  LucideAngularModule,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  User,
} from 'lucide-angular';
import { AuthClient } from '../../core/auth/auth-client.service';
import { resolveRhRoleContext } from '../../core/auth/rh-access.guard';
import { SessionStore } from '../../core/auth/session-store.service';
import {
  RhAdscripcionEstadoVigencia,
  RhMiContextoAdscripcionPropia,
  RhMiContextoResponse,
  RhService,
} from '../../services/rh.service';

const ESTADO_VIGENCIA_PRIORITY: Record<RhAdscripcionEstadoVigencia, number> = {
  VIGENTE: 0,
  FUTURA: 1,
  HISTORICA: 2,
};

@Component({
  selector: 'app-rh-employee-portal',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rh-employee-portal.component.html',
})
export class RhEmployeePortalComponent implements OnInit, OnDestroy {
  private readonly authClient = inject(AuthClient);
  private readonly sessionStore = inject(SessionStore);
  private readonly rhService = inject(RhService);
  private readonly router = inject(Router);

  readonly icons = {
    user: User,
    briefcase: Briefcase,
    building: Building2,
    calendar: Calendar,
    clock: Clock,
    info: Info,
    shieldCheck: ShieldCheck,
    shieldAlert: ShieldAlert,
    alertTriangle: AlertTriangle,
    refreshCw: RefreshCw,
    keyRound: KeyRound,
    logOut: LogOut,
  };

  readonly loggingOut = signal(false);

  /** Estado de carga y datos de `GET /api/rh/mi-contexto` (exclusivamente en memoria local) */
  readonly loadingContexto = signal(false);
  readonly contextoData = signal<RhMiContextoResponse | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly forbiddenMessage = signal<string | null>(null);
  readonly canRetry = signal(false);

  private requestSeq = 0;

  /** Señal con el usuario autenticado actual desde SessionStore */
  readonly user = this.sessionStore.user;

  readonly displayName = computed(() => {
    const ctx = this.contextoData();
    if (ctx?.persona?.nombre_completo?.trim()) {
      return ctx.persona.nombre_completo.trim();
    }
    const profile = this.user();
    if (!profile) {
      return 'Usuario autenticado';
    }
    return profile.name?.trim() || profile.email?.trim() || 'Usuario autenticado';
  });

  readonly displayEmail = computed(() => {
    const profile = this.user();
    return profile?.email?.trim() || '';
  });

  /**
   * Evalúa si el contexto de roles existente permite acceso a `/rh-admin`
   * reutilizando estrictamente `resolveRhRoleContext()`.
   */
  readonly adminRoleContext = computed(() => resolveRhRoleContext(this.user()));

  readonly canAccessRhAdmin = computed(() => this.adminRoleContext() !== null);

  /**
   * Indica si la tarjeta de unidad representa una adscripción laboral RH vigente
   * o una unidad de referencia institucional del directorio.
   */
  readonly isUnidadAdscripcionFormal = computed(() => {
    const ctx = this.contextoData();
    if (!ctx?.unidad_referencia) {
      return false;
    }
    return (
      ctx.unidad_referencia.origen === 'ADSCRIPCION_RH' &&
      ctx.estado_vinculacion_rh === 'ADSCRIPCION_VIGENTE'
    );
  });

  readonly unidadCardTitle = computed(() => {
    const ctx = this.contextoData();
    if (!ctx?.unidad_referencia) {
      return 'Unidad de referencia institucional';
    }
    if (ctx.unidad_referencia.origen === 'DIRECTORIO') {
      return 'Unidad de referencia institucional';
    }
    if (ctx.estado_vinculacion_rh === 'ADSCRIPCION_VIGENTE') {
      return 'Mi unidad de adscripción';
    }
    if (ctx.estado_vinculacion_rh === 'ADSCRIPCION_FUTURA') {
      return 'Unidad de adscripción programada';
    }
    return 'Última unidad de adscripción registrada';
  });

  /**
   * Ordena las adscripciones propias priorizando visualmente:
   * 1. `VIGENTE`
   * 2. `FUTURA`
   * 3. `HISTORICA`
   */
  readonly adscripcionesOrdenadas = computed<RhMiContextoAdscripcionPropia[]>(() => {
    const list = this.contextoData()?.adscripciones ?? [];
    return [...list].sort((a, b) => {
      const prioA = ESTADO_VIGENCIA_PRIORITY[a.estado_vigencia] ?? 99;
      const prioB = ESTADO_VIGENCIA_PRIORITY[b.estado_vigencia] ?? 99;
      if (prioA !== prioB) {
        return prioA - prioB;
      }
      return b.vigente_desde.localeCompare(a.vigente_desde);
    });
  });

  ngOnInit(): void {
    void this.cargarMiContexto();
  }

  ngOnDestroy(): void {
    this.clearPersonalState();
  }

  private clearPersonalState(): void {
    this.requestSeq += 1;
    this.loadingContexto.set(false);
    this.contextoData.set(null);
    this.errorMessage.set(null);
    this.forbiddenMessage.set(null);
    this.canRetry.set(false);
  }

  async cargarMiContexto(): Promise<void> {
    if (this.loadingContexto()) {
      return;
    }

    const seq = ++this.requestSeq;
    const epochAtStart = this.sessionStore.currentEpoch;

    this.loadingContexto.set(true);
    this.errorMessage.set(null);
    this.forbiddenMessage.set(null);
    this.canRetry.set(false);

    try {
      const response = await this.rhService.obtenerMiContextoRh();

      if (seq !== this.requestSeq || this.sessionStore.currentEpoch !== epochAtStart) {
        return;
      }

      this.contextoData.set(response);
    } catch (err: unknown) {
      if (seq !== this.requestSeq) {
        return;
      }

      this.contextoData.set(null);

      if (err instanceof HttpErrorResponse) {
        if (err.status === 401) {
          this.clearPersonalState();
          this.sessionStore.clear();
          await this.router.navigate(['/login'], {
            queryParams: { returnUrl: '/rh' },
          });
          return;
        }

        if (this.sessionStore.currentEpoch !== epochAtStart) {
          return;
        }

        if (err.status === 403) {
          const backendMsg = this.extractBackendErrorMessage(err);
          this.forbiddenMessage.set(
            backendMsg ||
              'Tu cuenta autenticada no cuenta con un registro personal activo habilitado para consultar este espacio laboral.'
          );
          this.canRetry.set(false);
          return;
        }

        const backendMsg = this.extractBackendErrorMessage(err);
        this.errorMessage.set(
          backendMsg ||
            'No fue posible cargar tu información laboral en este momento. Por favor intenta nuevamente.'
        );
        this.canRetry.set(true);
        return;
      }

      this.errorMessage.set(
        'Ocurrió un problema de conexión al consultar tu espacio laboral. Verifica tu red e intenta nuevamente.'
      );
      this.canRetry.set(true);
    } finally {
      if (seq === this.requestSeq) {
        this.loadingContexto.set(false);
      }
    }
  }

  private extractBackendErrorMessage(err: HttpErrorResponse): string | null {
    const payload = err.error;
    if (payload && typeof payload === 'object') {
      const maybeError = (payload as Record<string, unknown>)['error'];
      if (typeof maybeError === 'string' && maybeError.trim().length > 0) {
        return maybeError.trim();
      }
      const maybeMessage = (payload as Record<string, unknown>)['message'];
      if (typeof maybeMessage === 'string' && maybeMessage.trim().length > 0) {
        return maybeMessage.trim();
      }
    }
    return null;
  }

  isCluesConvencional(cluesimb: string | null | undefined): boolean {
    if (!cluesimb) {
      return false;
    }
    const normalized = cluesimb.trim().toUpperCase();
    return normalized.length > 0 && normalized !== 'N/A';
  }

  formatCluesLabel(cluesimb: string | null | undefined): string {
    if (this.isCluesConvencional(cluesimb)) {
      return `CLUES: ${cluesimb!.trim().toUpperCase()}`;
    }
    return 'Sin CLUES convencional · Unidad administrativa';
  }

  /**
   * Formatea una fecha ISO `YYYY-MM-DD` en formato legible `DD/MM/YYYY`
   * sin crear instancias de `Date` sujetas a desfases de zona horaria.
   */
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

  async onLogout(): Promise<void> {
    if (this.loggingOut()) {
      return;
    }

    this.clearPersonalState();
    this.loggingOut.set(true);
    const expectedLogoutEpoch = this.sessionStore.currentEpoch + 1;

    try {
      await this.authClient.logout();
      if (this.sessionStore.currentEpoch === expectedLogoutEpoch) {
        await this.router.navigate(['/login']);
      }
    } finally {
      if (this.sessionStore.currentEpoch === expectedLogoutEpoch) {
        this.loggingOut.set(false);
      }
    }
  }
}
