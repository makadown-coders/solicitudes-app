import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  KeyRound,
  Loader2,
  LogOut,
  LucideAngularModule,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  User,
  X,
} from 'lucide-angular';
import { AuthClient } from '../../core/auth/auth-client.service';
import { RhAccessScope, resolveRhRoleContext } from '../../core/auth/rh-access.guard';
import { SessionStore } from '../../core/auth/session-store.service';
import { RhService, RhUnidadAutorizada } from '../../services/rh.service';

@Component({
  selector: 'app-rh-shell',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet, RouterLink, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rh-shell.component.html',
})
export class RhShellComponent implements OnInit {
  private readonly authClient = inject(AuthClient);
  private readonly sessionStore = inject(SessionStore);
  private readonly rhService = inject(RhService);
  private readonly router = inject(Router);

  readonly icons = {
    user: User,
    keyRound: KeyRound,
    logOut: LogOut,
    building: Building2,
    shieldCheck: ShieldCheck,
    shieldAlert: ShieldAlert,
    alert: AlertCircle,
    checkCircle: CheckCircle2,
    search: Search,
    clear: X,
    refresh: RefreshCw,
    loader: Loader2,
  };

  readonly loggingOut = signal(false);

  /** Señal con el usuario autenticado actual desde SessionStore */
  readonly user = this.sessionStore.user;

  /** Nombre visible del usuario autenticado (fallback seguro al correo o 'Usuario autenticado') */
  readonly displayName = computed(() => {
    const profile = this.user();
    if (!profile) {
      return 'Usuario autenticado';
    }
    return profile.name?.trim() || profile.email?.trim() || 'Usuario autenticado';
  });

  /** Correo visible del usuario autenticado */
  readonly displayEmail = computed(() => {
    const profile = this.user();
    return profile?.email?.trim() || '';
  });

  /** Estado del catálogo de unidades autorizadas por el backend */
  readonly loadingUnidades = signal(false);
  readonly errorUnidades = signal<string | null>(null);
  readonly accessDeniedError = signal<string | null>(null);
  readonly serverScope = signal<RhAccessScope | null>(null);
  readonly unidadesAutorizadas = signal<RhUnidadAutorizada[]>([]);

  /** Selección activa de unidad de trabajo (conserva el id real unidad_medica.id) */
  readonly selectedUnidadId = signal<number | null>(null);

  /** Estado del autocompletado de unidad de trabajo */
  readonly unidadSearchDraft = signal('');
  readonly unidadSuggestOpen = signal(false);
  readonly unidadSuggestIndex = signal(-1);

  private requestSeq = 0;

  /** Contexto de rol y alcance resuelto desde SessionStore */
  readonly roleContext = computed(() => resolveRhRoleContext(this.user()));

  /**
   * Etiqueta discreta del alcance activo del operador:
   * - RECURSOS_HUMANOS GLOBAL
   * - RECURSOS_HUMANOS CLUES
   * - ADMIN_TIC GLOBAL
   */
  readonly activeScopeLabel = computed<
    'RECURSOS_HUMANOS GLOBAL' | 'RECURSOS_HUMANOS CLUES' | 'ADMIN_TIC GLOBAL' | null
  >(() => {
    const ctx = this.roleContext();
    const srvScope = this.serverScope();
    if (ctx) {
      if (srvScope === 'GLOBAL' && ctx.grantedBy === 'ADMIN_TIC') {
        return 'ADMIN_TIC GLOBAL';
      }
      if (srvScope === 'GLOBAL') {
        return 'RECURSOS_HUMANOS GLOBAL';
      }
      if (srvScope === 'CLUES') {
        return 'RECURSOS_HUMANOS CLUES';
      }
      return ctx.badgeLabel;
    }
    if (srvScope === 'GLOBAL') {
      return 'RECURSOS_HUMANOS GLOBAL';
    }
    if (srvScope === 'CLUES') {
      return 'RECURSOS_HUMANOS CLUES';
    }
    return null;
  });

  readonly effectiveScope = computed<RhAccessScope | null>(
    () => this.serverScope() ?? this.roleContext()?.scope ?? null
  );

  /**
   * Unidad actualmente seleccionada, verificada siempre contra la lista vigente de
   * `unidadesAutorizadas()` devuelta por el backend (nunca sobrevive una selección obsoleta).
   */
  readonly selectedUnidad = computed<RhUnidadAutorizada | null>(() => {
    const id = this.selectedUnidadId();
    if (id === null) {
      return null;
    }
    return this.unidadesAutorizadas().find((u) => u.id === id) ?? null;
  });

