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
  TiUsuariosService,
} from '../../../services/ti-usuarios.service';

@Component({
  selector: 'app-ti-usuarios-page',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ti-usuarios-page.component.html',
})
export class TiUsuariosPageComponent implements OnInit {
  private readonly tiUsuariosService = inject(TiUsuariosService);
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
}
