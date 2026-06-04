// src/app/features/ib-onco/ib-onco-page.component.ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { LucideAngularModule, Download, Info, Search, X } from 'lucide-angular';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import {
  IbOncoAbastoCpmRow,
  IbOncoCitaPendiente,
  IbOncoPaginatedResponse,
  IbOncoResumenUnidad,
  IbOncoUnidad,
} from '../../models/ib-onco';
import { Inventario } from '../../models/Inventario';
import { IbOncoService } from '../../services/ib-onco.service';
import { CitasService } from '../../services/citas.service';
import { InventarioService } from '../../services/inventario.service';
import { Cita } from '../../models/Cita';

interface IbOncoKpi {
  label: string;
  value: number | null;
  format?: 'number' | 'percent';
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

interface IbOncoBalanceUnidad {
  row: IbOncoAbastoCpmRow;
  objetivo: number;
  piezas: number;
}

interface IbOncoBalanceDonador {
  nombre: string;
  piezas: number;
  tipo: 'hospital' | 'almacen';
  row?: IbOncoAbastoCpmRow;
}

interface IbOncoBalanceMovimiento {
  desde: IbOncoBalanceDonador;
  hacia: IbOncoAbastoCpmRow;
  piezas: number;
  acumuladoPrevioDestino: number;
  acumuladoDestino: number;
  faltanteDestino: number;
  existenciaDestino: number;
  objetivoDestino: number;
}

interface IbOncoBalanceEstatal {
  cpmTotal: number;
  excedenteTotal: number;
  faltanteTotal: number;
  piezasSugeridas: number;
  almacenesTotal: number;
  piezasSugeridasAlmacenes: number;
  piezasSugeridasHospitales: number;
  almacenes: { almacen: string; piezas: number }[];
  donadores: IbOncoBalanceDonador[];
  receptores: IbOncoBalanceUnidad[];
  movimientos: IbOncoBalanceMovimiento[];
}

interface IbOncoPropuestaRedistribucionRow {
  origen: string;
  claveCnis: string;
  descripcion: string;
  cantidad: number;
  destino: string;
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
  private inventarioService = inject(InventarioService);
  private readonly estatalValue = '__ESTATAL__';

  readonly SearchIcon = Search;
  readonly XIcon = X;
  readonly DownloadIcon = Download;
  readonly InfoIcon = Info;

  acercaDeIbOncoVisible = false;
  loadingInicial = signal(false);
  loadingClaves = signal(false);
  loadingModal = signal(false);
  loadingOrdenesDetalleEstatal = signal(false);
  loadingAlmacenes = signal(false);
  generandoPropuestas = signal(false);
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
  inventarioAlmacenes = signal<Inventario[]>([]);
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
    const abastoRows = this.abasto().rows;
    const porcentajeClavesConExistencia = this.calcularPorcentajeClavesConExistencia(abastoRows);
    const cpmCeroConExistencia = abastoRows.filter(row => Number(row.cpm ?? 0) <= 0 && Number(row.existencias ?? 0) > 0).length;
    const cpmCeroSinExistencia = abastoRows.filter(row => Number(row.cpm ?? 0) <= 0 && Number(row.existencias ?? 0) <= 0).length;
    const posiblesFaltantes = this.abasto().rows
      .filter(row => row.tiene_citas_pendientes && this.esFaltante(row))
      .length;

