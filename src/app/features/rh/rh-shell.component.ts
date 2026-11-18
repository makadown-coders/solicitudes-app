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
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  KeyRound,
  Loader2,
  LogOut,
  LucideAngularModule,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-angular';
import { AuthClient } from '../../core/auth/auth-client.service';
import { RhAccessScope, resolveRhRoleContext } from '../../core/auth/rh-access.guard';
import { SessionStore } from '../../core/auth/session-store.service';
import {
  RhCreateAdscripcionPayload,
  RhPersonaCandidataItem,
  RhPersonalUnidadItem,
  RhService,
  RhTrabajadorFichaResponse,
  RhUnidadAutorizada,
  RhUpdateAdscripcionLaboralPayload,
} from '../../services/rh.service';
import { RhFichaTrabajadorDialogComponent } from './rh-ficha-trabajador-dialog.component';

@Component({
  selector: 'app-rh-shell',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterOutlet,
    RouterLink,
    LucideAngularModule,
    RhFichaTrabajadorDialogComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rh-shell.component.html',
})
export class RhShellComponent implements OnInit, OnDestroy {
  private readonly authClient = inject(AuthClient);
  private readonly sessionStore = inject(SessionStore);
  private readonly rhService = inject(RhService);
  private readonly router = inject(Router);

