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
import { Router } from '@angular/router';
import {
  AlertCircle,
  Building2,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Loader2,
  LucideAngularModule,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  UserCheck,
  UserMinus,
  Users,
  X,
} from 'lucide-angular';
import {
  TiRoleCatalogItem,
  TiUsuarioItem,
  TiUsuarioRoleAssignment,
  TiUsuarioStatus,
  TiUsuariosService,
} from '../../../services/ti-usuarios.service';
import { TiPersonasService, TiUnidadesPagedResponse } from '../../../services/ti-personas.service';

@Component({
  selector: 'app-ti-usuarios-page',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ti-usuarios-page.component.html',
})
export class TiUsuariosPageComponent implements OnInit {
  private readonly tiUsuariosService = inject(TiUsuariosService);
  private readonly tiPersonasService = inject(TiPersonasService);
  private readonly router = inject(Router);

  readonly icons = {
    search: Search,
    clear: X,
    refresh: RefreshCw,
    loader: Loader2,
    alert: AlertCircle,
    shieldAlert: ShieldAlert,
    shield: Shield,
    key: KeyRound,
    users: Users,
    userCheck: UserCheck,
    userMinus: UserMinus,
    building: Building2,
    prev: ChevronLeft,
    next: ChevronRight,
  };

  // Estado del catálogo de roles (GET /api/ti/roles)
  readonly rolesCatalog = signal<TiRoleCatalogItem[]>([]);
  readonly rolesLoading = signal<boolean>(false);
  readonly rolesError = signal<string | null>(null);
  readonly showRolesCatalog = signal<boolean>(true);

  // Estado del listado paginado de usuarios (GET /api/ti/usuarios)
  readonly usuarios = signal<TiUsuarioItem[]>([]);
  readonly usuariosLoading = signal<boolean>(false);
  readonly usuariosError = signal<string | null>(null);
  readonly accessDeniedError = signal<string | null>(null);

  // Filtros y paginación
  readonly searchDraft = signal<string>('');
  readonly appliedSearch = signal<string>('');
  readonly statusFilter = signal<string>('');
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(20);
  readonly total = signal<number>(0);

  /** Contador de secuencia para descartar respuestas obsoletas si el usuario cambia rápido de página/filtro */
  private usuariosRequestSeq = 0;

  // Mensajes de retroalimentación de operaciones administrativas
  readonly actionSuccessMessage = signal<string | null>(null);
  readonly lastCreatedUser = signal<TiUsuarioItem | null>(null);

  // Modal: Alta de cuenta SSO (POST /api/ti/usuarios)
  readonly createModalOpen = signal<boolean>(false);
  readonly createPersonaSearch = signal<string>('');
  readonly createPersonasOptions = signal<
    Awaited<ReturnType<TiPersonasService['listarPersonas']>>['items']
  >([]);
  readonly createPersonasLoading = signal<boolean>(false);
  readonly createSelectedPersona = signal<
    Awaited<ReturnType<TiPersonasService['listarPersonas']>>['items'][number] | null
  >(null);
  readonly createEmailDraft = signal<string>('');
  readonly createNameDraft = signal<string>('');
  readonly createPasswordDraft = signal<string>('');
  readonly createPasswordConfirmDraft = signal<string>('');
  readonly createStatusDraft = signal<TiUsuarioStatus>('ACTIVE');
  readonly createSubmitting = signal<boolean>(false);
  readonly createError = signal<string | null>(null);

  // Modal: Cambio de estado (PATCH /api/ti/usuarios/:id/status)
  readonly statusModalUser = signal<TiUsuarioItem | null>(null);
  readonly statusDraft = signal<TiUsuarioStatus>('ACTIVE');
  readonly statusConfirmStep = signal<boolean>(false);
  readonly statusSubmitting = signal<boolean>(false);
  readonly statusError = signal<string | null>(null);