    return [
      { label: 'Total registros', value: this.sum(rows, 'claves_onco') },
      { label: '% abasto', value: porcentajeClavesConExistencia, format: 'percent' },
      { label: 'Posible sobre abasto', value: this.sum(rows, 'claves_posible_sobre_abasto') },
      { label: 'Posibles faltantes', value: posiblesFaltantes },
      { label: 'CPM 0 con existencia', value: cpmCeroConExistencia },
      { label: 'CPM 0 sin existencia', value: cpmCeroSinExistencia },
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

  balanceDetalleEstatal = computed(() => this.calcularBalanceDetalleEstatal(this.abastoEstatalDetalle()));

  sortedModalAnalisisRows = computed(() => {
    return this.sortRows(this.modalAnalisisRows(), this.citasSort(), (row, key) => this.citaSortValue(row, key));
  });

  constructor() {
    this.inventarioService.inventario$
      .pipe(takeUntilDestroyed())
      .subscribe(rows => this.inventarioAlmacenes.set(rows ?? []));

    this.inventarioService.cargandoInventario$
      .pipe(takeUntilDestroyed())
      .subscribe(loading => this.loadingAlmacenes.set(loading));

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
    if (value === this.estatalValue) {
      this.inventarioService.initExistenciaAlmacenes();
    }
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

      const abastoRows = (await this.fetchAllAbasto())
        .filter(row => row.cluesimb === this.cluesimb());
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
      this.appendJsonSheet(workbook, 'KPIs', this.toExcelKpiRows(abastoRows));
      this.appendJsonSheet(workbook, 'Sobreabasto', sobreabastoRows);
      this.appendJsonSheet(workbook, 'Faltantes', faltantesRows);

      const stamp = this.timestamp();
      XLSX.writeFile(workbook, `IB_ONCO_TODOS_${stamp}.xlsx`, { bookType: 'xlsx' });
    } catch {
      this.error.set('No se pudo generar el Excel IB-ONCO.');
    } finally {
      this.exportando.set(false);
      this.exportProgress.set(null);
    }
  }

