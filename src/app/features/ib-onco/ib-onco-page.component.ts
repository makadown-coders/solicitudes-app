// src/app/features/ib-onco/ib-onco-page.component.ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { LucideAngularModule, Download, Search, X } from 'lucide-angular';
import * as XLSX from 'xlsx';
import {
  IbOncoAbastoCpmRow,
  IbOncoCitaPendiente,
  IbOncoPaginatedResponse,
  IbOncoResumenUnidad,
  IbOncoUnidad,
} from '../../models/ib-onco';
import { IbOncoService } from '../../services/ib-onco.service';
import { CitasService } from '../../services/citas.service';
import { Cita } from '../../models/Cita';

interface IbOncoKpi {
  label: string;
  value: number;
}

type SortDirection = 'asc' | 'desc';
type AbastoSortKey = 'clave_cnis' | 'descripcion' | 'cpm' | 'existencias' | 'piezas_pendientes' | 'sobreabasto' | 'faltantes';
type CitaSortKey = 'orden_de_suministro' | 'proveedor' | 'tipo_de_entrega' | 'no_de_piezas_emitidas' | 'nombre_de_unidad' | 'fecha_limite_de_entrega' | 'estatus';

interface IbOncoEstatalRow {
  clave_cnis: string;
  descripcion?: string | null;
  cpm: number;
  existencias: number;
  piezas_pendientes: number;
}

interface SortState<T extends string> {
  key: T;
  direction: SortDirection;
}

