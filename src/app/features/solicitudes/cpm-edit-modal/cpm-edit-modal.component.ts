// src/app/features/solicitudes/cpm-edit-modal/cpm-edit-modal.component.ts
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { BatchItem } from '../../../models/cpm-row';
import { SolicitudCpmEditRow } from '../../../models/solicitud-cpm-edit-row';
import { ArticulosService } from '../../../services/articulos.service';
import { CpmEditorService } from '../../../services/cpm-editor.service';
import { ArticuloAutocompleteComponent, ArticuloAutocompleteItem } from '../../../shared/articulo-autocomplete/articulo-autocomplete.component';
import * as XLSX from 'xlsx';

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

  private normalizeClave(value: string | null | undefined): string {
    return String(value ?? '').trim().toUpperCase();
  }

  private findRowIndexByClave(clave: string): number {
    const claveNorm = this.normalizeClave(clave);
    return this.rows().findIndex(r => this.normalizeClave(r.clave_cnis) === claveNorm);
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

  onRowCpmChange(clave: string, value: number | string) {
    const n = Number(value);
    this.rows.update(list => {
      const index = list.findIndex(r => this.normalizeClave(r.clave_cnis) === this.normalizeClave(clave));
      if (index < 0) return list;
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

  onRowFuenteChange(clave: string, value: string) {
    const fuente = (value || 'manual').trim() || 'manual';
    this.rows.update(list => {
      const index = list.findIndex(r => this.normalizeClave(r.clave_cnis) === this.normalizeClave(clave));
      if (index < 0) return list;
      const copy = [...list];
      const row = { ...copy[index] };
      row.fuente = fuente;
      row._dirty = true;
      copy[index] = row;
      return copy;
    });
  }

  cancelRow(clave: string) {
    const index = this.findRowIndexByClave(clave);
    const row = index >= 0 ? this.rows()[index] : undefined;
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

  deleteRow(clave: string) {
    if (!this.canEdit || this.saving()) return;
    const index = this.findRowIndexByClave(clave);
    const row = index >= 0 ? this.rows()[index] : undefined;
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

  undoDeleteMark(clave: string) {
    const index = this.findRowIndexByClave(clave);
    const row = index >= 0 ? this.rows()[index] : undefined;
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

  exportXlsx() {
    const rows = [...this.rows()]
      .sort((a, b) => String(a.clave_cnis).localeCompare(String(b.clave_cnis)))
      .map(r => ({
        clave_cnis: r.clave_cnis,
        descripcion: r.descripcion ?? '',
        presentacion: r.presentacion ?? '',
        cpm: Number(r.cpm ?? 0),
        // fuente: r.fuente ?? 'manual',
        // estado: this.isMarkedForDelete(r) ? 'MARCADA_PARA_ELIMINAR' : (r._dirty ? 'PENDIENTE_GUARDAR' : 'VIGENTE'),
      }));

    const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: false });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CPMs');

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const unitSafe = (this.cluesimb || 'UNIDAD').replace(/[^A-Z0-9_-]/gi, '_');
    const filename = `CPMs_${unitSafe}_${stamp}.xlsx`;
    XLSX.writeFile(wb, filename, { bookType: 'xlsx' });

    this.setTransientMessage(`Archivo exportado: ${filename}`);
  }

  async onImportFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!this.canEdit || this.saving()) {
      input.value = '';
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const firstSheet = wb.SheetNames?.[0];
      if (!firstSheet) {
        this.error.set('El archivo no contiene hojas.');
        return;
      }

      const ws = wb.Sheets[firstSheet];
      const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: false, defval: '' });
      if (!matrix.length) {
        this.error.set('El archivo esta vacio.');
        return;
      }

      const header = this.findImportHeader(matrix);
      if (!header) {
        this.error.set('No se encontro encabezado valido. Requiere "clave_cnis" (o "clave") y "cpm".');
        return;
      }

      const incoming = new Map<string, { cpm: number; descripcion?: string; presentacion?: string }>();
      let invalidCount = 0;
      let duplicateCount = 0;

      for (let i = header.headerIndex + 1; i < matrix.length; i++) {
        const row = matrix[i] ?? [];
        const clave = String(row[header.idxClave] ?? '').trim().toUpperCase();
        if (!clave) continue;

        const cpmRaw = String(row[header.idxCpm] ?? '').trim().replace(',', '.');
        const cpm = Number(cpmRaw);
        if (!Number.isFinite(cpm) || cpm < 0) {
          invalidCount++;
          continue;
        }

        if (incoming.has(clave)) duplicateCount++;
        incoming.set(clave, {
          cpm,
          descripcion: header.idxDescripcion >= 0 ? String(row[header.idxDescripcion] ?? '').trim() : '',
          presentacion: header.idxPresentacion >= 0 ? String(row[header.idxPresentacion] ?? '').trim() : '',
        });
      }

      if (!incoming.size) {
        this.error.set('No se encontraron filas validas para importar.');
        return;
      }

      const current = [...this.rows()];
      const byClave = new Map(current.map((r, idx) => [r.clave_cnis.toUpperCase(), idx] as const));
      let updated = 0;
      let created = 0;

      for (const [clave, payload] of incoming.entries()) {
        const idx = byClave.get(clave);
        if (idx !== undefined) {
          const row = { ...current[idx] };
          row.cpm = payload.cpm;
          row._dirty = true;
          row._invalid = Number.isNaN(payload.cpm) || payload.cpm < 0 || (!!row._isNew && payload.cpm === 0);
          if (payload.descripcion) row.descripcion = payload.descripcion;
          if (payload.presentacion) row.presentacion = payload.presentacion;
          current[idx] = row;
          updated++;
          continue;
        }

        const meta = this.findMetaByClave(clave);
        current.push({
          clave_cnis: clave,
          cpm: payload.cpm,
          fuente: 'manual',
          descripcion: payload.descripcion || meta?.descripcion || '',
          presentacion: payload.presentacion || meta?.presentacion || '',
          _dirty: true,
          _invalid: Number.isNaN(payload.cpm) || payload.cpm < 0 || payload.cpm === 0,
          _isNew: true,
          _originalCpm: 0,
          _originalFuente: 'manual',
        });
        created++;
      }

      this.rows.set(current.sort((a, b) => String(a.clave_cnis).localeCompare(String(b.clave_cnis))));

      const notes: string[] = [];
      if (invalidCount > 0) notes.push(`${invalidCount} fila(s) invalidas omitidas`);
      if (duplicateCount > 0) notes.push(`${duplicateCount} duplicada(s), se tomo la ultima`);
      this.error.set('');
      this.setTransientMessage(
        `Importadas ${incoming.size} clave(s): ${updated} actualizadas, ${created} nuevas.${notes.length ? ' ' + notes.join('. ') + '.' : ''}`,
        6000
      );
    } catch (err: any) {
      this.error.set(err?.message ?? 'No fue posible importar el archivo.');
    } finally {
      input.value = '';
    }
  }

  private findImportHeader(matrix: any[][]): { headerIndex: number; idxClave: number; idxCpm: number; idxDescripcion: number; idxPresentacion: number } | null {
    const norm = (v: any) => String(v ?? '').trim().toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_');

    const isClave = (k: string) => ['clave_cnis', 'clave', 'cnis'].includes(k);
    const isCpm = (k: string) => k === 'cpm';
    const isDescripcion = (k: string) => ['descripcion', 'desc'].includes(k);
    const isPresentacion = (k: string) => ['presentacion', 'unidad_medida', 'unidad'].includes(k);

    const maxScan = Math.min(matrix.length, 12);
    for (let i = 0; i < maxScan; i++) {
      const header = (matrix[i] ?? []).map(norm);
      const idxClave = header.findIndex(isClave);
      const idxCpm = header.findIndex(isCpm);
      if (idxClave < 0 || idxCpm < 0) continue;

      return {
        headerIndex: i,
        idxClave,
        idxCpm,
        idxDescripcion: header.findIndex(isDescripcion),
        idxPresentacion: header.findIndex(isPresentacion),
      };
    }
    return null;
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