  /**
   * Indica si una unidad tiene una CLUES institucional real (distinta de vacío y de 'N/A').
   * No fabrica una CLUES para unidades administrativas como OFICINA CENTRAL (`cluesimb = 'N/A'`).
   */
  hasDisplayableClues(cluesimb: string | null | undefined): boolean {
    if (typeof cluesimb !== 'string') {
      return false;
    }
    const clean = cluesimb.trim().toUpperCase();
    return clean.length > 0 && clean !== 'N/A';
  }

  /**
   * Filtra localmente el universo autorizado devuelto por `GET /api/rh/unidades-autorizadas`
   * por nombre parcial o por CLUES (sin consultar catálogos públicos ajenos).
   */
  readonly filteredUnidades = computed<RhUnidadAutorizada[]>(() => {
    const list = this.unidadesAutorizadas();
    const rawQuery = this.unidadSearchDraft().trim().toLowerCase();
    if (!rawQuery) {
      return list;
    }

    const selected = this.selectedUnidad();
    // Si el texto del input coincide exactamente con el nombre de la unidad ya seleccionada,
    // mostrar todas las opciones autorizadas al abrir el desplegable para permitir cambiarla
    if (selected && selected.nombre.trim().toLowerCase() === rawQuery) {
      return list;
    }

    return list.filter((u) => {
      const nombreMatch = (u.nombre ?? '').toLowerCase().includes(rawQuery);
      const cluesClean = this.hasDisplayableClues(u.cluesimb)
        ? u.cluesimb!.trim().toLowerCase()
        : '';
      const cluesMatch = cluesClean.length > 0 && cluesClean.includes(rawQuery);
      return nombreMatch || cluesMatch;
    });
  });

  /** Indica si el usuario tiene alcance CLUES con exactamente una unidad autorizada */
  readonly isSingleCluesUnitLocked = computed(
    () => this.effectiveScope() === 'CLUES' && this.unidadesAutorizadas().length === 1
  );

  ngOnInit(): void {
    void this.cargarUnidadesAutorizadas();
  }

  async cargarUnidadesAutorizadas(): Promise<void> {
    const seq = ++this.requestSeq;
    this.loadingUnidades.set(true);
    this.errorUnidades.set(null);
    this.accessDeniedError.set(null);

    try {
      const res = await this.rhService.obtenerUnidadesAutorizadas();
      if (seq !== this.requestSeq) {
        return;
      }

      const rawUnidades = Array.isArray(res?.unidades) ? res.unidades : [];
      const sanitizedUnidades: RhUnidadAutorizada[] = rawUnidades
        .filter(
          (u) =>
            u &&
            typeof u.id === 'number' &&
            Number.isFinite(u.id) &&
            typeof u.nombre === 'string' &&
            u.nombre.trim().length > 0
        )
        .map((u) => ({
          id: Number(u.id),
          nombre: u.nombre.trim(),
          cluesimb: typeof u.cluesimb === 'string' ? u.cluesimb.trim() || null : null,
        }));

      const scope: RhAccessScope = res?.scope === 'GLOBAL' ? 'GLOBAL' : 'CLUES';

      this.serverScope.set(scope);
      this.unidadesAutorizadas.set(sanitizedUnidades);
      this.unidadSuggestOpen.set(false);
      this.unidadSuggestIndex.set(-1);

      // Validar si la selección previa sigue perteneciendo al conjunto autorizado actual
      const currentSelectedId = this.selectedUnidadId();
      const stillAuthorized =
        currentSelectedId !== null
          ? sanitizedUnidades.find((u) => u.id === currentSelectedId) ?? null
          : null;

      if (scope === 'CLUES' && sanitizedUnidades.length === 1) {
        // Regla CLUES con una sola unidad autorizada: selección automática
        const unica = sanitizedUnidades[0];
        this.selectedUnidadId.set(unica.id);
        this.unidadSearchDraft.set(unica.nombre);
      } else if (stillAuthorized) {
        this.selectedUnidadId.set(stillAuthorized.id);
        this.unidadSearchDraft.set(stillAuthorized.nombre);
      } else {
        // Para GLOBAL o cuando la selección previa ya no está autorizada: limpiar selección
        this.selectedUnidadId.set(null);
        this.unidadSearchDraft.set('');
      }
    } catch (err: unknown) {
      if (seq !== this.requestSeq) {
        return;
      }

      // Al perder autorización o fallar la consulta, nunca conservar selecciones previas
      this.unidadesAutorizadas.set([]);
      this.selectedUnidadId.set(null);
      this.unidadSearchDraft.set('');
      this.unidadSuggestOpen.set(false);
      this.unidadSuggestIndex.set(-1);

      const status = this.extractHttpStatus(err);
      if (status === 401) {
        this.sessionStore.clear();
        void this.router.navigate(['/login'], { queryParams: { returnUrl: '/rh' } });
        return;
      }

      if (status === 403) {
        this.accessDeniedError.set(
          'Tu cuenta no cuenta con permisos vigentes para consultar unidades de Recursos Humanos (HTTP 403).'
        );
        return;
      }

      this.errorUnidades.set(
        'No fue posible cargar las unidades de trabajo autorizadas. Verifica tu conexión e intenta nuevamente.'
      );
    } finally {
      if (seq === this.requestSeq) {
        this.loadingUnidades.set(false);
      }
    }
  }

