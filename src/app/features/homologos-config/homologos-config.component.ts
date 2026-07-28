import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgFastToastService } from 'ng-fast-toast';
import { ConfirmacionModalComponent } from '../../shared/confirmacion-modal/confirmacion-modal.component';
import { HomologosCrudService } from '../../services/homologos-crud.service';
import {
  HomologoCrudUiRow,
  HomologoCrudUpsertPayload,
} from '../../models/homologos/homologo-crud.model';
import { HomologosFormModalComponent } from './homologos-form-modal.component';

type SortBy = 'id' | 'clave' | 'sustituto' | 'factor' | 'claveDescripcion' | 'sustitutoDescripcion';
type SortOrder = 'ASC' | 'DESC';
type FormMode = 'create' | 'edit';

@Component({
  selector: 'app-homologos-config',
  standalone: true,
  imports: [CommonModule, ConfirmacionModalComponent, HomologosFormModalComponent],
  templateUrl: './homologos-config.component.html',
  styleUrls: ['./homologos-config.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomologosConfigComponent {
  private api = inject(HomologosCrudService);
  private toast = inject(NgFastToastService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly deleting = signal(false);

  readonly allItems = signal<HomologoCrudUiRow[]>([]);
  readonly search = signal('');
  readonly sortBy = signal<SortBy>('id');
  readonly sortOrder = signal<SortOrder>('ASC');
  readonly page = signal(1);
  readonly pageSize = signal(10);

  readonly error = signal('');
  readonly message = signal('');

  readonly formOpen = signal(false);
  readonly formMode = signal<FormMode>('create');
  readonly editingRow = signal<HomologoCrudUiRow | null>(null);

  readonly deleteTarget = signal<HomologoCrudUiRow | null>(null);

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.allItems();

    return this.allItems().filter((row) =>
      row.clave.toLowerCase().includes(q)
      || row.sustituto.toLowerCase().includes(q)
      || (row.claveDescripcion ?? '').toLowerCase().includes(q)
      || (row.sustitutoDescripcion ?? '').toLowerCase().includes(q)
      || row.factor.toLowerCase().includes(q)
    );
  });

  readonly sorted = computed(() => {
    const rows = [...this.filtered()];
    const field = this.sortBy();
    const order = this.sortOrder();

    rows.sort((a, b) => {
      const aValue = this.normalizeSortValue(a, field);
      const bValue = this.normalizeSortValue(b, field);
      const compare = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return order === 'ASC' ? compare : -compare;
    });

    return rows;
  });

  readonly total = computed(() => this.sorted().length);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  readonly pageItems = computed(() => {
    const start = (this.page() - 1) * this.pageSize();
    return this.sorted().slice(start, start + this.pageSize());
  });
  readonly pageButtons = computed(() => {
    const totalPages = this.totalPages();
    const currentPage = this.page();
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, start + 4);
    const pages: number[] = [];

    for (let value = Math.max(1, end - 4); value <= end; value += 1) {
      pages.push(value);
    }

    return pages;
  });
  readonly showingFrom = computed(() => (this.total() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1));
  readonly showingTo = computed(() => Math.min(this.total(), this.page() * this.pageSize()));
  readonly hasRows = computed(() => this.allItems().length > 0);
  readonly hasActiveSearch = computed(() => this.search().trim().length > 0);

  constructor() {
    this.loadAll();
  }

  loadAll(): void {
    this.loading.set(true);
    this.error.set('');

    this.api.listAllEnriched().subscribe({
      next: (rows) => {
        this.allItems.set(rows ?? []);
        this.ensureValidPage();
        this.loading.set(false);
      },
      error: (err) => {
        const message = err?.error?.error ?? 'No fue posible cargar las relaciones.';
        this.error.set(message);
        this.loading.set(false);
      },
    });
  }

  onSearchInput(value: string): void {
    this.search.set(value);
    this.page.set(1);
    this.message.set('');
  }

  clearSearch(): void {
    this.search.set('');
    this.page.set(1);
  }

  toggleSort(field: SortBy): void {
    if (this.sortBy() === field) {
      this.sortOrder.set(this.sortOrder() === 'ASC' ? 'DESC' : 'ASC');
    } else {
      this.sortBy.set(field);
      this.sortOrder.set('ASC');
    }

    this.page.set(1);
  }

  changePageSize(value: number | string): void {
    const parsed = Number(value);
    this.pageSize.set(Number.isFinite(parsed) && parsed > 0 ? parsed : 10);
    this.page.set(1);
  }

  goToPage(nextPage: number): void {
    if (nextPage < 1 || nextPage > this.totalPages()) return;
    this.page.set(nextPage);
  }

  openCreate(): void {
    this.formMode.set('create');
    this.editingRow.set(null);
    this.formOpen.set(true);
    this.message.set('');
    this.error.set('');
  }

  openEdit(row: HomologoCrudUiRow): void {
    this.formMode.set('edit');
    this.editingRow.set(row);
    this.formOpen.set(true);
    this.message.set('');
    this.error.set('');
  }

  closeForm(): void {
    if (this.saving()) return;
    this.formOpen.set(false);
    this.editingRow.set(null);
  }

  requestDelete(row: HomologoCrudUiRow): void {
    this.deleteTarget.set(row);
    this.message.set('');
    this.error.set('');
  }

  cancelDelete(): void {
    if (this.deleting()) return;
    this.deleteTarget.set(null);
  }

  saveRow(payload: HomologoCrudUpsertPayload): void {
    const factor = Number(payload.factor);
    if (!Number.isFinite(factor)) {
      this.error.set('El factor debe ser numérico.');
      return;
    }

    this.saving.set(true);
    this.error.set('');

    if (this.formMode() === 'create') {
      this.api.create({ ...payload, factor }).subscribe({
        next: () => {
          this.handleMutationSuccess('Relación creada correctamente.');
        },
        error: (err) => {
          this.handleMutationError(err?.error?.error ?? 'No fue posible crear la relación.');
        },
      });
      return;
    }

    const id = this.editingRow()?.id;
    if (!id) {
      this.handleMutationError('No se encontró el registro a editar.');
      return;
    }

    this.api.update(id, { ...payload, factor }).subscribe({
      next: () => {
        this.handleMutationSuccess('Relación actualizada correctamente.');
      },
      error: (err) => {
        this.handleMutationError(err?.error?.error ?? 'No fue posible actualizar la relación.');
      },
    });
  }

  confirmDelete(): void {
    const target = this.deleteTarget();
    if (!target) return;

    this.deleting.set(true);
    this.error.set('');

    this.api.delete(target.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deleteTarget.set(null);
        this.message.set('Relación eliminada correctamente.');
        this.toast.success({
          title: 'Relación eliminada',
          content: `Se eliminó la relación entre ${target.clave} y ${target.sustituto}.`,
          duration: 5,
        });
        this.loadAll();
      },
      error: (err) => {
        const message = err?.error?.error ?? 'No fue posible eliminar la relación.';
        this.deleting.set(false);
        this.error.set(message);
        this.toast.error({
          title: 'No se pudo eliminar',
          content: message,
          duration: 7,
        });
      },
    });
  }

  sortLabel(field: SortBy): string {
    if (this.sortBy() !== field) return '';
    return this.sortOrder() === 'ASC' ? '↑' : '↓';
  }

  private handleMutationSuccess(message: string): void {
    this.saving.set(false);
    this.formOpen.set(false);
    this.editingRow.set(null);
    this.message.set(message);
    this.toast.success({
      title: 'Operación exitosa',
      content: message,
      duration: 5,
    });
    this.loadAll();
  }

  private handleMutationError(message: string): void {
    this.saving.set(false);
    this.error.set(message);
    this.toast.error({
      title: 'Operación fallida',
      content: message,
      duration: 7,
    });
  }

  private ensureValidPage(): void {
    const totalPages = Math.max(1, Math.ceil(this.filtered().length / this.pageSize()));
    if (this.page() > totalPages) {
      this.page.set(totalPages);
    }
  }

  private normalizeSortValue(row: HomologoCrudUiRow, field: SortBy): number | string {
    if (field === 'id') return Number(row.id);
    if (field === 'factor') return Number(row.factor);
    return String(row[field] ?? '').toLowerCase();
  }
}