  // Modal: Restablecimiento de contraseña (PUT /api/ti/usuarios/:id/password)
  readonly passwordModalUser = signal<TiUsuarioItem | null>(null);
  readonly passwordDraft = signal<string>('');
  readonly passwordConfirmDraft = signal<string>('');
  readonly passwordConfirmStep = signal<boolean>(false);
  readonly passwordSubmitting = signal<boolean>(false);
  readonly passwordError = signal<string | null>(null);

  // Modal: Administración de roles (PUT /api/ti/usuarios/:id/roles)
  readonly rolesModalUser = signal<TiUsuarioItem | null>(null);
  readonly rolesDraft = signal<TiUsuarioRoleAssignment[]>([]);
  readonly rolesOriginalSnapshot = signal<TiUsuarioRoleAssignment[]>([]);
  readonly newRoleCode = signal<string>('');
  readonly newRoleScopeType = signal<'GLOBAL' | 'CLUES'>('GLOBAL');
  readonly newRoleScopeId = signal<string>('*');
  readonly cluesSearchDraft = signal<string>('');
  readonly cluesOptions = signal<TiUnidadesPagedResponse['items']>([]);
  readonly cluesLoading = signal<boolean>(false);
  readonly rolesConfirmRemoveStep = signal<boolean>(false);
  readonly rolesSubmitting = signal<boolean>(false);
  readonly rolesModalError = signal<string | null>(null);

  readonly totalPages = computed(() => {
    const totalCount = this.total();
    const size = this.pageSize();
    if (totalCount <= 0 || size <= 0) {
      return 1;
    }
    return Math.ceil(totalCount / size);
  });

  readonly canGoPrev = computed(() => this.page() > 1 && !this.usuariosLoading());
  readonly canGoNext = computed(
    () => this.page() < this.totalPages() && !this.usuariosLoading()
  );

  readonly rangeStart = computed(() => {
    if (this.total() === 0 || this.usuarios().length === 0) {
      return 0;
    }
    return (this.page() - 1) * this.pageSize() + 1;
  });

  readonly rangeEnd = computed(() => {
    if (this.total() === 0 || this.usuarios().length === 0) {
      return 0;
    }
    return Math.min(this.rangeStart() + this.usuarios().length - 1, this.total());
  });

  readonly hasActiveFilters = computed(
    () => this.appliedSearch().trim().length > 0 || this.statusFilter().trim().length > 0
  );

  ngOnInit(): void {
    void this.cargarTodo();
  }

  async cargarTodo(): Promise<void> {
    this.accessDeniedError.set(null);
    await Promise.all([this.cargarRoles(), this.cargarUsuarios()]);
  }

  toggleRolesCatalog(): void {
    this.showRolesCatalog.update(v => !v);
  }

  async cargarRoles(): Promise<void> {
    this.rolesLoading.set(true);
    this.rolesError.set(null);

    try {
      const roles = await this.tiUsuariosService.listarRoles();
      this.rolesCatalog.set(Array.isArray(roles) ? roles : []);
    } catch (err: unknown) {
      const status = this.extractHttpStatus(err);
      if (status === 401 || status === 403) {
        this.handleUnauthorizedOrForbidden(status);
        return;
      }
      this.rolesCatalog.set([]);
      this.rolesError.set('No fue posible cargar el catálogo de roles.');
    } finally {
      this.rolesLoading.set(false);
    }
  }

  async cargarUsuarios(): Promise<void> {
    const seq = ++this.usuariosRequestSeq;
    this.usuariosLoading.set(true);
    this.usuariosError.set(null);

    try {
      const response = await this.tiUsuariosService.listarUsuarios({
        q: this.appliedSearch() || undefined,
        status: this.statusFilter() || undefined,
        page: this.page(),
        pageSize: this.pageSize(),
      });

      if (seq !== this.usuariosRequestSeq) {
        return;
      }

      this.usuarios.set(Array.isArray(response?.items) ? response.items : []);
      this.total.set(Number(response?.total ?? 0));
      if (typeof response?.page === 'number' && response.page >= 1) {
        this.page.set(response.page);
      }
      if (typeof response?.pageSize === 'number' && response.pageSize >= 1) {
        this.pageSize.set(response.pageSize);
      }
    } catch (err: unknown) {
      if (seq !== this.usuariosRequestSeq) {
        return;
      }

      const status = this.extractHttpStatus(err);
      if (status === 401 || status === 403) {
        this.handleUnauthorizedOrForbidden(status);
        return;
      }

      this.usuarios.set([]);
      this.total.set(0);
      this.usuariosError.set(
        'No fue posible consultar el listado de cuentas SSO. Verifica tu conexión e intenta nuevamente.'
      );
    } finally {
      if (seq === this.usuariosRequestSeq) {
        this.usuariosLoading.set(false);
      }
    }
  }

