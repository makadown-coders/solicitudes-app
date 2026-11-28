import { CommonModule, DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Loader2,
  LucideAngularModule,
  Network,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  X,
} from 'lucide-angular';
import { RhOrgOcupacion, RhOrgPuestoDto, RhService } from '../../../services/rh.service';
import { RhOrgOcupacionComponent } from './rh-org-ocupacion.component';
import { rhOrgEtiquetaOcupacion } from './rh-org-ocupacion-labels';
import { NgFastToastService } from 'ng-fast-toast';

export interface RhOrgFlatNode {
  puesto: RhOrgPuestoDto;
  depth: number;
  hasChildren: boolean;
  childrenCount: number;
  isExpanded: boolean;
  matchesSearch: boolean;
}

@Component({
  selector: 'app-rh-organigrama-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, RhOrgOcupacionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rh-organigrama-admin.component.html',
  styles: [`
    .org-puesto {
      padding-inline-start: calc(0.75rem + var(--org-depth, 0) * clamp(0.375rem, 1.4vw, 1.25rem));
    }
    .org-puesto-seleccionado {
      outline: 2px solid #047857;
      outline-offset: -2px;
    }
    .org-nivel { background-color: #f1f5f9; }
    .org-nivel[data-nivel="1"] { background-color: #d1fae5; }
    .org-nivel[data-nivel="2"] { background-color: #e0f2fe; }
    .org-nivel[data-nivel="3"] { background-color: #fef3c7; }
    .org-nivel[data-nivel="4"] { background-color: #ede9fe; }
    .org-nivel[data-nivel="5"] { background-color: #ccfbf1; }
    .org-nivel[data-nivel="6"] { background-color: #ffe4e6; }
    .org-nivel[data-nivel="7"] { background-color: #ecfccb; }
    .org-nivel[data-nivel="8"] { background-color: #e0e7ff; }
    .org-nivel[data-nivel="9"] { background-color: #ffedd5; }
    .org-nivel[data-nivel="10"] { background-color: #fae8ff; }
  `],
})
export class RhOrganigramaAdminComponent implements OnInit {
  private readonly rhService = inject(RhService);
  private readonly toast = inject(NgFastToastService);
  private readonly documento = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private observarToasts?: MutationObserver;
  private readonly toastsAdaptados = new WeakSet<ShadowRoot>();

  readonly unauthorized = output<void>();
  readonly revisarAdscripcion = output<string>();
  readonly etiquetaOcupacion = rhOrgEtiquetaOcupacion;

  readonly icons = {
    network: Network,
    search: Search,
    clear: X,
    refresh: RefreshCw,
    loader: Loader2,
    alert: AlertCircle,
    chevronRight: ChevronRight,
    chevronDown: ChevronDown,
    plus: Plus,
    pencil: Pencil,
    branch: GitBranch,
    power: Power,
  };

