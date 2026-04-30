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

interface IbOncoKpi {
  label: string;
  value: number;
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

  readonly SearchIcon = Search;
  readonly XIcon = X;
  readonly DownloadIcon = Download;

  loadingInicial = signal(false);
  loadingClaves = signal(false);
  loadingModal = signal(false);
  exportando = signal(false);
  error = signal<string | null>(null);
  modalError = signal<string | null>(null);

  unidades = signal<IbOncoUnidad[]>([]);
  resumen = signal<IbOncoResumenUnidad[]>([]);
  abasto = signal<IbOncoPaginatedResponse<IbOncoAbastoCpmRow>>(this.emptyPage<IbOncoAbastoCpmRow>(1000));
  modalCitas = signal<IbOncoCitaPendiente[]>([]);

  cluesimb = signal('');
  search = signal('');
  windowDays = signal(120);
  selectedRow = signal<IbOncoAbastoCpmRow | null>(null);
  selectedAnalysisType = signal<'sobreabasto' | 'faltantes'>('faltantes');
  checkedCitas = signal<number[]>([]);

  unidadSeleccionada = computed(() =>
    this.unidades().find(unidad => unidad.cluesimb === this.cluesimb()) ?? null
  );

  resumenVisible = computed(() => {
    const unidad = this.cluesimb();
    if (!unidad) return [];
    return this.resumen().filter(row => row.cluesimb === unidad);
  });

  kpis = computed<IbOncoKpi[]>(() => {
    const rows = this.resumenVisible();
    return [
      { label: 'Claves onco', value: this.sum(rows, 'claves_onco') },
      { label: 'Posible sobre abasto', value: this.sum(rows, 'claves_posible_sobre_abasto') },
      { label: 'Citas pendientes', value: this.sum(rows, 'citas_pendientes') },
      { label: 'Piezas pendientes', value: this.sum(rows, 'piezas_pendientes') },
    ];
  });

  modalAnalisisTitulo = computed(() => {
    return this.selectedAnalysisType() === 'sobreabasto'
      ? 'Analisis sobre abasto'
      : 'Analisis faltantes';
  });

  modalAnalisisRows = computed(() => {
    const row = this.selectedRow();
    return row ? this.modalCitas() : [];
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
    this.cerrarModal();

    if (!value) return;
    await this.cargarClavesHospital();
  }

  async onSearchChange(value: string): Promise<void> {
    this.search.set(value);
    if (!this.cluesimb()) return;
    await this.cargarClavesHospital();
  }

  async refrescar(): Promise<void> {
    await this.cargarResumen();
    if (this.cluesimb()) {
      await this.cargarClavesHospital();
    }
  }

  async exportarExcel(): Promise<void> {
    if (this.exportando()) return;

    this.exportando.set(true);
    this.error.set(null);

    try {
      const abastoRows = await this.fetchAllAbasto();
      const sobreabastoRows: Record<string, string | number | null>[] = [];
      const faltantesRows: Record<string, string | number | null>[] = [];

      const rowsConCitas = abastoRows.filter(row => row.tiene_citas_pendientes);

      for (const row of rowsConCitas) {
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
    return row.estado_abasto === 'posible sobre abasto';
  }

  trackAbasto(row: IbOncoAbastoCpmRow): string {
    return `${row.cluesimb}-${row.clave_cnis}`;
  }

  trackCita(row: IbOncoCitaPendiente): string {
    return `${row.id}-${row.orden_de_suministro ?? ''}`;
  }

  private async cargarClavesHospital(): Promise<void> {
    this.loadingClaves.set(true);
    this.error.set(null);

    try {
      const response = await firstValueFrom(this.ibOncoService.obtenerAbastoCpm({
        cluesimb: this.cluesimb(),
        search: this.search().trim(),
        window_days: this.windowDays(),
        page: 1,
        limit: 1000,
      }));
      this.abasto.set(response);
    } catch {
      this.error.set('No se pudieron cargar las claves del hospital seleccionado.');
      this.abasto.set(this.emptyPage<IbOncoAbastoCpmRow>(1000));
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
      'c.fecha_emision': this.formatDateForExcel(cita.fecha_emision),
      'c.fecha_limite_de_entrega': this.formatDateForExcel(cita.fecha_limite_de_entrega),
      checkbox: '',
    };
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
}
