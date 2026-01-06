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
import { RouterLink } from '@angular/router';
import { ArticulosService } from '../../../services/articulos.service';
import { ExcelService } from '../../../services/excel.service';
import { firstValueFrom } from 'rxjs';

/**
 * @deprecated Usar CargaCpmKitsComponent en su lugar
 * ¿Porqué? porque las tablas [kit_clave] ni [unidad_medica_kit] están en proceso de eliminación.
 * Probablemente este componente se refactorizará en el futuro.
 */
@Component({
  selector: 'app-admin-kits',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-kits.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminKitsComponent {

  private kitsSrv = inject(KitsService);
  private kitsClavesSrv = inject(KitsClavesService);
  private kitsUnidadesSrv = inject(KitsUnidadesService);
  private unidadesSrv = inject(UnidadesService);
  private fastToast = inject(NgFastToastService);
  private articulosSrv = inject(ArticulosService);
  private excelService = inject(ExcelService);

  // Estado general
  loadingKits = signal(false);
  kits = signal<Kit[]>([]);
  selectedKitId = signal<number | null>(null);
  exportandoKits = signal(false);

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

  // 🔹 NUEVO: filtro texto para unidades (aplica a disponibles y asignadas)
  filtroUnidades = signal('');

  // subtab derecha: 'claves' | 'unidades'
  rightTab = signal<'claves' | 'unidades'>('claves');

  // 🔹 NUEVO: mapa de artículos para sacar descripciones por clave
  private articulosMapa = signal<
    Record<string, { descripcion: string; presentacion?: string; categoria?: string | null }>
    | null
  >(null);

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

  // 🔹 NUEVO: puente para filtro de unidades
  get filtroUnidadesValue() {
    return this.filtroUnidades();
  }
  set filtroUnidadesValue(v: string) {
    this.filtroUnidades.set(v ?? '');
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
    if (!this.unidadesAsignadas()) return new Set<string>();

    return new Set(this.unidadesAsignadas().map(u => u.cluesimb));
  });

  // base: todas las unidades elegibles
  private unidadesDisponiblesBase = computed<UnidadMedica[]>(() => {
    const all = this.unidadesAll()
      .filter(u =>
        u.tipo_unidad?.toLocaleUpperCase() !== 'ALMACENES' &&
        (u.cluesimb ?? '').length > 3
      );
    const asignadas = this.unidadCluesAsignadas();
    return all.filter(u => !asignadas.has(u.cluesimb!));
  });

  // 🔹 NUEVO: filtro amigable por texto (CLUES, nombre, muni, localidad, tipo)
  private filtrarUnidadesLista(list: UnidadMedica[]): UnidadMedica[] {
    const term = this.filtroUnidades().trim().toLowerCase();
    if (!term) return list;

    return list.filter(u => {
      const clues = (u.cluesimb ?? '').toLowerCase();
      const nombre = (u.nombre_de_unidad ?? '').toLowerCase();
      const muni = (u.nombre_municipio ?? '').toLowerCase();
      const loc = (u.nombre_localidad ?? '').toLowerCase();
      const tipo = (u.tipo_unidad ?? '').toLowerCase();

      return (
        clues.includes(term) ||
        nombre.includes(term) ||
        muni.includes(term) ||
        loc.includes(term) ||
        tipo.includes(term)
      );
    });
  }

  // 👇 final: listas ya filtradas para la UI
  unidadesDisponibles = computed<UnidadMedica[]>(() => {
    return this.filtrarUnidadesLista(this.unidadesDisponiblesBase());
  });

  unidadesAsignadasFiltradas = computed<UnidadMedica[]>(() => {
    return this.filtrarUnidadesLista(this.unidadesAsignadas());
  });

  constructor() {
    this.loadKits();
    this.unidadesSrv.loadAllOnce();

    // 🔹 NUEVO: cargar mapa de artículos para descripciones por clave
    this.articulosSrv.getArticulosMapa().subscribe({
      next: (mapa) => this.articulosMapa.set(mapa),
      error: (err) => {
        console.error('Error cargando mapa de artículos en AdminKits', err);
        // si falla, simplemente no mostramos descripción
      },
    });
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

  // 🔹 NUEVO: descripción de la clave (máx 250 chars)
  getDescripcionClave(clave: string): string {
    const mapa = this.articulosMapa();
    if (!mapa) return '';
    const desc = mapa[clave]?.descripcion ?? '';
    return desc.length > 250 ? desc.slice(0, 250) + '…' : desc;
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
    // 👇 dejamos el tab como esté (persistencia de selección)
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

    // evitar duplicados en UI
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

    const yaExiste = this.claves().some(c => c.clave === clave);
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

    this.unidadesAsignadas.set(
      [...current, u].sort((a, b) => a.cluesimb!.localeCompare(b.cluesimb!))
    );

    const kit = this.currentKit();
    this.fastToast.success({
      title: 'Unidad asignada',
      content: `Se ha asignado ${u.cluesimb} — ${u.nombre_de_unidad} al kit ${kit?.codigo ?? ''}`,
      duration: 7,
    });
  }

  quitarUnidad(u: UnidadMedica) {
    this.unidadesAsignadas.set(
      this.unidadesAsignadas().filter(x => x.cluesimb !== u.cluesimb)
    );

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

    this.kitsUnidadesSrv.saveUnidadesByKit(kitId, clues).subscribe({
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

  async exportarExcelKits() {
    if (this.exportandoKits()) return;

    try {
      this.exportandoKits.set(true);

      const resp = await firstValueFrom(this.kitsSrv.getMatrix());
      const rows = resp.rows ?? [];

      if (!rows.length) {
        this.fastToast.warn({
          title: 'Sin datos',
          content: 'No se encontraron relaciones kit–clave para exportar.',
          duration: 5,
        });
        return;
      }

      // 1) Distintos kits y claves
      const kitsSet = new Set<string>();
      const clavesSet = new Set<string>();

      for (const r of rows) {
        if (r.kit_codigo) kitsSet.add(r.kit_codigo.trim());
        if (r.clave) clavesSet.add(r.clave.trim());
      }

      const kits = Array.from(kitsSet).sort();
      const claves = Array.from(clavesSet).sort();

      // 2) Mapa clave -> set de kits donde aplica
      const mapClaveKits = new Map<string, Set<string>>();
      for (const r of rows) {
        const clave = (r.clave || '').trim();
        const kit = (r.kit_codigo || '').trim();
        if (!clave || !kit) continue;

        if (!mapClaveKits.has(clave)) {
          mapClaveKits.set(clave, new Set<string>());
        }
        mapClaveKits.get(clave)!.add(kit);
      }

      // 3) Construir filas para el Excel
      const filas = claves.map(clave => ({
        clave,
        kitsAplica: Array.from(mapClaveKits.get(clave) ?? []).sort(),
      }));

      const mapaArticulos = this.articulosMapa();

      const nombre = `Catalogo_kits_${new Date().toISOString().slice(0, 10)}.xlsx`;

      await this.excelService.exportarCatalogoKits(
        nombre,
        kits,
        filas,
        mapaArticulos ?? undefined
      );

      this.fastToast.success({
        title: 'Catálogo exportado',
        content: `Se exportaron ${kits.length} kits y ${claves.length} claves.`,
        duration: 6,
      });
    } catch (err) {
      console.error('Error exportando catálogo de kits', err);
      this.fastToast.error({
        title: 'Error al exportar',
        content: 'Ocurrió un error al generar el Excel. Revisa la consola.',
        duration: 7,
      });
    } finally {
      this.exportandoKits.set(false);
    }
  }

}