  readonly versionNombre = signal('Estructura organizacional de Coordinación Estatal');
  readonly versionClave = signal('ORG-COORDINACION-ESTATAL');
  readonly items = signal<RhOrgPuestoDto[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly anuncioExito = signal<{ texto: string; alterno: boolean } | null>(null);

  private notificarExito(title: string, content: string): void {
    if (this.destroyRef.destroyed) return;
    this.adaptarAnfitrionToast();
    this.toast.success({ title, content, duration: 2.5 });
    this.anuncioExito.update((previo) => ({ texto: `${title}. ${content}`, alterno: !previo?.alterno }));
  }

  private adaptarAnfitrionToast(): void {
    if (this.observarToasts) return;
    const anfitrion = this.documento.querySelector('ng-fast-toast')?.shadowRoot;
    if (!anfitrion) return;

    // ng-fast-toast encapsula cada tarjeta y su botón en Shadow DOM sin CSS parts.
    for (const toast of anfitrion.querySelectorAll('toast-root')) {
      if (toast.shadowRoot) this.toastsAdaptados.add(toast.shadowRoot);
    }
    this.observarToasts = new MutationObserver(() => {
      for (const toast of anfitrion.querySelectorAll('toast-root')) {
        const tarjeta = toast.shadowRoot;
        const cerrar = tarjeta?.querySelector<HTMLElement>('section:last-child > error-icon');
        if (!tarjeta || !cerrar || this.toastsAdaptados.has(tarjeta)) continue;
        this.toastsAdaptados.add(tarjeta);
        const estilos = this.documento.createElement('style');
        estilos.textContent = `
          :host > div { max-width: calc(100vw - 2rem); overflow-wrap: anywhere; pointer-events: auto; }
          :host section:last-child > error-icon { opacity: 1; }
          :host error-icon:focus-visible { outline: 2px solid #047857; outline-offset: 2px; }
          @media (prefers-reduced-motion: reduce) {
            :host > div { animation: none !important; transform: none !important; transition: none !important; }
            :host .toast-exit-right { opacity: 0; }
            :host circle-progress { visibility: hidden; }
          }
        `;
        tarjeta.appendChild(estilos);
        cerrar.setAttribute('role', 'button');
        cerrar.setAttribute('aria-label', 'Cerrar notificación');
        cerrar.tabIndex = 0;
        cerrar.addEventListener('keydown', (evento) => {
          if (evento.key === 'Enter' || evento.key === ' ') {
            evento.preventDefault();
            cerrar.click();
          }
        });
      }
    });
    this.observarToasts.observe(anfitrion, { childList: true, subtree: true });
    this.destroyRef.onDestroy(() => this.observarToasts?.disconnect());
  }
  private readonly buscadorPuestos = viewChild.required<ElementRef<HTMLInputElement>>('buscadorPuestos');
  private readonly objetivoOcupacion = signal<{
    puesto: RhOrgPuestoDto;
    ruta: string[];
    padre: string;
    disparador: HTMLButtonElement;
  } | null>(null);
  readonly ocupacionId = computed(() => this.objetivoOcupacion()?.puesto.id ?? null);
  private cargaSeq = 0;

  readonly searchQuery = signal('');
  readonly expandedIds = signal<Record<number, boolean>>({});

  /** Diálogo Alta / Edición */
  readonly formDialogMode = signal<'create' | 'edit' | null>(null);
  readonly formTargetPuesto = signal<RhOrgPuestoDto | null>(null);
  readonly draftDenominacion = signal('');
  readonly draftCodigoNivel = signal('');
  readonly draftSiglasArea = signal('');
  readonly draftOrdenVisual = signal('0');
  readonly draftObservaciones = signal('');
  readonly formSubmitting = signal(false);
  readonly formError = signal<string | null>(null);

  /** Diálogo Cambiar dependencia (con búsqueda dinámica de superior) */
  readonly depTarget = signal<RhOrgPuestoDto | null>(null);
  readonly depSearch = signal('');
  readonly depSelectedPadreId = signal<number | null>(null);
  readonly depSubmitting = signal(false);
  readonly depError = signal<string | null>(null);

  /** Estado en curso de habilitar/deshabilitar */
  readonly togglingEstadoId = signal<number | null>(null);

  readonly byId = computed<Record<number, RhOrgPuestoDto>>(() => {
    const map: Record<number, RhOrgPuestoDto> = {};
    for (const p of this.items()) {
      map[p.id] = p;
    }
    return map;
  });

  readonly ocupacionSeleccionada = computed(() => {
    const objetivo = this.objetivoOcupacion();
    return objetivo && {
      ...objetivo,
      puesto: this.byId()[objetivo.puesto.id] ?? objetivo.puesto,
    };
  });

  abrirOcupacion(puesto: RhOrgPuestoDto, disparador: HTMLButtonElement): void {
    if (this.objetivoOcupacion()) return;
    const ruta: string[] = [];
    const vistos = new Set<number>();
    const puestos = this.byId();
    let actual: RhOrgPuestoDto | undefined = puesto;
    while (actual && !vistos.has(actual.id)) {
      vistos.add(actual.id);
      ruta.unshift(actual.denominacion);
      actual = actual.puesto_padre_id === null ? undefined : puestos[actual.puesto_padre_id];
    }
    this.objetivoOcupacion.set({ puesto, ruta, padre: this.getNombrePuesto(puesto.puesto_padre_id), disparador });
  }

  cerrarOcupacion(): void {
    const disparador = this.objetivoOcupacion()?.disparador;
    this.objetivoOcupacion.set(null);
    (disparador?.isConnected ? disparador : this.buscadorPuestos().nativeElement).focus();
  }

  ocupacionGuardada(ocupacion: RhOrgOcupacion): void {
    this.items.update((puestos) => puestos.map((puesto) => puesto.id === ocupacion.puesto_id
      ? { ...puesto, estado_ocupacion: ocupacion.estado, persona_id: ocupacion.persona_id,
        nombre_ocupante: ocupacion.nombre_ocupante }
      : puesto));
    this.notificarExito('Ocupación actualizada', `${ocupacion.denominacion} · ${this.etiquetaOcupacion(ocupacion.estado)}`);
    void this.cargar();
  }

  readonly childrenByParentId = computed<Map<number | null, RhOrgPuestoDto[]>>(() => {
    const map = new Map<number | null, RhOrgPuestoDto[]>();
    for (const p of this.items()) {
      const key = p.puesto_padre_id;
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.orden_visual - b.orden_visual || a.id - b.id);
    }
    return map;
  });

