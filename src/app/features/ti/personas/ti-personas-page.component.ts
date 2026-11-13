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
  ContactRound,
  Edit3,
  Loader2,
  LucideAngularModule,
  Mail,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  UserPlus,
  X,
} from 'lucide-angular';
import {
  TiPersonaCreatePayload,
  TiPersonaLite,
  TiPersonasService,
  TiPersonaUpdatePayload,
  TiUnidadMedicaItem,
} from '../../../services/ti-personas.service';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface EditInitialSnapshot {
  id: number;
  nombre_completo: string;
  unidad_medica_id: number | null;
  correo_principal: string;
  correos_complementarios: string[];
}

@Component({
  selector: 'app-ti-personas-page',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ti-personas-page.component.html',
})
export class TiPersonasPageComponent implements OnInit {
  private readonly tiPersonasService = inject(TiPersonasService);
  private readonly router = inject(Router);

  readonly icons = {
    personas: ContactRound,
    search: Search,
    clear: X,
    refresh: RefreshCw,
    loader: Loader2,
    alert: AlertCircle,
    shieldAlert: ShieldAlert,
    building: Building2,
    mail: Mail,
    plus: Plus,
    userPlus: UserPlus,
    edit: Edit3,
    trash: Trash2,
    prev: ChevronLeft,
    next: ChevronRight,
  };

