import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  LucideAngularModule,
  MonitorSmartphone,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-angular';
import {
  DispositivoCreate,
  DispositivoRowEx,
  EstadoDispositivo,
  TipoDispositivo,
} from '../../../models/ti-inventario.models';
import { TiCatalogosService } from '../../../services/ti-catalogos.service';
import { TiDispositivosService } from '../../../services/ti-dispositivos.service';
import { DispositivoDetailModalComponent } from './components/dispositivo-detail-modal.component';
import { EquipoFormModalComponent } from './components/equipo-form-modal.component';

@Component({
  selector: 'app-ti-inventario-equipos-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LucideAngularModule,
    EquipoFormModalComponent,
    DispositivoDetailModalComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ti-inventario-equipos-page.component.html',
})
export class TiInventarioEquiposPageComponent implements OnInit {
  private readonly dispositivosSvc = inject(TiDispositivosService);
  private readonly catalogosSvc = inject(TiCatalogosService);

  readonly icons = {
    device: MonitorSmartphone,
    search: Search,
    clear: X,
    refresh: RefreshCw,
    plus: Plus,
    loader: Loader2,
    alert: AlertCircle,
    check: CheckCircle2,
    prev: ChevronLeft,
    next: ChevronRight,
  };

  readonly items = signal<DispositivoRowEx[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly errorMsg = signal<string | null>(null);
  readonly successMsg = signal<string | null>(null);

  // Filtros y paginación
  readonly q = signal('');
  readonly tipoId = signal<number | null>(null);
  readonly estadoId = signal<number | null>(null);
  readonly page = signal(1);
  readonly pageSize = signal(20);
  readonly pageSizeOptions = [10, 20, 50, 100];

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize()))
  );

  // Catálogos
  readonly tipos = signal<TipoDispositivo[]>([]);
  readonly estados = signal<EstadoDispositivo[]>([]);

  // Modales
  readonly showCreateModal = signal(false);
  readonly creating = signal(false);
  readonly selectedDispositivoId = signal<number | null>(null);

  ngOnInit(): void {
    this.loadCatalogos();
    this.loadItems();
  }

  private loadCatalogos(): void {
    this.catalogosSvc.tiposDispositivo().subscribe({
      next: (list) => this.tipos.set(list ?? []),
    });
    this.catalogosSvc.estadosDispositivo().subscribe({
      next: (list) => this.estados.set(list ?? []),
    });
  }

  loadItems(resetPage = false): void {
    if (resetPage) this.page.set(1);
    this.loading.set(true);
    this.errorMsg.set(null);

    this.dispositivosSvc
      .list({
        q: this.q().trim() || null,
        tipo_dispositivo_id: this.tipoId(),
        estado_dispositivo_id: this.estadoId(),
        page: this.page(),
        pageSize: this.pageSize(),
      })
      .subscribe({
        next: (res) => {
          this.items.set(res.items ?? []);
          this.total.set(res.total ?? 0);
          this.loading.set(false);
        },
        error: () => {
          this.errorMsg.set('No se pudo cargar el inventario de equipos.');
          this.loading.set(false);
        },
      });
  }

  clearFilters(): void {
    this.q.set('');
    this.tipoId.set(null);
    this.estadoId.set(null);
    this.loadItems(true);
  }

  changePage(delta: number): void {
    const next = this.page() + delta;
    if (next < 1 || next > this.totalPages()) return;
    this.page.set(next);
    this.loadItems();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(Number(size));
    this.loadItems(true);
  }

  onCreateEquipo(payload: DispositivoCreate): void {
    this.creating.set(true);
    this.errorMsg.set(null);
    this.dispositivosSvc.create(payload).subscribe({
      next: () => {
        this.creating.set(false);
        this.showCreateModal.set(false);
        this.showSuccess('Equipo registrado correctamente en el inventario.');
        this.loadItems(true);
      },
      error: () => {
        this.creating.set(false);
        this.errorMsg.set('No se pudo registrar el equipo. Verifique los datos e intente nuevamente.');
      },
    });
  }

  openDetail(row: DispositivoRowEx): void {
    this.selectedDispositivoId.set(row.id);
  }

  estadoBadgeClass(nombre?: string | null): string {
    const n = (nombre ?? '').toLowerCase();
    if (n.includes('uso')) return 'bg-emerald-100 text-emerald-800';
    if (n.includes('repar')) return 'bg-amber-100 text-amber-800';
    if (n.includes('resguardo')) return 'bg-sky-100 text-sky-800';
    if (n.includes('baja')) return 'bg-red-100 text-red-800';
    return 'bg-slate-100 text-slate-700';
  }

  private showSuccess(msg: string): void {
    this.successMsg.set(msg);
    setTimeout(() => {
      if (this.successMsg() === msg) this.successMsg.set(null);
    }, 4000);
  }
}