  readonly visibleNodes = computed<RhOrgFlatNode[]>(() => {
    const all = this.items();
    if (all.length === 0) return [];
    const q = this.searchQuery().trim().toLowerCase();
    const mapById = this.byId();
    const childrenMap = this.childrenByParentId();
    const expanded = this.expandedIds();

    const matchedIds = new Set<number>();
    const visibleWithAncestors = new Set<number>();

    if (q) {
      for (const p of all) {
        const hit =
          p.denominacion.toLowerCase().includes(q) ||
          (p.codigo_nivel ?? '').toLowerCase().includes(q) ||
          (p.siglas_area ?? '').toLowerCase().includes(q);
        if (hit) {
          matchedIds.add(p.id);
          let cur: RhOrgPuestoDto | undefined = p;
          let guard = 0;
          while (cur && guard < 32) {
            visibleWithAncestors.add(cur.id);
            cur = cur.puesto_padre_id != null ? mapById[cur.puesto_padre_id] : undefined;
            guard += 1;
          }
        }
      }
    }

    const result: RhOrgFlatNode[] = [];
    const visit = (parentId: number | null, depth: number) => {
      const children = childrenMap.get(parentId) ?? [];
      for (const p of children) {
        if (q && !visibleWithAncestors.has(p.id)) {
          continue;
        }
        const sub = childrenMap.get(p.id) ?? [];
        const isExpanded = q ? true : Boolean(expanded[p.id]);
        result.push({
          puesto: p,
          depth,
          hasChildren: sub.length > 0,
          childrenCount: sub.length,
          isExpanded,
          matchesSearch: q ? matchedIds.has(p.id) : false,
        });
        if (sub.length > 0 && isExpanded) {
          visit(p.id, depth + 1);
        }
      }
    };

    visit(null, 0);
    return result;
  });

  readonly depCandidates = computed<RhOrgPuestoDto[]>(() => {
    const target = this.depTarget();
    if (!target) return [];
    const q = this.depSearch().trim().toLowerCase();
    return this.items()
      .filter((p) => p.id !== target.id && p.activo)
      .filter(
        (p) =>
          !q ||
          p.denominacion.toLowerCase().includes(q) ||
          (p.codigo_nivel ?? '').toLowerCase().includes(q)
      )
      .slice(0, 12);
  });

