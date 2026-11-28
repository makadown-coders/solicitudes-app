import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  EventEmitter,
  inject,
  Input,
  Injector,
  OnInit,
  Output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgSelectComponent, NgSelectModule } from '@ng-select/ng-select';
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
import { Subject, catchError, debounceTime, from, of, switchMap } from 'rxjs';
import {
  AsignacionBitacoraRow,
  CambiarAsignacionPayload,
  CAMPOS_TECNICOS_DISPOSITIVO,
  CampoTecnicoDispositivo,
  DispositivoDetail,
  DispositivoRowEx,
  DispositivoUpdateBasicPayload,
  EstadoDispositivo,
  Monitor,
  NicItem,
  NicKind,
  Periferico,
  TipoPeriferico,
  ValoresTecnicosDispositivo,
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
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly fb = inject(FormBuilder);
  private readonly dispositivosSvc = inject(TiDispositivosService);
  private readonly catalogosSvc = inject(TiCatalogosService);
  private readonly tiPersonasSvc = inject(TiPersonasService);

  @Input({ required: true }) dispositivoId!: number;
  @Input() listRow?: DispositivoRowEx;
  @Input() estados: EstadoDispositivo[] = [];

  @Output() closed = new EventEmitter<void>();
  @Output() updated = new EventEmitter<void>();
  @Output() datosTecnicosActualizados = new EventEmitter<void>();

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
  readonly editingEnabled = false;
  readonly historyEnabled = false;
  readonly currentAssignment = computed(() => {
    const assignment = this.detail()?.asignacion_actual;
    return assignment?.fecha_retiro == null ? assignment ?? null : null;
  });
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
  readonly editBasicError = signal<string | null>(null);
  readonly editBasicSuccess = signal(false);
  readonly editBasicConflict = signal(false);
  readonly editBasicConsultando = signal(false);
  readonly datosTecnicosActuales = signal<DispositivoDetail | null>(null);
  private editBasicOriginal: ValoresTecnicosDispositivo = {};
  readonly camposTecnicos = CAMPOS_TECNICOS_DISPOSITIVO;
  readonly etiquetasTecnicas: Record<CampoTecnicoDispositivo, string> = {
    serial: 'Serie', marca: 'Marca', modelo: 'Modelo', ip: 'IP',
    conexion: 'Conexión', observaciones: 'Observaciones',
  };
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
  readonly asignacionError = signal<string | null>(null);
  readonly asignacionSuccess = signal<string | null>(null);
  readonly asignacionEnConflicto = signal(false);
  readonly unidadSeleccionada = signal<TiUnidadMedicaItem | null>(null);
  readonly personaSeleccionada = signal<TiPersonaLite | null>(null);
  private readonly unidadAsignacionSelect = viewChild<NgSelectComponent>('unidadAsignacionSelect');
  private readonly personaAsignacionSelect = viewChild<NgSelectComponent>('personaAsignacionSelect');
  private asignacionOriginal: CambiarAsignacionPayload | null = null;
  readonly unidades = signal<TiUnidadMedicaItem[]>([]);
  readonly loadingUnidades = signal(false);
  readonly unidadSearch$ = new Subject<string>();
  readonly personas = signal<TiPersonaLite[]>([]);
  readonly loadingPersonas = signal(false);
  readonly personaSearch$ = new Subject<string>();

  readonly asignacionForm = this.fb.group({
    unidad_medica_id: [null as number | null, Validators.required],
    persona_id: [null as number | null],
    estado_dispositivo_id: [null as number | null, Validators.required],
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
    textoCancelar?: string;
    action: () => void;
  } | null>(null);

  ngOnInit(): void {
    this.loadDetail();
    this.setupSearchStreams();
    if (this.editingEnabled) {
      this.catalogosSvc.tiposPeriferico().subscribe((list) => this.tiposPeriferico.set(list));
    }
  }

  private setupSearchStreams(): void {
    this.unidadSearch$
      .pipe(
        debounceTime(250),
        switchMap((term) => {
          this.loadingUnidades.set(true);
          return from(this.tiPersonasSvc.buscarUnidades({ q: term, page: 1, pageSize: 25 }))
            .pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (res) => {
          if (res) this.unidades.set(this.incluirSeleccion(res.items, this.unidadSeleccionada()));
          this.loadingUnidades.set(false);
        },
        error: () => this.loadingUnidades.set(false),
      });

    this.personaSearch$
      .pipe(
        debounceTime(250),
        switchMap((term) => {
          this.loadingPersonas.set(true);
          return from(this.tiPersonasSvc.listarPersonas({ q: term, page: 1, pageSize: 25 }))
            .pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (res) => {
          if (res) {
            const actual = this.personaSeleccionada();
            const encontrada = res.items.find((persona) => persona.id === actual?.id);
            if (encontrada) this.personaSeleccionada.set(encontrada);
            this.personas.set(this.incluirSeleccion(res.items, this.personaSeleccionada()));
          }
          this.loadingPersonas.set(false);
        },
        error: () => this.loadingPersonas.set(false),
      });
  }

  loadDetail(reabrirAsignacion = false): void {
    this.loading.set(true);
    this.errorMsg.set(null);
    this.dispositivosSvc.getById(this.dispositivoId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (d) => {
        this.detail.set(d);
        this.loading.set(false);
        if (reabrirAsignacion && this.showAsignacion()) this.openAsignacion();
      },
      error: () => {
        this.errorMsg.set('No se pudo cargar el detalle del dispositivo.');
        if (reabrirAsignacion) this.asignacionError.set('No se pudieron consultar los datos actuales. El formulario conserva lo capturado.');
        this.loading.set(false);
      },
    });
  }

  selectTab(tab: DetailTab): void {
    if (tab === 'historial' && !this.historyEnabled) return;
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
    if (!d || this.loading() || this.saving()) return;
    this.precargarDatosTecnicos(d);
    this.showEditBasic.set(true);
  }

  private precargarDatosTecnicos(d: DispositivoDetail): void {
    this.editBasicOriginal = {
      serial: d.serial ?? null, marca: d.marca ?? null, modelo: d.modelo ?? null,
      ip: d.ip ?? null, conexion: d.conexion ?? null, observaciones: d.observaciones ?? null,
    };
    this.editBasicForm.reset({
      serial: d.serial ?? '',
      marca: d.marca ?? '',
      modelo: d.modelo ?? '',
      ip: d.ip ?? '',
      conexion: d.conexion ?? '',
      observaciones: d.observaciones ?? '',
    });
    this.editBasicError.set(null);
    this.editBasicSuccess.set(false);
    this.editBasicConflict.set(false);
    this.datosTecnicosActuales.set(null);
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

  private cambiosDatosTecnicos(): DispositivoUpdateBasicPayload {
    const valores = this.editBasicForm.getRawValue();
    const cambios: DispositivoUpdateBasicPayload = {};
    const expected_values: ValoresTecnicosDispositivo = {};
    const clear_fields: CampoTecnicoDispositivo[] = [];
    for (const campo of this.camposTecnicos) {
      const original = this.editBasicOriginal[campo] ?? null;
      const capturado = valores[campo];
      const nuevo = capturado.trim();
      if (capturado === (original ?? '') || nuevo === (original ?? '') || (nuevo !== '' && nuevo === original?.trim())) continue;
      expected_values[campo] = original;
      if (nuevo === '') clear_fields.push(campo);
      else cambios[campo] = nuevo;
    }
    if (clear_fields.length) cambios.clear_fields = clear_fields;
    if (Object.keys(expected_values).length) cambios.expected_values = expected_values;
    return cambios;
  }

  tieneCambiosDatosTecnicos(): boolean {
    return this.cambiosDatosTecnicos().expected_values !== undefined;
  }

  consultarDatosTecnicos(): void {
    if (!this.editBasicConflict() || this.editBasicConsultando()) return;
    this.editBasicConsultando.set(true);
    this.dispositivosSvc.getById(this.dispositivoId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (d) => {
        this.editBasicConsultando.set(false);
        this.detail.set(d);
        this.datosTecnicosActuales.set(d);
      },
      error: () => {
        this.editBasicConsultando.set(false);
        this.editBasicError.set('No se pudieron consultar los datos actuales. Se conservó lo capturado.');
      },
    });
  }

  usarDatosTecnicosActuales(): void {
    const actuales = this.datosTecnicosActuales();
    if (actuales) this.precargarDatosTecnicos(actuales);
  }

  cerrarEditBasic(): void {
    if (!this.showEditBasic() || this.editBasicConsultando()) return;
    this.solicitarCierreFormulario(this.tieneCambiosDatosTecnicos(), () => this.showEditBasic.set(false));
  }

  cerrarAsignacion(): void {
    if (!this.showAsignacion()) return;
    this.solicitarCierreFormulario(this.cambioBorradorAsignacion(), () => this.showAsignacion.set(false));
  }

  cerrarDetalle(): void {
    if (this.saving() || this.showEditBasic() || this.showAsignacion() || this.confirmState()) return;
    this.closed.emit();
  }

  private solicitarCierreFormulario(cambios: boolean, cerrar: () => void): void {
    if (this.saving() || this.confirmState()) return;
    if (!cambios) {
      cerrar();
      return;
    }
    this.confirmState.set({
      titulo: '¿Descartar los cambios?',
      mensaje: 'Tienes cambios sin guardar. Si cierras este formulario, perderás la información capturada.',
      textoCancelar: 'Continuar editando',
      textoConfirmar: 'Descartar cambios',
      action: () => {
        if (!this.saving()) cerrar();
      },
    });
  }

  saveEditBasic(): void {
    const d = this.detail();
    if (!d || !this.showEditBasic() || this.saving() || this.confirmState() || this.editBasicConflict() || this.editBasicForm.invalid) return;
    const payload = this.cambiosDatosTecnicos();
    if (!payload.expected_values) return;
    this.saving.set(true);
    this.editBasicError.set(null);
    this.dispositivosSvc.updateBasic(d.id, payload).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.showEditBasic.set(false);
        this.editBasicSuccess.set(true);
        this.loadDetail();
        this.datosTecnicosActualizados.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        if (err.status === 409) {
          this.editBasicConflict.set(true);
          this.editBasicError.set('Otro usuario modificó los datos técnicos. Consulte los valores actuales antes de continuar.');
          return;
        }
        const mensaje = err.error?.error;
        this.editBasicError.set(typeof mensaje === 'string' && err.status < 500
          ? mensaje : 'No se pudo guardar la edición del dispositivo. Intente nuevamente.');
      },
    });
  }

  // --- Cambiar asignación ---
  openAsignacion(): void {
    const d = this.detail();
    if (!d || this.loading() || this.saving()) return;
    const cur = this.currentAssignment();
    const unidad = {
      id: d.unidad_medica_id,
      nombre: this.nombreUnidad(d.unidad_medica_id),
    };
    const persona = cur?.persona_id == null ? null : {
      id: cur.persona_id,
      nombre_completo: cur.nombre_completo ?? `Persona #${cur.persona_id}`,
      unidad_medica_id: cur.persona_unidad_medica_id,
    };

    this.asignacionForm.reset({
      unidad_medica_id: unidad.id,
      persona_id: persona?.id ?? null,
      estado_dispositivo_id: cur?.estado_dispositivo_id ?? null,
      lugar_especifico: cur?.lugar_especifico ?? '',
    });
    this.asignacionOriginal = this.payloadAsignacion();
    this.unidadSeleccionada.set(unidad);
    this.personaSeleccionada.set(persona);
    this.unidades.set([unidad]);
    this.personas.set(persona ? [persona] : []);
    this.asignacionError.set(null);
    this.asignacionSuccess.set(null);
    this.asignacionEnConflicto.set(false);
    this.showAsignacion.set(true);
    this.unidadSearch$.next('');
    this.personaSearch$.next(persona?.nombre_completo ?? '');
    afterNextRender(() => {
      if (!this.showAsignacion()) return;
      this.unidadAsignacionSelect()?.writeValue(this.unidadSeleccionada()?.id ?? null);
      this.personaAsignacionSelect()?.writeValue(this.personaSeleccionada()?.id ?? null);
    }, { injector: this.injector });
  }

  cambiarUnidadAsignacion(unidad?: TiUnidadMedicaItem): void {
    this.unidadSeleccionada.set(unidad ?? null);
    this.asignacionForm.controls.unidad_medica_id.setValue(unidad?.id ?? null);
  }

  cambiarPersonaAsignacion(persona?: TiPersonaLite): void {
    this.personaSeleccionada.set(persona ?? null);
    this.asignacionForm.controls.persona_id.setValue(persona?.id ?? null);
  }

  private incluirSeleccion<T extends { id: number }>(items: T[], seleccionado: T | null): T[] {
    return seleccionado && !items.some((item) => item.id === seleccionado.id)
      ? [seleccionado, ...items] : items;
  }

  private nombreUnidad(id: number): string {
    const d = this.detail();
    return (d?.unidad_medica_id === id ? d.unidad_medica : null)
      || (this.listRow?.unidad_medica_id === id ? this.listRow.unidad_medica : null)
      || `Unidad #${id}`;
  }

  private payloadAsignacion(): CambiarAsignacionPayload {
    const v = this.asignacionForm.getRawValue();
    return {
      unidad_medica_id: v.unidad_medica_id,
      persona_id: v.persona_id,
      lugar_especifico: v.lugar_especifico?.trim() || (v.persona_id == null ? 'sin asignar' : null),
      estado_dispositivo_id: v.estado_dispositivo_id,
      asignacion_vigente_esperada_id: this.currentAssignment()?.id ?? null,
    };
  }

  tieneCambiosAsignacion(): boolean {
    return this.currentAssignment() === null || !this.asignacionOriginal || this.cambioBorradorAsignacion();
  }

  private cambioBorradorAsignacion(): boolean {
    const original = this.asignacionOriginal;
    const nuevo = this.payloadAsignacion();
    return !!original && (nuevo.unidad_medica_id !== original.unidad_medica_id
      || nuevo.persona_id !== original.persona_id
      || nuevo.lugar_especifico !== original.lugar_especifico
      || nuevo.estado_dispositivo_id !== original.estado_dispositivo_id);
  }

  estadosIncluyen(id: number): boolean {
    return this.estados.some((estado) => estado.id === id);
  }

  saveAsignacion(): void {
    const d = this.detail();
    if (!d || !this.showAsignacion() || this.loading() || this.saving() || this.confirmState()
        || this.asignacionEnConflicto() || this.asignacionForm.invalid || !this.tieneCambiosAsignacion()) return;
    const payload = this.payloadAsignacion();
    if (payload.unidad_medica_id === d.unidad_medica_id) {
      this.enviarAsignacion(d.id, payload);
      return;
    }

    const destino = this.unidadSeleccionada();
    if (!destino) return;
    const responsable = this.personaSeleccionada();
    let aviso = 'El equipo quedará sin responsable.';
    if (responsable) {
      const unidadResponsable = responsable.unidad_medica_id;
      const compatibilidad = unidadResponsable === destino.id
        ? 'Pertenece a la unidad destino.'
        : unidadResponsable != null
          ? 'Pertenece a una unidad distinta de la unidad destino.'
          : 'Su unidad de adscripción no está disponible para verificarla.';
      aviso = `Se conservará como responsable a ${responsable.nombre_completo}. ${compatibilidad} Puede cancelar para cambiarlo.`;
    }
    this.confirmState.set({
      titulo: 'Confirmar traslado',
      mensaje: `Origen: ${this.nombreUnidad(d.unidad_medica_id)}. Destino: ${destino.nombre}. ${aviso}`,
      textoConfirmar: 'Confirmar traslado',
      action: () => this.enviarAsignacion(d.id, payload),
    });
  }

  private enviarAsignacion(id: number, payload: CambiarAsignacionPayload): void {
    if (this.saving() || !this.showAsignacion() || this.asignacionEnConflicto()) return;
    this.saving.set(true);
    this.asignacionError.set(null);
    this.dispositivosSvc.cambiarAsignacion(id, payload).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.showAsignacion.set(false);
        this.asignacionSuccess.set('Asignación actualizada correctamente.');
        this.loadDetail();
        this.updated.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        if (err.status === 409 && err.error?.codigo !== 'UNIDAD_INCONSISTENTE') {
          this.asignacionEnConflicto.set(true);
          this.asignacionError.set('Otro usuario modificó el equipo. Consulte los datos actuales antes de guardar.');
          return;
        }
        const mensaje = err.error?.error;
        this.asignacionError.set(typeof mensaje === 'string' && err.status < 500
          ? mensaje : 'No se pudo actualizar la asignación. Intente nuevamente.');
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

}
