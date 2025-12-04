import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Kit, UnidadMedica } from '../../../models';
import { KitClave } from '../../../models/KitClave';
import { KitsClavesService } from '../../../services/kits-claves.service';
import { KitsUnidadesService } from '../../../services/kits-unidades.service';
import { KitsService } from '../../../services/kits.service';
import { UnidadesService } from '../../../services/unidades.service';
import { NgFastToastService } from 'ng-fast-toast';

@Component({
  selector: 'app-admin-kits',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-kits.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminKitsComponent {

  private kitsSrv = inject(KitsService);
  private kitsClavesSrv = inject(KitsClavesService);
  private kitsUnidadesSrv = inject(KitsUnidadesService);
  private unidadesSrv = inject(UnidadesService);
  private fastToast = inject(NgFastToastService);

  // Estado general
  loadingKits = signal(false);
  kits = signal<Kit[]>([]);
  selectedKitId = signal<number | null>(null);

  // Form kit
  nuevoCodigo = signal('');
  nuevoNombre = signal('');
  filtroKits = signal('');

  // Claves
  loadingClaves = signal(false);
  claves = signal<KitClave[]>([]);
  nuevaClave = signal('');

  // Unidades
  loadingUnidadesKit = signal(false);
  unidadesAsignadas = signal<UnidadMedica[]>([]);
  // todas las unidades (UnidadesService)
  unidadesAll = this.unidadesSrv.unidadesAll;

  // subtab derecha: 'claves' | 'unidades'
  rightTab = signal<'claves' | 'unidades'>('claves');

  // 👇 propiedades puente para [(ngModel)]

  get filtroKitsValue() {
    return this.filtroKits();
  }
  set filtroKitsValue(v: string) {
    this.filtroKits.set(v ?? '');
  }

  get nuevoCodigoValue() {
    return this.nuevoCodigo();
  }
  set nuevoCodigoValue(v: string) {
    this.nuevoCodigo.set(v ?? '');
  }

  get nuevoNombreValue() {
    return this.nuevoNombre();
  }
  set nuevoNombreValue(v: string) {
    this.nuevoNombre.set(v ?? '');
  }

  get nuevaClaveValue() {
    return this.nuevaClave();
  }
  set nuevaClaveValue(v: string) {
    this.nuevaClave.set(v ?? '');
  }

  // computed: kits filtrados
  filteredKits = computed(() => {
    const q = this.filtroKits().trim().toLowerCase();
    const list = this.kits();
    if (!q) return list;
    return list.filter(k =>
      k.codigo.toLowerCase().includes(q) ||
      (k.nombre ?? '').toLowerCase().includes(q)
    );
  });

  currentKit = computed<Kit | null>(() => {
    const id = this.selectedKitId();
    if (!id) return null;
    return this.kits().find(k => k.id === id) ?? null;
  });

  // unidades disponibles vs asignadas para el kit actual (por cluesimb)
  unidadCluesAsignadas = computed(() => {
    if (!this.selectedKitId()) return new Set<string>();
    // this.unidadesAsignadas() PUEDE SER NULL!!!!!
    if (!this.unidadesAsignadas()) return new Set<string>();

    return new Set(this.unidadesAsignadas().map(u => u.cluesimb));
  });

  unidadesDisponibles = computed<UnidadMedica[]>(() => {
    const all = this.unidadesAll()
      .filter(u =>
        u.tipo_unidad?.toLocaleUpperCase() !== 'ALMACENES' && u.cluesimb!.length > 3);
    const asignadas = this.unidadCluesAsignadas();
    return all.filter(u => !asignadas.has(u.cluesimb!));
  });

  constructor() {
    this.loadKits();
    this.unidadesSrv.loadAllOnce();
  }

  unidadTooltip(u: UnidadMedica): string {
    const direccion = u.direccion ?? 'Sin dirección';
    const localidad = [
      u.nombre_municipio ?? '',
      u.nombre_localidad ?? ''
    ].filter(Boolean).join(', ');
    const tipo = u.tipo_unidad ?? 'Tipo no definido';

    return `Dirección: ${direccion}\n${localidad}\nTipo de unidad: ${tipo}`;
  }

  // ---------- KITS ----------

  loadKits() {
    this.loadingKits.set(true);
    this.kitsSrv.list().subscribe({
      next: (rows) => {
        this.kits.set(rows);
        this.loadingKits.set(false);
        if (!this.selectedKitId() && rows.length) {
          this.onSelectKit(rows[0].id);
        }
      },
      error: (err) => {
        console.error('Error cargando kits:', err);
        this.loadingKits.set(false);
      },
    });
  }

  onSelectKit(id: number) {
    if (this.selectedKitId() === id) return;
    this.selectedKitId.set(id);
    this.loadClaves(id);
    this.loadUnidadesKit(id);
  }

  crearKit() {
    const codigo = this.nuevoCodigo().trim();
    const nombre = this.nuevoNombre().trim();
    if (!codigo) {
      this.fastToast.warn({
        title: 'Código requerido',
        content: 'Captura un código para el kit.',
        duration: 4,
      });
      return;
    }

    // evitar duplicados en UI (y evitar que truene el unique index del backend)
    const yaExiste = this.kits().some(
      k => (k.codigo || '').toUpperCase() === codigo.toUpperCase()
    );
    if (yaExiste) {
      this.fastToast.error({
        title: 'Kit duplicado',
        content: `Ya existe un kit con el código ${codigo}.`,
        duration: 6,
      });
      return;
    }

    this.kitsSrv.create({ codigo, nombre: nombre || null }).subscribe({
      next: kit => {
        this.kits.set([...this.kits(), kit].sort((a, b) => a.codigo.localeCompare(b.codigo)));
        this.nuevoCodigo.set('');
        this.nuevoNombre.set('');
        this.fastToast.success({
          title: 'Kit creado',
          content: `Se creó el kit ${codigo}.`,
          duration: 4,
        });
      },
      error: err => {
        console.error('Error creando kit:', err);
        this.fastToast.error({
          title: 'Error al crear kit',
          content: 'Ocurrió un error al crear el kit. Revisa la consola.',
          duration: 7,
        });
      },
    });
  }

  borrarKit(kit: Kit) {
    if (!confirm(`¿Eliminar kit ${kit.codigo}?`)) return;
    this.kitsSrv.delete(kit.id).subscribe({
      next: () => {
        const updated = this.kits().filter(k => k.id !== kit.id);
        this.kits.set(updated);
        if (this.selectedKitId() === kit.id) {
          this.selectedKitId.set(updated[0]?.id ?? null);
          if (updated.length) {
            this.onSelectKit(updated[0].id);
          } else {
            this.claves.set([]);
            this.unidadesAsignadas.set([]);
          }
        }
      },
      error: err => console.error('Error eliminando kit:', err),
    });
  }

  // ---------- CLAVES ----------

  private loadClaves(kitId: number) {
    this.loadingClaves.set(true);
    this.kitsClavesSrv.listByKit(kitId).subscribe({
      next: rows => {
        this.claves.set(rows);
        this.loadingClaves.set(false);
      },
      error: err => {
        console.error('Error cargando claves de kit:', err);
        this.loadingClaves.set(false);
      },
    });
  }

  agregarClave() {
    const kitId = this.selectedKitId();
    if (!kitId) return;
    const clave = this.nuevaClave().trim();
    if (!clave) {
      this.fastToast.warn({
        title: 'Clave requerida',
        content: 'Captura una clave CNIS antes de agregarla.',
        duration: 4,
      });
      return;
    }

    // validar duplicado en UI
    const yaExiste = this.claves().some(
      c => c.clave === clave
    );
    if (yaExiste) {
      this.fastToast.warn({
        title: 'Clave duplicada',
        content: `La clave ${clave} ya está en este kit.`,
        duration: 5,
      });
      return;
    }

    this.kitsClavesSrv.addClave(kitId, { clave }).subscribe({
      next: row => {
        this.claves.set([...this.claves(), row].sort((a, b) => a.clave.localeCompare(b.clave)));
        this.nuevaClave.set('');
        this.fastToast.success({
          title: 'Clave agregada',
          content: `Se agregó la clave ${row.clave} al kit.`,
          duration: 4,
        });
      },
      error: err => {
        console.error('Error agregando clave:', err);
        this.fastToast.error({
          title: 'Error al agregar clave',
          content: 'Ocurrió un error al agregar la clave. Revisa la consola.',
          duration: 7,
        });
      },
    });
  }

  eliminarClave(c: KitClave) {
    const kitId = this.selectedKitId();
    if (!kitId) return;
    if (!confirm(`¿Eliminar clave ${c.clave} del kit?`)) return;

    this.kitsClavesSrv.deleteClave(kitId, c.id).subscribe({
      next: () => {
        this.claves.set(this.claves().filter(x => x.id !== c.id));
      },
      error: err => console.error('Error eliminando clave:', err),
    });
  }

  // ---------- UNIDADES ----------

  private loadUnidadesKit(kitId: number) {
    this.loadingUnidadesKit.set(true);
    this.kitsUnidadesSrv.getUnidadesByKit(kitId).subscribe({
      next: rows => {
        console.log('asignando a this.unidadesAsignadas:', rows);
        this.unidadesAsignadas.set(rows);
        this.loadingUnidadesKit.set(false);
      },
      error: err => {
        console.error('Error cargando unidades del kit:', err);
        this.loadingUnidadesKit.set(false);
      },
    });
  }

  agregarUnidad(u: UnidadMedica) {
    const current = this.unidadesAsignadas();

    if (current.some(x => x.cluesimb === u.cluesimb)) {
      const kit = this.currentKit();
      this.fastToast.warn({
        title: 'Ya asignada',
        content: `${u.cluesimb} — ${u.nombre_de_unidad} ya está asignada al kit ${kit?.codigo ?? ''}.`,
        duration: 5,
      });
      return;
    }
    
    this.unidadesAsignadas.set([
      ...current,
      u
    ].sort((a, b) => a.cluesimb!.localeCompare(b.cluesimb!)));

    const kit = this.currentKit();
    this.fastToast.success({
      title: 'Unidad asignada',
      content: `Se ha asignado ${u.cluesimb} — ${u.nombre_de_unidad} al kit ${kit?.codigo ?? ''}`,
      duration: 7,
    });
  }

  quitarUnidad(u: UnidadMedica) {
    this.unidadesAsignadas.set(this.unidadesAsignadas().filter(x => x.cluesimb !== u.cluesimb));

    const kit = this.currentKit();
    this.fastToast.warn({
      title: 'Unidad desasignada',
      content: `Se ha desasignado ${u.cluesimb} — ${u.nombre_de_unidad} del kit ${kit?.codigo ?? ''}`,
      duration: 5,
    });
  }

  guardarUnidades() {
    const kitId = this.selectedKitId();
    if (!kitId) return;
    const clues = this.unidadesAsignadas().map(u => u.cluesimb).filter(Boolean) as string[];

    this.kitsUnidadesSrv.saveUnidadesByKit(kitId, clues as string[]).subscribe({
      next: () => {
        const kit = this.currentKit();
        this.fastToast.success({
          title: 'Asignaciones guardadas',
          content: `Se guardaron las unidades asignadas para el kit ${kit?.codigo ?? ''}.`,
          duration: 5,
        });
      },
      error: err => {
        console.error('Error guardando unidades del kit:', err);
        this.fastToast.error({
          title: 'Error al guardar',
          content: 'Ocurrió un error al guardar las asignaciones. Revisa la consola.',
          duration: 7,
        });
      },
    });
  }
}