  readonly icons = {
    user: User,
    userPlus: UserPlus,
    users: Users,
    eye: Eye,
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
    prev: ChevronLeft,
    next: ChevronRight,
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

  /** Estado del padrón laboral de la unidad seleccionada (`GET /api/rh/unidades/:unidadId/personal`) */
  readonly personalItems = signal<RhPersonalUnidadItem[]>([]);
  readonly loadingPersonal = signal(false);
  readonly errorPersonal = signal<string | null>(null);
  readonly personalSearchDraft = signal('');
  readonly personalAppliedSearch = signal('');
  readonly personalPage = signal(1);
  readonly personalPageSize = signal(20);
  readonly personalTotal = signal(0);

  /** Mensaje de confirmación tras vincular un trabajador exitosamente (HTTP 201) */
  readonly vincularSuccessBanner = signal<string | null>(null);

  /** Estado del diálogo «Vincular trabajador a la unidad» (RH-2B.4B) */
  readonly vincularOpen = signal(false);
  readonly vincularTargetUnidadId = signal<number | null>(null);
  readonly vincularTargetUnidadNombre = signal('');
  readonly candidataSearchDraft = signal('');
  readonly candidataSuggestOpen = signal(false);
  readonly candidataSuggestIndex = signal(-1);
  readonly candidataItems = signal<RhPersonaCandidataItem[]>([]);
  readonly loadingCandidatas = signal(false);
  readonly errorCandidatas = signal<string | null>(null);
  readonly candidataSearchedOnce = signal(false);
  readonly selectedCandidata = signal<RhPersonaCandidataItem | null>(null);

  /** Campos laborales del formulario de vinculación */
  readonly vincularMatricula = signal('');
  readonly vincularPuesto = signal('');
  readonly vincularTurno = signal('');
  readonly vincularJornada = signal('');
  readonly vincularHorario = signal('');
  readonly vincularVigenteDesde = signal('');
  readonly vincularVigenteHasta = signal('');
  readonly vincularSubmitting = signal(false);
  readonly vincularError = signal<string | null>(null);

  /** Estado del diálogo de consulta y edición laboral de Ficha del trabajador (RH-2B.4D y RH-2B.4F) */
  readonly fichaOpen = signal(false);
  readonly fichaTargetUnidadId = signal<number | null>(null);
  readonly fichaTargetUnidadNombre = signal('');
  readonly fichaTargetAdscripcionId = signal<number | null>(null);
  readonly fichaFallbackNombre = signal('');
  readonly fichaLoading = signal(false);
  readonly fichaError = signal<string | null>(null);
  readonly fichaCanRetry = signal(true);
  readonly fichaData = signal<RhTrabajadorFichaResponse | null>(null);
  readonly fichaSavingLaboral = signal(false);
  readonly fichaSaveLaboralError = signal<string | null>(null);
  readonly fichaSaveLaboralIsConflict = signal(false);
  readonly fichaSaveLaboralSuccess = signal<string | null>(null);

  private requestSeq = 0;
  private personalRequestSeq = 0;
  private personalSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private candidatasRequestSeq = 0;
  private candidatasSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private vincularSubmitSeq = 0;
  private fichaRequestSeq = 0;
  private fichaSaveSeq = 0;

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
   *Unidad actualmente seleccionada, verificada siempre contra la lista vigente de
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
   * Disponible exclusivamente cuando existe una unidad seleccionada y autorizada
   * y el usuario cuenta con rol operativo `RECURSOS_HUMANOS` (`GLOBAL` o `CLUES`).
   * Nunca se habilita para cuentas que solo tienen contingencia `ADMIN_TIC GLOBAL`.
   */
  readonly canVincularTrabajador = computed<boolean>(() => {
    const ctx = this.roleContext();
    const unidad = this.selectedUnidad();
    return Boolean(ctx && ctx.grantedBy === 'RECURSOS_HUMANOS' && unidad !== null);
  });

  readonly selectedCandidataBloqueadaEnUnidad = computed<boolean>(() => {
    const c = this.selectedCandidata();
    return Boolean(c && (c.situacion_rh === 'YA_ADSCRITA_EN_UNIDAD' || c.tiene_adscripcion_rh_en_unidad));
  });

  readonly selectedCandidataRequiereValidacion = computed<boolean>(() => {
    const c = this.selectedCandidata();
    if (!c || this.selectedCandidataBloqueadaEnUnidad()) {
      return false;
    }
    return Boolean(
      c.situacion_rh === 'REQUIERE_VALIDACION_OTRA_ADSCRIPCION' ||
        c.requiere_validacion_previa ||
        c.tiene_adscripcion_rh_activa_en_otra_unidad
    );
  });

  readonly isSelectedCandidataEligible = computed<boolean>(() => {
    const c = this.selectedCandidata();
    return Boolean(
      c &&
        c.situacion_rh === 'DISPONIBLE_DIRECTORIO' &&
        !c.tiene_adscripcion_rh_en_unidad &&
        !c.tiene_adscripcion_rh_activa_en_otra_unidad &&
        !c.requiere_validacion_previa
    );
  });

  readonly vincularDatesOrderInvalid = computed<boolean>(() => {
    const desde = this.vincularVigenteDesde().trim();
    const hasta = this.vincularVigenteHasta().trim();
    if (!desde || !hasta) {
      return false;
    }
    return hasta < desde;
  });

  readonly vincularFieldLengthError = computed<string | null>(() => {
    if (this.vincularMatricula().trim().length > 64) {
      return 'El campo "matricula" no puede exceder 64 caracteres.';
    }
    if (this.vincularPuesto().trim().length > 160) {
      return 'El campo "puesto" no puede exceder 160 caracteres.';
    }
    if (this.vincularTurno().trim().length > 60) {
      return 'El campo "turno" no puede exceder 60 caracteres.';
    }
    if (this.vincularJornada().trim().length > 80) {
      return 'El campo "jornada" no puede exceder 80 caracteres.';
    }
    if (this.vincularHorario().trim().length > 120) {
      return 'El campo "horario" no puede exceder 120 caracteres.';
    }
    return null;
  });

  readonly canSubmitVincular = computed<boolean>(() => {
    if (this.vincularSubmitting() || !this.vincularOpen()) {
      return false;
    }
    const unidad = this.selectedUnidad();
    if (!unidad || unidad.id !== this.vincularTargetUnidadId()) {
      return false;
    }
    if (!this.canVincularTrabajador()) {
      return false;
    }
    if (!this.isSelectedCandidataEligible()) {
      return false;
    }
    const desde = this.vincularVigenteDesde().trim();
    if (!desde) {
      return false;
    }
    if (this.vincularDatesOrderInvalid() || this.vincularFieldLengthError() !== null) {
      return false;
    }
    return true;
  });

  readonly personalTotalPages = computed(() => {
    const total = this.personalTotal();
    const size = this.personalPageSize();
    if (total <= 0 || size <= 0) {
      return 1;
    }
    return Math.ceil(total / size);
  });

  readonly canPersonalGoPrev = computed(
    () => this.personalPage() > 1 && !this.loadingPersonal()
  );

  readonly canPersonalGoNext = computed(
    () => this.personalPage() < this.personalTotalPages() && !this.loadingPersonal()
  );

  readonly personalRangeStart = computed(() => {
    if (this.personalTotal() === 0 || this.personalItems().length === 0) {
      return 0;
    }
    return (this.personalPage() - 1) * this.personalPageSize() + 1;
  });

  readonly personalRangeEnd = computed(() => {
    if (this.personalTotal() === 0 || this.personalItems().length === 0) {
      return 0;
    }
    return Math.min(
      this.personalRangeStart() + this.personalItems().length - 1,
      this.personalTotal()
    );
  });

  readonly hasActivePersonalSearch = computed(
    () => this.personalAppliedSearch().trim().length > 0
  );

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

  ngOnDestroy(): void {
    this.clearPersonalSearchTimer();
    this.clearCandidatasSearchTimer();
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
        const changed = currentSelectedId !== unica.id;
        this.selectedUnidadId.set(unica.id);
        this.unidadSearchDraft.set(unica.nombre);
        if (changed) {
          this.resetPersonalFilterAndState();
        }
        await this.cargarPersonalUnidad();
      } else if (stillAuthorized) {
        this.selectedUnidadId.set(stillAuthorized.id);
        this.unidadSearchDraft.set(stillAuthorized.nombre);
        await this.cargarPersonalUnidad();
      } else {
        // Para GLOBAL o cuando la selección previa ya no está autorizada: limpiar selección y padrón
        this.selectedUnidadId.set(null);
        this.unidadSearchDraft.set('');
        this.resetPersonalFilterAndState();
      }
    } catch (err: unknown) {
      if (seq !== this.requestSeq) {
        return;
      }

      // Al perder autorización o fallar la consulta, nunca conservar selecciones ni padrón previo
      this.unidadesAutorizadas.set([]);
      this.selectedUnidadId.set(null);
      this.unidadSearchDraft.set('');
      this.unidadSuggestOpen.set(false);
      this.unidadSuggestIndex.set(-1);
      this.resetPersonalFilterAndState();

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
      this.resetPersonalFilterAndState();
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

    const prevId = this.selectedUnidadId();
    this.selectedUnidadId.set(authorized.id);
    this.unidadSearchDraft.set(authorized.nombre);
    this.unidadSuggestOpen.set(false);
    this.unidadSuggestIndex.set(-1);

    // Al seleccionar o cambiar de unidad: limpiar inmediatamente resultados anteriores,
    // restablecer búsqueda y paginación a 1 y consultar el padrón de la unidad seleccionada
    if (prevId !== authorized.id) {
      this.resetPersonalFilterAndState();
    } else {
      this.clearPersonalDataOnly();
    }
    void this.cargarPersonalUnidad();
  }

