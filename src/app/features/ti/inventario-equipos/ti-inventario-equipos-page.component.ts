import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  Injector,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NgSelectComponent, NgSelectModule } from '@ng-select/ng-select';
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
import { Subject, catchError, debounceTime, distinctUntilChanged, from, of, switchMap } from 'rxjs';
import {
  DispositivoCreate,
  DispositivoRowEx,
  EstadoDispositivo,
  TipoDispositivo,
} from '../../../models/ti-inventario.models';
import { TiCatalogosService } from '../../../services/ti-catalogos.service';
import { TiDispositivosService } from '../../../services/ti-dispositivos.service';
import { TiPersonasService, TiUnidadMedicaItem } from '../../../services/ti-personas.service';
import { EquipoFormModalComponent } from './components/equipo-form-modal.component';
import { DispositivoDetailModalComponent } from './components/dispositivo-detail-modal.component';

const DEFAULT_UNIDAD_MEDICA_ID = 177;

@Component({
  selector: 'app-ti-inventario-equipos-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NgSelectModule,
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
  private readonly tiPersonasSvc = inject(TiPersonasService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

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
  readonly selectedDevice = signal<DispositivoRowEx | null>(null);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly errorMsg = signal<string | null>(null);
  readonly successMsg = signal<string | null>(null);

  // Filtros y paginación
  readonly q = signal('');
  readonly unidadMedicaId = signal<number | null>(null);
  private readonly unidadSelect = viewChild<NgSelectComponent>('unidadSelect');
  readonly tipoId = signal<number | null>(null);
  readonly estadoId = signal<number | null>(null);
  readonly page = signal(1);
  readonly pageSize = signal(20);
  readonly pageSizeOptions = [10, 20, 50, 100];

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize()))
  );

  readonly hasActiveFilters = computed(
    () => Boolean(this.q().trim() || this.unidadMedicaId() || this.tipoId() || this.estadoId())
  );

  // Catálogos y búsqueda remota de unidades
  readonly tipos = signal<TipoDispositivo[]>([]);
  readonly estados = signal<EstadoDispositivo[]>([]);
  readonly tiposError = signal<string | null>(null);
  readonly estadosError = signal<string | null>(null);
  readonly unidades = signal<TiUnidadMedicaItem[]>([]);
  readonly loadingUnidades = signal(false);
  readonly initializingUnidad = signal(true);
  readonly unidadInicialError = signal<string | null>(null);
  readonly unidadSearch$ = new Subject<string>();

  // Búsqueda reactiva con debounce y protección contra respuestas fuera de orden
  private readonly qSearch$ = new Subject<string>();
  private readonly loadTrigger$ = new Subject<void>();

  // Modal de alta
  readonly showCreateModal = signal(false);
  readonly creating = signal(false);
  readonly createError = signal<string | null>(null);

  ngOnInit(): void {
    this.setupStreams();
    this.loadCatalogos();
    this.initializeUnidad();
  }

  private setupStreams(): void {
    this.qSearch$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadItems(true));

    this.unidadSearch$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((term) => {
          this.loadingUnidades.set(true);
          return from(this.tiPersonasSvc.buscarUnidades({ q: term, page: 1, pageSize: 25 })).pipe(
            catchError(() => of({ items: [], page: 1, pageSize: 25, total: 0 }))
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((res) => {
        this.unidades.set(res.items ?? []);
        this.loadingUnidades.set(false);
      });

    this.loadTrigger$
      .pipe(
        switchMap(() => {
          this.loading.set(true);
          this.errorMsg.set(null);
          return this.dispositivosSvc
            .list({
              q: this.q().trim() || null,
              unidad_medica_id: this.unidadMedicaId(),
              tipo_dispositivo_id: this.tipoId(),
              estado_dispositivo_id: this.estadoId(),
              page: this.page(),
              pageSize: this.pageSize(),
            })
            .pipe(
              catchError(() => {
                this.items.set([]);
                this.total.set(0);
                this.errorMsg.set('No se pudo cargar el inventario de equipos.');
                this.loading.set(false);
                return of(null);
              })
            );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((res) => {
        if (!res) return;
        if (!res.items?.length && this.page() > 1) {
          this.page.update((page) => page - 1);
          this.loadItems();
          return;
        }
        this.items.set(res.items ?? []);
        this.total.set(res.total ?? 0);
        this.loading.set(false);
      });
  }

  private loadCatalogos(): void {
    this.catalogosSvc
      .tiposDispositivo()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => this.tipos.set(list ?? []),
        error: () => this.tiposError.set('No se pudieron cargar los tipos de dispositivo.'),
      });

    this.catalogosSvc
      .estadosDispositivo()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => this.estados.set(list ?? []),
        error: () => this.estadosError.set('No se pudieron cargar los estados de dispositivo.'),
      });
  }

  private async initializeUnidad(): Promise<void> {
    const pageSize = 100;
    let initialOptions: TiUnidadMedicaItem[] = [];
    try {
      for (let page = 1; ; page++) {
        const result = await this.tiPersonasSvc.buscarUnidades({ page, pageSize });
        if (this.destroyRef.destroyed) return;
        if (page === 1) initialOptions = result.items.slice(0, 25);

        const unidad = result.items.find((item) => item.id === DEFAULT_UNIDAD_MEDICA_ID);
        if (unidad) {
          this.unidadMedicaId.set(unidad.id);
          this.unidades.set(initialOptions.some((item) => item.id === unidad.id)
            ? initialOptions
            : [unidad, ...initialOptions]);
          afterNextRender(() => {
            if (this.unidadMedicaId() === unidad.id) this.unidadSelect()?.writeValue(unidad.id);
          }, { injector: this.injector });
          return;
        }
        if (result.items.length === 0 || page * result.pageSize >= result.total) break;
      }
    } catch {
      // Si falla una página del catálogo, conservar las opciones ya recuperadas.
    } finally {
      if (!this.destroyRef.destroyed) {
        if (this.unidadMedicaId() === null) {
          this.unidades.set(initialOptions);
          this.unidadInicialError.set('No se pudo recuperar la unidad predeterminada. Puede seleccionar otra unidad.');
        }
        this.initializingUnidad.set(false);
        this.loadItems(true);
      }
    }
  }

  onSearchInput(value: string): void {
    this.q.set(value);
    this.qSearch$.next(value);
  }

  onUnidadChange(unidad: TiUnidadMedicaItem | null | undefined): void {
    const id = unidad?.id ?? null;
    if (id === this.unidadMedicaId()) return;
    this.unidadMedicaId.set(id);
    this.loadItems(true);
  }

  loadItems(resetPage = false): void {
    if (this.initializingUnidad()) return;
    if (resetPage) this.page.set(1);
    this.loadTrigger$.next();
  }

  clearFilters(): void {
    this.q.set('');
    this.unidadMedicaId.set(null);
    this.unidadSelect()?.writeValue(null);
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

  openCreateModal(): void {
    this.createError.set(null);
    this.showCreateModal.set(true);
  }

  closeCreateModal(): void {
    if (this.creating()) return;
    this.createError.set(null);
    this.showCreateModal.set(false);
  }

  onCreateEquipo(payload: DispositivoCreate): void {
    if (this.creating()) return;
    this.creating.set(true);
    this.createError.set(null);

    this.dispositivosSvc
      .create(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.creating.set(false);
          this.showCreateModal.set(false);
          this.showSuccess('Equipo registrado correctamente en el inventario.');
          this.loadItems(true);
        },
        error: (err: HttpErrorResponse) => {
          this.creating.set(false);
          const backendMsg = err?.error?.error || err?.error?.message;
          this.createError.set(
            backendMsg || 'No se pudo registrar el equipo. Verifique los datos e intente nuevamente.'
          );
        },
      });
  }

  estadoBadgeClass(nombre?: string | null): string {
    const n = (nombre ?? '').toLowerCase();
    if (!n) return 'bg-slate-100 text-slate-600';
    if (n.includes('uso')) return 'bg-emerald-100 text-emerald-800';
    if (n.includes('repar')) return 'bg-amber-100 text-amber-800';
    if (n.includes('resguardo')) return 'bg-sky-100 text-sky-800';
    if (n.includes('baja')) return 'bg-red-100 text-red-800';
    return 'bg-slate-100 text-slate-700';
  }

  onAsignacionActualizada(): void {
    this.showSuccess('Asignación actualizada correctamente.');
    this.loadItems();
  }

  onDatosTecnicosActualizados(): void {
    this.showSuccess('Datos técnicos actualizados correctamente.');
    this.loadItems();
  }

  private showSuccess(msg: string): void {
    this.successMsg.set(msg);
    setTimeout(() => {
      if (this.successMsg() === msg) this.successMsg.set(null);
    }, 4000);
  }
}
