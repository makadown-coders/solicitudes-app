import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  EventEmitter,
  inject,
  Input,
  OnInit,
  Output,
  signal,
} from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  History,
  Keyboard,
  Loader2,
  LucideAngularModule,
  Monitor as MonitorIcon,
  Network,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-angular';
import { Subject, debounceTime, distinctUntilChanged, from, switchMap } from 'rxjs';
import {
  AsignacionBitacoraRow,
  DispositivoDetail,
  EstadoDispositivo,
  Monitor,
  NicItem,
  NicKind,
  Periferico,
  TipoPeriferico,
  normalizeMac,
} from '../../../../models/ti-inventario.models';
import { TiCatalogosService } from '../../../../services/ti-catalogos.service';
import { TiDispositivosService } from '../../../../services/ti-dispositivos.service';
import {
  TiPersonaLite,
  TiPersonasService,
  TiUnidadMedicaItem,
} from '../../../../services/ti-personas.service';
import { ConfirmacionModalComponent } from '../../../../shared/confirmacion-modal/confirmacion-modal.component';

type DetailTab = 'resumen' | 'monitores' | 'perifericos' | 'historial';

@Component({
  selector: 'app-dispositivo-detail-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NgSelectModule,
    LucideAngularModule,
    ConfirmacionModalComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dispositivo-detail-modal.component.html',
})
export class DispositivoDetailModalComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly dispositivosSvc = inject(TiDispositivosService);
  private readonly catalogosSvc = inject(TiCatalogosService);
  private readonly tiPersonasSvc = inject(TiPersonasService);

  @Input({ required: true }) dispositivoId!: number;
  @Input() estados: EstadoDispositivo[] = [];

  @Output() closed = new EventEmitter<void>();
  @Output() updated = new EventEmitter<void>();

  readonly icons = {
    close: X,
    loader: Loader2,
    edit: Edit3,
    assign: ArrowLeftRight,
    monitor: MonitorIcon,
    periferico: Keyboard,
    history: History,
    network: Network,
    plus: Plus,
    trash: Trash2,
    download: Download,
    revert: RotateCcw,
    prev: ChevronLeft,
    next: ChevronRight,
  };

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMsg = signal<string | null>(null);
  readonly detail = signal<DispositivoDetail | null>(null);
  readonly activeTab = signal<DetailTab>('resumen');
  readonly tiposPeriferico = signal<TipoPeriferico[]>([]);

  // NICs list computed from detail
  readonly nicList = computed<NicItem[]>(() => {
    const d = this.detail();
    if (!d) return [];
    return d.macs ?? d.nics ?? [];
  });

  // Historial (Bitácora)
  readonly historial = signal<AsignacionBitacoraRow[]>([]);
  readonly historialTotal = signal(0);
  readonly historialPage = signal(1);
  readonly historialPageSize = signal(10);
  readonly historialLoading = signal(false);
  readonly historialFrom = signal('');
  readonly historialTo = signal('');
  private historialLoaded = false;

  readonly historialTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.historialTotal() / this.historialPageSize()))
  );

  // Sub-modal: Editar básico + MACs
  readonly showEditBasic = signal(false);
  readonly editNics = signal<NicItem[]>([]);
  readonly newMac = signal('');
  readonly newMacKind = signal<NicKind>('ethernet');
  readonly macError = signal<string | null>(null);

  readonly editBasicForm = this.fb.nonNullable.group({
    serial: [''],
    marca: [''],
    modelo: [''],
    ip: [''],
    conexion: [''],
    observaciones: [''],
  });

  // Sub-modal: Cambiar asignación
  readonly showAsignacion = signal(false);
  readonly unidades = signal<TiUnidadMedicaItem[]>([]);
  readonly loadingUnidades = signal(false);
  readonly unidadSearch$ = new Subject<string>();
  readonly personas = signal<TiPersonaLite[]>([]);
  readonly loadingPersonas = signal(false);
  readonly personaSearch$ = new Subject<string>();

  readonly asignacionForm = this.fb.group({
    unidad_medica_id: [null as number | null, Validators.required],
    persona_id: [null as number | null],
    estado_dispositivo_id: [null as number | null],
    fecha_asignacion: [this.todayIsoDate()],
    lugar_especifico: [''],
  });

  // Sub-modal: Monitor
  readonly showMonitorForm = signal(false);
  readonly editingMonitorId = signal<number | null>(null);
  readonly monitorError = signal<string | null>(null);
  readonly monitorForm = this.fb.nonNullable.group({
    serial: [''],
    marca: [''],
    modelo: [''],
    es_principal: [false],
  });

  // Sub-modal: Periférico
  readonly showPerifericoForm = signal(false);
  readonly editingPerifericoId = signal<number | null>(null);
  readonly perifericoForm = this.fb.group({
    tipo_id: [null as number | null, Validators.required],
    serial: [''],
    marca: [''],
    modelo: [''],
  });

  // Confirmación genérica
  readonly confirmState = signal<{
    titulo: string;
    mensaje: string;
    textoConfirmar: string;
    action: () => void;
  } | null>(null);

  ngOnInit(): void {
    this.loadDetail();
    this.catalogosSvc.tiposPeriferico().subscribe((list) => this.tiposPeriferico.set(list));
    this.setupSearchStreams();
  }

  private setupSearchStreams(): void {
    this.unidadSearch$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((term) => {
          this.loadingUnidades.set(true);
          return from(this.tiPersonasSvc.buscarUnidades({ q: term, page: 1, pageSize: 25 }));
        })
      )
      .subscribe({
        next: (res) => {
          this.unidades.set(res.items ?? []);
          this.loadingUnidades.set(false);
        },
        error: () => this.loadingUnidades.set(false),
      });

    this.personaSearch$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((term) => {
          this.loadingPersonas.set(true);
          return from(this.tiPersonasSvc.listarPersonas({ q: term, page: 1, pageSize: 25 }));
        })
      )
      .subscribe({
        next: (res) => {
          this.personas.set(res.items ?? []);
          this.loadingPersonas.set(false);
        },
        error: () => this.loadingPersonas.set(false),
      });
  }

  loadDetail(): void {
    this.loading.set(true);
    this.errorMsg.set(null);
    this.dispositivosSvc.getById(this.dispositivoId).subscribe({
      next: (d) => {
        this.detail.set(d);
        this.loading.set(false);
      },
      error: () => {
        this.errorMsg.set('No se pudo cargar el detalle del dispositivo.');
        this.loading.set(false);
      },
    });
  }

  selectTab(tab: DetailTab): void {
    this.activeTab.set(tab);
    if (tab === 'historial' && !this.historialLoaded) {
      this.historialLoaded = true;
      this.loadHistorial();
    }
  }

  // --- Cambio rápido de estado ---
  onQuickEstadoChange(estadoIdStr: string): void {
    const d = this.detail();
    const estadoId = Number(estadoIdStr);
    if (!d || !estadoId || this.saving()) return;

    const current = d.asignacion_actual;
    this.saving.set(true);
    this.dispositivosSvc
      .cambiarAsignacion(d.id, {
        unidad_medica_id: d.unidad_medica_id,
        persona_id: current?.persona_id ?? null,
        lugar_especifico: current?.lugar_especifico ?? (current?.persona_id ? null : 'sin asignar'),
        estado_dispositivo_id: estadoId,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.loadDetail();
          if (this.historialLoaded) this.loadHistorial();
          this.updated.emit();
        },
        error: () => {
          this.saving.set(false);
          this.errorMsg.set('No se pudo actualizar el estado del dispositivo.');
        },
      });
  }

  // --- Editar básico + MACs ---
  openEditBasic(): void {
    const d = this.detail();
    if (!d) return;
    this.editBasicForm.reset({
      serial: d.serial ?? '',
      marca: d.marca ?? '',
      modelo: d.modelo ?? '',
      ip: d.ip ?? '',
      conexion: d.conexion ?? '',
      observaciones: d.observaciones ?? '',
    });
    this.editNics.set([...this.nicList()]);
    this.newMac.set('');
    this.newMacKind.set('ethernet');
    this.macError.set(null);
    this.showEditBasic.set(true);
  }

  addMac(): void {
    const raw = this.newMac().trim();
    if (!raw) return;
    const norm = normalizeMac(raw);
    if (!norm) {
      this.macError.set('Dirección MAC inválida (requiere 12 dígitos hexadecimales).');
      return;
    }
    const exists = this.editNics().some(
      (n) => (n.mac_norm ?? normalizeMac(n.mac)) === norm
    );
    if (exists) {
      this.macError.set('Esa dirección MAC ya está en la lista.');
      return;
    }
    const kind = this.newMacKind();
    this.editNics.update((list) => [
      ...list,
      { mac: norm, mac_norm: norm, kind, iface_name: kind, en_uso: true },
    ]);
    this.newMac.set('');
    this.macError.set(null);
  }

  removeMac(index: number): void {
    this.editNics.update((list) => list.filter((_, i) => i !== index));
  }

  saveEditBasic(): void {
    const d = this.detail();
    if (!d || this.saving()) return;

    // Auto-agregar MAC pendiente si es válida (regla de ti-admin)
    if (this.newMac().trim()) {
      const norm = normalizeMac(this.newMac().trim());
      if (norm) {
        this.addMac();
      } else {
        this.macError.set('Corrija o limpie la dirección MAC pendiente antes de guardar.');
        return;
      }
    }

    const v = this.editBasicForm.getRawValue();
    this.saving.set(true);
    this.dispositivosSvc
      .updateBasic(d.id, {
        serial: v.serial.trim(),
        marca: v.marca.trim(),
        modelo: v.modelo.trim(),
        ip: v.ip.trim(),
        conexion: v.conexion.trim(),
        observaciones: v.observaciones.trim(),
        nics: this.editNics(),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.showEditBasic.set(false);
          this.loadDetail();
          this.updated.emit();
        },
        error: () => {
          this.saving.set(false);
          this.errorMsg.set('No se pudo guardar la edición del dispositivo.');
        },
      });
  }

  // --- Cambiar asignación ---
  openAsignacion(): void {
    const d = this.detail();
    if (!d) return;
    const cur = d.asignacion_actual;

    this.asignacionForm.reset({
      unidad_medica_id: d.unidad_medica_id,
      persona_id: cur?.persona_id ?? null,
      estado_dispositivo_id: cur?.estado_dispositivo_id ?? null,
      fecha_asignacion: this.todayIsoDate(),
      lugar_especifico: cur?.lugar_especifico ?? '',
    });

    from(this.tiPersonasSvc.buscarUnidades({ q: d.unidad_medica ?? '', page: 1, pageSize: 25 })).subscribe((r) => {
      const items = [...(r.items ?? [])];
      if (d.unidad_medica_id && !items.some((u) => u.id === d.unidad_medica_id)) {
        items.unshift({ id: d.unidad_medica_id, nombre: d.unidad_medica ?? `Unidad #${d.unidad_medica_id}` });
      }
      this.unidades.set(items);
    });

    from(
      this.tiPersonasSvc.listarPersonas({ q: cur?.persona_nombre_completo ?? cur?.persona ?? '', page: 1, pageSize: 25 })
    ).subscribe((r) => {
      const items = [...(r.items ?? [])];
      if (cur?.persona_id && !items.some((p) => p.id === cur.persona_id)) {
        items.unshift({
          id: cur.persona_id,
          nombre_completo: cur.persona_nombre_completo ?? cur.persona ?? `Persona #${cur.persona_id}`,
        });
      }
      this.personas.set(items);
    });

    this.showAsignacion.set(true);
  }

  saveAsignacion(): void {
    const d = this.detail();
    if (!d || this.asignacionForm.invalid || this.saving()) {
      this.asignacionForm.markAllAsTouched();
      return;
    }
    const v = this.asignacionForm.getRawValue();
    const personaId = v.persona_id ? Number(v.persona_id) : null;
    let lugar = (v.lugar_especifico ?? '').trim();
    if (!personaId && !lugar) {
      lugar = 'sin asignar';
    }

    this.saving.set(true);
    this.dispositivosSvc
      .cambiarAsignacion(d.id, {
        unidad_medica_id: Number(v.unidad_medica_id),
        persona_id: personaId,
        lugar_especifico: lugar || null,
        estado_dispositivo_id: v.estado_dispositivo_id ? Number(v.estado_dispositivo_id) : null,
        fecha_asignacion: v.fecha_asignacion ? new Date(v.fecha_asignacion).toISOString() : undefined,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.showAsignacion.set(false);
          this.loadDetail();
          if (this.historialLoaded) this.loadHistorial();
          this.updated.emit();
        },
        error: () => {
          this.saving.set(false);
          this.errorMsg.set('No se pudo actualizar la asignación.');
        },
      });
  }

  // --- Monitores ---
  openMonitorForm(m?: Monitor): void {
    this.editingMonitorId.set(m?.id ?? null);
    this.monitorError.set(null);
    this.monitorForm.reset({
      serial: m?.serial ?? '',
      marca: m?.marca ?? '',
      modelo: m?.modelo ?? '',
      es_principal: Boolean(m?.es_principal),
    });
    this.showMonitorForm.set(true);
  }

  saveMonitor(): void {
    const d = this.detail();
    if (!d || this.saving()) return;
    const v = this.monitorForm.getRawValue();
    if (!v.serial.trim() && !v.marca.trim() && !v.modelo.trim()) {
      this.monitorError.set('Capture al menos serial, marca o modelo.');
      return;
    }
    this.saving.set(true);
    this.dispositivosSvc
      .saveMonitor(d.id, {
        id: this.editingMonitorId() ?? undefined,
        serial: v.serial.trim(),
        marca: v.marca.trim(),
        modelo: v.modelo.trim(),
        es_principal: v.es_principal,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.showMonitorForm.set(false);
          this.loadDetail();
        },
        error: () => {
          this.saving.set(false);
          this.monitorError.set('No se pudo guardar el monitor.');
        },
      });
  }

  confirmDeleteMonitor(m: Monitor): void {
    if (!m.id) return;
    this.confirmState.set({
      titulo: 'Eliminar monitor',
      mensaje: `¿Desea eliminar el monitor ${m.marca || ''} ${m.modelo || ''} (${m.serial || 'sin serie'})?`,
      textoConfirmar: 'Eliminar',
      action: () => {
        this.dispositivosSvc.deleteMonitor(this.dispositivoId, m.id!).subscribe({
          next: () => this.loadDetail(),
          error: () => this.errorMsg.set('No se pudo eliminar el monitor.'),
        });
      },
    });
  }

  // --- Periféricos ---
  openPerifericoForm(p?: Periferico): void {
    this.editingPerifericoId.set(p?.id ?? null);
    this.perifericoForm.reset({
      tipo_id: p?.tipo_id ?? null,
      serial: p?.serial ?? '',
      marca: p?.marca ?? '',
      modelo: p?.modelo ?? '',
    });
    this.showPerifericoForm.set(true);
  }

  savePeriferico(): void {
    const d = this.detail();
    if (!d || this.perifericoForm.invalid || this.saving()) {
      this.perifericoForm.markAllAsTouched();
      return;
    }
    const v = this.perifericoForm.getRawValue();
    this.saving.set(true);
    this.dispositivosSvc
      .savePeriferico(d.id, {
        id: this.editingPerifericoId() ?? undefined,
        tipo_id: Number(v.tipo_id),
        serial: v.serial?.trim() || '',
        marca: v.marca?.trim() || '',
        modelo: v.modelo?.trim() || '',
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.showPerifericoForm.set(false);
          this.loadDetail();
        },
        error: () => {
          this.saving.set(false);
          this.errorMsg.set('No se pudo guardar el periférico.');
        },
      });
  }

  confirmDeletePeriferico(p: Periferico): void {
    if (!p.id) return;
    this.confirmState.set({
      titulo: 'Eliminar periférico',
      mensaje: `¿Desea eliminar el periférico ${p.tipo_nombre || p.tipo || ''} (${p.serial || 'sin serie'})?`,
      textoConfirmar: 'Eliminar',
      action: () => {
        this.dispositivosSvc.deletePeriferico(this.dispositivoId, p.id!).subscribe({
          next: () => this.loadDetail(),
          error: () => this.errorMsg.set('No se pudo eliminar el periférico.'),
        });
      },
    });
  }

  // --- Historial (Bitácora) ---
  loadHistorial(resetPage = false): void {
    if (resetPage) this.historialPage.set(1);
    this.historialLoading.set(true);
    this.dispositivosSvc
      .listAsignaciones(this.dispositivoId, {
        from: this.historialFrom() || null,
        to: this.historialTo() || null,
        page: this.historialPage(),
        pageSize: this.historialPageSize(),
      })
      .subscribe({
        next: (res) => {
          this.historial.set(res.items ?? []);
          this.historialTotal.set(res.total ?? 0);
          this.historialLoading.set(false);
        },
        error: () => {
          this.historial.set([]);
          this.historialLoading.set(false);
        },
      });
  }

  changeHistorialPage(delta: number): void {
    const next = this.historialPage() + delta;
    if (next < 1 || next > this.historialTotalPages()) return;
    this.historialPage.set(next);
    this.loadHistorial();
  }

  confirmRevert(row: AsignacionBitacoraRow): void {
    this.confirmState.set({
      titulo: 'Revertir asignación',
      mensaje: 'Se creará una nueva asignación restaurando el responsable, lugar y estado de este registro. ¿Desea continuar?',
      textoConfirmar: 'Revertir',
      action: () => {
        this.dispositivosSvc.revertAsignacion(this.dispositivoId, row.id).subscribe({
          next: () => {
            this.loadDetail();
            this.loadHistorial();
            this.updated.emit();
          },
          error: () => this.errorMsg.set('No se pudo revertir la asignación.'),
        });
      },
    });
  }

  exportHistorialCsv(): void {
    const rows = this.historial();
    if (!rows.length) return;
    const header = ['Desde', 'Hasta', 'Unidad', 'Responsable', 'Lugar', 'Estado', 'Observaciones'];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      header.map(escape).join(','),
      ...rows.map((r) =>
        [
          r.desde ?? r.fecha_asignacion ?? '',
          r.hasta ?? r.fecha_retiro ?? 'Vigente',
          r.unidad_medica ?? '',
          r.persona ?? '',
          r.lugar_especifico ?? '',
          r.estado_dispositivo ?? '',
          r.observaciones ?? '',
        ]
          .map(escape)
          .join(',')
      ),
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historial-dispositivo-${this.dispositivoId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  executeConfirm(): void {
    const state = this.confirmState();
    this.confirmState.set(null);
    state?.action();
  }

  private todayIsoDate(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
}
