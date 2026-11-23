import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertCircle,
  CheckCircle2,
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
import { RhOrgPuestoDto, RhService } from '../../../services/rh.service';

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
  imports: [CommonModule, FormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rh-organigrama-admin.component.html',
})
export class RhOrganigramaAdminComponent implements OnInit {
  private readonly rhService = inject(RhService);

  readonly unauthorized = output<void>();

  readonly icons = {
    network: Network,
    search: Search,
    clear: X,
    refresh: RefreshCw,
    loader: Loader2,
    alert: AlertCircle,
    checkCircle: CheckCircle2,
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
  readonly successBanner = signal<string | null>(null);

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
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.rhService.listOrganigramaPuestos();
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
      if (err instanceof HttpErrorResponse && err.status === 401) {
        this.unauthorized.emit();
        return;
      }
      this.error.set(this.extractError(err, 'No se pudo consultar la estructura organizacional.'));
    } finally {
      this.loading.set(false);
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
        this.successBanner.set(`Puesto "${denom}" agregado correctamente.`);
      } else {
        await this.rhService.actualizarOrganigramaPuesto(target.id, {
          denominacion: denom,
          codigo_nivel: this.draftCodigoNivel().trim() || null,
          siglas_area: this.draftSiglasArea().trim() || null,
          orden_visual: Math.max(0, Number(this.draftOrdenVisual()) || 0),
          observaciones: this.draftObservaciones().trim() || null,
        });
        this.successBanner.set(`Puesto "${denom}" actualizado correctamente.`);
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
      this.successBanner.set(`Dependencia de "${target.denominacion}" actualizada correctamente.`);
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
      this.successBanner.set(
        !puesto.activo
          ? `Puesto "${puesto.denominacion}" habilitado.`
          : `Puesto "${puesto.denominacion}" deshabilitado.`
      );
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
