import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  EventEmitter,
  inject,
  Input,
  OnDestroy,
  OnInit,
  Output,
  signal,
} from '@angular/core';
import {
  AlertCircle,
  ArrowRightLeft,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Loader2,
  LucideAngularModule,
  Pencil,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
} from 'lucide-angular';
import {
  RhCreatePersonaPayload,
  RhPersonasEstadoFilter,
  RhPersonasPadronItem,
  RhService,
  RhUnidadAutorizada,
  RhUpdatePersonaGeneralPayload,
} from '../../services/rh.service';

import { RhComisionesLaboralesComponent } from './comisiones/rh-comisiones-laborales.component';
import { RhExpedienteConsolidadoComponent } from './expediente/rh-expediente-consolidado.component';
import { RhVacacionesComponent } from './vacaciones/rh-vacaciones.component';

const RFC_PERSONA_FISICA_REGEX =
  /^[A-ZÑ&]{4}(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([A-Z\d]{3})?$/;
const CURP_REGEX =
  /^[A-Z][AEIOUX][A-Z]{2}(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HMX][A-Z]{2}[A-Z\d]{3}[A-Z\d]\d$/;

@Component({
  selector: 'app-rh-padron-institucional',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, RhComisionesLaboralesComponent, RhExpedienteConsolidadoComponent, RhVacacionesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rh-padron-institucional.component.html',
})
export class RhPadronInstitucionalComponent implements OnInit, OnDestroy {
  private readonly rhService = inject(RhService);

  @Input() unidades: RhUnidadAutorizada[] = [];
  @Output() unauthorized = new EventEmitter<void>();

  readonly icons = {
    users: Users,
    userPlus: UserPlus,
    userCheck: UserCheck,
    userX: UserX,
    search: Search,
    clear: X,
    pencil: Pencil,
    comision: ArrowRightLeft,
    vacaciones: Calendar,
    expediente: FolderOpen,
    refresh: RefreshCw,
    loader: Loader2,
    alert: AlertCircle,
    shieldAlert: ShieldAlert,
    checkCircle: CheckCircle2,
    prev: ChevronLeft,
    next: ChevronRight,
  };

  /** Estado del listado paginado del padrón */
  readonly items = signal<RhPersonasPadronItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly forbiddenError = signal<string | null>(null);
  readonly successBanner = signal<string | null>(null);

  /** Filtros y paginación */
  readonly searchDraft = signal('');
  readonly appliedSearch = signal('');
  readonly estadoFilter = signal<RhPersonasEstadoFilter>('todas');
  readonly page = signal(1);
  readonly pageSize = signal(20);
  readonly total = signal(0);

  /** Estado del diálogo «Registrar persona» */
  readonly createDialogOpen = signal(false);
  readonly draftNombres = signal('');
  readonly draftApellidos = signal('');
  readonly draftRfc = signal('');
  readonly draftCurp = signal('');
  readonly draftCargo = signal('');
  readonly draftCorreo = signal('');
  readonly draftUnidadId = signal<string>('');
  readonly draftFechaIngreso = signal('');
  readonly createSubmitting = signal(false);
  readonly createError = signal<string | null>(null);
  readonly createIsConflict = signal(false);

  /** Estado del diálogo de confirmación de cambio de estado (desactivar / reactivar) */
  readonly estadoDialogOpen = signal(false);
  readonly estadoTargetPersona = signal<RhPersonasPadronItem | null>(null);
  readonly estadoTargetNuevoActivo = signal<boolean>(false);
  readonly estadoSubmitting = signal(false);
  readonly estadoError = signal<string | null>(null);
  readonly estadoIsConflict = signal(false);

  /** Estado del diálogo «Editar datos generales» (RH-4A.2B / RH-4A.7A) */
  readonly editGeneralDialogOpen = signal(false);
  readonly editGeneralTargetPersona = signal<RhPersonasPadronItem | null>(null);
  readonly editDraftNombres = signal('');
  readonly editDraftApellidos = signal('');
  readonly editDraftCargo = signal('');
  readonly editDraftCorreo = signal('');
  readonly editDraftUnidadId = signal('');
  readonly editDraftCurp = signal('');
  readonly editDraftRfc = signal('');
  readonly editDraftFechaIngreso = signal('');
  readonly editGeneralSubmitting = signal(false);
  readonly editGeneralError = signal<string | null>(null);

  /** Estado del panel «Comisiones laborales» (RH-4A.3B) */
  readonly comisionesTargetPersona = signal<RhPersonasPadronItem | null>(null);

  /** Estado del panel «Vacaciones y kardex» (RH-4A.4B) */
  readonly vacacionesTargetPersona = signal<RhPersonasPadronItem | null>(null);

  /** Estado del panel «Expediente administrativo consolidado» (RH-4A.5A) */
  readonly expedienteTargetPersona = signal<RhPersonasPadronItem | null>(null);

  private listSeq = 0;

  readonly totalPages = computed(() => {
    const t = this.total();
    const s = this.pageSize();
    return t > 0 && s > 0 ? Math.ceil(t / s) : 1;
  });

  readonly canGoPrev = computed(() => this.page() > 1 && !this.loading());
  readonly canGoNext = computed(() => this.page() < this.totalPages() && !this.loading());

  readonly createValidationError = computed<string | null>(() => {
    const nombres = this.draftNombres().trim();
    const apellidos = this.draftApellidos().trim();
    if (!nombres) {
      return 'El campo «Nombres» es obligatorio.';
    }
    if (!apellidos) {
      return 'El campo «Apellidos» es obligatorio.';
    }
    if (`${nombres} ${apellidos}`.trim().length > 150) {
      return 'La combinación de nombres y apellidos no puede exceder 150 caracteres.';
    }

    const rfc = this.draftRfc().trim().toUpperCase();
    if (rfc.length > 0) {
      if (rfc.length === 12) {
        return 'No se admite RFC de persona moral (12 caracteres). Ingresa un RFC de persona física de 10 o 13 caracteres.';
      }
      if (!RFC_PERSONA_FISICA_REGEX.test(rfc)) {
        return 'El RFC debe corresponder a una persona física válida (10 caracteres sin homoclave o 13 caracteres completo).';
      }
    }

    const curp = this.draftCurp().trim().toUpperCase();
    if (curp.length > 0 && !CURP_REGEX.test(curp)) {
      return 'La CURP debe tener exactamente 18 caracteres con estructura oficial válida.';
    }

    const correo = this.draftCorreo().trim();
    if (correo.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      return 'El correo principal no tiene un formato válido.';
    }

    return null;
  });

  ngOnInit(): void {
    void this.cargarPadron();
  }

  ngOnDestroy(): void {
    this.listSeq += 1;
    this.resetCreateDraft();
    this.closeEstadoDialog();
    this.closeEditGeneralDialog();
  }

  async cargarPadron(): Promise<void> {
    const seq = ++this.listSeq;
    this.loading.set(true);
    this.error.set(null);
    this.forbiddenError.set(null);

    try {
      const res = await this.rhService.listarPersonasPadron({
        q: this.appliedSearch().trim() || undefined,
        estado: this.estadoFilter(),
        page: this.page(),
        pageSize: this.pageSize(),
      });

      if (seq !== this.listSeq) {
        return;
      }

      this.items.set(Array.isArray(res.items) ? res.items : []);
      this.page.set(res.page ?? this.page());
      this.pageSize.set(res.pageSize ?? this.pageSize());
      this.total.set(Number(res.total ?? 0));
    } catch (err: unknown) {
      if (seq !== this.listSeq) {
        return;
      }

      this.items.set([]);
      this.total.set(0);

      if (err instanceof HttpErrorResponse) {
        if (err.status === 401) {
          this.unauthorized.emit();
          return;
        }
        if (err.status === 403) {
          this.forbiddenError.set(
            this.extractBackendError(err) ||
              'No cuentas con autorización RECURSOS_HUMANOS GLOBAL para consultar el padrón institucional completo.'
          );
          return;
        }
        this.error.set(
          this.extractBackendError(err) ||
            'No fue posible cargar el padrón institucional. Intenta nuevamente.'
        );
        return;
      }

      this.error.set('Error de conexión al consultar el padrón institucional.');
    } finally {
      if (seq === this.listSeq) {
        this.loading.set(false);
      }
    }
  }

  onSearchInput(value: string): void {
    this.searchDraft.set(value);
  }

  onSubmitSearch(): void {
    this.appliedSearch.set(this.searchDraft().trim());
    this.page.set(1);
    void this.cargarPadron();
  }

  onClearSearch(): void {
    this.searchDraft.set('');
    this.appliedSearch.set('');
    this.page.set(1);
    void this.cargarPadron();
  }

  onEstadoFilterChange(value: string): void {
    if (value === 'activas' || value === 'inactivas' || value === 'todas') {
      this.estadoFilter.set(value);
      this.page.set(1);
      void this.cargarPadron();
    }
  }

  goToPrevPage(): void {
    if (!this.canGoPrev()) {
      return;
    }
    this.page.update((p) => Math.max(1, p - 1));
    void this.cargarPadron();
  }

  goToNextPage(): void {
    if (!this.canGoNext()) {
      return;
    }
    this.page.update((p) => p + 1);
    void this.cargarPadron();
  }

  // =========================================================================
  // DIÁLOGO: REGISTRAR PERSONA
  // =========================================================================

  openCreateDialog(): void {
    this.resetCreateDraft();
    this.createDialogOpen.set(true);
  }

  closeCreateDialog(): void {
    this.createDialogOpen.set(false);
    this.resetCreateDraft();
  }

  private resetCreateDraft(): void {
    this.draftNombres.set('');
    this.draftApellidos.set('');
    this.draftRfc.set('');
    this.draftCurp.set('');
    this.draftCargo.set('');
    this.draftCorreo.set('');
    this.draftUnidadId.set('');
    this.draftFechaIngreso.set('');
    this.createSubmitting.set(false);
    this.createError.set(null);
    this.createIsConflict.set(false);
  }

  async onSubmitCreatePersona(): Promise<void> {
    if (this.createSubmitting()) {
      return;
    }

    const validationErr = this.createValidationError();
    if (validationErr) {
      this.createError.set(validationErr);
      this.createIsConflict.set(false);
      return;
    }

    this.createSubmitting.set(true);
    this.createError.set(null);
    this.createIsConflict.set(false);

    const payload: RhCreatePersonaPayload = {
      nombres: this.draftNombres().trim(),
      apellidos: this.draftApellidos().trim(),
    };

    const rfc = this.draftRfc().trim().toUpperCase();
    if (rfc.length > 0) {
      payload.rfc = rfc;
    }

    const curp = this.draftCurp().trim().toUpperCase();
    if (curp.length > 0) {
      payload.curp = curp;
    }

    const cargo = this.draftCargo().trim();
    if (cargo.length > 0) {
      payload.cargo = cargo;
    }

    const correo = this.draftCorreo().trim().toLowerCase();
    if (correo.length > 0) {
      payload.correo_principal = correo;
    }

    const unidadStr = this.draftUnidadId().trim();
    if (unidadStr.length > 0) {
      const parsedUnidad = Number(unidadStr);
      if (Number.isInteger(parsedUnidad) && parsedUnidad > 0) {
        payload.unidad_medica_id = parsedUnidad;
      }
    }

    const fechaIngreso = this.draftFechaIngreso().trim();
    if (fechaIngreso.length > 0) {
      if (fechaIngreso < '1940-01-01' || fechaIngreso > '2100-12-31') {
        this.createSubmitting.set(false);
        this.createError.set('La fecha de ingreso institucional debe estar entre 1940-01-01 y 2100-12-31.');
        return;
      }
      payload.fecha_ingreso = fechaIngreso;
    }

    try {
      const created = await this.rhService.crearPersonaInstitucional(payload);
      this.closeCreateDialog();
      this.successBanner.set(
        `Persona registrada correctamente en el padrón institucional: ${created.nombre_completo}.`
      );
      this.searchDraft.set(created.nombre_completo);
      this.appliedSearch.set(created.nombre_completo);
      this.page.set(1);
      await this.cargarPadron();
    } catch (err: unknown) {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 401) {
          this.closeCreateDialog();
          this.unauthorized.emit();
          return;
        }
        if (err.status === 409) {
          this.createIsConflict.set(true);
          this.createError.set(
            this.extractBackendError(err) ||
              'Existe un conflicto de identificación: el RFC o la CURP ya se encuentran registrados en el padrón institucional.'
          );
          return;
        }
        this.createError.set(
          this.extractBackendError(err) ||
            'No fue posible registrar la persona. Verifica los datos e intenta nuevamente.'
        );
        return;
      }
      this.createError.set('Error de conexión al registrar la persona.');
    } finally {
      this.createSubmitting.set(false);
    }
  }

  // =========================================================================
  // DIÁLOGO: DESACTIVAR / REACTIVAR PERSONA
  // =========================================================================

  openEstadoDialog(persona: RhPersonasPadronItem, nuevoActivo: boolean): void {
    this.estadoTargetPersona.set(persona);
    this.estadoTargetNuevoActivo.set(nuevoActivo);
    this.estadoError.set(null);
    this.estadoIsConflict.set(false);
    this.estadoSubmitting.set(false);
    this.estadoDialogOpen.set(true);
  }

  closeEstadoDialog(): void {
    this.estadoDialogOpen.set(false);
    this.estadoTargetPersona.set(null);
    this.estadoError.set(null);
    this.estadoIsConflict.set(false);
    this.estadoSubmitting.set(false);
  }

  async onConfirmEstadoChange(): Promise<void> {
    if (this.estadoSubmitting()) {
      return;
    }

    const target = this.estadoTargetPersona();
    if (!target) {
      return;
    }

    const nuevoActivo = this.estadoTargetNuevoActivo();
    this.estadoSubmitting.set(true);
    this.estadoError.set(null);
    this.estadoIsConflict.set(false);

    try {
      const res = await this.rhService.actualizarEstadoPersona(target.persona_id, nuevoActivo);
      this.closeEstadoDialog();
      this.successBanner.set(
        res.persona.activo
          ? `Registro de ${res.persona.nombre_completo} reactivado administrativamente.`
          : `Registro de ${res.persona.nombre_completo} desactivado administrativamente conservando su historial.`
      );
      await this.cargarPadron();
    } catch (err: unknown) {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 401) {
          this.closeEstadoDialog();
          this.unauthorized.emit();
          return;
        }
        if (err.status === 409) {
          this.estadoIsConflict.set(true);
          this.estadoError.set(
            this.extractBackendError(err) ||
              'No se puede completar la desactivación porque la persona mantiene una cuenta activa o una adscripción laboral vigente.'
          );
          return;
        }
        this.estadoError.set(
          this.extractBackendError(err) ||
            'No fue posible actualizar el estado administrativo de la persona.'
        );
        return;
      }
      this.estadoError.set('Error de conexión al actualizar el estado administrativo.');
    } finally {
      this.estadoSubmitting.set(false);
    }
  }

  // =========================================================================
  // DIÁLOGO: EDITAR DATOS GENERALES (RH-4A.2B)
  // =========================================================================

  openEditGeneralDialog(persona: RhPersonasPadronItem): void {
    this.editGeneralTargetPersona.set(persona);
    this.editDraftCargo.set((persona.cargo ?? '').trim());
    this.editDraftCorreo.set((persona.correo_principal ?? '').trim());
    this.editDraftUnidadId.set(
      persona.unidad_medica_id != null ? String(persona.unidad_medica_id) : ''
    );
    this.editDraftNombres.set(persona.nombres ?? '');
    this.editDraftApellidos.set(persona.apellidos ?? '');
    this.editDraftCurp.set('');
    this.editDraftRfc.set('');
    this.editDraftFechaIngreso.set(persona.fecha_ingreso ?? '');
    this.editGeneralSubmitting.set(false);
    this.editGeneralError.set(null);
    this.editGeneralDialogOpen.set(true);
  }

  closeEditGeneralDialog(): void {
    this.editGeneralDialogOpen.set(false);
    this.editGeneralTargetPersona.set(null);
    this.editDraftNombres.set('');
    this.editDraftApellidos.set('');
    this.editDraftCargo.set('');
    this.editDraftCorreo.set('');
    this.editDraftUnidadId.set('');
    this.editDraftCurp.set('');
    this.editDraftRfc.set('');
    this.editDraftFechaIngreso.set('');
    this.editGeneralSubmitting.set(false);
    this.editGeneralError.set(null);
  }

  async onSubmitEditGeneral(): Promise<void> {
    if (this.editGeneralSubmitting()) {
      return;
    }

    const target = this.editGeneralTargetPersona();
    if (!target) {
      return;
    }

    const nextCargoRaw = this.editDraftCargo().trim();
    if (nextCargoRaw.length > 100) {
      this.editGeneralError.set('El campo «Cargo» no puede exceder 100 caracteres.');
      return;
    }
    const nextCargo: string | null = nextCargoRaw.length > 0 ? nextCargoRaw : null;

    const nextCorreoRaw = this.editDraftCorreo().trim().toLowerCase();
    if (nextCorreoRaw.length > 254) {
      this.editGeneralError.set('El campo «Correo principal» no puede exceder 254 caracteres.');
      return;
    }
    if (nextCorreoRaw.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextCorreoRaw)) {
      this.editGeneralError.set('El campo «Correo principal» no tiene un formato de correo válido.');
      return;
    }
    const nextCorreo: string | null = nextCorreoRaw.length > 0 ? nextCorreoRaw : null;

    const nextUnidadStr = this.editDraftUnidadId().trim();
    let nextUnidadId: number | null = null;
    if (nextUnidadStr.length > 0) {
      const parsed = Number(nextUnidadStr);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        this.editGeneralError.set('La unidad de referencia seleccionada no es válida.');
        return;
      }
      nextUnidadId = parsed;
    }

    const nextNombres = this.editDraftNombres().trim();
    const nextApellidos = this.editDraftApellidos().trim();
    if (nextNombres.length > 150 || nextApellidos.length > 150) {
      this.editGeneralError.set('Los campos «Nombres» y «Apellidos» no pueden exceder 150 caracteres.');
      return;
    }

    const nextCurpRaw = this.editDraftCurp().trim().toUpperCase();
    if (nextCurpRaw.length > 0 && !CURP_REGEX.test(nextCurpRaw)) {
      this.editGeneralError.set('La CURP debe tener exactamente 18 caracteres con estructura oficial válida.');
      return;
    }

    const nextRfcRaw = this.editDraftRfc().trim().toUpperCase();
    if (nextRfcRaw.length > 0) {
      if (nextRfcRaw.length === 12) {
        this.editGeneralError.set('No se admite RFC de persona moral (12 caracteres).');
        return;
      }
      if (!RFC_PERSONA_FISICA_REGEX.test(nextRfcRaw)) {
        this.editGeneralError.set('El RFC debe corresponder a una persona física válida (10 o 13 caracteres).');
        return;
      }
    }

    const currentNombres = (target.nombres ?? '').trim();
    const currentApellidos = (target.apellidos ?? '').trim();
    const currentCargo =
      target.cargo != null && target.cargo.trim().length > 0 ? target.cargo.trim() : null;
    const currentCorreo =
      target.correo_principal != null && target.correo_principal.trim().length > 0
        ? target.correo_principal.trim().toLowerCase()
        : null;
    const currentUnidadId =
      target.unidad_medica_id != null ? Number(target.unidad_medica_id) : null;

    const patch: RhUpdatePersonaGeneralPayload = {};
    if (nextNombres && nextNombres !== currentNombres) {
      patch.nombres = nextNombres;
    }
    if (nextApellidos && nextApellidos !== currentApellidos) {
      patch.apellidos = nextApellidos;
    }
    if (nextCargo !== currentCargo) {
      patch.cargo = nextCargo;
    }
    if (nextCorreo !== currentCorreo) {
      patch.correo_principal = nextCorreo;
    }
    if (nextUnidadId !== currentUnidadId) {
      patch.unidad_medica_id = nextUnidadId;
    }
    if (nextCurpRaw.length > 0) {
      patch.curp = nextCurpRaw;
    }
    if (nextRfcRaw.length > 0) {
      patch.rfc = nextRfcRaw;
    }
    const nextFechaIngreso = this.editDraftFechaIngreso().trim() || null;
    const currentFechaIngreso = target.fecha_ingreso ? target.fecha_ingreso.trim() : null;
    if (nextFechaIngreso !== currentFechaIngreso) {
      patch.fecha_ingreso = nextFechaIngreso;
    }

    // Si no existen cambios efectivos, cerrar sin realizar PATCH
    if (Object.keys(patch).length === 0) {
      this.closeEditGeneralDialog();
      return;
    }

    this.editGeneralSubmitting.set(true);
    this.editGeneralError.set(null);

    try {
      const res = await this.rhService.actualizarDatosGeneralesPersona(target.persona_id, patch);
      this.closeEditGeneralDialog();
      this.successBanner.set(
        `Datos generales de ${res.persona.nombre_completo} actualizados correctamente.`
      );
      await this.cargarPadron();
    } catch (err: unknown) {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 401) {
          this.closeEditGeneralDialog();
          this.unauthorized.emit();
          return;
        }
        if (err.status === 403) {
          this.editGeneralError.set(
            this.extractBackendError(err) ||
              'No cuentas con autorización RECURSOS_HUMANOS GLOBAL para editar datos generales.'
          );
          return;
        }
        if (err.status === 404) {
          this.editGeneralError.set(
            this.extractBackendError(err) ||
              'La persona o la unidad de referencia seleccionada ya no se encuentra disponible.'
          );
          return;
        }
        this.editGeneralError.set(
          this.extractBackendError(err) ||
            'No fue posible guardar los datos generales. Verifica la información e intenta nuevamente.'
        );
        return;
      }
      this.editGeneralError.set('Error de conexión al guardar los datos generales.');
    } finally {
      this.editGeneralSubmitting.set(false);
    }
  }

  openComisionesDialog(persona: RhPersonasPadronItem): void {
    this.comisionesTargetPersona.set(persona);
  }

  closeComisionesDialog(): void {
    this.comisionesTargetPersona.set(null);
  }

  openVacacionesDialog(persona: RhPersonasPadronItem): void {
    this.vacacionesTargetPersona.set(persona);
  }

  closeVacacionesDialog(): void {
    this.vacacionesTargetPersona.set(null);
  }

  openExpedienteDialog(persona: RhPersonasPadronItem): void {
    this.expedienteTargetPersona.set(persona);
  }

  closeExpedienteDialog(): void {
    this.expedienteTargetPersona.set(null);
  }

  isCluesConvencional(cluesimb: string | null | undefined): boolean {
    if (!cluesimb) {
      return false;
    }
    const clean = cluesimb.trim().toUpperCase();
    return clean.length > 0 && clean !== 'N/A';
  }

  private extractBackendError(err: HttpErrorResponse): string | null {
    const payload = err.error;
    if (payload && typeof payload === 'object') {
      const maybeError = (payload as Record<string, unknown>)['error'];
      if (typeof maybeError === 'string' && maybeError.trim().length > 0) {
        return maybeError.trim();
      }
    }
    return null;
  }
}