  onSearchSubmit(): void {
    const trimmed = this.searchDraft().trim();
    this.appliedSearch.set(trimmed);
    this.page.set(1);
    void this.cargarUsuarios();
  }

  onClearSearch(): void {
    this.searchDraft.set('');
    if (this.appliedSearch() !== '') {
      this.appliedSearch.set('');
      this.page.set(1);
      void this.cargarUsuarios();
    }
  }

  onStatusChange(newStatus: string): void {
    this.statusFilter.set(newStatus);
    this.page.set(1);
    void this.cargarUsuarios();
  }

  onPageSizeChange(rawSize: string | number): void {
    const parsed = Number(rawSize);
    const validSize = Number.isInteger(parsed) && parsed >= 1 ? Math.min(parsed, 100) : 20;
    if (validSize !== this.pageSize()) {
      this.pageSize.set(validSize);
      this.page.set(1);
      void this.cargarUsuarios();
    }
  }

  onResetFilters(): void {
    this.searchDraft.set('');
    this.appliedSearch.set('');
    this.statusFilter.set('');
    this.page.set(1);
    void this.cargarUsuarios();
  }

  goToPrevPage(): void {
    if (!this.canGoPrev()) {
      return;
    }
    this.page.update(p => Math.max(1, p - 1));
    void this.cargarUsuarios();
  }

  goToNextPage(): void {
    if (!this.canGoNext()) {
      return;
    }
    this.page.update(p => p + 1);
    void this.cargarUsuarios();
  }

  /**
   * Formatea de forma legible el alcance (`scope_type` / `scope_id`) de una asignación
   * administrativa devuelta por `GET /api/ti/usuarios`, respetando la diferencia con
   * `scope` / `id` del JWT.
   */
  formatRoleScope(role: TiUsuarioRoleAssignment): string {
    const scopeType = (role.scope_type ?? '').trim().toUpperCase();
    const scopeId = (role.scope_id ?? '').trim();

    if (scopeType === 'GLOBAL' && (scopeId === '*' || scopeId === '')) {
      return 'GLOBAL (*)';
    }
    if (!scopeId) {
      return scopeType;
    }
    return `${scopeType}: ${scopeId}`;
  }

