import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ArticuloCrudRow,
  ArticulosCrudService,
  ArticuloCrudSummary,
} from '../../services/articulos-crud.service';

type SortBy = 'id' | 'clave' | 'descripcion' | 'presentacion';
type SortOrder = 'ASC' | 'DESC';
type FormMode = 'create' | 'edit';

@Component({
  selector: 'app-articulos-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './articulos-admin.component.html',
  styleUrls: ['./articulos-admin.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArticulosAdminComponent {
  private api = inject(ArticulosCrudService);

  loading = signal(false);
  saving = signal(false);
  loadingSummary = signal(false);

  items = signal<ArticuloCrudRow[]>([]);
  total = signal(0);
  page = signal(1);
  pageSize = signal(20);
  search = signal('');
  sortBy = signal<SortBy>('id');
  sortOrder = signal<SortOrder>('ASC');

  summary = signal<ArticuloCrudSummary | null>(null);

  error = signal('');
  message = signal('');

  formOpen = signal(false);
  formMode = signal<FormMode>('create');
  editId = signal<number | null>(null);
  formClave = signal('');
  formDescripcion = signal('');
  formPresentacion = signal('');

  totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));

  constructor() {
    this.loadPage();
    this.loadSummary();
  }

  loadPage() {
    this.loading.set(true);
    this.error.set('');

    this.api
      .list({
        q: this.search(),
        page: this.page(),
        pageSize: this.pageSize(),
        sortBy: this.sortBy(),
        sortOrder: this.sortOrder(),
      })
      .subscribe({
        next: (res) => {
          this.items.set(res.items ?? []);
          this.total.set(Number(res.total ?? 0));
          this.page.set(Number(res.page ?? 1));
          this.pageSize.set(Number(res.pageSize ?? 20));
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err?.error?.error ?? 'No fue posible cargar articulos.');
          this.loading.set(false);
        },
      });
  }

  loadSummary() {
    this.loadingSummary.set(true);
    this.api.getSummary(this.search()).subscribe({
      next: (res) => {
        this.summary.set(res);
        this.loadingSummary.set(false);
      },
      error: () => {
        this.loadingSummary.set(false);
      },
    });
  }

  onBuscar() {
    this.page.set(1);
    this.loadPage();
    this.loadSummary();
  }

  clearSearch() {
    this.search.set('');
    this.onBuscar();
  }

  toggleSort(field: SortBy) {
    if (this.sortBy() === field) {
      this.sortOrder.set(this.sortOrder() === 'ASC' ? 'DESC' : 'ASC');
    } else {
      this.sortBy.set(field);
      this.sortOrder.set('ASC');
    }
    this.loadPage();
  }

  prevPage() {
    if (this.page() <= 1) return;
    this.page.set(this.page() - 1);
    this.loadPage();
  }

  nextPage() {
    if (this.page() >= this.totalPages()) return;
    this.page.set(this.page() + 1);
    this.loadPage();
  }

  changePageSize(value: number | string) {
    const n = Number(value);
    this.pageSize.set(Number.isFinite(n) && n > 0 ? n : 20);
    this.page.set(1);
    this.loadPage();
  }

  openCreate() {
    this.formMode.set('create');
    this.editId.set(null);
    this.formClave.set('');
    this.formDescripcion.set('');
    this.formPresentacion.set('');
    this.formOpen.set(true);
    this.message.set('');
    this.error.set('');
  }

  openEdit(row: ArticuloCrudRow) {
    this.formMode.set('edit');
    this.editId.set(row.id);
    this.formClave.set(row.clave ?? '');
    this.formDescripcion.set(row.descripcion ?? '');
    this.formPresentacion.set(row.presentacion ?? '');
    this.formOpen.set(true);
    this.message.set('');
    this.error.set('');
  }

  closeForm() {
    this.formOpen.set(false);
  }

  saveForm() {
    const clave = this.formClave().trim();
    const descripcion = this.formDescripcion().trim();
    const presentacion = this.formPresentacion().trim();

    if (!clave) {
      this.error.set('La clave es requerida.');
      return;
    }
    if (!descripcion) {
      this.error.set('La descripcion es requerida.');
      return;
    }

    this.saving.set(true);
    this.error.set('');

    if (this.formMode() === 'create') {
      this.api
        .create({
          clave,
          descripcion,
          presentacion: presentacion || null,
        })
        .subscribe({
          next: () => {
            this.saving.set(false);
            this.formOpen.set(false);
            this.message.set('Articulo creado.');
            this.page.set(1);
            this.loadPage();
            this.loadSummary();
          },
          error: (err) => {
            this.saving.set(false);
            this.error.set(err?.error?.error ?? 'No fue posible crear el articulo.');
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

    this.api
      .update(id, {
        clave,
        descripcion,
        presentacion: presentacion || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.formOpen.set(false);
          this.message.set('Articulo actualizado.');
          this.loadPage();
          this.loadSummary();
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(err?.error?.error ?? 'No fue posible actualizar el articulo.');
        },
      });
  }

  deleteRow(row: ArticuloCrudRow) {
    if (!confirm(`Eliminar articulo ${row.id} (${row.clave ?? 'sin clave'})?`)) return;
    this.api.delete(row.id).subscribe({
      next: () => {
        this.message.set('Articulo eliminado.');
        if (this.items().length === 1 && this.page() > 1) {
          this.page.set(this.page() - 1);
        }
        this.loadPage();
        this.loadSummary();
      },
      error: (err) => {
        this.error.set(err?.error?.error ?? 'No fue posible eliminar el articulo.');
      },
    });
  }

  sortLabel(field: SortBy): string {
    if (this.sortBy() !== field) return '';
    return this.sortOrder() === 'ASC' ? '?' : '?';
  }
}
