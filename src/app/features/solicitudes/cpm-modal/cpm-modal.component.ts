// src/app/features/solicitudes/cpm-modal/cpm-modal.component.ts
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ArticulosService } from '../../../services/articulos.service';
import { ExistenciasTempService } from '../../../services/existencias-temp.service';
import { CpmEditorService } from '../../../services/cpm-editor.service'; // usa tu servicio actual de CPM
import { ArticuloSolicitud } from '../../../models/articulo-solicitud';
import { firstValueFrom } from 'rxjs';
import { aplicarFactorConversion, InventarioDisponibles } from '../../../models';
import { InventarioService } from '../../../services/inventario.service';
import { NgFastToastService } from 'ng-fast-toast';
import { TrazabilidadService } from '../../../services/trazabilidad.service';
import { Row } from '../Row';

type VistaCpm = 'todos' | 'sugeridos' | 'existenciaCero';

@Component({
  selector: 'app-cpm-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cpm-modal.component.html',
  styleUrls: ['./cpm-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CpmModalComponent {
  // ---------- Inputs/Outputs iguales al kit en lo posible ----------
  @Input({ required: true }) cluesimb!: string;
  @Input() tituloUnidad: string = '';
  @Input() mostrarUnidadEnTitulo = true;
  @Input() existingClaves: string[] = [];
  /** Inventario estatal por almacén (AZM/AZE/AZT) para enriquecer filas */
  @Input() inventarioDisponible: InventarioDisponibles[] = [];

  @Output() addToSolicitud = new EventEmitter<ArticuloSolicitud[]>();
  @Output() close = new EventEmitter<void>();

  // ---------- DI ----------
  private arts = inject(ArticulosService);
  private existApi = inject(ExistenciasTempService);
  private cpmApi = inject(CpmEditorService);
  private invSvc = inject(InventarioService);
  private toast = inject(NgFastToastService);
  private trazabilidadService = inject(TrazabilidadService);

  // ---------- UI state ----------
  loading = signal(true);
  busy = signal(false);
  filterText = signal('');
  mesesCobertura = signal(1);
  vista = signal<VistaCpm>('todos');

  hasUnidadExist = signal(false);
  totalClaves = computed(() => this.rows().length);
  conExistencias = computed(() => this.rows().filter(r => (r.exist ?? 0) > 0).length);
  sinExistencias = computed(() => Math.max(0, this.totalClaves() - this.conExistencias()));
  existenciasTotales = computed(() => this.rows().reduce((acc, r) => acc + (Number(r.exist ?? 0) || 0), 0));

  // helper formato
  fmt(n: number) { return (n ?? 0).toLocaleString('es-MX'); }

  private normClave(clave: string | null | undefined): string {
    return this.invSvc.normalizarClave((clave ?? '').toString().trim().toUpperCase());
  }

  // Si el reorden ya viene como TOTAL X meses, no multiplicamos otra vez.
  private reordenEsTotal = false;

  rows = signal<Row[]>([]);
  skeletonRows = Array.from({ length: 8 });
  selectedSet = new Set<string>();

  // Mensajes amigables post-import
  importMsg = signal<string>('');
  importDetail = signal<string>('');
  importIsError = signal<boolean>(false);

  ngOnInit() { this.cargar(); }

  private async cargar() {
    this.loading.set(true);
    try {
      // 1) Trae CPMs de la unidad (tal como haces en el editor de CPM)
      const cpmsResp = await firstValueFrom(this.cpmApi.getByUnidadAll(this.cluesimb));
      const rowsBase: Row[] = (cpmsResp?.rows ?? [])
        .filter(r => (r.cpm ?? 0) > 0)
        .map(r => ({ clave: this.normClave(r.clave_cnis), cpm: Number(r.cpm ?? 0) }));

      // 2) Enriquecer con mapa de artículos local
      const mapa = await firstValueFrom(this.arts.getArticulosMapaByCluesIMBCPM(this.cluesimb));
      const enriched = rowsBase.map(r => {
        const meta = mapa?.[r.clave];
        return { ...r, descripcion: meta?.descripcion ?? '', presentacion: meta?.presentacion ?? '' };
      });

      // 🔽 intenta cargar existencias de la unidad; si no hay, no mostramos columna
      let idx = new Map<string, number>();
      try {
        const ex = await firstValueFrom(this.existApi.byUnidad(this.cluesimb));

        const entries = await Promise.all(ex!.map(async x => {
          // obteniendo factor de conversion
          const factor = await this.trazabilidadService
            .getFactorConversionPorUnidad(x.clave_cnis, this.cluesimb);
          return [x.clave_cnis, aplicarFactorConversion(Number(x.existencia_total ?? 0), factor)] as const;
        }));
        idx = new Map<string, number>(entries);
      } catch { /* sin existencias es válido */ }

      const withExist = enriched.map(r => ({ ...r, exist: idx.get(r.clave) ?? 0 }));
      const withStores = withExist.map(r => {
        const { azm, aze, azt } = this.getAlmacenesFor(r.clave);
        return { ...r, azm, aze, azt };
      });
      this.rows.set(withStores);
      this.hasUnidadExist.set([...idx.values()].some(v => (v ?? 0) > 0));
    } finally {
      this.loading.set(false);
    }
  }

  /** Intenta obtener AZM/AZE/AZT para una clave sin asumir estructura exacta. */
  private getAlmacenesFor(clave: string): { azm: number; aze: number; azt: number } {
    const K = this.invSvc.normalizarClave(clave);
    let src: InventarioDisponibles[] = this.inventarioDisponible.filter(d => d.clave === K || d.clave === clave) ?? [];
    if (!src) return { azm: 0, aze: 0, azt: 0 };

    // establecer src como un array de valores unicos (por si acaso) de clave+existenciaAZM+existenciaAZE+existenciaAZT
    const seen = new Set<string>();
    src = src.filter(d => {
      const key = `${d.clave}|${d.existenciasAZM}|${d.existenciasAZE}|${d.existenciasAZT}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    let azm = 0, aze = 0, azt = 0;
    for (const r of src) {
      azm += r.existenciasAZM ?? 0;
      aze += r.existenciasAZE ?? 0;
      azt += r.existenciasAZT ?? 0;
    }
    return { azm, aze, azt };
  }

  suggestedCount = computed(() =>
    this.rows().filter(r => this.sugerencia(r) > 0).length
  );

  selectedZeroSuggestionCount = computed(() =>
    this.rows().filter(r => r._sel && this.sugerencia(r) <= 0).length
  );

  zeroExistCount = computed(() =>
    this.rows().filter(r => this.tieneExistenciaUnidadEnCero(r)).length
  );

  private tieneExistenciaUnidadEnCero(r: Row): boolean {
    return r.exist !== undefined && (Number(r.exist) || 0) === 0;
  }

  setVista(vista: VistaCpm) {
    this.vista.set(vista);
    this.pruneSelectionToVisibleRows();
  }

  setFilterText(value: string) {
    this.filterText.set(value);
    this.pruneSelectionToVisibleRows();
  }

  private pruneSelectionToVisibleRows() {
    const visibles = new Set(this.rowsFiltered().map(r => this.normClave(r.clave)));
    this.selectedSet = new Set([...this.selectedSet].filter(clave => visibles.has(clave)));
    this.rows.update(list => list.map(r => ({ ...r, _sel: this.selectedSet.has(this.normClave(r.clave)) })));
  }

  toggleSelUno(clave: string, checked: boolean) {
    const claveNorm = this.normClave(clave);
    if (checked) this.selectedSet.add(claveNorm); else this.selectedSet.delete(claveNorm);
    this.rows.update(list => list.map(r => this.normClave(r.clave) === claveNorm ? ({ ...r, _sel: checked }) : r));
  }

  rowsFiltered = computed(() => {
    const q = this.filterText().trim().toLowerCase();
    const byText = !q
      ? this.rows()
      : this.rows().filter(r =>
        r.clave.toLowerCase().includes(q) ||
        (r.descripcion ?? '').toLowerCase().includes(q) ||
        (r.presentacion ?? '').toLowerCase().includes(q)
      );

    switch (this.vista()) {
      case 'sugeridos':
        return byText.filter(r => this.sugerencia(r) > 0);
      case 'existenciaCero':
        return byText.filter(r => this.tieneExistenciaUnidadEnCero(r));
      default:
        return byText;
    }
  });

  // ---------- Cantidad final (anti-doble cobertura) ----------
  private factorPara(fuente: 'cpm' | 'reorden' | 'default') {
    return (fuente === 'reorden' && this.reordenEsTotal) ? 1 : Math.max(1, Math.floor(this.mesesCobertura() || 1));
  }

  private qtyPara(r: Row): { qty: number; fuente: 'cpm' | 'reorden' | 'default' } {
    const meses = Math.max(1, Math.floor(this.mesesCobertura() || 1));
    let base = 0;
    let fuente: 'cpm' | 'reorden' | 'default' = 'default';

    // CPM SIEMPRE debe ser >0 aquí, porque filtramos arriba.
    const cpm = Number(r.cpm ?? NaN);
    base = cpm;
    fuente = 'cpm';

    // if (!Number.isNaN(cpm) && cpm > 0) { base = cpm; fuente = 'cpm'; }
    //else { base = Number(this.defaultQtyNoCpm || 0); fuente = 'default'; }

    let reordenEsTotalLocal = false;
    // Si activaron existencias, calcula reorden = max(CPM*meses - exist, 0)
    //if (this.hasUnidadExist() && (r.exist ?? 0) >= 0) {

    // const totalCobertura = (cpm > 0 ? cpm : this.defaultQtyNoCpm) * meses;
    const totalCobertura = cpm * meses;
    const reorden = Math.max(0, Math.round(totalCobertura - (r.exist ?? 0)));
    if (reorden > 0) { base = reorden; fuente = 'reorden'; reordenEsTotalLocal = true; }
    else { base = 0; fuente = 'reorden'; reordenEsTotalLocal = true; }
    /*} else {
      this.reordenEsTotal = false;
    }*/

    const factor = 1; //(fuente === 'reorden' && this.reordenEsTotal) ? 1 : meses;
    const qty = Math.max(0, Math.round((Number(base) || 0) * factor));
    return { qty, fuente };
  }

  agregarSeleccion() {
    const seleccionadas = this.rows().filter(r => this.selectedSet.has(this.normClave(r.clave)));

    if (seleccionadas.length === 0) {
      this.importIsError.set(true);
      this.importMsg.set('Sin selección');
      this.importDetail.set('Elige al menos una clave.');
      this.procesarToastDesdeAgregarSeleccion();
      return;
    }

    const existentes = new Set((this.existingClaves || []).map(x => this.normClave(x)));

    const nuevos: ArticuloSolicitud[] = [];
    let omitidasPorDup = 0;
    let ajustadasPorQtyCero = 0;

    for (const r of seleccionadas) {
      const clave = this.normClave(r.clave);
      if (existentes.has(clave)) { omitidasPorDup++; continue; }
      const qtySugerida = this.sugerencia(r); // ya anti-doble y con cobertura
      const qty = qtySugerida > 0 ? qtySugerida : 1;
      const observaciones = qtySugerida > 0
        ? ''
        : 'Cantidad sugerida original en 0; se predetermino en 1 para permitir revision. Validar antes de exportar.';

      if (qtySugerida <= 0) ajustadasPorQtyCero++;

      nuevos.push({
        clave,
        descripcion: r.descripcion ?? '',
        unidadMedida: r.presentacion ?? '',
        presentacion: r.presentacion ?? '',
        cantidad: qty,
        cpm: Number(r.cpm ?? 0),
        observaciones,
      });
    }

    if (!nuevos.length) {
      this.importIsError.set(true);
      this.importMsg.set('Nada para agregar');
      const partes: string[] = [];
      //const partes2: string[] = [];
      if (omitidasPorDup > 0) partes.push(`${omitidasPorDup} duplicada${omitidasPorDup > 1 ? 's' : ''}`);
      // if (omitidasPorQty > 0) partes2.push(`${omitidasPorQty} sin cantidad (ajustar haciendo click en icono de edición)`);
      this.importDetail.set(partes.length ? `Omitidas: ${partes.join(' · ')}` : 'Verifica la selección.');
      this.procesarToastDesdeAgregarSeleccion();
      return;
    }

    // Mensaje de éxito al estilo kit-modal
    const agregadas = nuevos.length;
    const partes: string[] = [];
    const partes2: string[] = [];
    if (omitidasPorDup > 0) partes.push(`${omitidasPorDup} duplicada${omitidasPorDup > 1 ? 's' : ''}`);
    if (ajustadasPorQtyCero > 0) {
      partes2.push(`${ajustadasPorQtyCero} con cantidad sugerida 0 se agregaron con cantidad 1 para revision`);
    }
    const detalle = partes.length ? `Omitidas: ${partes.join(' · ')} / ` : '';
    const detalle2 = partes2.length ? `Aviso: ${partes2.join(' · ')}` : '';
    /*if (omitidasPorDup > 0) partes.push(`${omitidasPorDup} duplicada${omitidasPorDup > 1 ? 's' : ''}`);
    if (omitidasPorQty > 0) partes.push(`${omitidasPorQty} sin cantidad (ajustar haciendo click en icono de edición)`);
    const detalle = partes.length ? `Omitidas: ${partes.join(' · ')}` : '';*/

    this.importIsError.set(false);
    this.importMsg.set(`Se agregaron ${agregadas} clave${agregadas > 1 ? 's' : ''}.`);
    this.importDetail.set(detalle + (detalle2 ? ' · ' + detalle2 : ''));
    this.procesarToastDesdeAgregarSeleccion();

    // Cerrar siempre el modal aunque el handler del padre falle.
    try {
      this.addToSolicitud.emit(nuevos);
    } finally {
      this.close.emit();
    }
  }
  procesarToastDesdeAgregarSeleccion() {
    if (this.importMsg()) {
      if (this.importIsError()) {
        this.toast.warn({ title: this.importMsg(), content: this.importDetail(), duration: 7 });
      } else {
        this.toast.success({ title: this.importMsg(), content: this.importDetail(), duration: 7 });
      }
    }
  }

  setMesesCobertura($event: number) {
    this.mesesCobertura.set(Math.max(1, Math.floor($event || 1)));
  }

  seleccionarUnoToggle(clave: string, $event: Event) {
    const input = $event.target as HTMLInputElement;
    const claveNorm = this.normClave(clave);
    if (input.checked) this.selectedSet.add(claveNorm); else this.selectedSet.delete(claveNorm);
    this.rows.update(list => list.map(r => this.normClave(r.clave) === claveNorm ? ({ ...r, _sel: input.checked }) : r));
  }

  trackByClave(index: number, item: any): string {
    return item.clave;
  }

  /**
   * Sugerencia visible en la tabla: cantidad recomendada a agregar según CPM y existencias.
   */
  sugerencia(r: Row) { return this.qtyPara(r).qty; }

  /************************************************************************************/
  /*********************************** EXPORTACIONES A CSV ****************************/
  /************************************************************************************/
  private csvEscape(s: any) {
    const v = (s ?? '').toString().replace(/"/g, '""');
    return /[",\n]/.test(v) ? `"${v}"` : v;
  }

  private visibleHeaders(): string[] {
    const cols = ['Clave', 'Descripción', 'Presentación', 'CPM'];
    cols.push('Exist. unidad');
    if (this.hasAlmacenExist()) cols.push('AZM', 'AZE', 'AZT'); // ← NUEVO
    cols.push('Cant. sugerida');
    return cols;
  }

  private visibleRow(r: Row): any[] {
    const base = [r.clave, r.descripcion ?? '', r.presentacion ?? '', (r.cpm ?? 0)];
    base.push(r.exist ?? '');
    if (this.hasAlmacenExist()) base.push(r.azm ?? 0, r.aze ?? 0, r.azt ?? 0); // ← NUEVO
    base.push(this.sugerencia(r));
    return base;
  }

  copyVisible() {
    const headers = this.visibleHeaders();
    const lines = [headers.join('\t')];
    for (const r of this.rowsFiltered()) lines.push(this.visibleRow(r).join('\t'));
    const text = lines.join('\n');
    navigator.clipboard?.writeText(text).then(() => {
      // opcional: toast/alert
    });
  }

  exportCsvVisible() {
    const headers = this.visibleHeaders().map(h => this.csvEscape(h)).join(',');
    const rows = this.rowsFiltered()
      .map(r => this.visibleRow(r).map(v => this.csvEscape(v)).join(','))
      .join('\n');
    const csv = headers + '\n' + rows;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fecha = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `cpm-${this.cluesimb}-${fecha}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  hasAlmacenExist = computed(() =>
    this.rows().some(r => (r.azm || 0) + (r.aze || 0) + (r.azt || 0) > 0)
  );

  filteredCount = computed(() => this.rowsFiltered().length);

  selectionCount = computed(() => this.rows().filter(r => this.selectedSet.has(this.normClave(r.clave))).length);

  // Todas las visibles elegibles están seleccionadas
  allFilteredSelected = computed(() => {
    const eligibles = this.rowsFiltered();//.filter(r => this.sugerencia(r) > 0);
    if (eligibles.length === 0) return false;
    return eligibles.every(r => this.selectedSet.has(this.normClave(r.clave)));
  });

  // Algunas (pero no todas) visibles elegibles están seleccionadas
  someFilteredSelected = computed(() => {
    const eligibles = this.rowsFiltered();
    // if (eligibles.length === 0) return false;
    const selected = eligibles.filter(r => this.selectedSet.has(this.normClave(r.clave))).length;
    return selected > 0 && selected < eligibles.length;
  });

  toggleMasterSelection(checked: boolean) {
    const eligibles = this.rowsFiltered();
    const next = new Set(this.selectedSet);

    if (checked) {
      for (const r of eligibles) next.add(this.normClave(r.clave));
    } else {
      for (const r of eligibles) next.delete(this.normClave(r.clave));
    }

    this.selectedSet = next;
    // reflejar en _sel solo lo visible (más rápido y congruente con UI)
    this.rows.update(list => list.map(r =>
      eligibles.some(e => this.normClave(e.clave) === this.normClave(r.clave))
        ? ({ ...r, _sel: next.has(this.normClave(r.clave)) })
        : r
    ));
  }

}