  // Listado principal
  readonly personas = signal<TiPersonaLite[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly accessDeniedError = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  // Filtros y paginación
  readonly searchDraft = signal<string>('');
  readonly appliedSearch = signal<string>('');
  readonly filterUnidadId = signal<number | null>(null);
  readonly filterUnidadSearch = signal<string>('');
  readonly unidadesFilterOptions = signal<TiUnidadMedicaItem[]>([]);
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(20);
  readonly total = signal<number>(0);

  // Modal de Alta / Edición
  readonly formModalOpen = signal<boolean>(false);
  readonly formMode = signal<'create' | 'edit'>('create');
  readonly formLoadingDetalle = signal<boolean>(false);
  readonly formSaving = signal<boolean>(false);
  readonly formError = signal<string | null>(null);

  readonly formNombre = signal<string>('');
  readonly formUnidadId = signal<number | null>(null);
  readonly formUnidadNombre = signal<string | null>(null);
  readonly formUnidadQuery = signal<string>('');
  readonly formUnidadesOptions = signal<TiUnidadMedicaItem[]>([]);
  readonly formUnidadesLoading = signal<boolean>(false);

  readonly formCorreoPrincipal = signal<string>('');
  readonly formComplementarios = signal<string[]>([]);
  readonly formNewComplementario = signal<string>('');
  readonly formComplementarioError = signal<string | null>(null);

  private editSnapshot: EditInitialSnapshot | null = null;

  // Modal de Baja Lógica
  readonly deleteModalOpen = signal<boolean>(false);
  readonly deleteTarget = signal<TiPersonaLite | null>(null);
  readonly deleteLoading = signal<boolean>(false);
  readonly deleteError = signal<string | null>(null);

  // Contadores de secuencia para descartar respuestas HTTP fuera de orden
  private listRequestSeq = 0;
  private unitSearchSeq = 0;
  private detailRequestSeq = 0;

  readonly totalPages = computed(() => {
    const t = this.total();
    const s = this.pageSize();
    if (t <= 0 || s <= 0) return 1;
    return Math.ceil(t / s);
  });

  readonly canGoPrev = computed(() => this.page() > 1 && !this.loading());
  readonly canGoNext = computed(() => this.page() < this.totalPages() && !this.loading());

  readonly rangeStart = computed(() => {
    if (this.total() === 0 || this.personas().length === 0) return 0;
    return (this.page() - 1) * this.pageSize() + 1;
  });

  readonly rangeEnd = computed(() => {
    if (this.total() === 0 || this.personas().length === 0) return 0;
    return Math.min(this.rangeStart() + this.personas().length - 1, this.total());
  });

  readonly hasActiveFilters = computed(
    () => this.appliedSearch().trim().length > 0 || this.filterUnidadId() !== null
  );

  ngOnInit(): void {
    void this.cargarUnidadesFiltro();
    void this.cargarPersonas();
  }

  async cargarUnidadesFiltro(q = ''): Promise<void> {
    try {
      const res = await this.tiPersonasService.buscarUnidades({
        q: q.trim() || undefined,
        page: 1,
        pageSize: 50,
      });
      this.unidadesFilterOptions.set(Array.isArray(res?.items) ? res.items : []);
    } catch {
      // No bloqueamos el listado principal si falla el catálogo auxiliar de filtro
    }
  }

  async cargarPersonas(): Promise<void> {
    const seq = ++this.listRequestSeq;
    this.loading.set(true);
    this.error.set(null);

    try {
      const res = await this.tiPersonasService.listarPersonas({
        q: this.appliedSearch() || undefined,
        unidad_medica_id: this.filterUnidadId(),
        page: this.page(),
        pageSize: this.pageSize(),
      });

      if (seq !== this.listRequestSeq) {
        return;
      }

      this.personas.set(Array.isArray(res?.items) ? res.items : []);
      this.total.set(Number(res?.total ?? 0));
      if (typeof res?.page === 'number' && res.page >= 1) {
        this.page.set(res.page);
      }
      if (typeof res?.pageSize === 'number' && res.pageSize >= 1) {
        this.pageSize.set(res.pageSize);
      }
    } catch (err: unknown) {
      if (seq !== this.listRequestSeq) {
        return;
      }

      const status = this.extractHttpStatus(err);
      if (status === 401 || status === 403) {
        this.handleUnauthorizedOrForbidden(status);
        return;
      }

      this.personas.set([]);
      this.total.set(0);
      this.error.set(
        'No fue posible consultar el directorio de personas. Verifica tu conexión e intenta nuevamente.'
      );
    } finally {
      if (seq === this.listRequestSeq) {
        this.loading.set(false);
      }
    }
  }

  onSearchSubmit(): void {
    this.appliedSearch.set(this.searchDraft().trim());
    this.page.set(1);
    void this.cargarPersonas();
  }

  onClearSearch(): void {
    this.searchDraft.set('');
    if (this.appliedSearch() !== '') {
      this.appliedSearch.set('');
      this.page.set(1);
      void this.cargarPersonas();
    }
  }

  onUnidadFilterChange(rawVal: string | number | null): void {
    const parsed = rawVal === null || rawVal === '' ? null : Number(rawVal);
    this.filterUnidadId.set(parsed !== null && Number.isFinite(parsed) ? parsed : null);
    this.page.set(1);
    void this.cargarPersonas();
  }

  onPageSizeChange(rawSize: string | number): void {
    const parsed = Number(rawSize);
    const valid = Number.isInteger(parsed) && parsed >= 1 ? Math.min(parsed, 100) : 20;
    if (valid !== this.pageSize()) {
      this.pageSize.set(valid);
      this.page.set(1);
      void this.cargarPersonas();
    }
  }

  onResetFilters(): void {
    this.searchDraft.set('');
    this.appliedSearch.set('');
    this.filterUnidadId.set(null);
    this.page.set(1);
    void this.cargarPersonas();
  }

  goToPrevPage(): void {
    if (!this.canGoPrev()) return;
    this.page.update(p => Math.max(1, p - 1));
    void this.cargarPersonas();
  }

  goToNextPage(): void {
    if (!this.canGoNext()) return;
    this.page.update(p => p + 1);
    void this.cargarPersonas();
  }

  // ==================== ALTA Y EDICIÓN ====================

  openCreateModal(): void {
    this.successMessage.set(null);
    this.formMode.set('create');
    this.editSnapshot = null;
    this.formError.set(null);
    this.formComplementarioError.set(null);
    this.formLoadingDetalle.set(false);
    this.formSaving.set(false);

    this.formNombre.set('');
    this.formUnidadId.set(null);
    this.formUnidadNombre.set(null);
    this.formUnidadQuery.set('');
    this.formCorreoPrincipal.set('');
    this.formComplementarios.set([]);
    this.formNewComplementario.set('');

    this.formModalOpen.set(true);
    void this.buscarUnidadesParaFormulario('');
  }

  async openEditModal(persona: TiPersonaLite): Promise<void> {
    this.successMessage.set(null);
    this.formMode.set('edit');
    this.editSnapshot = null;
    this.formError.set(null);
    this.formComplementarioError.set(null);
    this.formSaving.set(false);
    this.formLoadingDetalle.set(true);
    this.formNewComplementario.set('');
    this.formModalOpen.set(true);

    const seq = ++this.detailRequestSeq;

    try {
      const [detalle] = await Promise.all([
        this.tiPersonasService.obtenerPersona(persona.id),
        this.buscarUnidadesParaFormulario(''),
      ]);

      if (seq !== this.detailRequestSeq) {
        return;
      }

      const nombre = (detalle.nombre_completo ?? '').trim();
      const principal = (detalle.email_principal ?? detalle.correo ?? '').trim();
      const principalLower = principal.toLowerCase();

      // Reconstruir complementarios únicamente desde filas reales de persona_correo,
      // excluyendo duplicados del correo principal (sin distinguir mayúsculas/minúsculas).
      const rawRows = Array.isArray(detalle.correos) ? detalle.correos : [];
      const seen = new Set<string>();
      if (principalLower) {
        seen.add(principalLower);
      }
      const complementarios: string[] = [];
      for (const row of rawRows) {
        const clean = (row?.correo ?? '').trim();
        if (!clean) continue;
        const key = clean.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        complementarios.push(clean);
      }

      this.formNombre.set(nombre);
      this.formUnidadId.set(detalle.unidad_medica_id ?? null);
      this.formUnidadNombre.set(detalle.unidad_medica ?? null);
      this.formUnidadQuery.set('');
      this.formCorreoPrincipal.set(principal);
      this.formComplementarios.set(complementarios);

      this.editSnapshot = {
        id: detalle.id,
        nombre_completo: nombre,
        unidad_medica_id: detalle.unidad_medica_id ?? null,
        correo_principal: principal,
        correos_complementarios: [...complementarios],
      };
    } catch (err: unknown) {
      if (seq !== this.detailRequestSeq) {
        return;
      }
      const status = this.extractHttpStatus(err);
      if (status === 401 || status === 403) {
        this.formModalOpen.set(false);
        this.handleUnauthorizedOrForbidden(status);
        return;
      }
      this.formError.set(
        'No fue posible cargar el detalle de la persona para edición. Cierra e intenta de nuevo.'
      );
    } finally {
      if (seq === this.detailRequestSeq) {
        this.formLoadingDetalle.set(false);
      }
    }
  }

  closeFormModal(): void {
    if (this.formSaving()) return;
    this.formModalOpen.set(false);
    this.editSnapshot = null;
  }

  async buscarUnidadesParaFormulario(query: string): Promise<void> {
    const seq = ++this.unitSearchSeq;
    this.formUnidadesLoading.set(true);
    try {
      const res = await this.tiPersonasService.buscarUnidades({
        q: query.trim() || undefined,
        page: 1,
        pageSize: 30,
      });
      if (seq !== this.unitSearchSeq) return;
      this.formUnidadesOptions.set(Array.isArray(res?.items) ? res.items : []);
    } catch {
      if (seq !== this.unitSearchSeq) return;
      this.formUnidadesOptions.set([]);
    } finally {
      if (seq === this.unitSearchSeq) {
        this.formUnidadesLoading.set(false);
      }
    }
  }

  onFormUnidadSelect(rawVal: string | number | null): void {
    if (rawVal === null || rawVal === '') {
      this.formUnidadId.set(null);
      this.formUnidadNombre.set(null);
      return;
    }
    const id = Number(rawVal);
    if (!Number.isFinite(id)) return;
    this.formUnidadId.set(id);
    const found = this.formUnidadesOptions().find(u => u.id === id);
    this.formUnidadNombre.set(found?.nombre ?? this.formUnidadNombre());
  }

  clearFormUnidad(): void {
    this.formUnidadId.set(null);
    this.formUnidadNombre.set(null);
  }

  addComplementario(): void {
    this.formComplementarioError.set(null);
    const raw = this.formNewComplementario().trim();
    if (!raw) return;

    if (!EMAIL_REGEX.test(raw)) {
      this.formComplementarioError.set('El correo complementario no tiene un formato válido.');
      return;
    }

    const principalLower = this.formCorreoPrincipal().trim().toLowerCase();
    const rawLower = raw.toLowerCase();

    if (principalLower && rawLower === principalLower) {
      this.formComplementarioError.set('Este correo ya está capturado como correo principal.');
      return;
    }

    const exists = this.formComplementarios().some(c => c.toLowerCase() === rawLower);
    if (exists) {
      this.formComplementarioError.set('Este correo complementario ya fue agregado.');
      return;
    }

    this.formComplementarios.update(list => [...list, raw]);
    this.formNewComplementario.set('');
  }

  removeComplementario(correo: string): void {
    const key = correo.toLowerCase();
    this.formComplementarios.update(list => list.filter(c => c.toLowerCase() !== key));
  }

  async submitForm(): Promise<void> {
    if (this.formSaving() || this.formLoadingDetalle()) return;
    this.formError.set(null);
    this.formComplementarioError.set(null);

    const nombre = this.formNombre().trim();
    if (!nombre) {
      this.formError.set('El nombre completo es obligatorio.');
      return;
    }

    const principal = this.formCorreoPrincipal().trim();
    if (principal && !EMAIL_REGEX.test(principal)) {
      this.formError.set('El correo principal no tiene un formato válido.');
      return;
    }

    const principalLower = principal.toLowerCase();
    const complementariosLimpios: string[] = [];
    const seen = new Set<string>();
    if (principalLower) {
      seen.add(principalLower);
    }
    for (const c of this.formComplementarios()) {
      const clean = c.trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      complementariosLimpios.push(clean);
    }

    this.formSaving.set(true);

    try {
      if (this.formMode() === 'create') {
        const payload: TiPersonaCreatePayload = {
          nombre_completo: nombre,
        };
        if (this.formUnidadId() !== null) {
          payload.unidad_medica_id = this.formUnidadId();
        }
        if (principal) {
          payload.correo_principal = principal;
        }
        if (complementariosLimpios.length > 0) {
          payload.correos_complementarios = complementariosLimpios;
        }

        await this.tiPersonasService.crearPersona(payload);
        this.formModalOpen.set(false);
        this.successMessage.set('Persona registrada correctamente.');
        this.page.set(1);
        await this.cargarPersonas();
        return;
      }

      // Modo edición: verificar snapshot seguro
      const snap = this.editSnapshot;
      if (!snap) {
        this.formError.set('No se pudo verificar el estado previo de la persona. Recarga el formulario.');
        return;
      }

      const updatePayload: TiPersonaUpdatePayload = {};
      if (nombre !== snap.nombre_completo) {
        updatePayload.nombre_completo = nombre;
      }
      if (this.formUnidadId() !== snap.unidad_medica_id) {
        updatePayload.unidad_medica_id = this.formUnidadId();
      }
      if (principal !== snap.correo_principal) {
        updatePayload.correo_principal = principal ? principal : null;
      }
      if (!this.areEmailListsEqual(complementariosLimpios, snap.correos_complementarios)) {
        updatePayload.correos_complementarios = complementariosLimpios;
      }

      if (Object.keys(updatePayload).length === 0) {
        this.formModalOpen.set(false);
        this.editSnapshot = null;
        return;
      }

      await this.tiPersonasService.actualizarPersona(snap.id, updatePayload);
      this.formModalOpen.set(false);
      this.editSnapshot = null;
      this.successMessage.set('Persona actualizada correctamente.');
      await this.cargarPersonas();
    } catch (err: unknown) {
      const status = this.extractHttpStatus(err);
      if (status === 401 || status === 403) {
        this.formModalOpen.set(false);
        this.handleUnauthorizedOrForbidden(status);
        return;
      }
      this.formError.set(this.extractBackendErrorMessage(err, 'No fue posible guardar los cambios.'));
    } finally {
      this.formSaving.set(false);
    }
  }

  // ==================== BAJA LÓGICA ====================

  openDeleteModal(persona: TiPersonaLite): void {
    this.successMessage.set(null);
    this.deleteTarget.set(persona);
    this.deleteError.set(null);
    this.deleteLoading.set(false);
    this.deleteModalOpen.set(true);
  }

  closeDeleteModal(): void {
    if (this.deleteLoading()) return;
    this.deleteModalOpen.set(false);
    this.deleteTarget.set(null);
  }

  async confirmDelete(): Promise<void> {
    const target = this.deleteTarget();
    if (!target || this.deleteLoading()) return;

    this.deleteLoading.set(true);
    this.deleteError.set(null);

    try {
      await this.tiPersonasService.bajaLogicaPersona(target.id);
      this.deleteModalOpen.set(false);
      this.deleteTarget.set(null);
      this.successMessage.set(`Baja lógica aplicada a "${target.nombre_completo}".`);
      await this.cargarPersonas();
    } catch (err: unknown) {
      const status = this.extractHttpStatus(err);
      if (status === 401 || status === 403) {
        this.deleteModalOpen.set(false);
        this.handleUnauthorizedOrForbidden(status);
        return;
      }
      this.deleteError.set(
        this.extractBackendErrorMessage(err, 'No fue posible aplicar la baja lógica.')
      );
    } finally {
      this.deleteLoading.set(false);
    }
  }

  // ==================== UTILIDADES ====================

  private areEmailListsEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  private handleUnauthorizedOrForbidden(status: 401 | 403): void {
    this.personas.set([]);
    this.total.set(0);
    this.error.set(null);

    if (status === 401) {
      this.accessDeniedError.set(
        'Tu sesión expiró o ya no es válida. Inicia sesión nuevamente para acceder a Administración TI.'
      );
      void this.router.navigate(['/login'], {
        queryParams: { returnUrl: '/ti/personas' },
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

  private extractBackendErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse && err.error && typeof err.error === 'object') {
      const msg = (err.error as { error?: unknown; message?: unknown }).error ??
                  (err.error as { message?: unknown }).message;
      if (typeof msg === 'string' && msg.trim()) {
        return msg.trim();
      }
    }
    return fallback;
  }
}