@Component({
  selector: 'app-ib-onco-page',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './ib-onco-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IbOncoPageComponent {
  private ibOncoService = inject(IbOncoService);
  private citasService = inject(CitasService);
  private readonly estatalValue = '__ESTATAL__';

  readonly SearchIcon = Search;
  readonly XIcon = X;
  readonly DownloadIcon = Download;

  loadingInicial = signal(false);
  loadingClaves = signal(false);
  loadingModal = signal(false);
  loadingOrdenesDetalleEstatal = signal(false);
  exportando = signal(false);
  exportProgress = signal<string | null>(null);
  error = signal<string | null>(null);
  modalError = signal<string | null>(null);
  ordenesDetalleEstatalError = signal<string | null>(null);

  unidades = signal<IbOncoUnidad[]>([]);
  resumen = signal<IbOncoResumenUnidad[]>([]);
  abasto = signal<IbOncoPaginatedResponse<IbOncoAbastoCpmRow>>(this.emptyPage<IbOncoAbastoCpmRow>(1000));
  abastoEstatal = signal<IbOncoEstatalRow[]>([]);
  abastoEstatalDetalle = signal<IbOncoAbastoCpmRow[]>([]);
  ordenesRecientesDetalleEstatal = signal<Record<string, IbOncoCitaPendiente[]>>({});
  modalCitas = signal<IbOncoCitaPendiente[]>([]);

  cluesimb = signal('');
  search = signal('');
  windowDays = signal(120);
  selectedRow = signal<IbOncoAbastoCpmRow | null>(null);
  selectedEstatalRow = signal<IbOncoEstatalRow | null>(null);
  selectedAnalysisType = signal<'sobreabasto' | 'faltantes' | 'recientes'>('faltantes');
  checkedCitas = signal<number[]>([]);
  abastoSort = signal<SortState<AbastoSortKey> | null>({ key: 'clave_cnis', direction: 'asc' });
  citasSort = signal<SortState<CitaSortKey> | null>(null);

  unidadSeleccionada = computed(() =>
    this.unidades().find(unidad => unidad.cluesimb === this.cluesimb()) ?? null
  );

  esVistaEstatal = computed(() => this.cluesimb() === this.estatalValue);

  resumenVisible = computed(() => {
    const unidad = this.cluesimb();
    if (!unidad) return [];
    if (this.esVistaEstatal()) return this.resumen();
    return this.resumen().filter(row => row.cluesimb === unidad);
  });

  kpis = computed<IbOncoKpi[]>(() => {
    const rows = this.resumenVisible();
    const posiblesFaltantes = this.abasto().rows
      .filter(row => row.tiene_citas_pendientes && this.esFaltante(row))
      .length;

    return [
      { label: 'Claves onco', value: this.sum(rows, 'claves_onco') },
      { label: 'Posible sobre abasto', value: this.sum(rows, 'claves_posible_sobre_abasto') },
      { label: 'Posibles faltantes', value: posiblesFaltantes },
      { label: 'Citas pendientes', value: this.sum(rows, 'citas_pendientes') },
      { label: 'Piezas pendientes', value: this.sum(rows, 'piezas_pendientes') },
    ];
  });

  modalAnalisisTitulo = computed(() => {
    if (this.selectedAnalysisType() === 'recientes') {
      return `Ordenes completadas / pendientes (ultimos ${this.windowDays()} dias)`;
    }
    return this.selectedAnalysisType() === 'sobreabasto'
      ? 'Analisis sobre abasto'
      : 'Analisis faltantes';
  });

  modalAnalisisRows = computed(() => {
    const row = this.selectedRow();
    return row ? this.modalCitas() : [];
  });

  sortedAbastoRows = computed(() => {
    return this.sortRows(this.abasto().rows, this.abastoSort(), (row, key) => this.abastoSortValue(row, key));
  });

  sortedAbastoEstatalRows = computed(() => {
    return this.sortRows(this.abastoEstatal(), this.abastoSort(), (row, key) => {
      if (key === 'sobreabasto' || key === 'faltantes') return null;
      return row[key];
    });
  });

  sortedDetalleEstatalRows = computed(() => {
    return this.sortRows(this.abastoEstatalDetalle(), this.abastoSort(), (row, key) => this.abastoSortValue(row, key));
  });

  sortedModalAnalisisRows = computed(() => {
    return this.sortRows(this.modalAnalisisRows(), this.citasSort(), (row, key) => this.citaSortValue(row, key));
  });

  constructor() {
    void this.cargarInicial();
  }

  async cargarInicial(): Promise<void> {
    this.loadingInicial.set(true);
    this.error.set(null);

    try {
      const [unidadesResponse, resumenResponse] = await Promise.all([
        firstValueFrom(this.ibOncoService.obtenerUnidades()),
        firstValueFrom(this.ibOncoService.obtenerResumen(this.windowDays())),
      ]);

      this.unidades.set(unidadesResponse.data ?? []);
      this.resumen.set(resumenResponse.data ?? []);
    } catch {
      this.error.set('No se pudo cargar la informacion inicial de IB-ONCO.');
    } finally {
      this.loadingInicial.set(false);
    }
  }

  async onUnidadChange(value: string): Promise<void> {
    this.cluesimb.set(value);
    this.search.set('');
    this.abasto.set(this.emptyPage<IbOncoAbastoCpmRow>(1000));
    this.abastoEstatal.set([]);
    this.abastoEstatalDetalle.set([]);
    this.ordenesRecientesDetalleEstatal.set({});
    this.selectedEstatalRow.set(null);
    this.cerrarModal();

    if (!value) return;
    await this.cargarClaves();
  }

  async onSearchChange(value: string): Promise<void> {
    this.search.set(value);
    if (!this.cluesimb()) return;
    await this.cargarClaves();
  }

  async refrescar(): Promise<void> {
    await this.cargarResumen();
    if (this.cluesimb()) {
      await this.cargarClaves();
    }
  }

  async exportarExcel(): Promise<void> {
    if (this.exportando()) return;

    this.exportando.set(true);
    this.exportProgress.set(this.esVistaEstatal() ? 'Preparando exportacion estatal...' : 'Preparando exportacion...');
    this.error.set(null);

    try {
      if (this.esVistaEstatal()) {
        await this.exportarExcelEstatal();
        return;
      }

      const abastoRows = await this.fetchAllAbasto();
      const sobreabastoRows: Record<string, string | number | null>[] = [];
      const faltantesRows: Record<string, string | number | null>[] = [];

      const rowsConCitas = abastoRows.filter(row => row.tiene_citas_pendientes);

      for (let index = 0; index < rowsConCitas.length; index++) {
        const row = rowsConCitas[index];
        this.exportProgress.set(`Cargando ordenes ${index + 1}/${rowsConCitas.length}...`);
        const citas = await this.fetchAllCitas(row);
        const target = this.esSobreabasto(row) ? sobreabastoRows : faltantesRows;
        target.push(...citas.map(cita => this.toExcelRow(row, cita)));
      }

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sobreabastoRows), 'Sobreabasto');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(faltantesRows), 'Faltantes');

      const stamp = this.timestamp();
      XLSX.writeFile(workbook, `IB_ONCO_TODOS_${stamp}.xlsx`, { bookType: 'xlsx' });
    } catch {
      this.error.set('No se pudo generar el Excel IB-ONCO.');
    } finally {
      this.exportando.set(false);
      this.exportProgress.set(null);
    }
  }

  async abrirAnalisis(row: IbOncoAbastoCpmRow, tipo: 'sobreabasto' | 'faltantes'): Promise<void> {
    if (!row.tiene_citas_pendientes) return;

    this.selectedRow.set(row);
    this.selectedAnalysisType.set(tipo);
    this.modalCitas.set([]);
    this.checkedCitas.set([]);
    this.modalError.set(null);
    this.loadingModal.set(true);

    try {
      const response = await firstValueFrom(this.ibOncoService.obtenerCitasPendientes({
        cluesimb: row.cluesimb,
        clave_cnis: row.clave_cnis,
        window_days: this.windowDays(),
        page: 1,
        limit: 1000,
      }));
      this.modalCitas.set(response.rows ?? []);
    } catch {
      this.modalError.set('No se pudo cargar el detalle de ordenes de suministro.');
    } finally {
      this.loadingModal.set(false);
    }
  }

  async abrirOrdenesRecientes(row: IbOncoAbastoCpmRow): Promise<void> {
    if (!this.esSinAlerta(row)) return;

    this.selectedRow.set(row);
    this.selectedAnalysisType.set('recientes');
    this.modalCitas.set([]);
    this.checkedCitas.set([]);
    this.modalError.set(null);
    this.loadingModal.set(true);

    const precargadas = this.ordenesRecientesDetalleEstatal()[this.trackAbasto(row)];
    if (precargadas) {
      this.modalCitas.set(precargadas);
      this.loadingModal.set(false);
      return;
    }

    try {
      const response = await firstValueFrom(this.citasService.getCitasPorClaveXClave({
        clave: row.clave_cnis,
        windowDays: this.windowDays(),
        incluyeNoRecibidas: true,
        limit: 200,
      }));

      const rows = (response.rows ?? [])
        .filter((cita: Cita) => this.esOrdenDelHospital(cita, row))
        .filter((cita: Cita) => this.esOrdenRecienteOPendiente(cita))
        .sort((a: Cita, b: Cita) => this.fechaOrden(b) - this.fechaOrden(a))
        .slice(0, 10)
        .map((cita: Cita, index: number) => this.mapCitaToOrden(cita, row, index));

      this.modalCitas.set(rows);
    } catch {
      this.modalError.set('No se pudieron cargar las ordenes completadas o pendientes recientes.');
    } finally {
      this.loadingModal.set(false);
    }
  }

  abrirDetalleEstatal(row: IbOncoEstatalRow): void {
    const detalle = this.abasto().rows.filter(item => item.clave_cnis === row.clave_cnis);
    this.selectedEstatalRow.set(row);
    this.abastoEstatalDetalle.set(detalle);
    this.ordenesRecientesDetalleEstatal.set({});
    this.ordenesDetalleEstatalError.set(null);
    this.cerrarModal();
    void this.cargarOrdenesDetalleEstatal(row, detalle);
  }

  cerrarDetalleEstatal(): void {
    this.selectedEstatalRow.set(null);
    this.abastoEstatalDetalle.set([]);
    this.ordenesRecientesDetalleEstatal.set({});
    this.ordenesDetalleEstatalError.set(null);
    this.loadingOrdenesDetalleEstatal.set(false);
    this.cerrarModal();
  }

  cerrarModal(): void {
    this.selectedRow.set(null);
    this.modalCitas.set([]);
    this.checkedCitas.set([]);
    this.modalError.set(null);
    this.loadingModal.set(false);
  }

  toggleCita(citaId: number, checked: boolean): void {
    const current = this.checkedCitas();
    if (checked && !current.includes(citaId)) {
      this.checkedCitas.set([...current, citaId]);
      return;
    }
    if (!checked) {
      this.checkedCitas.set(current.filter(id => id !== citaId));
    }
  }

  citaChecked(citaId: number): boolean {
    return this.checkedCitas().includes(citaId);
  }

  estadoClass(row: IbOncoAbastoCpmRow): string {
    return row.estado_abasto === 'posible sobre abasto'
      ? 'bg-amber-50 text-amber-800'
      : 'bg-emerald-50 text-emerald-700';
  }

  esSobreabasto(row: IbOncoAbastoCpmRow): boolean {
    return this.normalizarEstado(row).includes('sobre');
  }

  esSinAlerta(row: IbOncoAbastoCpmRow): boolean {
    const estado = this.normalizarEstado(row);
    const estadoExplicito = estado === 'sin alerta' || estado === 'sin alertas' || estado === 'sin_alerta' || estado === 'normal';
    return estadoExplicito || (!row.tiene_citas_pendientes && !this.esSobreabasto(row));
  }

  esFaltante(row: IbOncoAbastoCpmRow): boolean {
    return !this.esSobreabasto(row) && !this.esSinAlerta(row);
  }

  estadoLabel(row: IbOncoAbastoCpmRow): string {
    if (this.esSobreabasto(row)) return 'Posible sobreabasto';
    if (this.esSinAlerta(row)) return 'Sin alerta';
    return 'Posibles faltantes';
  }

  tieneOrdenesRecientesPrecargadas(row: IbOncoAbastoCpmRow): boolean {
    return (this.ordenesRecientesDetalleEstatal()[this.trackAbasto(row)]?.length ?? 0) > 0;
  }

  sortAbastoBy(key: AbastoSortKey): void {
    this.abastoSort.update(current => this.nextSortState(current, key));
  }

  sortCitasBy(key: CitaSortKey): void {
    this.citasSort.update(current => this.nextSortState(current, key));
  }

  abastoSortIndicator(key: AbastoSortKey): string {
    return this.sortIndicator(this.abastoSort(), key);
  }

  citasSortIndicator(key: CitaSortKey): string {
    return this.sortIndicator(this.citasSort(), key);
  }

  trackAbasto(row: IbOncoAbastoCpmRow): string {
    return `${row.cluesimb}-${row.clave_cnis}`;
  }

  trackCita(row: IbOncoCitaPendiente): string {
    return `${row.id}-${row.orden_de_suministro ?? ''}`;
  }

  private async cargarClaves(): Promise<void> {
    this.loadingClaves.set(true);
    this.error.set(null);

    try {
      const response = await firstValueFrom(this.ibOncoService.obtenerAbastoCpm({
        cluesimb: this.esVistaEstatal() ? undefined : this.cluesimb(),
        search: this.search().trim(),
        window_days: this.windowDays(),
        page: 1,
        limit: 1000,
      }));
      const rows = [...(response.rows ?? [])];
      if (this.esVistaEstatal()) {
        for (let page = 2; page <= (response.totalPages || 1); page++) {
          const next = await firstValueFrom(this.ibOncoService.obtenerAbastoCpm({
            search: this.search().trim(),
            window_days: this.windowDays(),
            page,
            limit: 1000,
          }));
          rows.push(...(next.rows ?? []));
        }
      }

      this.abasto.set({ ...response, rows });
      this.abastoEstatal.set(this.esVistaEstatal() ? this.agruparAbastoEstatal(this.abasto().rows) : []);
    } catch {
      this.error.set(this.esVistaEstatal()
        ? 'No se pudieron cargar las claves estatales.'
        : 'No se pudieron cargar las claves del hospital seleccionado.');
      this.abasto.set(this.emptyPage<IbOncoAbastoCpmRow>(1000));
      this.abastoEstatal.set([]);
    } finally {
      this.loadingClaves.set(false);
    }
  }

  private async cargarResumen(): Promise<void> {
    try {
      const response = await firstValueFrom(this.ibOncoService.obtenerResumen(this.windowDays()));
      this.resumen.set(response.data ?? []);
    } catch {
      this.error.set('No se pudo actualizar el resumen IB-ONCO.');
    }
  }

  private async fetchAllAbasto(limit = 1000): Promise<IbOncoAbastoCpmRow[]> {
    const first = await firstValueFrom(this.ibOncoService.obtenerAbastoCpm({
      window_days: this.windowDays(),
      page: 1,
      limit,
    }));
    const rows = [...(first.rows ?? [])];

    for (let page = 2; page <= (first.totalPages || 1); page++) {
      const next = await firstValueFrom(this.ibOncoService.obtenerAbastoCpm({
        window_days: this.windowDays(),
        page,
        limit,
      }));
      rows.push(...(next.rows ?? []));
    }

    return rows;
  }

  private async fetchAllCitas(row: IbOncoAbastoCpmRow, limit = 1000): Promise<IbOncoCitaPendiente[]> {
    const first = await firstValueFrom(this.ibOncoService.obtenerCitasPendientes({
      cluesimb: row.cluesimb,
      clave_cnis: row.clave_cnis,
      window_days: this.windowDays(),
      page: 1,
      limit,
    }));
    const rows = [...(first.rows ?? [])];

    for (let page = 2; page <= (first.totalPages || 1); page++) {
      const next = await firstValueFrom(this.ibOncoService.obtenerCitasPendientes({
        cluesimb: row.cluesimb,
        clave_cnis: row.clave_cnis,
        window_days: this.windowDays(),
        page,
        limit,
      }));
      rows.push(...(next.rows ?? []));
    }

    return rows;
  }

  private async exportarExcelEstatal(): Promise<void> {
    this.exportProgress.set('Cargando claves estatales...');
    const abastoRows = await this.fetchAllAbasto();
    const resumenEstatal = this.agruparAbastoEstatal(abastoRows);
    const rowsConCitas = abastoRows.filter(row => row.tiene_citas_pendientes);
    const rowsSinAlerta = abastoRows.filter(row => this.esSinAlerta(row));
    const sobreabastoRows: Record<string, string | number | null>[] = [];
    const faltantesRows: Record<string, string | number | null>[] = [];
    const recientesRows: Record<string, string | number | null>[] = [];
    const notas: Record<string, string | number>[] = [
      { Nota: 'Exportacion estatal completa de IB-ONCO.', Valor: '' },
      { Nota: 'Ventana de ordenes recientes en dias.', Valor: this.windowDays() },
      { Nota: 'Generado.', Valor: new Date().toISOString() },
    ];
    let erroresOrdenesPendientes = 0;
    let erroresOrdenesRecientes = 0;

    for (let index = 0; index < rowsConCitas.length; index++) {
      const row = rowsConCitas[index];
      this.exportProgress.set(`Cargando ordenes con analisis ${index + 1}/${rowsConCitas.length}...`);
      try {
        const citas = await this.fetchAllCitas(row);
        const target = this.esSobreabasto(row) ? sobreabastoRows : faltantesRows;
        target.push(...citas.map(cita => this.toExcelRow(row, cita)));
      } catch {
        erroresOrdenesPendientes++;
      }
    }

    const rowsSinAlertaPorClave = new Map<string, IbOncoAbastoCpmRow[]>();
    rowsSinAlerta.forEach(row => {
      const rows = rowsSinAlertaPorClave.get(row.clave_cnis) ?? [];
      rows.push(row);
      rowsSinAlertaPorClave.set(row.clave_cnis, rows);
    });

    const clavesSinAlerta = [...rowsSinAlertaPorClave.keys()];
    for (let index = 0; index < clavesSinAlerta.length; index++) {
      const clave = clavesSinAlerta[index];
      this.exportProgress.set(`Cargando ordenes recientes ${index + 1}/${clavesSinAlerta.length}...`);

      try {
        const response = await firstValueFrom(this.citasService.getCitasPorClaveXClave({
          clave,
          windowDays: this.windowDays(),
          incluyeNoRecibidas: true,
          limit: 1000,
        }));
        const citas = (response.rows ?? []) as Cita[];
        const rowsClave = rowsSinAlertaPorClave.get(clave) ?? [];

        rowsClave.forEach(row => {
          const ordenes = citas
            .filter(cita => this.esOrdenDelHospital(cita, row))
            .filter(cita => this.esOrdenRecienteOPendiente(cita))
            .sort((a, b) => this.fechaOrden(b) - this.fechaOrden(a))
            .map((cita, citaIndex) => this.mapCitaToOrden(cita, row, citaIndex));

          recientesRows.push(...ordenes.map(cita => this.toExcelRow(row, cita)));
        });
      } catch {
        erroresOrdenesRecientes++;
      }
    }

    if (erroresOrdenesPendientes > 0) {
      notas.push({ Nota: 'Claves/unidades con error al cargar ordenes de sobreabasto/faltantes.', Valor: erroresOrdenesPendientes });
    }
    if (erroresOrdenesRecientes > 0) {
      notas.push({ Nota: 'Claves con error al cargar ordenes recientes.', Valor: erroresOrdenesRecientes });
    }

    this.exportProgress.set('Armando archivo Excel estatal...');
    const workbook = XLSX.utils.book_new();
    this.appendJsonSheet(workbook, 'Resumen estatal', resumenEstatal.map(row => this.toExcelEstatalResumenRow(row)));
    this.appendJsonSheet(workbook, 'Detalle hospitales', abastoRows.map(row => this.toExcelDetalleHospitalRow(row)));
    this.appendJsonSheet(workbook, 'Sobreabasto ordenes', sobreabastoRows);
    this.appendJsonSheet(workbook, 'Faltantes ordenes', faltantesRows);
    this.appendJsonSheet(workbook, 'Ordenes recientes', recientesRows);
    this.appendJsonSheet(workbook, 'Notas', notas);

    XLSX.writeFile(workbook, `IB_ONCO_ESTATAL_${this.timestamp()}.xlsx`, { bookType: 'xlsx' });
  }

  private toExcelRow(row: IbOncoAbastoCpmRow, cita: IbOncoCitaPendiente): Record<string, string | number | null> {
    return {
      'CLUES IMB': row.cluesimb,
      'Unidad Medica': row.nombre_de_unidad ?? '',
      'Clave CNIS': row.clave_cnis,
      'Descripcion': row.descripcion ?? '',
      CPM: row.cpm,
      CPMx3: row.cpm_x_3,
      Existencias: row.existencias,
      CPMS_EQ: row.cpms_eq,
      'c.orden_de_suministro': cita.orden_de_suministro ?? '',
      'c.institucion': cita.institucion ?? '',
      'c.contrato': cita.contrato ?? '',
      'c.tipo_de_entrega': cita.tipo_de_entrega ?? '',
      'c.fte_fmto': cita.fte_fmto ?? '',
      'c.proveedor': cita.proveedor ?? '',
      'c.compra': cita.compra ?? '',
      'c.tipo_de_red': cita.tipo_de_red ?? '',
      'c.tipo_de_insumo': cita.tipo_de_insumo ?? '',
      'c.grupo_terapeutico': cita.grupo_terapeutico ?? '',
      'c.precio_unitario': cita.precio_unitario ?? 0,
      'c.no_de_piezas_emitidas': cita.no_de_piezas_emitidas ?? 0,
      'c.pzas_recibidas_por_la_entidad': cita.pzas_recibidas_por_la_entidad ?? 0,
      'c.nombre_de_unidad': cita.nombre_de_unidad ?? '',
      'c.fecha_emision': this.formatDateForExcel(cita.fecha_emision),
      'c.fecha_limite_de_entrega': this.formatDateForExcel(cita.fecha_limite_de_entrega),
      'c.fecha_recepcion_almacen': this.formatDateForExcel(cita.fecha_recepcion_almacen),
      'c.estatus': cita.estatus ?? '',
      checkbox: '',
    };
  }

  private toExcelEstatalResumenRow(row: IbOncoEstatalRow): Record<string, string | number | null> {
    return {
      'Clave CNIS': row.clave_cnis,
      Descripcion: row.descripcion ?? '',
      CPM: row.cpm,
      Existencias: row.existencias,
      'Piezas pendientes': row.piezas_pendientes,
    };
  }

  private toExcelDetalleHospitalRow(row: IbOncoAbastoCpmRow): Record<string, string | number | null> {
    return {
      'CLUES IMB': row.cluesimb,
      'Unidad Medica': row.nombre_de_unidad ?? '',
      'Clave CNIS': row.clave_cnis,
      Descripcion: row.descripcion ?? '',
      CPM: row.cpm,
      'CPM x 3': row.cpm_x_3,
      Existencias: row.existencias,
      'CPMs eq.': row.cpms_eq,
      'Estado abasto': this.estadoLabel(row),
      'Citas pendientes': row.citas_pendientes,
      'Piezas pendientes': row.piezas_pendientes,
      'Tiene citas pendientes': row.tiene_citas_pendientes ? 'SI' : 'NO',
    };
  }

  private appendJsonSheet(
    workbook: XLSX.WorkBook,
    name: string,
    rows: Record<string, string | number | null>[]
  ): void {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(rows.length ? rows : [{ Mensaje: 'Sin datos' }]),
      name
    );
  }

  private formatDateForExcel(value?: string | null): string {
    if (!value) return '';
    return String(value).slice(0, 10);
  }

  private timestamp(): string {
    const now = new Date();
    const pad = (value: number) => value.toString().padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  }

  private emptyPage<T>(limit: number): IbOncoPaginatedResponse<T> {
    return {
      count: 0,
      total: 0,
      page: 1,
      limit,
      offset: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: false,
      rows: [],
    };
  }

  private sum(rows: IbOncoResumenUnidad[], key: keyof IbOncoResumenUnidad): number {
    return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
  }

  private nextSortState<T extends string>(current: SortState<T> | null, key: T): SortState<T> {
    if (current?.key !== key) {
      return { key, direction: 'asc' };
    }

    return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }

  private sortIndicator<T extends string>(state: SortState<T> | null, key: T): string {
    if (state?.key !== key) return '';
    return state.direction === 'asc' ? ' ^' : ' v';
  }

  private sortRows<T, K extends string>(
    rows: T[],
    state: SortState<K> | null,
    valueSelector: (row: T, key: K) => string | number | boolean | null | undefined
  ): T[] {
    if (!state) return rows;

    const direction = state.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => this.compareValues(valueSelector(a, state.key), valueSelector(b, state.key)) * direction);
  }

  private compareValues(a: string | number | boolean | null | undefined, b: string | number | boolean | null | undefined): number {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;

    if (typeof a === 'number' || typeof b === 'number') {
      return Number(a) - Number(b);
    }

    if (typeof a === 'boolean' || typeof b === 'boolean') {
      return Number(a) - Number(b);
    }

    return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
  }

  private abastoSortValue(row: IbOncoAbastoCpmRow, key: AbastoSortKey): string | number | boolean | null | undefined {
    if (key === 'sobreabasto') return row.tiene_citas_pendientes && this.esSobreabasto(row);
    if (key === 'faltantes') return row.tiene_citas_pendientes && this.esFaltante(row);
    return row[key];
  }

  private citaSortValue(row: IbOncoCitaPendiente, key: CitaSortKey): string | number | boolean | null | undefined {
    return row[key];
  }

  private agruparAbastoEstatal(rows: IbOncoAbastoCpmRow[]): IbOncoEstatalRow[] {
    const byClave = new Map<string, IbOncoEstatalRow>();

    rows.forEach(row => {
      const current = byClave.get(row.clave_cnis);
      if (current) {
        current.cpm += Number(row.cpm ?? 0);
        current.existencias += Number(row.existencias ?? 0);
        current.piezas_pendientes += Number(row.piezas_pendientes ?? 0);
        return;
      }

      byClave.set(row.clave_cnis, {
        clave_cnis: row.clave_cnis,
        descripcion: row.descripcion,
        cpm: Number(row.cpm ?? 0),
        existencias: Number(row.existencias ?? 0),
        piezas_pendientes: Number(row.piezas_pendientes ?? 0),
      });
    });

    return [...byClave.values()];
  }

  private async cargarOrdenesDetalleEstatal(
    selectedRow: IbOncoEstatalRow,
    detalle: IbOncoAbastoCpmRow[]
  ): Promise<void> {
    const rowsSinAlerta = detalle.filter(row => this.esSinAlerta(row));
    if (rowsSinAlerta.length === 0) return;

    this.loadingOrdenesDetalleEstatal.set(true);
    this.ordenesDetalleEstatalError.set(null);

    try {
      const response = await firstValueFrom(this.citasService.getCitasPorClaveXClave({
        clave: selectedRow.clave_cnis,
        windowDays: this.windowDays(),
        incluyeNoRecibidas: true,
        limit: Math.max(200, rowsSinAlerta.length * 10),
      }));

      if (this.selectedEstatalRow()?.clave_cnis !== selectedRow.clave_cnis) return;

      const citas = (response.rows ?? []) as Cita[];
      const ordenesByHospital: Record<string, IbOncoCitaPendiente[]> = {};

      rowsSinAlerta.forEach(row => {
        ordenesByHospital[this.trackAbasto(row)] = citas
          .filter(cita => this.esOrdenDelHospital(cita, row))
          .filter(cita => this.esOrdenRecienteOPendiente(cita))
          .sort((a, b) => this.fechaOrden(b) - this.fechaOrden(a))
          .slice(0, 10)
          .map((cita, index) => this.mapCitaToOrden(cita, row, index));
      });

      this.ordenesRecientesDetalleEstatal.set(ordenesByHospital);
    } catch {
      if (this.selectedEstatalRow()?.clave_cnis === selectedRow.clave_cnis) {
        this.ordenesDetalleEstatalError.set('No se pudieron comprobar las ordenes recientes.');
      }
    } finally {
      if (this.selectedEstatalRow()?.clave_cnis === selectedRow.clave_cnis) {
        this.loadingOrdenesDetalleEstatal.set(false);
      }
    }
  }

  private normalizarEstado(row: IbOncoAbastoCpmRow): string {
    return String(row.estado_abasto ?? '').trim().toLocaleLowerCase();
  }

  private esOrdenDelHospital(cita: Cita, row: IbOncoAbastoCpmRow): boolean {
    const clues = String(cita.clues_destino ?? '').trim().toLocaleUpperCase();
    if (clues && clues === row.cluesimb.trim().toLocaleUpperCase()) return true;

    return String(cita.unidad ?? '').trim().toLocaleUpperCase()
      === String(row.nombre_de_unidad ?? '').trim().toLocaleUpperCase();
  }

  private esOrdenRecienteOPendiente(cita: Cita): boolean {
    const today = new Date();
    const past = new Date(today);
    const future = new Date(today);
    past.setDate(today.getDate() - this.windowDays());
    future.setDate(today.getDate() + this.windowDays());

    const recepcion = this.fechaRecepcion(cita);
    const emision = this.toDate(cita.fecha_emision);
    const limite = this.toDate(cita.fecha_limite_de_entrega);
    const emitidas = Number(cita.no_de_piezas_emitidas ?? 0);
    const recibidas = Number(cita.pzas_recibidas_por_la_entidad ?? 0);
    const pendiente = !recepcion || recibidas < emitidas;

    if (recepcion && recepcion >= past && recepcion <= today) return true;
    if (!pendiente) return false;
    return (!!emision && emision >= past && emision <= today)
      || (!!limite && limite >= past && limite <= future);
  }

  private fechaOrden(cita: Cita): number {
    return this.fechaRecepcion(cita)?.getTime()
      ?? this.toDate(cita.fecha_emision)?.getTime()
      ?? this.toDate(cita.fecha_limite_de_entrega)?.getTime()
      ?? 0;
  }

  private mapCitaToOrden(cita: Cita, row: IbOncoAbastoCpmRow, index: number): IbOncoCitaPendiente {
    return {
      id: -(index + 1),
      ejercicio: cita.ejercicio,
      orden_de_suministro: cita.orden_de_suministro,
      institucion: cita.institucion,
      contrato: cita.contrato,
      cluesimb: row.cluesimb,
      nombre_de_unidad: row.nombre_de_unidad ?? cita.unidad,
      clave_cnis: row.clave_cnis,
      descripcion: row.descripcion,
      proveedor: cita.proveedor,
      compra: cita.compra,
      tipo_de_entrega: cita.tipo_de_entrega,
      fte_fmto: cita.fte_fmto,
      tipo_de_red: cita.tipo_de_red,
      tipo_de_insumo: cita.tipo_de_insumo,
      grupo_terapeutico: cita.grupo_terapeutico,
      precio_unitario: cita.precio_unitario,
      no_de_piezas_emitidas: Number(cita.no_de_piezas_emitidas ?? 0),
      pzas_recibidas_por_la_entidad: Number(cita.pzas_recibidas_por_la_entidad ?? 0),
      fecha_emision: this.toIsoString(cita.fecha_emision),
      fecha_limite_de_entrega: this.toIsoString(cita.fecha_limite_de_entrega),
      fecha_recepcion_almacen: this.toIsoString(this.fechaRecepcion(cita)),
      fecha_de_cita: this.toIsoString(cita.fecha_de_cita),
      estatus: cita.estatus,
      folio_abasto: cita.folio_abasto,
    };
  }

  private toDate(value: string | Date | null | undefined): Date | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private fechaRecepcion(cita: Cita): Date | null {
    return this.toDate(cita.fecha_recepcion_almacen)
      ?? this.toDate(cita.fecha_recepcion_lista?.[0])
      ?? this.toDate(cita.fecha_recepcion_min);
  }

  private toIsoString(value: string | Date | null | undefined): string | null {
    const date = this.toDate(value);
    return date?.toISOString() ?? null;
  }
}