  clearUnidadSelection(): void {
    if (this.isSingleCluesUnitLocked()) {
      return;
    }
    this.selectedUnidadId.set(null);
    this.unidadSearchDraft.set('');
    this.unidadSuggestOpen.set(false);
    this.unidadSuggestIndex.set(-1);
    this.resetPersonalFilterAndState();
  }

  onUnidadSearchBlur(): void {
    setTimeout(() => {
      this.unidadSuggestOpen.set(false);
      this.unidadSuggestIndex.set(-1);
    }, 150);
  }

  // ==================== PADRÓN LABORAL POR UNIDAD ====================

  async cargarPersonalUnidad(): Promise<void> {
    const unidad = this.selectedUnidad();
    if (!unidad) {
      this.clearPersonalDataOnly();
      return;
    }

    const targetUnidadId = unidad.id;
    const seq = ++this.personalRequestSeq;
    this.loadingPersonal.set(true);
    this.errorPersonal.set(null);

    try {
      const res = await this.rhService.listarPersonalUnidad(targetUnidadId, {
        q: this.personalAppliedSearch() || undefined,
        page: this.personalPage(),
        pageSize: this.personalPageSize(),
      });

      // Descartar respuestas obsoletas si hubo otra petición posterior o si cambió la unidad seleccionada
      if (seq !== this.personalRequestSeq || this.selectedUnidadId() !== targetUnidadId) {
        return;
      }

      const rawItems = Array.isArray(res?.items) ? res.items : [];
      this.personalItems.set(rawItems);
      this.personalTotal.set(Number(res?.total ?? 0));
      if (typeof res?.page === 'number' && res.page >= 1) {
        this.personalPage.set(res.page);
      }
      if (typeof res?.pageSize === 'number' && res.pageSize >= 1) {
        this.personalPageSize.set(res.pageSize);
      }
    } catch (err: unknown) {
      if (seq !== this.personalRequestSeq) {
        return;
      }

      this.personalItems.set([]);
      this.personalTotal.set(0);

      const status = this.extractHttpStatus(err);
      if (status === 401) {
        this.resetVincularState();
        this.resetFichaState();
        this.unidadesAutorizadas.set([]);
        this.selectedUnidadId.set(null);
        this.unidadSearchDraft.set('');
        this.sessionStore.clear();
        void this.router.navigate(['/login'], { queryParams: { returnUrl: '/rh' } });
        return;
      }

      if (status === 403) {
        this.resetVincularState();
        this.resetFichaState();
        this.unidadesAutorizadas.set([]);
        this.selectedUnidadId.set(null);
        this.unidadSearchDraft.set('');
        this.accessDeniedError.set(
          'No tienes autorización para consultar el padrón laboral de esta unidad de trabajo (HTTP 403).'
        );
        return;
      }

      this.errorPersonal.set(
        'No fue posible consultar el personal adscrito de la unidad. Verifica tu conexión e intenta nuevamente.'
      );
    } finally {
      if (seq === this.personalRequestSeq) {
        this.loadingPersonal.set(false);
      }
    }
  }

  onPersonalSearchInput(value: string): void {
    this.personalSearchDraft.set(value);
    this.clearPersonalSearchTimer();

    this.personalSearchTimer = setTimeout(() => {
      const clean = this.personalSearchDraft().trim();
      if (clean !== this.personalAppliedSearch()) {
        this.personalAppliedSearch.set(clean);
        this.personalPage.set(1);
        void this.cargarPersonalUnidad();
      }
    }, 250);
  }

  onPersonalSearchSubmit(): void {
    this.clearPersonalSearchTimer();
    const clean = this.personalSearchDraft().trim();
    this.personalAppliedSearch.set(clean);
    this.personalPage.set(1);
    void this.cargarPersonalUnidad();
  }

  onClearPersonalSearch(): void {
    this.clearPersonalSearchTimer();
    this.personalSearchDraft.set('');
    if (this.personalAppliedSearch() !== '') {
      this.personalAppliedSearch.set('');
      this.personalPage.set(1);
      void this.cargarPersonalUnidad();
    }
  }

  onPersonalPageSizeChange(rawSize: string | number): void {
    const parsed = Number(rawSize);
    const valid = Number.isInteger(parsed) && parsed >= 1 ? Math.min(parsed, 100) : 20;
    if (valid !== this.personalPageSize()) {
      this.personalPageSize.set(valid);
      this.personalPage.set(1);
      void this.cargarPersonalUnidad();
    }
  }

  goToPrevPersonalPage(): void {
    if (!this.canPersonalGoPrev()) {
      return;
    }
    this.personalPage.update((p) => Math.max(1, p - 1));
    void this.cargarPersonalUnidad();
  }

  goToNextPersonalPage(): void {
    if (!this.canPersonalGoNext()) {
      return;
    }
    this.personalPage.update((p) => p + 1);
    void this.cargarPersonalUnidad();
  }