  onUnidadSearchFocus(): void {
    if (this.isSingleCluesUnitLocked() || this.unidadesAutorizadas().length === 0) {
      return;
    }
    // Para alcance CLUES con varias unidades (pocas opciones), abrir sugerencias al enfocar;
    // para GLOBAL, no mostrar todas las unidades abiertas inicialmente hasta que el usuario escriba o pulse flecha abajo
    if (this.effectiveScope() === 'CLUES' || this.unidadSearchDraft().trim().length > 0) {
      this.unidadSuggestOpen.set(true);
      this.unidadSuggestIndex.set(-1);
    }
  }

  onUnidadSearchInput(value: string): void {
    this.unidadSearchDraft.set(value);
    const selected = this.selectedUnidad();
    if (selected && value.trim() !== selected.nombre) {
      this.selectedUnidadId.set(null);
    }

    const hasText = value.trim().length > 0;
    if (hasText || this.effectiveScope() === 'CLUES') {
      this.unidadSuggestOpen.set(true);
    } else {
      this.unidadSuggestOpen.set(false);
    }
    this.unidadSuggestIndex.set(-1);
  }

  onUnidadSearchKeyDown(event: KeyboardEvent): void {
    if (this.isSingleCluesUnitLocked()) {
      return;
    }

    const list = this.filteredUnidades();
    if (!this.unidadSuggestOpen()) {
      if (event.key === 'ArrowDown' && list.length > 0) {
        event.preventDefault();
        this.unidadSuggestOpen.set(true);
        this.unidadSuggestIndex.set(0);
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        if (list.length > 0) {
          event.preventDefault();
          this.unidadSuggestIndex.set((this.unidadSuggestIndex() + 1) % list.length);
        }
        break;
      case 'ArrowUp':
        if (list.length > 0) {
          event.preventDefault();
          this.unidadSuggestIndex.set((this.unidadSuggestIndex() - 1 + list.length) % list.length);
        }
        break;
      case 'Enter': {
        event.preventDefault();
        const idx = this.unidadSuggestIndex();
        if (idx >= 0 && list[idx]) {
          this.selectUnidad(list[idx]);
        } else if (list.length === 1) {
          this.selectUnidad(list[0]);
        }
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.unidadSuggestOpen.set(false);
        this.unidadSuggestIndex.set(-1);
        break;
    }
  }

  selectUnidad(unidad: RhUnidadAutorizada): void {
    // Verificar que la unidad pertenezca estrictamente al arreglo autorizado por el backend
    const authorized = this.unidadesAutorizadas().find((u) => u.id === unidad.id);
    if (!authorized) {
      return;
    }
    this.selectedUnidadId.set(authorized.id);
    this.unidadSearchDraft.set(authorized.nombre);
    this.unidadSuggestOpen.set(false);
    this.unidadSuggestIndex.set(-1);
  }

  clearUnidadSelection(): void {
    if (this.isSingleCluesUnitLocked()) {
      return;
    }
    this.selectedUnidadId.set(null);
    this.unidadSearchDraft.set('');
    this.unidadSuggestOpen.set(false);
    this.unidadSuggestIndex.set(-1);
  }

  onUnidadSearchBlur(): void {
    setTimeout(() => {
      this.unidadSuggestOpen.set(false);
      this.unidadSuggestIndex.set(-1);
    }, 150);
  }

  /**
   * Ejecuta el cierre de sesión utilizando `AuthClient.logout()`.
   */
  async onLogout(): Promise<void> {
    if (this.loggingOut()) {
      return;
    }

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

  private extractHttpStatus(err: unknown): number | null {
    if (err instanceof HttpErrorResponse) {
      return err.status;
    }
    if (typeof err === 'object' && err !== null && 'status' in err) {
      const status = (err as { status?: unknown }).status;
      return typeof status === 'number' ? status : null;
    }
    return null;
  }
}
