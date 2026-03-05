import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { BatchItem } from '../../../models/cpm-row';
import { SolicitudCpmEditRow } from '../../../models/solicitud-cpm-edit-row';
import { ArticulosService } from '../../../services/articulos.service';
import { CpmEditorService } from '../../../services/cpm-editor.service';
import { ArticuloAutocompleteComponent, ArticuloAutocompleteItem } from '../../../shared/articulo-autocomplete/articulo-autocomplete.component';

@Component({
  selector: 'app-cpm-edit-modal',
  standalone: true,
  imports: [CommonModule, FormsModule,
      ArticuloAutocompleteComponent],
  templateUrl: './cpm-edit-modal.component.html',
  styleUrls: ['./cpm-edit-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CpmEditModalComponent {
  @Input({ required: true }) cluesimb!: string;
  @Input() tituloUnidad = '';
  @Input() mostrarUnidadEnTitulo = true;
  @Input() canEdit = false;

  @Output() close = new EventEmitter<void>();
  @Output() updated = new EventEmitter<void>();

  private cpmEditor = inject(CpmEditorService);
  private articulos = inject(ArticulosService);

  loading = signal(true);
  saving = signal(false);
  error = signal('');
  message = signal('');
  filterText = signal('');
  autocompleteModel = signal('');

  rows = signal<SolicitudCpmEditRow[]>([]);
  private messageTimer: ReturnType<typeof setTimeout> | null = null;

  private artMap = new Map<string, { descripcion?: string; presentacion?: string }>();
  private artMapLoaded = false;

  dirtyCount = computed(() => this.rows().filter(r => r._dirty && !r._invalid).length);
  rowsFiltered = computed(() => {
    const q = this.filterText().trim().toLowerCase();
    if (!q) return this.rows();
    return this.rows().filter(r =>
      r.clave_cnis.toLowerCase().includes(q)
      || (r.descripcion ?? '').toLowerCase().includes(q)
    );
  });

  ngOnInit() {
    this.cargar();
  }

  private async cargar() {
    this.loading.set(true);
    this.error.set('');
    this.message.set('');

    try {
      await this.loadArtMapIfNeeded();
      const res = await firstValueFrom(this.cpmEditor.getByUnidadAll(this.cluesimb));
      const loaded: SolicitudCpmEditRow[] = (res?.rows ?? [])
        .filter(r => Number(r.cpm ?? 0) > 0)
        .map(r => {
          const meta = this.findMetaByClave(r.clave_cnis);
          return {
            ...r,
            descripcion: meta?.descripcion ?? '',
            presentacion: meta?.presentacion ?? '',
            _dirty: false,
            _invalid: Number.isNaN(Number(r.cpm)) || Number(r.cpm) < 0,
            _isNew: false,
            _originalCpm: Number(r.cpm ?? 0),
            _originalFuente: r.fuente ?? 'manual',
          };
        });

      this.rows.set(loaded);
      this.message.set(`${loaded.length} clave(s) con CPM cargadas.`);
    } catch (err: any) {
      this.error.set(err?.error?.error ?? err?.message ?? 'No fue posible cargar CPMS de la unidad.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadArtMapIfNeeded() {
    if (this.artMapLoaded) return;
    const mapa = await firstValueFrom(this.articulos.getArticulosMapa());
    this.artMap = new Map<string, { descripcion?: string; presentacion?: string }>(Object.entries(mapa ?? {}));
    this.artMapLoaded = true;
  }

  private findMetaByClave(rawClave: string) {
    const clave = String(rawClave || '').trim();
    if (!clave) return null;

    const direct = this.artMap.get(clave);
    if (direct) return direct;

    const upper = clave.toUpperCase();
    const upperDirect = this.artMap.get(upper);
    if (upperDirect) return upperDirect;

    const lower = clave.toLowerCase();
    for (const [k, v] of this.artMap.entries()) {
      if (k.toLowerCase() === lower) return v;
    }
    return null;
  }

  onAutocompleteModelChange(value: string) {
    this.autocompleteModel.set(value);
  }

  onArticuloSelected(item: ArticuloAutocompleteItem) {
    const clave = String(item?.clave ?? '').trim().toUpperCase();
    if (!clave) return;

    const exists = this.rows().some(r => r.clave_cnis.toUpperCase() === clave);
    if (exists) {
      this.error.set(`La clave ${clave} ya existe en esta unidad.`);
      return;
    }

    const meta = this.findMetaByClave(clave);
    const next: SolicitudCpmEditRow = {
      clave_cnis: clave,
      cpm: 0,
      fuente: 'manual',
      descripcion: (item?.descripcion ?? meta?.descripcion ?? '').trim(),
      presentacion: (item?.presentacion ?? item?.unidadMedida ?? meta?.presentacion ?? '').trim(),
      _dirty: true,
      _invalid: true,
      _isNew: true,
      _originalCpm: 0,
      _originalFuente: 'manual',
      _selectedFromAutocomplete: true,
    };

    this.rows.update(list => [next, ...list]);
    this.autocompleteModel.set('');
    this.setTransientMessage(`Clave ${clave} agregada. Captura un CPM mayor a 0 para guardar.`);
    this.error.set('');
  }

  onRowCpmChange(index: number, value: number | string) {
    const n = Number(value);
    this.rows.update(list => {
      const copy = [...list];
      const row = { ...copy[index] };
      row.cpm = n;
      row._dirty = true;
      row._invalid = Number.isNaN(n) || n < 0 || (!!row._isNew && n === 0);
      copy[index] = row;
      return copy;
    });
    this.error.set('');
  }

  onRowFuenteChange(index: number, value: string) {
    const fuente = (value || 'manual').trim() || 'manual';
    this.rows.update(list => {
      const copy = [...list];
      const row = { ...copy[index] };
      row.fuente = fuente;
      row._dirty = true;
      copy[index] = row;
      return copy;
    });
  }

  cancelRow(index: number) {
    const row = this.rows()[index];
    if (!row) return;

    if (row._isNew) {
      this.rows.update(list => list.filter((_, i) => i !== index));
      this.message.set('');
      return;
    }

    const originalCpm = Number(row._originalCpm ?? row.cpm);
    const originalFuente = row._originalFuente ?? row.fuente ?? 'manual';
    this.rows.update(list => {
      const copy = [...list];
      copy[index] = {
        ...row,
        cpm: originalCpm,
        fuente: originalFuente,
        _dirty: false,
        _invalid: Number.isNaN(originalCpm) || originalCpm < 0,
      };
      return copy;
    });
    this.message.set('');
  }

  isMarkedForDelete(row: SolicitudCpmEditRow): boolean {
    return !row._isNew && !!row._dirty && Number(row.cpm ?? 0) === 0;
  }

  deleteRow(index: number) {
    if (!this.canEdit || this.saving()) return;
    const row = this.rows()[index];
    if (!row) return;

    if (row._isNew) {
      this.rows.update(list => list.filter((_, i) => i !== index));
      this.setTransientMessage(`Clave ${row.clave_cnis} eliminada de la captura local.`);
      return;
    }

    const ok = confirm(`Se marcara para eliminar la clave ${row.clave_cnis}. Se aplicara al guardar cambios. Deseas continuar?`);
    if (!ok) return;

    this.rows.update(list => {
      const copy = [...list];
      const next = { ...copy[index] };
      next.cpm = 0;
      next._dirty = true;
      next._invalid = false;
      copy[index] = next;
      return copy;
    });
    this.setTransientMessage(`Clave ${row.clave_cnis} marcada para eliminacion. Presiona "Guardar cambios".`);
  }

  undoDeleteMark(index: number) {
    const row = this.rows()[index];
    if (!row || row._isNew) return;

    const originalCpm = Number(row._originalCpm ?? 0);
    const originalFuente = row._originalFuente ?? row.fuente ?? 'manual';
    this.rows.update(list => {
      const copy = [...list];
      copy[index] = {
        ...row,
        cpm: originalCpm,
        fuente: originalFuente,
        _dirty: false,
        _invalid: Number.isNaN(originalCpm) || originalCpm < 0,
      };
      return copy;
    });
    this.setTransientMessage(`Eliminacion cancelada para ${row.clave_cnis}.`);
  }

  async saveAll() {
    if (!this.canEdit) {
      this.error.set('No autorizado para editar CPMS en esta unidad.');
      return;
    }

    const dirty = this.rows().filter(r => r._dirty && !r._invalid);
    if (!dirty.length) {
      this.message.set('No hay cambios por guardar.');
      return;
    }

    const invalidNewZero = this.rows()
      .filter(r => r._dirty && !!r._isNew && Number(r.cpm) === 0)
      .map(r => r.clave_cnis);
    if (invalidNewZero.length > 0) {
      this.error.set(`No se puede insertar CPM=0. Ajusta: ${invalidNewZero.slice(0, 6).join(', ')}${invalidNewZero.length > 6 ? '...' : ''}`);
      return;
    }

    this.saving.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const payload: BatchItem[] = dirty.map(r => ({
        clave: r.clave_cnis,
        cpm: Number(r.cpm ?? 0),
        fuente: (r.fuente || 'manual').trim() || 'manual',
      }));

      await firstValueFrom(this.cpmEditor.upsertBatch(this.cluesimb, payload));

      const deletedCount = dirty.filter(r => !r._isNew && Number(r.cpm) === 0).length;
      this.rows.update(list => list
        .map(r => r._dirty ? ({
          ...r,
          _dirty: false,
          _invalid: Number.isNaN(Number(r.cpm ?? 0)) || Number(r.cpm ?? 0) < 0,
          _isNew: false,
          _originalCpm: Number(r.cpm ?? 0),
          _originalFuente: r.fuente ?? 'manual',
        }) : r)
        .filter(r => Number(r.cpm ?? 0) > 0)
      );

      this.message.set(
        deletedCount > 0
          ? `Cambios guardados (${payload.length}). Eliminadas por CPM=0: ${deletedCount}.`
          : `Cambios guardados (${payload.length}).`
      );
      this.updated.emit();
    } catch (err: any) {
      this.error.set(err?.error?.error ?? err?.message ?? 'Error al guardar cambios de CPM.');
    } finally {
      this.saving.set(false);
    }
  }

  private setTransientMessage(text: string, ttlMs = 3500) {
    if (this.messageTimer) {
      clearTimeout(this.messageTimer);
      this.messageTimer = null;
    }
    this.message.set(text);
    this.messageTimer = setTimeout(() => {
      this.message.set('');
      this.messageTimer = null;
    }, ttlMs);
  }

  trackByClave(_: number, row: SolicitudCpmEditRow) {
    return row.clave_cnis;
  }

  ngOnDestroy() {
    if (this.messageTimer) {
      clearTimeout(this.messageTimer);
      this.messageTimer = null;
    }
  }
}