  /**
   * Devuelve las clases visuales para la insignia de estado de cuenta SSO en Light Mode.
   */
  getStatusBadgeClass(status: string): string {
    const normalized = (status ?? '').trim().toUpperCase();
    switch (normalized) {
      case 'ACTIVE':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'SUSPENDED':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'INACTIVE':
        return 'bg-slate-100 text-slate-700 border-slate-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  }

  /**
   * Etiqueta en español acompañada del código técnico de estado.
   */
  getStatusLabel(status: string): string {
    const normalized = (status ?? '').trim().toUpperCase();
    switch (normalized) {
      case 'ACTIVE':
        return 'Activa (ACTIVE)';
      case 'SUSPENDED':
        return 'Suspendida (SUSPENDED)';
      case 'INACTIVE':
        return 'Inactiva (INACTIVE)';
      default:
        return normalized || 'Desconocido';
    }
  }

  /**
   * Ante una respuesta 401 o 403 del backend, limpia inmediatamente cualquier dato protegido
   * en memoria de la vista y presenta un estado seguro sin exponer información sensible.
   */
  private handleUnauthorizedOrForbidden(status: 401 | 403): void {
    this.usuarios.set([]);
    this.rolesCatalog.set([]);
    this.total.set(0);
    this.usuariosError.set(null);
    this.rolesError.set(null);

    if (status === 401) {
      this.accessDeniedError.set(
        'Tu sesión expiró o ya no es válida. Inicia sesión nuevamente para acceder a Administración TI.'
      );
      void this.router.navigate(['/login'], {
        queryParams: { returnUrl: '/ti/usuarios' },
      });
      return;
    }

    this.accessDeniedError.set(
      'Permiso insuficiente (403). Esta vista requiere exclusivamente el rol ADMIN_TIC con alcance GLOBAL.'
    );
  }

  private extractHttpStatus(err: unknown): number | null {
    if (err instanceof HttpErrorResponse) {
      return err.status;
    }
    if (typeof err === 'object' && err !== null && 'status' in err) {
      const st = (err as { status?: unknown }).status;
      return typeof st === 'number' ? st : null;
    }
    return null;
  }

  private extractErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error;
      if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
        return (body as { error: string }).error;
      }
    }
    if (typeof err === 'object' && err !== null && 'error' in err) {
      const inner = (err as { error?: unknown }).error;
      if (inner && typeof inner === 'object' && typeof (inner as { error?: unknown }).error === 'string') {
        return (inner as { error: string }).error;
      }
    }
    return fallback;
  }

  private handleAdminHttpError(err: unknown, targetErrorSignal: { set: (v: string | null) => void }, fallback: string): void {
    const status = this.extractHttpStatus(err);
    if (status === 401 || status === 403) {
      this.accessDeniedError.set(
        status === 401
          ? 'Tu sesión expiró o ya no es válida. Inicia sesión nuevamente para acceder a Administración TI.'
          : 'Permiso insuficiente (403). Esta vista requiere exclusivamente el rol ADMIN_TIC con alcance GLOBAL.'
      );
      if (status === 401) {
        void this.router.navigate(['/login'], { queryParams: { returnUrl: '/ti/usuarios' } });
      }
      return;
    }
    const serverMsg = this.extractErrorMessage(err, fallback);
    if (status === 409) {
      targetErrorSignal.set(serverMsg || 'Conflicto de administración: no es posible completar la operación.');
      return;
    }
    if (status === 404) {
      targetErrorSignal.set(serverMsg || 'La cuenta SSO ya no existe en el sistema.');
      return;
    }
    if (status === 400) {
      targetErrorSignal.set(serverMsg || 'Datos inválidos para la operación solicitada.');
      return;
    }
    targetErrorSignal.set(serverMsg || fallback);
  }

  // =========================================================================
  // A. CAMBIO DE ESTADO (PATCH /api/ti/usuarios/:id/status)
  // =========================================================================
  openStatusModal(user: TiUsuarioItem): void {
    this.actionSuccessMessage.set(null);
    this.statusModalUser.set(user);
    const current = (user.status || 'ACTIVE').toUpperCase();
    this.statusDraft.set(
      current === 'SUSPENDED' || current === 'INACTIVE' ? current : 'ACTIVE'
    );
    this.statusConfirmStep.set(false);
    this.statusError.set(null);
  }

  closeStatusModal(): void {
    this.statusModalUser.set(null);
    this.statusConfirmStep.set(false);
    this.statusError.set(null);
  }

  requestStatusSave(): void {
    const user = this.statusModalUser();
    if (!user) return;
    const next = this.statusDraft();
    if (next !== 'ACTIVE' && !this.statusConfirmStep()) {
      this.statusConfirmStep.set(true);
      this.statusError.set(null);
      return;
    }
    void this.submitStatusChange();
  }

  async submitStatusChange(): Promise<void> {
    const user = this.statusModalUser();
    if (!user || this.statusSubmitting()) return;

    this.statusSubmitting.set(true);
    this.statusError.set(null);
    try {
      const next = this.statusDraft();
      const res = await this.tiUsuariosService.cambiarEstado(user.id, next);
      this.usuarios.update((list) =>
        list.map((u) => (u.id === user.id ? { ...u, status: res.status } : u))
      );
      this.actionSuccessMessage.set(
        `Estado de ${user.email} actualizado a ${res.status}.` +
          (res.status !== 'ACTIVE' ? ' Se revocaron las sesiones renovables de la cuenta.' : '')
      );
      this.closeStatusModal();
    } catch (err) {
      this.statusConfirmStep.set(false);
      this.handleAdminHttpError(err, this.statusError, 'Error al actualizar el estado de la cuenta.');
    } finally {
      this.statusSubmitting.set(false);
    }
  }

  // =========================================================================
  // B. RESTABLECIMIENTO DE CONTRASEÑA (PUT /api/ti/usuarios/:id/password)
  // =========================================================================
  openPasswordModal(user: TiUsuarioItem): void {
    this.actionSuccessMessage.set(null);
    this.passwordModalUser.set(user);
    this.passwordDraft.set('');
    this.passwordConfirmDraft.set('');
    this.passwordConfirmStep.set(false);
    this.passwordError.set(null);
  }

  closePasswordModal(): void {
    this.passwordDraft.set('');
    this.passwordConfirmDraft.set('');
    this.passwordConfirmStep.set(false);
    this.passwordError.set(null);
    this.passwordModalUser.set(null);
  }

  requestPasswordSave(): void {
    const pass = this.passwordDraft();
    const confirm = this.passwordConfirmDraft();
    if (pass.trim().length < 8) {
      this.passwordError.set('La contraseña debe tener al menos 8 caracteres válidos.');
      return;
    }
    if (pass !== confirm) {
      this.passwordError.set('Las contraseñas no coinciden.');
      return;
    }
    if (!this.passwordConfirmStep()) {
      this.passwordError.set(null);
      this.passwordConfirmStep.set(true);
      return;
    }
    void this.submitPasswordReset();
  }

  async submitPasswordReset(): Promise<void> {
    const user = this.passwordModalUser();
    if (!user || this.passwordSubmitting()) return;

    const pass = this.passwordDraft();
    this.passwordSubmitting.set(true);
    this.passwordError.set(null);
    try {
      await this.tiUsuariosService.restablecerContrasena(user.id, pass);
      this.actionSuccessMessage.set(
        `Contraseña de ${user.email} restablecida. Se revocaron las sesiones renovables de la cuenta.`
      );
      this.closePasswordModal();
    } catch (err) {
      this.passwordConfirmStep.set(false);
      this.handleAdminHttpError(err, this.passwordError, 'Error al restablecer la contraseña.');
    } finally {
      this.passwordSubmitting.set(false);
    }
  }

  // =========================================================================
  // C. ADMINISTRACIÓN DE ROLES (PUT /api/ti/usuarios/:id/roles)
  // =========================================================================
  openRolesModal(user: TiUsuarioItem): void {
    this.actionSuccessMessage.set(null);
    if (this.rolesError() || this.rolesCatalog().length === 0 || !Array.isArray(user.roles)) {
      this.rolesModalUser.set(user);
      this.rolesDraft.set([]);
      this.rolesOriginalSnapshot.set([]);
      this.rolesModalError.set(
        'No es posible administrar roles porque no se pudo cargar el catálogo completo de roles o las asignaciones actuales.'
      );
      return;
    }

    const cloned = user.roles.map((r) => ({ ...r }));
    this.rolesModalUser.set(user);
    this.rolesOriginalSnapshot.set(cloned.map((r) => ({ ...r })));
    this.rolesDraft.set(cloned);
    this.newRoleCode.set(this.rolesCatalog()[0]?.code ?? '');
    this.newRoleScopeType.set('GLOBAL');
    this.newRoleScopeId.set('*');
    this.cluesSearchDraft.set('');
    this.cluesOptions.set([]);
    this.rolesConfirmRemoveStep.set(false);
    this.rolesModalError.set(null);
  }

  closeRolesModal(): void {
    this.rolesModalUser.set(null);
    this.rolesDraft.set([]);
    this.rolesOriginalSnapshot.set([]);
    this.rolesConfirmRemoveStep.set(false);
    this.rolesModalError.set(null);
  }

  onNewScopeTypeChange(scopeType: 'GLOBAL' | 'CLUES'): void {
    this.newRoleScopeType.set(scopeType);
    this.rolesModalError.set(null);
    if (scopeType === 'GLOBAL') {
      this.newRoleScopeId.set('*');
    } else {
      this.newRoleScopeId.set('');
      if (this.cluesOptions().length === 0) {
        void this.searchCluesUnits();
      }
    }
  }

  async searchCluesUnits(): Promise<void> {
    this.cluesLoading.set(true);
    try {
      const res = await this.tiPersonasService.buscarUnidades({
        q: this.cluesSearchDraft().trim() || undefined,
        page: 1,
        pageSize: 25,
      });
      this.cluesOptions.set(res.items.filter((u) => Boolean(u.cluesimb && u.cluesimb.trim())));
    } catch {
      this.cluesOptions.set([]);
    } finally {
      this.cluesLoading.set(false);
    }
  }

  addRoleAssignment(): void {
    const code = this.newRoleCode().trim().toUpperCase();
    const scopeType = this.newRoleScopeType();
    const scopeId = scopeType === 'GLOBAL' ? '*' : this.newRoleScopeId().trim().toUpperCase();

    if (!code) {
      this.rolesModalError.set('Selecciona un rol del catálogo.');
      return;
    }
    if (scopeType === 'CLUES' && !scopeId) {
      this.rolesModalError.set('Selecciona una unidad médica (CLUES) válida.');
      return;
    }

    const exists = this.rolesDraft().some(
      (r) => r.code === code && r.scope_type === scopeType && r.scope_id === scopeId
    );
    if (exists) {
      this.rolesModalError.set(`La asignación ${code} (${scopeType}:${scopeId}) ya existe.`);
      return;
    }

    this.rolesModalError.set(null);
    this.rolesConfirmRemoveStep.set(false);
    this.rolesDraft.update((list) => [...list, { code, scope_type: scopeType, scope_id: scopeId }]);
  }

  removeRoleAssignment(index: number): void {
    this.rolesModalError.set(null);
    this.rolesConfirmRemoveStep.set(false);
    this.rolesDraft.update((list) => list.filter((_, i) => i !== index));
  }

  hasRemovedExistingRoles(): boolean {
    const current = this.rolesDraft();
    return this.rolesOriginalSnapshot().some(
      (orig) =>
        !current.some(
          (c) => c.code === orig.code && c.scope_type === orig.scope_type && c.scope_id === orig.scope_id
        )
    );
  }

  requestRolesSave(): void {
    if (this.rolesError() || this.rolesCatalog().length === 0) {
      this.rolesModalError.set('No es posible guardar sin el catálogo completo de roles.');
      return;
    }
    if (this.hasRemovedExistingRoles() && !this.rolesConfirmRemoveStep()) {
      this.rolesModalError.set(null);
      this.rolesConfirmRemoveStep.set(true);
      return;
    }
    void this.submitRolesUpdate();
  }

  async submitRolesUpdate(): Promise<void> {
    const user = this.rolesModalUser();
    if (!user || this.rolesSubmitting()) return;

    this.rolesSubmitting.set(true);
    this.rolesModalError.set(null);
    try {
      const res = await this.tiUsuariosService.actualizarRoles(user.id, this.rolesDraft());
      this.usuarios.update((list) =>
        list.map((u) => (u.id === user.id ? { ...u, roles: res.roles } : u))
      );
      this.actionSuccessMessage.set(
        `Roles de ${user.email} actualizados. Se revocaron las sesiones renovables de la cuenta.`
      );
      this.closeRolesModal();
    } catch (err) {
      this.rolesConfirmRemoveStep.set(false);
      this.handleAdminHttpError(err, this.rolesModalError, 'Error al actualizar los roles de la cuenta.');
    } finally {
      this.rolesSubmitting.set(false);
    }
  }

  // =========================================================================
  // D. ALTA DE CUENTA SSO (POST /api/ti/usuarios)
  // =========================================================================
  openCreateModal(): void {
    this.actionSuccessMessage.set(null);
    this.lastCreatedUser.set(null);
    this.createModalOpen.set(true);
    this.createPersonaSearch.set('');
    this.createPersonasOptions.set([]);
    this.createSelectedPersona.set(null);
    this.createEmailDraft.set('');
    this.createNameDraft.set('');
    this.createPasswordDraft.set('');
    this.createPasswordConfirmDraft.set('');
    this.createStatusDraft.set('ACTIVE');
    this.createError.set(null);
    void this.searchPersonasForCreate();
  }

  closeCreateModal(): void {
    this.createPasswordDraft.set('');
    this.createPasswordConfirmDraft.set('');
    this.createError.set(null);
    this.createModalOpen.set(false);
  }

  async searchPersonasForCreate(): Promise<void> {
    this.createPersonasLoading.set(true);
    try {
      const res = await this.tiPersonasService.listarPersonas({
        q: this.createPersonaSearch().trim() || undefined,
        page: 1,
        pageSize: 20,
      });
      this.createPersonasOptions.set(res.items);
    } catch {
      this.createPersonasOptions.set([]);
    } finally {
      this.createPersonasLoading.set(false);
    }
  }

  selectPersonaForCreate(
    persona: Awaited<ReturnType<TiPersonasService['listarPersonas']>>['items'][number]
  ): void {
    this.createSelectedPersona.set(persona);
    this.createError.set(null);
    this.createEmailDraft.set((persona.email_principal ?? '').trim().toLowerCase());
    this.createNameDraft.set((persona.nombre_completo ?? '').trim());
  }

  async submitCreateUsuario(): Promise<void> {
    if (this.createSubmitting()) return;

    const persona = this.createSelectedPersona();
    if (!persona) {
      this.createError.set('Selecciona una persona activa existente.');
      return;
    }

    const email = this.createEmailDraft().trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.createError.set('Ingresa un correo electrónico de acceso válido.');
      return;
    }

    const pass = this.createPasswordDraft();
    const confirm = this.createPasswordConfirmDraft();
    if (pass.trim().length < 8) {
      this.createError.set('La contraseña inicial debe tener al menos 8 caracteres válidos.');
      return;
    }
    if (pass !== confirm) {
      this.createError.set('Las contraseñas no coinciden.');
      return;
    }

    const name = this.createNameDraft().trim();
    const payload: {
      persona_id: number;
      email: string;
      name?: string;
      password: string;
      status: TiUsuarioStatus;
    } = {
      persona_id: persona.id,
      email,
      password: pass,
      status: this.createStatusDraft(),
    };
    if (name) {
      payload.name = name;
    }

    this.createSubmitting.set(true);
    this.createError.set(null);
    try {
      const created = await this.tiUsuariosService.crearUsuario(payload);
      this.closeCreateModal();
      this.lastCreatedUser.set({
        id: created.id,
        email: created.email,
        name: created.name,
        status: created.status,
        persona_id: created.persona_id,
        nombre_completo: persona.nombre_completo ?? created.name,
        unidad_medica_id: persona.unidad_medica_id ?? null,
        unidad_medica: persona.unidad_medica ?? null,
        roles: [],
      });
      this.actionSuccessMessage.set(
        `Cuenta SSO ${created.email} creada correctamente. Todavía no tiene roles asignados.`
      );
      await this.cargarUsuarios();
    } catch (err) {
      this.handleAdminHttpError(err, this.createError, 'Error al crear la cuenta SSO.');
    } finally {
      this.createSubmitting.set(false);
    }
  }

  openRolesForLastCreated(): void {
    const created = this.lastCreatedUser();
    if (created) {
      this.openRolesModal(created);
    }
  }
}