  async generarPropuestasRedistribucion(): Promise<void> {
    if (!this.esVistaEstatal() || this.generandoPropuestas()) return;

    this.generandoPropuestas.set(true);
    this.exportProgress.set('Preparando propuestas de redistribucion...');
    this.error.set(null);

    try {
      const abastoRows = await this.fetchAllAbasto();
      console.log('abastoRows', abastoRows);
      const balanceRows = this.toExcelBalanceEstatalRows(abastoRows);
      const propuestaRows = this.toPropuestaRedistribucionRows(balanceRows);

      if (propuestaRows.length === 0) {
        this.error.set('No hay movimientos sugeridos para generar propuestas de redistribucion.');
        return;
      }

      const rowsByOrigen = this.groupBy(propuestaRows, row => row.origen);
      const templateBuffer = await this.fetchTemplateIbOnco();
      const total = rowsByOrigen.size;
      let index = 0;

      for (const [origen, rows] of rowsByOrigen.entries()) {
        index++;
        this.exportProgress.set(`Generando propuesta ${index}/${total}: ${origen}`);
        await this.generarArchivoPropuesta(origen, this.sortPropuestaRows(rows), templateBuffer);
      }
    } catch {
      this.error.set('No se pudieron generar las propuestas de redistribucion.');
    } finally {
      this.generandoPropuestas.set(false);
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

  mostrarAcercaDeIbOnco(): void {
    this.acercaDeIbOncoVisible = true;
  }

  cerrarAcercaDeIbOnco(): void {
    this.acercaDeIbOncoVisible = false;
  }

  anioActual(): number {
    return new Date().getFullYear();
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
        ? 'No se pudieron cargar las claves a nivel estado.'
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

  private async fetchAllAbasto(limit = 10000): Promise<IbOncoAbastoCpmRow[]> {
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

  private async fetchAllCitas(row: IbOncoAbastoCpmRow, limit = 10000): Promise<IbOncoCitaPendiente[]> {
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
    const balanceRows = this.toExcelBalanceEstatalRows(abastoRows);
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
    this.appendJsonSheet(workbook, 'KPIs', this.toExcelKpiRows(abastoRows));
    this.appendJsonSheet(workbook, 'Resumen estatal', resumenEstatal.map(row => this.toExcelEstatalResumenRow(row)));
    this.appendJsonSheet(workbook, 'Detalle hospitales', abastoRows.map(row => this.toExcelDetalleHospitalRow(row)));
    this.appendJsonSheet(workbook, 'Balance sugerido', balanceRows);
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

  private toExcelKpiRows(rows: IbOncoAbastoCpmRow[]): Record<string, string | number | null>[] {
    const porcentajeClavesConExistencia = this.calcularPorcentajeClavesConExistencia(rows);
    const cpmCeroConExistencia = rows.filter(row => Number(row.cpm ?? 0) <= 0 && Number(row.existencias ?? 0) > 0).length;
    const cpmCeroSinExistencia = rows.filter(row => Number(row.cpm ?? 0) <= 0 && Number(row.existencias ?? 0) <= 0).length;
    const rowsConCpm = rows.filter(row => Number(row.cpm ?? 0) > 0);
    const rowsConCpmYExistencia = rowsConCpm.filter(row => Number(row.existencias ?? 0) > 0).length;
    const rowsConCpmSinExistencia = rowsConCpm.filter(row => Number(row.existencias ?? 0) <= 0).length;

    return [
      {
        KPI: '% abasto',
        Valor: porcentajeClavesConExistencia,
        Unidad: porcentajeClavesConExistencia === null ? 'N/A' : '%',
        Nota: 'Mide cuantas claves/unidades con CPM > 0 tienen alguna existencia. No mide suficiencia contra CPM; solo separa registros con existencia mayor a cero contra registros en cero. Las claves con CPM 0 se reportan aparte.',
      },
      {
        KPI: 'Registros con CPM > 0 y existencia',
        Valor: rowsConCpmYExistencia,
        Unidad: 'registros',
        Nota: 'Numerador del porcentaje de claves con existencia.',
      },
      {
        KPI: 'Registros con CPM > 0 sin existencia',
        Valor: rowsConCpmSinExistencia,
        Unidad: 'registros',
        Nota: 'Registros con CPM configurado y existencia igual a cero.',
      },
      {
        KPI: 'Registros con CPM > 0',
        Valor: rowsConCpm.length,
        Unidad: 'registros',
        Nota: 'Denominador del porcentaje de claves con existencia.',
      },
      {
        KPI: 'CPM 0 con existencia',
        Valor: cpmCeroConExistencia,
        Unidad: 'registros',
        Nota: 'Registros del universo onco sin CPM configurado pero con existencias.',
      },
      {
        KPI: 'CPM 0 sin existencia',
        Valor: cpmCeroSinExistencia,
        Unidad: 'registros',
        Nota: 'Registros del universo onco sin CPM configurado y sin existencias.',
      },
    ];
  }

  private toExcelBalanceEstatalRows(abastoRows: IbOncoAbastoCpmRow[]): Record<string, string | number | null>[] {
    const byClave = new Map<string, IbOncoAbastoCpmRow[]>();

    abastoRows.forEach(row => {
      const rows = byClave.get(row.clave_cnis) ?? [];
      rows.push(row);
      byClave.set(row.clave_cnis, rows);
    });

    const balanceRows: Record<string, string | number | null>[] = [];

    [...byClave.values()].forEach(rows => {
      const balance = this.calcularBalanceDetalleEstatal(rows);
      if (!balance) return;

      const claveRow = rows[0];
      if (balance.movimientos.length === 0) {
        balance.almacenes.forEach(almacen => {
          balanceRows.push({
            'Clave CNIS': claveRow.clave_cnis,
            Descripcion: claveRow.descripcion ?? '',
            'CPM estatal': balance.cpmTotal,
            'Faltante CPM x 3': balance.faltanteTotal,
            'Existencia almacenes': balance.almacenesTotal,
            'Excedente hospitales': balance.excedenteTotal,
            'Piezas sugeridas': balance.piezasSugeridas,
            'Origen tipo': 'ALMACEN',
            Origen: almacen.almacen,
            Destino: '',
            Piezas: almacen.piezas,
            'Existencia destino': null,
            'Transferencia previa destino': null,
            'Transferencia acumulada destino': null,
            'Avance CPM x 3 texto': '',
            'Cobertura CPM x 3 destino': null,
            'Objetivo CPM x 3 destino': null,
            'Faltante destino': null,
            Nota: balance.cpmTotal <= 0
              ? 'Insumo sin CPM estatal configurado; existencia en almacen solo informativa.'
              : 'Existencia en almacen sin movimiento sugerido.',
          });
        });
        return;
      }

      balance.movimientos.forEach(movimiento => {
        balanceRows.push({
          'Clave CNIS': claveRow.clave_cnis,
          Descripcion: claveRow.descripcion ?? '',
          'CPM estatal': balance.cpmTotal,
          'Faltante CPM x 3': balance.faltanteTotal,
          'Existencia almacenes': balance.almacenesTotal,
          'Excedente hospitales': balance.excedenteTotal,
          'Piezas sugeridas': balance.piezasSugeridas,
          'Origen tipo': movimiento.desde.tipo === 'almacen' ? 'ALMACEN' : 'HOSPITAL',
          Origen: movimiento.desde.nombre,
          Destino: movimiento.hacia.nombre_de_unidad || movimiento.hacia.cluesimb,
          Piezas: movimiento.piezas,
          'Existencia destino': movimiento.existenciaDestino,
          'Transferencia previa destino': movimiento.acumuladoPrevioDestino,
          'Transferencia acumulada destino': movimiento.acumuladoDestino,
          'Avance CPM x 3 texto': this.avanceCpmX3Texto(movimiento),
          'Cobertura CPM x 3 destino': movimiento.existenciaDestino + movimiento.acumuladoDestino,
          'Objetivo CPM x 3 destino': movimiento.objetivoDestino,
          'Faltante destino': movimiento.faltanteDestino,
          Nota: 'Sugerencia informativa sujeta a validacion operativa, normativa, lote, caducidad, conservacion, documentacion y autorizaciones aplicables.',
        });
      });
    });

    return balanceRows;
  }

  private toPropuestaRedistribucionRows(
    balanceRows: Record<string, string | number | null>[]
  ): IbOncoPropuestaRedistribucionRow[] {
    return balanceRows
      .map(row => ({
        origen: String(row['Origen'] ?? '').trim(),
        claveCnis: String(row['Clave CNIS'] ?? '').trim(),
        descripcion: String(row['Descripcion'] ?? '').trim(),
        cantidad: Number(row['Piezas'] ?? 0),
        destino: String(row['Destino'] ?? '').trim(),
      }))
      .filter(row => row.origen.length > 0 && row.destino.length > 0 && row.cantidad > 0);
  }

  private async fetchTemplateIbOnco(): Promise<ArrayBuffer> {
    const response = await fetch('/template-ib-onco.xlsx');
    if (!response.ok) {
      throw new Error('No se pudo cargar la plantilla IB-Onco.');
    }

    return response.arrayBuffer();
  }

  private async generarArchivoPropuesta(
    origen: string,
    rows: IbOncoPropuestaRedistribucionRow[],
    templateBuffer: ArrayBuffer
  ): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(templateBuffer.slice(0));

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('La plantilla no contiene hojas.');
    }

    const imgBuffer = await fetch('ib-onco-logo.png')
      .then(res => res.arrayBuffer())
      .then(buffer => new Uint8Array(buffer));

    const imageId = workbook.addImage({
      buffer: imgBuffer.buffer,
      extension: 'png',
    });
    worksheet!.getCell('B1').value = '';
    worksheet.addImage(imageId, {
      tl: { col: 1, row: 0 },
      ext: { width: 150, height: 40 },
      editAs: 'oneCell',
    });

    worksheet.getCell('B4').value = origen;
    worksheet.getCell('D4').value = 'IMPLEMENTACIÓN DE REDISTRIBUCIÓN ESTATAL';
    // Aqui va nombre de responsable farmacia de unidad o responsable de almacen
    worksheet.getCell('E5').value = '';

    rows.forEach((row, index) => {
      const rowNumber = 11 + index;
      this.copyExcelRowStyle(worksheet, 11, rowNumber, 2, 6);

      worksheet.getCell(`B${rowNumber}`).value = index + 1;
      worksheet.getCell(`C${rowNumber}`).value = row.claveCnis;
      worksheet.getCell(`D${rowNumber}`).value = row.descripcion;
      worksheet.getCell(`E${rowNumber}`).value = row.cantidad;
      worksheet.getCell(`F${rowNumber}`).value = row.destino;
    });

    const disclaimerRow = 10 + rows.length + 2;
    const disclaimerCell = worksheet.getCell(`B${disclaimerRow}`);

    worksheet.mergeCells(`B${disclaimerRow}:F${disclaimerRow}`);

    disclaimerCell.value =
      'Documento de apoyo operativo. No constituye autorización de traslado hasta contar con validación correspondiente.';
    disclaimerCell.alignment = { wrapText: true, vertical: 'top' };
    disclaimerCell.font = { italic: true, color: { argb: '92400E' } };

    worksheet.getRow(disclaimerRow).height = 30;

    await this.downloadExcelJsWorkbook(
      workbook,
      `IB_ONCO_PROPUESTA_${this.safeFilename(origen)}_${this.timestamp()}.xlsx`
    );
  }

  private sortPropuestaRows(rows: IbOncoPropuestaRedistribucionRow[]): IbOncoPropuestaRedistribucionRow[] {
    return [...rows].sort((a, b) => {
      const destinoCompare = a.destino.localeCompare(b.destino, 'es', { numeric: true, sensitivity: 'base' });
      if (destinoCompare !== 0) return destinoCompare;

      return a.claveCnis.localeCompare(b.claveCnis, 'es', { numeric: true, sensitivity: 'base' });
    });
  }

  private copyExcelRowStyle(
    worksheet: ExcelJS.Worksheet,
    sourceRow: number,
    targetRow: number,
    startColumn: number,
    endColumn: number
  ): void {
    if (sourceRow === targetRow) return;

    for (let column = startColumn; column <= endColumn; column++) {
      const sourceCell = worksheet.getCell(sourceRow, column);
      const targetCell = worksheet.getCell(targetRow, column);
      targetCell.style = { ...sourceCell.style };
      targetCell.numFmt = sourceCell.numFmt;
    }
  }

  private async downloadExcelJsWorkbook(workbook: ExcelJS.Workbook, filename: string): Promise<void> {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private groupBy<T>(rows: T[], keySelector: (row: T) => string): Map<string, T[]> {
    const grouped = new Map<string, T[]>();

    rows.forEach(row => {
      const key = keySelector(row);
      const current = grouped.get(key) ?? [];
      current.push(row);
      grouped.set(key, current);
    });

    return grouped;
  }

  private safeFilename(value: string): string {
    return this.normalizarTextoBalance(value)
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'ORIGEN';
  }

  private avanceCpmX3Texto(movimiento: IbOncoBalanceMovimiento): string {
    const piezas = this.formatInteger(movimiento.piezas);
    const existencia = this.formatInteger(movimiento.existenciaDestino);
    const objetivo = this.formatInteger(movimiento.objetivoDestino);

    if (movimiento.acumuladoPrevioDestino > 0) {
      const previo = this.formatInteger(movimiento.acumuladoPrevioDestino);
      return `(${piezas} + (${previo} + ${existencia}))/${objetivo}`;
    }

    return `(${piezas} + ${existencia})/${objetivo}`;
  }

  private formatInteger(value: number): string {
    return Math.round(Number(value ?? 0)).toLocaleString('es-MX');
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

  private calcularPorcentajeAbasto(rows: IbOncoAbastoCpmRow[], objetivoTipo: 'cpm' | 'cpm_x_3'): number | null {
    const rowsConCpm = rows.filter(row => Number(row.cpm ?? 0) > 0);
    const objetivoTotal = this.sumarObjetivoAbasto(rowsConCpm, objetivoTipo);

    if (objetivoTotal <= 0) return null;

    const coberturaTotal = this.sumarCoberturaAbasto(rowsConCpm, objetivoTipo);

    return (coberturaTotal / objetivoTotal) * 100;
  }

  private calcularPorcentajeClavesConExistencia(rows: IbOncoAbastoCpmRow[]): number | null {
    const rowsConCpm = rows.filter(row => Number(row.cpm ?? 0) > 0);
    if (rowsConCpm.length === 0) return null;

    const rowsConExistencia = rowsConCpm.filter(row => Number(row.existencias ?? 0) > 0);
    return (rowsConExistencia.length / rowsConCpm.length) * 100;
  }

  private sumarObjetivoAbasto(rows: IbOncoAbastoCpmRow[], objetivoTipo: 'cpm' | 'cpm_x_3'): number {
    return rows.reduce((total, row) => total + this.objetivoPorTipo(row, objetivoTipo), 0);
  }

  private sumarCoberturaAbasto(rows: IbOncoAbastoCpmRow[], objetivoTipo: 'cpm' | 'cpm_x_3'): number {
    return rows.reduce((total, row) => {
      const objetivo = this.objetivoPorTipo(row, objetivoTipo);
      const existencias = Math.max(0, Number(row.existencias ?? 0));
      return total + Math.min(existencias, objetivo);
    }, 0);
  }

  private objetivoPorTipo(row: IbOncoAbastoCpmRow, objetivoTipo: 'cpm' | 'cpm_x_3'): number {
    if (objetivoTipo === 'cpm') {
      return Math.max(0, Math.ceil(Number(row.cpm ?? 0)));
    }

    return this.objetivoAbasto(row);
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

  private calcularBalanceDetalleEstatal(rows: IbOncoAbastoCpmRow[]): IbOncoBalanceEstatal | null {
    const cpmTotal = rows.reduce((total, row) => total + Number(row.cpm ?? 0), 0);
    const donadoresHospital = rows
      .map(row => {
        const objetivo = this.objetivoAbasto(row);
        return {
          nombre: row.nombre_de_unidad || row.cluesimb,
          piezas: Math.max(0, Number(row.existencias ?? 0) - objetivo),
          tipo: 'hospital' as const,
          row,
        };
      })
      .filter(item => item.piezas > 0)
      .sort((a, b) => b.piezas - a.piezas);

    const almacenes = this.obtenerExistenciasAlmacenDetalleEstatal(rows);
    const donadoresAlmacen = almacenes
      .map(item => ({
        nombre: item.almacen,
        piezas: item.piezas,
        tipo: 'almacen' as const,
      }))
      .filter(item => item.piezas > 0)
      .sort((a, b) => b.piezas - a.piezas);

    const donadores = [...donadoresAlmacen, ...donadoresHospital];

    const receptores = rows
      .map(row => {
        const objetivo = this.objetivoAbasto(row);
        return {
          row,
          objetivo,
          piezas: Math.max(0, objetivo - Number(row.existencias ?? 0)),
        };
      })
      .filter(item => item.piezas > 0)
      .sort((a, b) => b.piezas - a.piezas);

    const excedenteTotal = donadoresHospital.reduce((total, item) => total + item.piezas, 0);
    const almacenesTotal = donadoresAlmacen.reduce((total, item) => total + item.piezas, 0);
    const disponibleTotal = excedenteTotal + almacenesTotal;
    const faltanteTotal = receptores.reduce((total, item) => total + item.piezas, 0);
    const piezasSugeridas = Math.min(disponibleTotal, faltanteTotal);

    if (piezasSugeridas <= 0 && almacenesTotal <= 0) return null;

    const necesidades = piezasSugeridas > 0
      ? this.distribuirNecesidades(receptores, piezasSugeridas, faltanteTotal)
      : [];
    const movimientos = necesidades.length > 0
      ? this.asignarMovimientos(donadores, receptores, necesidades)
      : [];
    const piezasSugeridasAlmacenes = movimientos
      .filter(movimiento => movimiento.desde.tipo === 'almacen')
      .reduce((total, movimiento) => total + movimiento.piezas, 0);
    const piezasSugeridasHospitales = movimientos
      .filter(movimiento => movimiento.desde.tipo === 'hospital')
      .reduce((total, movimiento) => total + movimiento.piezas, 0);

    return {
      cpmTotal,
      excedenteTotal,
      faltanteTotal,
      piezasSugeridas,
      almacenesTotal,
      piezasSugeridasAlmacenes,
      piezasSugeridasHospitales,
      almacenes,
      donadores,
      receptores,
      movimientos,
    };
  }

  private objetivoAbasto(row: IbOncoAbastoCpmRow): number {
    return Math.max(0, Math.ceil(Number(row.cpm_x_3 ?? Number(row.cpm ?? 0) * 3)));
  }

  private distribuirNecesidades(
    receptores: IbOncoBalanceUnidad[],
    piezasDisponibles: number,
    faltanteTotal: number
  ): number[] {
    if (piezasDisponibles >= faltanteTotal) {
      return receptores.map(item => item.piezas);
    }

    const asignaciones = receptores.map((item, index) => {
      const proporcion = (item.piezas / faltanteTotal) * piezasDisponibles;
      return {
        index,
        piezasBase: Math.floor(proporcion),
        residuo: proporcion - Math.floor(proporcion),
      };
    });

    let restantes = piezasDisponibles - asignaciones.reduce((total, item) => total + item.piezasBase, 0);
    asignaciones
      .sort((a, b) => b.residuo - a.residuo)
      .forEach(item => {
        if (restantes <= 0) return;
        item.piezasBase++;
        restantes--;
      });

    return asignaciones
      .sort((a, b) => a.index - b.index)
      .map(item => item.piezasBase);
  }

  private asignarMovimientos(
    donadores: IbOncoBalanceDonador[],
    receptores: IbOncoBalanceUnidad[],
    necesidades: number[]
  ): IbOncoBalanceMovimiento[] {
    const disponibles = donadores.map(item => item.piezas);
    const necesidadesRestantes = [...necesidades];
    const movimientos: IbOncoBalanceMovimiento[] = [];

    donadores.forEach((donador, donadorIndex) => {
      if (donador.tipo !== 'almacen') return;

      receptores.forEach((receptor, receptorIndex) => {
        if (disponibles[donadorIndex] <= 0) return;
        if (necesidadesRestantes[receptorIndex] <= 0) return;
        if (!this.esPrioridadJurisdiccionalAlmacen(donador.nombre, receptor.row)) return;

        const piezas = Math.min(disponibles[donadorIndex], necesidadesRestantes[receptorIndex]);
        if (piezas <= 0) return;

        movimientos.push({
          desde: donador,
          hacia: receptor.row,
          piezas,
          acumuladoPrevioDestino: (necesidades[receptorIndex] ?? 0) - necesidadesRestantes[receptorIndex],
          acumuladoDestino: (necesidades[receptorIndex] ?? 0) - necesidadesRestantes[receptorIndex] + piezas,
          faltanteDestino: necesidades[receptorIndex] ?? receptor.piezas,
          existenciaDestino: Number(receptor.row.existencias ?? 0),
          objetivoDestino: receptor.objetivo,
        });
        disponibles[donadorIndex] -= piezas;
        necesidadesRestantes[receptorIndex] -= piezas;
      });
    });

    receptores.forEach((receptor, receptorIndex) => {
      let restante = necesidadesRestantes[receptorIndex] ?? 0;

      for (let donadorIndex = 0; donadorIndex < donadores.length && restante > 0; donadorIndex++) {
        const piezas = Math.min(disponibles[donadorIndex], restante);
        if (piezas <= 0) continue;

        movimientos.push({
          desde: donadores[donadorIndex],
          hacia: receptor.row,
          piezas,
          acumuladoPrevioDestino: (necesidades[receptorIndex] ?? 0) - restante,
          acumuladoDestino: (necesidades[receptorIndex] ?? 0) - restante + piezas,
          faltanteDestino: necesidades[receptorIndex] ?? receptor.piezas,
          existenciaDestino: Number(receptor.row.existencias ?? 0),
          objetivoDestino: receptor.objetivo,
        });
        disponibles[donadorIndex] -= piezas;
        restante -= piezas;
      }
    });

    return movimientos;
  }

  private esPrioridadJurisdiccionalAlmacen(almacen: string, row: IbOncoAbastoCpmRow): boolean {
    const almacenNorm = this.normalizarTextoBalance(almacen);
    const unidadNorm = this.normalizarTextoBalance(row.nombre_de_unidad || row.cluesimb);

    if (almacenNorm.includes('MEXICALI')) {
      return unidadNorm.includes('MEXICALI') || unidadNorm.includes('UNEME');
    }
    if (almacenNorm.includes('ENSENADA')) {
      return unidadNorm.includes('ENSENADA');
    }
    if (almacenNorm.includes('TIJUANA')) {
      return unidadNorm.includes('TIJUANA');
    }

    return false;
  }

  private normalizarTextoBalance(value: string): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLocaleUpperCase();
  }

  private obtenerExistenciasAlmacenDetalleEstatal(rows: IbOncoAbastoCpmRow[]): { almacen: string; piezas: number }[] {
    const selected = this.selectedEstatalRow();
    const clave = selected?.clave_cnis ?? rows[0]?.clave_cnis ?? '';
    const claveNormalizada = this.inventarioService.normalizarClave(clave);
    if (!claveNormalizada) return [];

    const byAlmacen = new Map<string, number>();

    this.inventarioAlmacenes().forEach(item => {
      const itemClave = this.inventarioService.normalizarClave(String(item.clave ?? ''));
      if (itemClave !== claveNormalizada) return;

      const piezas = Math.max(0, Number(item.disponible ?? 0) - Number(item.comprometidos ?? 0));
      if (piezas <= 0) return;

      const almacen = String(item.almacen ?? 'Almacen').trim() || 'Almacen';
      byAlmacen.set(almacen, (byAlmacen.get(almacen) ?? 0) + piezas);
    });

    return [...byAlmacen.entries()].map(([almacen, piezas]) => ({ almacen, piezas }));
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