  private resetPersonalFilterAndState(): void {
    this.clearPersonalSearchTimer();
    this.personalRequestSeq++;
    this.personalItems.set([]);
    this.personalTotal.set(0);
    this.personalPage.set(1);
    this.personalSearchDraft.set('');
    this.personalAppliedSearch.set('');
    this.loadingPersonal.set(false);
    this.errorPersonal.set(null);
    this.vincularSuccessBanner.set(null);
    this.resetVincularState();
    this.resetFichaState();
  }

  private clearPersonalDataOnly(): void {
    this.personalRequestSeq++;
    this.personalItems.set([]);
    this.personalTotal.set(0);
    this.loadingPersonal.set(false);
    this.errorPersonal.set(null);
    this.resetFichaState();
  }

  private clearPersonalSearchTimer(): void {
    if (this.personalSearchTimer) {
      clearTimeout(this.personalSearchTimer);
      this.personalSearchTimer = null;
    }
  }

  // ==================== VINCULACIÓN DE TRABAJADOR AL PADRÓN (RH-2B.4B) ====================

  openVincularDialog(): void {
    const unidad = this.selectedUnidad();
    if (!unidad || !this.canVincularTrabajador()) {
      return;
    }

    this.resetVincularState();
    this.vincularSuccessBanner.set(null);
    this.vincularTargetUnidadId.set(unidad.id);
    this.vincularTargetUnidadNombre.set(unidad.nombre);
    this.vincularOpen.set(true);
  }

  closeVincularDialog(): void {
    if (this.vincularSubmitting()) {
      return;
    }
    this.resetVincularState();
  }

  private resetVincularState(): void {
    this.clearCandidatasSearchTimer();
    this.candidatasRequestSeq++;
    this.vincularSubmitSeq++;
    this.vincularOpen.set(false);
    this.vincularTargetUnidadId.set(null);
    this.vincularTargetUnidadNombre.set('');
    this.candidataSearchDraft.set('');
    this.candidataSuggestOpen.set(false);
    this.candidataSuggestIndex.set(-1);
    this.candidataItems.set([]);
    this.loadingCandidatas.set(false);
    this.errorCandidatas.set(null);
    this.candidataSearchedOnce.set(false);
    this.selectedCandidata.set(null);
    this.vincularMatricula.set('');
    this.vincularPuesto.set('');
    this.vincularTurno.set('');
    this.vincularJornada.set('');
    this.vincularHorario.set('');
    this.vincularVigenteDesde.set('');
    this.vincularVigenteHasta.set('');
    this.vincularSubmitting.set(false);
    this.vincularError.set(null);
  }

  private clearCandidatasSearchTimer(): void {
    if (this.candidatasSearchTimer) {
      clearTimeout(this.candidatasSearchTimer);
      this.candidatasSearchTimer = null;
    }
  }

  onCandidataSearchFocus(): void {
    if (!this.vincularOpen() || this.vincularSubmitting()) {
      return;
    }
    const query = this.candidataSearchDraft().trim();
    const selected = this.selectedCandidata();
    if (query.length > 0 && (!selected || selected.nombre_completo !== query) && this.candidataSearchedOnce()) {
      this.candidataSuggestOpen.set(true);
    }
  }

  onCandidataSearchInput(value: string): void {
    this.candidataSearchDraft.set(value);
    this.vincularError.set(null);
    this.errorCandidatas.set(null);

    const currentSelected = this.selectedCandidata();
    if (currentSelected && value.trim() !== currentSelected.nombre_completo) {
      this.selectedCandidata.set(null);
    }

    this.clearCandidatasSearchTimer();
    this.candidatasRequestSeq++;

    const clean = value.trim();
    if (!clean) {
      this.loadingCandidatas.set(false);
      this.candidataItems.set([]);
      this.candidataSuggestOpen.set(false);
      this.candidataSuggestIndex.set(-1);
      this.candidataSearchedOnce.set(false);
      return;
    }

    this.candidataSuggestOpen.set(true);
    this.candidataSuggestIndex.set(-1);
    this.candidatasSearchTimer = setTimeout(() => {
      void this.ejecutarBusquedaCandidatas(clean);
    }, 250);
  }