  ngOnInit(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    const seq = ++this.cargaSeq;
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.rhService.listOrganigramaPuestos(true);
      if (seq !== this.cargaSeq) return;
      this.versionClave.set(res.version.clave);
      this.versionNombre.set(res.version.nombre);
      const list = Array.isArray(res.items) ? res.items : [];
      this.items.set(list);

      // Expandir niveles 1 y 2 por defecto al abrir
      if (Object.keys(this.expandedIds()).length === 0) {
        const initExp: Record<number, boolean> = {};
        for (const p of list) {
          if (p.nivel_jerarquico <= 2) {
            initExp[p.id] = true;
          }
        }
        this.expandedIds.set(initExp);
      }
    } catch (err) {
      if (seq !== this.cargaSeq) return;
      if (err instanceof HttpErrorResponse && err.status === 401) {
        this.unauthorized.emit();
        return;
      }
      this.error.set(this.extractError(err, 'No se pudo consultar la estructura organizacional.'));
    } finally {
      if (seq === this.cargaSeq) this.loading.set(false);
    }
  }

  toggleExpand(puestoId: number): void {
    const cur = { ...this.expandedIds() };
    cur[puestoId] = !cur[puestoId];
    this.expandedIds.set(cur);
  }

  expandAll(): void {
    const next: Record<number, boolean> = {};
    for (const p of this.items()) {
      next[p.id] = true;
    }
    this.expandedIds.set(next);
  }

  collapseAll(): void {
    const next: Record<number, boolean> = {};
    for (const p of this.items()) {
      if (p.puesto_padre_id === null) {
        next[p.id] = true;
      }
    }
    this.expandedIds.set(next);
  }

  openCreateDialog(padre: RhOrgPuestoDto): void {
    this.formDialogMode.set('create');
    this.formTargetPuesto.set(padre);
    this.draftDenominacion.set('');
    this.draftCodigoNivel.set('');
    this.draftSiglasArea.set(padre.siglas_area ?? '');
    this.draftOrdenVisual.set('0');
    this.draftObservaciones.set('');
    this.formError.set(null);
  }

  openEditDialog(puesto: RhOrgPuestoDto): void {
    this.formDialogMode.set('edit');
    this.formTargetPuesto.set(puesto);
    this.draftDenominacion.set(puesto.denominacion);
    this.draftCodigoNivel.set(puesto.codigo_nivel ?? '');
    this.draftSiglasArea.set(puesto.siglas_area ?? '');
    this.draftOrdenVisual.set(String(puesto.orden_visual));
    this.draftObservaciones.set(puesto.observaciones ?? '');
    this.formError.set(null);
  }

  closeFormDialog(): void {
    if (this.formSubmitting()) return;
    this.formDialogMode.set(null);
    this.formTargetPuesto.set(null);
    this.formError.set(null);
  }

  async submitFormDialog(): Promise<void> {
    const mode = this.formDialogMode();
    const target = this.formTargetPuesto();
    const denom = this.draftDenominacion().trim();
    if (!mode || !target || this.formSubmitting()) return;
    if (!denom) {
      this.formError.set('La denominación del puesto es obligatoria.');
      return;
    }

    this.formSubmitting.set(true);
    this.formError.set(null);
    try {
      if (mode === 'create') {
        await this.rhService.crearOrganigramaPuesto({
          puesto_padre_id: target.id,
          denominacion: denom,
          codigo_nivel: this.draftCodigoNivel().trim() || null,
          siglas_area: this.draftSiglasArea().trim() || null,
          orden_visual: Math.max(0, Number(this.draftOrdenVisual()) || 0),
          observaciones: this.draftObservaciones().trim() || null,
        });
        this.notificarExito('Puesto agregado', denom);
      } else {
        await this.rhService.actualizarOrganigramaPuesto(target.id, {
          denominacion: denom,
          codigo_nivel: this.draftCodigoNivel().trim() || null,
          siglas_area: this.draftSiglasArea().trim() || null,
          orden_visual: Math.max(0, Number(this.draftOrdenVisual()) || 0),
          observaciones: this.draftObservaciones().trim() || null,
        });
        this.notificarExito('Puesto actualizado', denom);
      }
      this.formDialogMode.set(null);
      this.formTargetPuesto.set(null);
      await this.cargar();
    } catch (err) {
      this.formError.set(this.extractError(err, 'No se pudo guardar el puesto organizacional.'));
    } finally {
      this.formSubmitting.set(false);
    }
  }

  openDepDialog(puesto: RhOrgPuestoDto): void {
    this.depTarget.set(puesto);
    this.depSearch.set('');
    this.depSelectedPadreId.set(null);
    this.depError.set(null);
  }

  closeDepDialog(): void {
    if (this.depSubmitting()) return;
    this.depTarget.set(null);
    this.depError.set(null);
  }

  async confirmarCambioDependencia(): Promise<void> {
    const target = this.depTarget();
    const newPadreId = this.depSelectedPadreId();
    if (!target || newPadreId === null || this.depSubmitting()) return;

    this.depSubmitting.set(true);
    this.depError.set(null);
    try {
      await this.rhService.cambiarDependenciaOrganigramaPuesto(target.id, newPadreId);
      this.depTarget.set(null);
      this.notificarExito('Dependencia actualizada', target.denominacion);
      await this.cargar();
    } catch (err) {
      this.depError.set(this.extractError(err, 'No se pudo cambiar la dependencia jerárquica.'));
    } finally {
      this.depSubmitting.set(false);
    }
  }

  async toggleEstadoPuesto(puesto: RhOrgPuestoDto): Promise<void> {
    if (this.togglingEstadoId() !== null) return;
    this.togglingEstadoId.set(puesto.id);
    this.error.set(null);
    try {
      await this.rhService.cambiarEstadoOrganigramaPuesto(puesto.id, !puesto.activo);
      this.notificarExito(puesto.activo ? 'Puesto deshabilitado' : 'Puesto habilitado', puesto.denominacion);
      await this.cargar();
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudo actualizar el estado del puesto.'));
    } finally {
      this.togglingEstadoId.set(null);
    }
  }

  getNombrePuesto(id: number | null): string {
    if (id === null) return 'Raíz institucional';
    return this.byId()[id]?.denominacion ?? `Puesto #${id}`;
  }

  private extractError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse && err.error && typeof err.error === 'object') {
      const msg = (err.error as { error?: unknown }).error;
      if (typeof msg === 'string' && msg.trim()) return msg.trim();
    }
    return fallback;
  }
}
