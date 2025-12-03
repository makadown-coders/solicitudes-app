import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Kit, UnidadMedica } from '../../../models';
import { KitClave } from '../../../models/KitClave';
import { UnidadAsignada } from '../../../models/UnidadAsignada';
import { KitsClavesService } from '../../../services/kits-claves.service';
import { KitsUnidadesService } from '../../../services/kits-unidades.service';
import { KitsService } from '../../../services/kits.service';
import { UnidadesService } from '../../../services/unidades.service';

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
  unidadesAsignadas = signal<UnidadAsignada[]>([]);
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

  // unidades disponibles vs asignadas para el kit actual (por cluesimb)
  unidadCluesAsignadas = computed(() => new Set(this.unidadesAsignadas().map(u => u.cluesimb)));

  unidadesDisponibles = computed<UnidadMedica[]>(() => {
    const all = this.unidadesAll();
    const asignadas = this.unidadCluesAsignadas();
    return all.filter(u => !asignadas.has(u.cluesimb!));
  });

  constructor() {
    this.loadKits();
    this.unidadesSrv.loadAllOnce();
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
    this.rightTab.set('claves');
    this.loadClaves(id);
    this.loadUnidadesKit(id);
  }

  crearKit() {
    const codigo = this.nuevoCodigo().trim();
    const nombre = this.nuevoNombre().trim();
    if (!codigo) return;

    this.kitsSrv.create({ codigo, nombre: nombre || null }).subscribe({
      next: kit => {
        this.kits.set([...this.kits(), kit].sort((a, b) => a.codigo.localeCompare(b.codigo)));
        this.nuevoCodigo.set('');
        this.nuevoNombre.set('');
      },
      error: err => console.error('Error creando kit:', err),
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
    if (!clave) return;

    this.kitsClavesSrv.addClave(kitId, { clave }).subscribe({
      next: row => {
        this.claves.set([...this.claves(), row].sort((a, b) => a.clave.localeCompare(b.clave)));
        this.nuevaClave.set('');
      },
      error: err => console.error('Error agregando clave:', err),
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
    if (current.some(x => x.cluesimb === u.cluesimb)) return;
    this.unidadesAsignadas.set([
      ...current,
      { unidad_medica_id: u.id, cluesimb: u.cluesimb!, nombre: u.nombre_de_unidad }
    ].sort((a, b) => a.cluesimb.localeCompare(b.cluesimb)));
  }

  quitarUnidad(u: UnidadAsignada) {
    this.unidadesAsignadas.set(this.unidadesAsignadas().filter(x => x.cluesimb !== u.cluesimb));
  }

  guardarUnidades() {
    const kitId = this.selectedKitId();
    if (!kitId) return;
    const clues = this.unidadesAsignadas().map(u => u.cluesimb);

    this.kitsUnidadesSrv.saveUnidadesByKit(kitId, clues).subscribe({
      next: () => {
        alert('Asignaciones guardadas correctamente');
      },
      error: err => {
        console.error('Error guardando unidades del kit:', err);
        alert('Error al guardar asignaciones');
      },
    });
  }

}