  async ejecutarBusquedaCandidatas(rawQuery?: string): Promise<void> {
    this.clearCandidatasSearchTimer();
    const unidad = this.selectedUnidad();
    const targetUnidadId = this.vincularTargetUnidadId();

    if (!this.vincularOpen() || !unidad || targetUnidadId === null || unidad.id !== targetUnidadId) {
      return;
    }

    const q = (rawQuery ?? this.candidataSearchDraft()).trim();
    if (!q) {
      this.candidataItems.set([]);
      this.candidataSuggestOpen.set(false);
      this.candidataSuggestIndex.set(-1);
      this.candidataSearchedOnce.set(false);
      this.loadingCandidatas.set(false);
      return;
    }

    const seq = ++this.candidatasRequestSeq;
    this.loadingCandidatas.set(true);
    this.errorCandidatas.set(null);
    this.candidataSuggestOpen.set(true);

    try {
      const res = await this.rhService.buscarPersonasCandidatasUnidad(targetUnidadId, {
        q,
        page: 1,
        pageSize: 15,
      });

      if (
        seq !== this.candidatasRequestSeq ||
        !this.vincularOpen() ||
        this.selectedUnidadId() !== targetUnidadId ||
        this.vincularTargetUnidadId() !== targetUnidadId
      ) {
        return;
      }

      const items = Array.isArray(res?.items) ? res.items : [];
      this.candidataItems.set(items);
      this.candidataSearchedOnce.set(true);
      this.candidataSuggestOpen.set(true);
      this.candidataSuggestIndex.set(items.length > 0 ? 0 : -1);
    } catch (err: unknown) {
      if (
        seq !== this.candidatasRequestSeq ||
        !this.vincularOpen() ||
        this.vincularTargetUnidadId() !== targetUnidadId
      ) {
        return;
      }

      this.candidataItems.set([]);
      this.candidataSearchedOnce.set(true);

      const status = this.extractHttpStatus(err);
      if (status === 401) {
        this.resetVincularState();
        this.unidadesAutorizadas.set([]);
        this.selectedUnidadId.set(null);
        this.unidadSearchDraft.set('');
        this.sessionStore.clear();
        void this.router.navigate(['/login'], { queryParams: { returnUrl: '/rh' } });
        return;
      }

      if (status === 403) {
        this.resetVincularState();
        this.unidadesAutorizadas.set([]);
        this.selectedUnidadId.set(null);
        this.unidadSearchDraft.set('');
        this.accessDeniedError.set(
          'No tienes autorización para consultar personas candidatas en esta unidad de trabajo (HTTP 403).'
        );
        return;
      }

      this.errorCandidatas.set(
        this.extractBackendErrorMessage(err) ??
          'No fue posible consultar las personas candidatas. Intenta nuevamente.'
      );
    } finally {
      if (seq === this.candidatasRequestSeq) {
        this.loadingCandidatas.set(false);
      }
    }
  }

