import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HomologosCrudService, HomologoCrudUiRow } from '../../services/homologos-crud.service';
import { ArticuloAutocompleteComponent, ArticuloAutocompleteItem } from '../../shared/articulo-autocomplete/articulo-autocomplete.component';

type SortBy = 'id' | 'clave' | 'sustituto' | 'factor' | 'claveDescripcion' | 'sustitutoDescripcion';
type SortOrder = 'ASC' | 'DESC';
type FormMode = 'create' | 'edit';

@Component({
  selector: 'app-homologos-config',
  standalone: true,
  imports: [CommonModule, FormsModule, ArticuloAutocompleteComponent],
  templateUrl: './homologos-config.component.html',
  styleUrls: ['./homologos-config.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomologosConfigComponent {
  private api = inject(HomologosCrudService);

  loading = signal(false);
  saving = signal(false);

  allItems = signal<HomologoCrudUiRow[]>([]);
  search = signal('');
  sortBy = signal<SortBy>('id');
  sortOrder = signal<SortOrder>('ASC');
  page = signal(1);
  pageSize = signal(20);

  error = signal('');
  message = signal('');

  formOpen = signal(false);
  formMode = signal<FormMode>('create');
  editId = signal<number | null>(null);
  formClave = signal('');
  formSustituto = signal('');
  formFactor = signal('');
  formClaveDescripcion = signal<string | null>(null);
  formSustitutoDescripcion = signal<string | null>(null);

  filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const rows = this.allItems();
    if (!q) return rows;
    return rows.filter((r) =>
      r.clave.toLowerCase().includes(q)
      || r.sustituto.toLowerCase().includes(q)
      || (r.claveDescripcion ?? '').toLowerCase().includes(q)
      || (r.sustitutoDescripcion ?? '').toLowerCase().includes(q)
      || String(r.factor).toLowerCase().includes(q)
    );
  });

  sorted = computed(() => {
    const field = this.sortBy();
    const order = this.sortOrder();
    const rows = [...this.filtered()];
    rows.sort((a, b) => {
      let av: any = a[field] ?? '';
      let bv: any = b[field] ?? '';

      if (field === 'id') {
        av = Number(a.id);
        bv = Number(b.id);
      } else if (field === 'factor') {
        av = Number(a.factor);
        bv = Number(b.factor);
      } else {
        av = String(av).toLowerCase();
        bv = String(bv).toLowerCase();
      }

      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return order === 'ASC' ? cmp : -cmp;
    });
    return rows;
  });

  total = computed(() => this.sorted().length);
  totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));

  pagedItems = computed(() => {
    const p = this.page();
    const s = this.pageSize();
    const start = (p - 1) * s;
    return this.sorted().slice(start, start + s);
  });

  sinDescripcionClave = computed(() => this.allItems().filter(r => !r.claveDescripcion).length);
  sinDescripcionSustituto = computed(() => this.allItems().filter(r => !r.sustitutoDescripcion).length);

  constructor() {
    this.loadAll();
  }

  loadAll() {
    this.loading.set(true);
    this.error.set('');
    this.api.listAllEnriched().subscribe({
      next: (rows) => {
        this.allItems.set(rows ?? []);
        const maxPage = Math.max(1, Math.ceil((rows?.length ?? 0) / this.pageSize()));
        if (this.page() > maxPage) this.page.set(maxPage);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.error ?? 'No fue posible cargar homologos.');
        this.loading.set(false);
      },
    });
  }

  onBuscar() {
    this.page.set(1);
  }

  clearSearch() {
    this.search.set('');
    this.page.set(1);
  }

  toggleSort(field: SortBy) {
    if (this.sortBy() === field) {
      this.sortOrder.set(this.sortOrder() === 'ASC' ? 'DESC' : 'ASC');
    } else {
      this.sortBy.set(field);
      this.sortOrder.set('ASC');
    }
    this.page.set(1);
  }

  prevPage() {
    if (this.page() <= 1) return;
    this.page.set(this.page() - 1);
  }

  nextPage() {
    if (this.page() >= this.totalPages()) return;
    this.page.set(this.page() + 1);
  }

  changePageSize(value: number | string) {
    const n = Number(value);
    this.pageSize.set(Number.isFinite(n) && n > 0 ? n : 20);
    this.page.set(1);
  }

  openCreate() {
    this.formMode.set('create');
    this.editId.set(null);
    this.formClave.set('');
    this.formSustituto.set('');
    this.formFactor.set('');
    this.formClaveDescripcion.set(null);
    this.formSustitutoDescripcion.set(null);
    this.formOpen.set(true);
    this.message.set('');
    this.error.set('');
  }

  openEdit(row: HomologoCrudUiRow) {
    this.formMode.set('edit');
    this.editId.set(row.id);
    this.formClave.set(row.clave);
    this.formSustituto.set(row.sustituto);
    this.formFactor.set(row.factor);
    this.formClaveDescripcion.set(row.claveDescripcion ?? null);
    this.formSustitutoDescripcion.set(row.sustitutoDescripcion ?? null);
    this.formOpen.set(true);
    this.message.set('');
    this.error.set('');
  }

  closeForm() {
    this.formOpen.set(false);
  }

  onClaveModelChange(value: string) {
    this.formClave.set(value);
    this.formClaveDescripcion.set(null);
  }

  onSustitutoModelChange(value: string) {
    this.formSustituto.set(value);
    this.formSustitutoDescripcion.set(null);
  }

  onClaveSelected(item: ArticuloAutocompleteItem) {
    this.formClave.set((item?.clave ?? '').trim().toUpperCase());
    this.formClaveDescripcion.set((item?.descripcion ?? '').trim() || null);
  }

  onSustitutoSelected(item: ArticuloAutocompleteItem) {
    this.formSustituto.set((item?.clave ?? '').trim().toUpperCase());
    this.formSustitutoDescripcion.set((item?.descripcion ?? '').trim() || null);
  }

  saveForm() {
    const clave = this.formClave().trim().toUpperCase();
    const sustituto = this.formSustituto().trim().toUpperCase();
    const factorRaw = this.formFactor().trim();
    const factor = Number(factorRaw);

    if (!clave) {
      this.error.set('La clave es requerida.');
      return;
    }
    if (!sustituto) {
      this.error.set('El sustituto es requerido.');
      return;
    }
    if (!Number.isFinite(factor) || factor <= 0) {
      this.error.set('El factor debe ser numerico y mayor a 0.');
      return;
    }

    this.saving.set(true);
    this.error.set('');

    if (this.formMode() === 'create') {
      this.api.create({ clave, sustituto, factor }).subscribe({
        next: () => {
          this.saving.set(false);
          this.formOpen.set(false);
          this.message.set('Homologo creado.');
          this.loadAll();
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(err?.error?.error ?? 'No fue posible crear el homologo.');
        },
      });
      return;
    }

    const id = this.editId();
    if (!id) {
      this.saving.set(false);
      this.error.set('No se encontro id para actualizar.');
      return;
    }

    this.api.update(id, { clave, sustituto, factor }).subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.message.set('Homologo actualizado.');
        this.loadAll();
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(err?.error?.error ?? 'No fue posible actualizar el homologo.');
      },
    });
  }

  deleteRow(row: HomologoCrudUiRow) {
    if (!confirm(`Eliminar homologo ${row.id} (${row.clave} -> ${row.sustituto})?`)) return;

    this.api.delete(row.id).subscribe({
      next: () => {
        this.message.set('Homologo eliminado.');
        this.loadAll();
      },
      error: (err) => {
        this.error.set(err?.error?.error ?? 'No fue posible eliminar el homologo.');
      },
    });
  }

  sortLabel(field: SortBy): string {
    if (this.sortBy() !== field) return '';
    return this.sortOrder() === 'ASC' ? '?' : '?';
  }
}