  onCandidataSearchKeyDown(event: KeyboardEvent): void {
    const list = this.candidataItems();

    if (event.key === 'Escape') {
      event.preventDefault();
      this.candidataSuggestOpen.set(false);
      this.candidataSuggestIndex.set(-1);
      return;
    }

    if (!this.candidataSuggestOpen()) {
      if (event.key === 'ArrowDown' && list.length > 0) {
        event.preventDefault();
        this.candidataSuggestOpen.set(true);
        this.candidataSuggestIndex.set(0);
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        if (list.length > 0) {
          event.preventDefault();
          this.candidataSuggestIndex.set((this.candidataSuggestIndex() + 1) % list.length);
        }
        break;
      case 'ArrowUp':
        if (list.length > 0) {
          event.preventDefault();
          this.candidataSuggestIndex.set((this.candidataSuggestIndex() - 1 + list.length) % list.length);
        }
        break;
      case 'Enter': {
        event.preventDefault();
        const idx = this.candidataSuggestIndex();
        if (idx >= 0 && list[idx]) {
          this.selectCandidata(list[idx]);
        } else if (list.length === 1) {
          this.selectCandidata(list[0]);
        } else if (this.candidataSearchDraft().trim().length > 0 && !this.loadingCandidatas()) {
          void this.ejecutarBusquedaCandidatas();
        }
        break;
      }
    }
  }

  selectCandidata(item: RhPersonaCandidataItem): void {
    if (
      !item ||
      typeof item.persona_id !== 'number' ||
      !Number.isInteger(item.persona_id) ||
      item.persona_id <= 0
    ) {
      return;
    }

    this.clearCandidatasSearchTimer();
    this.candidatasRequestSeq++;
    this.loadingCandidatas.set(false);
    this.selectedCandidata.set(item);
    this.candidataSearchDraft.set(item.nombre_completo);
    this.candidataSuggestOpen.set(false);
    this.candidataSuggestIndex.set(-1);
    this.vincularError.set(null);
  }

  clearSelectedCandidata(): void {
    this.clearCandidatasSearchTimer();
    this.candidatasRequestSeq++;
    this.loadingCandidatas.set(false);
    this.selectedCandidata.set(null);
    this.candidataSearchDraft.set('');
    this.candidataItems.set([]);
    this.candidataSuggestOpen.set(false);
    this.candidataSuggestIndex.set(-1);
    this.candidataSearchedOnce.set(false);
    this.errorCandidatas.set(null);
    this.vincularError.set(null);
  }

  onCandidataSearchBlur(): void {
    setTimeout(() => {
      this.candidataSuggestOpen.set(false);
      this.candidataSuggestIndex.set(-1);
    }, 150);
  }

  async onSubmitVincular(): Promise<void> {
    if (this.vincularSubmitting()) {
      return;
    }

    this.vincularError.set(null);

    const unidad = this.selectedUnidad();
    const targetUnidadId = this.vincularTargetUnidadId();
    if (!this.vincularOpen() || !unidad || targetUnidadId === null || unidad.id !== targetUnidadId) {
      this.vincularError.set(
        'La unidad de trabajo seleccionada cambió o dejó de ser válida. Cierra el formulario y vuelve a intentarlo.'
      );
      return;
    }

    if (!this.canVincularTrabajador()) {
      this.vincularError.set(
        'Tu cuenta no cuenta con permisos operativos de Recursos Humanos para vincular trabajadores.'
      );
      return;
    }

    const candidata = this.selectedCandidata();
    if (!candidata || !Number.isInteger(candidata.persona_id) || candidata.persona_id <= 0) {
      this.vincularError.set('Debes buscar y seleccionar una persona existente del directorio.');
      return;
    }

    if (this.selectedCandidataBloqueadaEnUnidad()) {
      this.vincularError.set(
        'Esta persona ya tiene una adscripción RH registrada en la unidad seleccionada.'
      );
      return;
    }

    if (this.selectedCandidataRequiereValidacion()) {
      this.vincularError.set(
        'La vinculación de esta persona requiere revisión administrativa previa porque cuenta con otra unidad o adscripción activa.'
      );
      return;
    }

    const lengthErr = this.vincularFieldLengthError();
    if (lengthErr) {
      this.vincularError.set(lengthErr);
      return;
    }

    const vigenteDesde = this.vincularVigenteDesde().trim();
    if (!vigenteDesde) {
      this.vincularError.set('La fecha de inicio de vigencia ("Vigente desde") es obligatoria.');
      return;
    }

    const vigenteHastaRaw = this.vincularVigenteHasta().trim();
    const vigenteHasta = vigenteHastaRaw.length > 0 ? vigenteHastaRaw : null;

    if (vigenteHasta && vigenteHasta < vigenteDesde) {
      this.vincularError.set(
        'La fecha "Vigente hasta" no puede ser anterior a la fecha "Vigente desde".'
      );
      return;
    }

    const payload: RhCreateAdscripcionPayload = {
      persona_id: candidata.persona_id,
      matricula: this.vincularMatricula().trim() || null,
      puesto: this.vincularPuesto().trim() || null,
      turno: this.vincularTurno().trim() || null,
      jornada: this.vincularJornada().trim() || null,
      horario: this.vincularHorario().trim() || null,
      vigente_desde: vigenteDesde,
      vigente_hasta: vigenteHasta,
    };

    const submitSeq = ++this.vincularSubmitSeq;
    this.vincularSubmitting.set(true);

    try {
      await this.rhService.crearAdscripcionUnidad(targetUnidadId, payload);

      if (
        submitSeq !== this.vincularSubmitSeq ||
        this.selectedUnidadId() !== targetUnidadId
      ) {
        return;
      }

      // HTTP 201 exitoso: cerrar y limpiar el formulario, mostrar confirmación y refrescar el padrón de la unidad
      this.resetVincularState();
      this.vincularSuccessBanner.set('Trabajador vinculado correctamente al padrón laboral');
      await this.cargarPersonalUnidad();
    } catch (err: unknown) {
      if (submitSeq !== this.vincularSubmitSeq) {
        return;
      }

      const status = this.extractHttpStatus(err);
      const backendMsg = this.extractBackendErrorMessage(err);

      if (status === 401) {
        this.resetVincularState();
        this.unidadesAutorizadas.set([]);
        this.selectedUnidadId.set(null);
        this.unidadSearchDraft.set('');
        this.sessionStore.clear();
        void this.router.navigate(['/login'], { queryParams: { returnUrl: '/rh' } });
        return;
      }

      if (status === 403) {
        this.resetVincularState();
        this.unidadesAutorizadas.set([]);
        this.selectedUnidadId.set(null);
        this.unidadSearchDraft.set('');
        this.accessDeniedError.set(
          backendMsg ??
            'No tienes autorización para registrar adscripciones laborales en esta unidad de trabajo (HTTP 403).'
        );
        return;
      }

      if (status === 400) {
        this.vincularError.set(
          backendMsg ?? 'Los datos capturados no son válidos. Revisa la información e intenta nuevamente.'
        );
        return;
      }

      if (status === 404) {
        this.vincularError.set(
          backendMsg ?? 'La persona seleccionada o la unidad de trabajo ya no se encuentra disponible (HTTP 404).'
        );
        return;
      }

      if (status === 409) {
        this.vincularError.set(
          backendMsg ??
            'Conflicto al vincular trabajador: la persona ya cuenta con una adscripción activa, pertenece a otra unidad en el directorio o presenta solapamiento de vigencias (HTTP 409).'
        );
        return;
      }

      this.vincularError.set(
        backendMsg ??
          'Error interno del servidor al registrar la adscripción laboral. Intenta nuevamente más tarde.'
      );
    } finally {
      if (submitSeq === this.vincularSubmitSeq) {
        this.vincularSubmitting.set(false);
      }
    }
  }

  dismissVincularSuccessBanner(): void {
    this.vincularSuccessBanner.set(null);
  }

  // ==================== FICHA INDIVIDUAL PROTEGIDA DEL TRABAJADOR (RH-2B.4D Y RH-2B.4F) ====================

  openFichaTrabajador(item: RhPersonalUnidadItem): void {
    if (this.fichaSavingLaboral()) {
      return;
    }
    const unidad = this.selectedUnidad();
    if (
      !unidad ||
      !item ||
      typeof item.adscripcion_laboral_id !== 'number' ||
      !Number.isInteger(item.adscripcion_laboral_id) ||
      item.adscripcion_laboral_id <= 0
    ) {
      return;
    }

    // Asegurar que no quede información ni edición de una ficha anterior antes de consultar la nueva
    this.resetFichaState();
    this.fichaTargetUnidadId.set(unidad.id);
    this.fichaTargetUnidadNombre.set(unidad.nombre);
    this.fichaTargetAdscripcionId.set(item.adscripcion_laboral_id);
    this.fichaFallbackNombre.set(item.nombre_completo ?? '');
    this.fichaOpen.set(true);

    void this.cargarFichaTrabajador();
  }

  closeFichaTrabajador(): void {
    if (this.fichaSavingLaboral()) {
      return;
    }
    this.resetFichaState();
  }

  clearFichaSaveFeedback(): void {
    this.fichaSaveLaboralError.set(null);
    this.fichaSaveLaboralIsConflict.set(false);
    this.fichaSaveLaboralSuccess.set(null);
  }

  async onSaveFichaLaboral(patch: RhUpdateAdscripcionLaboralPayload): Promise<void> {
    if (this.fichaSavingLaboral()) {
      return;
    }

    const unidad = this.selectedUnidad();
    const targetUnidadId = this.fichaTargetUnidadId();
    const targetAdscripcionId = this.fichaTargetAdscripcionId();
    const currentFicha = this.fichaData();

    if (
      !this.fichaOpen() ||
      !unidad ||
      targetUnidadId === null ||
      unidad.id !== targetUnidadId ||
      targetAdscripcionId === null ||
      targetAdscripcionId <= 0 ||
      !currentFicha ||
      !currentFicha.permisos?.puede_editar_laboral
    ) {
      this.fichaSaveLaboralError.set(
        'No es posible guardar los cambios laborales en el contexto actual.'
      );
      this.fichaSaveLaboralIsConflict.set(false);
      return;
    }

    if (!patch || Object.keys(patch).length === 0) {
      return;
    }

    const saveSeq = ++this.fichaSaveSeq;
    this.fichaSavingLaboral.set(true);
    this.fichaSaveLaboralError.set(null);
    this.fichaSaveLaboralIsConflict.set(false);
    this.fichaSaveLaboralSuccess.set(null);

    try {
      const updated = await this.rhService.actualizarLaboralAdscripcionUnidad(
        targetUnidadId,
        targetAdscripcionId,
        patch
      );

      if (
        saveSeq !== this.fichaSaveSeq ||
        !this.fichaOpen() ||
        this.selectedUnidadId() !== targetUnidadId ||
        this.fichaTargetUnidadId() !== targetUnidadId ||
        this.fichaTargetAdscripcionId() !== targetAdscripcionId
      ) {
        return;
      }

      // HTTP 200 confirmado: actualizar la sección laboral en la ficha conservando identificación y permisos,
      // mostrar confirmación y refrescar el padrón laboral de la unidad seleccionada
      this.fichaData.set({
        ...currentFicha,
        unidad: updated.unidad ?? currentFicha.unidad,
        laboral: updated.laboral,
      });
      this.fichaSaveLaboralSuccess.set('Información laboral actualizada correctamente');
      await this.cargarPersonalUnidadPreservingFicha();
    } catch (err: unknown) {
      if (
        saveSeq !== this.fichaSaveSeq ||
        !this.fichaOpen() ||
        this.fichaTargetUnidadId() !== targetUnidadId ||
        this.fichaTargetAdscripcionId() !== targetAdscripcionId
      ) {
        return;
      }

      const status = this.extractHttpStatus(err);
      const backendMsg = this.extractBackendErrorMessage(err);

      if (status === 401) {
        this.resetFichaState();
        this.resetVincularState();
        this.unidadesAutorizadas.set([]);
        this.selectedUnidadId.set(null);
        this.unidadSearchDraft.set('');
        this.sessionStore.clear();
        void this.router.navigate(['/login'], { queryParams: { returnUrl: '/rh' } });
        return;
      }

      if (status === 403) {
        this.resetFichaState();
        this.resetVincularState();
        this.unidadesAutorizadas.set([]);
        this.selectedUnidadId.set(null);
        this.unidadSearchDraft.set('');
        this.accessDeniedError.set(
          backendMsg ??
            'No tienes autorización para modificar la información laboral de esta adscripción (HTTP 403).'
        );
        return;
      }

      if (status === 409) {
        this.fichaSaveLaboralIsConflict.set(true);
        this.fichaSaveLaboralError.set(
          backendMsg ??
            'Conflicto al guardar: las fechas de vigencia o el estado entran en conflicto con otra adscripción o con listas de asistencia registradas (HTTP 409).'
        );
        return;
      }

      if (status === 400) {
        this.fichaSaveLaboralIsConflict.set(false);
        this.fichaSaveLaboralError.set(
          backendMsg ??
            'Los datos laborales capturados no son válidos. Revisa los campos e intenta nuevamente (HTTP 400).'
        );
        return;
      }

      if (status === 404) {
        this.fichaSaveLaboralIsConflict.set(false);
        this.fichaSaveLaboralError.set(
          backendMsg ??
            'La adscripción laboral solicitada ya no se encuentra disponible en la unidad (HTTP 404).'
        );
        return;
      }

      this.fichaSaveLaboralIsConflict.set(false);
      this.fichaSaveLaboralError.set(
        backendMsg ??
          'Error interno del servidor al actualizar la información laboral. Intenta nuevamente.'
      );
    } finally {
      if (saveSeq === this.fichaSaveSeq) {
        this.fichaSavingLaboral.set(false);
      }
    }
  }

  /**
   * Refresca el padrón de la unidad seleccionada tras actualizar la ficha (HTTP 200)
   * manteniendo abierta la ficha actualizada.
   */
  private async cargarPersonalUnidadPreservingFicha(): Promise<void> {
    const unidad = this.selectedUnidad();
    if (!unidad) {
      return;
    }

    const targetUnidadId = unidad.id;
    const seq = ++this.personalRequestSeq;
    this.loadingPersonal.set(true);
    this.errorPersonal.set(null);

    try {
      const res = await this.rhService.listarPersonalUnidad(targetUnidadId, {
        q: this.personalAppliedSearch() || undefined,
        page: this.personalPage(),
        pageSize: this.personalPageSize(),
      });

      if (seq !== this.personalRequestSeq || this.selectedUnidadId() !== targetUnidadId) {
        return;
      }

      const rawItems = Array.isArray(res?.items) ? res.items : [];
      this.personalItems.set(rawItems);
      this.personalTotal.set(Number(res?.total ?? 0));
      if (typeof res?.page === 'number' && res.page >= 1) {
        this.personalPage.set(res.page);
      }
      if (typeof res?.pageSize === 'number' && res.pageSize >= 1) {
        this.personalPageSize.set(res.pageSize);
      }
    } catch {
      // Si el refresco secundario falla, se preserva la ficha ya confirmada
    } finally {
      if (seq === this.personalRequestSeq) {
        this.loadingPersonal.set(false);
      }
    }
  }

  async cargarFichaTrabajador(): Promise<void> {
    const unidad = this.selectedUnidad();
    const targetUnidadId = this.fichaTargetUnidadId();
    const targetAdscripcionId = this.fichaTargetAdscripcionId();

    if (
      !this.fichaOpen() ||
      !unidad ||
      targetUnidadId === null ||
      unidad.id !== targetUnidadId ||
      targetAdscripcionId === null ||
      targetAdscripcionId <= 0
    ) {
      this.resetFichaState();
      return;
    }

    const seq = ++this.fichaRequestSeq;
    this.fichaSaveSeq++;
    this.fichaSavingLaboral.set(false);
    this.fichaSaveLaboralError.set(null);
    this.fichaSaveLaboralIsConflict.set(false);
    this.fichaSaveLaboralSuccess.set(null);
    this.fichaLoading.set(true);
    this.fichaError.set(null);
    this.fichaCanRetry.set(true);
    this.fichaData.set(null);

    try {
      const res = await this.rhService.obtenerFichaPersonalUnidad(
        targetUnidadId,
        targetAdscripcionId
      );

      // Descartar respuestas obsoletas si se solicitó otra ficha, se cerró el diálogo o cambió la unidad
      if (
        seq !== this.fichaRequestSeq ||
        !this.fichaOpen() ||
        this.selectedUnidadId() !== targetUnidadId ||
        this.fichaTargetUnidadId() !== targetUnidadId ||
        this.fichaTargetAdscripcionId() !== targetAdscripcionId
      ) {
        return;
      }

      this.fichaData.set(res);
    } catch (err: unknown) {
      if (
        seq !== this.fichaRequestSeq ||
        !this.fichaOpen() ||
        this.fichaTargetUnidadId() !== targetUnidadId ||
        this.fichaTargetAdscripcionId() !== targetAdscripcionId
      ) {
        return;
      }

      this.fichaData.set(null);
      const status = this.extractHttpStatus(err);

      if (status === 401) {
        this.resetFichaState();
        this.resetVincularState();
        this.unidadesAutorizadas.set([]);
        this.selectedUnidadId.set(null);
        this.unidadSearchDraft.set('');
        this.sessionStore.clear();
        void this.router.navigate(['/login'], { queryParams: { returnUrl: '/rh' } });
        return;
      }

      if (status === 403) {
        this.resetFichaState();
        this.resetVincularState();
        this.unidadesAutorizadas.set([]);
        this.selectedUnidadId.set(null);
        this.unidadSearchDraft.set('');
        this.accessDeniedError.set(
          'No tienes autorización para consultar la ficha de este trabajador en la unidad seleccionada (HTTP 403).'
        );
        return;
      }

      if (status === 400) {
        this.fichaCanRetry.set(false);
        this.fichaError.set(
          'Los identificadores solicitados para la ficha del trabajador no son válidos (HTTP 400).'
        );
        return;
      }

      if (status === 404) {
        this.fichaCanRetry.set(false);
        this.fichaError.set(
          'No se encontró la adscripción laboral solicitada en la unidad de trabajo actual (HTTP 404).'
        );
        return;
      }

      this.fichaCanRetry.set(true);
      this.fichaError.set(
        'No fue posible consultar la ficha del trabajador. Verifica tu conexión e intenta nuevamente.'
      );
    } finally {
      if (seq === this.fichaRequestSeq) {
        this.fichaLoading.set(false);
      }
    }
  }

  private resetFichaState(): void {
    this.fichaRequestSeq++;
    this.fichaSaveSeq++;
    this.fichaOpen.set(false);
    this.fichaTargetUnidadId.set(null);
    this.fichaTargetUnidadNombre.set('');
    this.fichaTargetAdscripcionId.set(null);
    this.fichaFallbackNombre.set('');
    this.fichaLoading.set(false);
    this.fichaError.set(null);
    this.fichaCanRetry.set(true);
    this.fichaData.set(null);
    this.fichaSavingLaboral.set(false);
    this.fichaSaveLaboralError.set(null);
    this.fichaSaveLaboralIsConflict.set(false);
    this.fichaSaveLaboralSuccess.set(null);
  }

  private extractBackendErrorMessage(err: unknown): string | null {
    if (err instanceof HttpErrorResponse) {
      const body = err.error;
      if (typeof body === 'object' && body !== null && 'error' in body) {
        const msg = (body as { error?: unknown }).error;
        if (typeof msg === 'string' && msg.trim().length > 0) {
          return msg.trim();
        }
      }
    }
    return null;
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
