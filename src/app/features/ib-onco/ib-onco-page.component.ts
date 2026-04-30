import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  IbOncoAbastoCpmRow,
  IbOncoCitaPendiente,
  IbOncoClave,
  IbOncoEstadoAbastoFiltro,
  IbOncoPaginatedResponse,
  IbOncoResumenUnidad,
  IbOncoUnidad,
} from '../../models/ib-onco';
import { IbOncoService } from '../../services/ib-onco.service';

type IbOncoTab = 'abasto' | 'citas';

interface IbOncoKpi {
  label: string;
  value: number;
}

@Component({
  selector: 'app-ib-onco-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ib-onco-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IbOncoPageComponent {
  private ibOncoService = inject(IbOncoService);

  loadingInicial = signal(false);
  loadingAbasto = signal(false);
  loadingCitas = signal(false);
  error = signal<string | null>(null);

  unidades = signal<IbOncoUnidad[]>([]);
  claves = signal<IbOncoClave[]>([]);
  resumen = signal<IbOncoResumenUnidad[]>([]);
  abasto = signal<IbOncoPaginatedResponse<IbOncoAbastoCpmRow>>(this.emptyPage<IbOncoAbastoCpmRow>(25));
  citas = signal<IbOncoPaginatedResponse<IbOncoCitaPendiente>>(this.emptyPage<IbOncoCitaPendiente>(25));

  tab = signal<IbOncoTab>('abasto');
  cluesimb = signal('');
  claveCnis = signal('');
  search = signal('');
  estadoAbasto = signal<IbOncoEstadoAbastoFiltro>('');
  windowDays = signal(15);
  abastoPage = signal(1);
  abastoLimit = signal(25);
  citasPage = signal(1);
  citasLimit = signal(25);

  resumenVisible = computed(() => {
    const unidad = this.cluesimb();
    if (!unidad) return this.resumen();
    return this.resumen().filter(row => row.cluesimb === unidad);
  });

  kpis = computed<IbOncoKpi[]>(() => {
    const rows = this.resumenVisible();
    return [
      { label: 'Unidades monitoreadas', value: rows.length },
      { label: 'Claves onco', value: this.sum(rows, 'claves_onco') },
      { label: 'Claves con posible sobre abasto', value: this.sum(rows, 'claves_posible_sobre_abasto') },
      { label: 'Citas pendientes', value: this.sum(rows, 'citas_pendientes') },
      { label: 'Piezas pendientes', value: this.sum(rows, 'piezas_pendientes') },
    ];
  });

  unidadSeleccionada = computed(() =>
    this.unidades().find(unidad => unidad.cluesimb === this.cluesimb()) ?? null
  );

  abastoTotalPages = computed(() => Math.max(1, this.abasto().totalPages || 1));
  citasTotalPages = computed(() => Math.max(1, this.citas().totalPages || 1));

  abastoStart = computed(() => this.rangeStart(this.abasto()));
  abastoEnd = computed(() => this.rangeEnd(this.abasto()));
  citasStart = computed(() => this.rangeStart(this.citas()));
  citasEnd = computed(() => this.rangeEnd(this.citas()));

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
      await Promise.all([
        this.cargarAbasto(),
        this.cargarCitas(),
      ]);
    } catch {
      this.error.set('No se pudo cargar la informacion inicial de IB-ONCO.');
    } finally {
      this.loadingInicial.set(false);
    }
  }

  async onUnidadChange(value: string): Promise<void> {
    this.cluesimb.set(value);
    this.claveCnis.set('');
    this.abastoPage.set(1);
    this.citasPage.set(1);
    this.claves.set([]);

    if (value) {
      await this.cargarClaves(value);
    }

    await Promise.all([
      this.cargarAbasto(),
      this.cargarCitas(),
    ]);
  }

  async onClaveChange(value: string): Promise<void> {
    this.claveCnis.set(value);
    this.abastoPage.set(1);
    this.citasPage.set(1);
    await Promise.all([
      this.cargarAbasto(),
      this.cargarCitas(),
    ]);
  }

  async onAbastoFiltroChange(): Promise<void> {
    this.abastoPage.set(1);
    await this.cargarAbasto();
  }

  async onWindowDaysChange(value: string | number): Promise<void> {
    const parsed = Math.min(Math.max(Number(value) || 15, 1), 365);
    this.windowDays.set(parsed);
    this.citasPage.set(1);
    await Promise.all([
      this.cargarResumen(),
      this.cargarCitas(),
    ]);
  }

  async limpiarFiltros(): Promise<void> {
    this.cluesimb.set('');
    this.claveCnis.set('');
    this.search.set('');
    this.estadoAbasto.set('');
    this.abastoPage.set(1);
    this.citasPage.set(1);
    this.claves.set([]);
    await Promise.all([
      this.cargarAbasto(),
      this.cargarCitas(),
    ]);
  }

  async refrescar(): Promise<void> {
    await Promise.all([
      this.cargarResumen(),
      this.cargarAbasto(),
      this.cargarCitas(),
    ]);
  }

  async previousAbastoPage(): Promise<void> {
    if (this.abastoPage() <= 1) return;
    this.abastoPage.set(this.abastoPage() - 1);
    await this.cargarAbasto();
  }

  async nextAbastoPage(): Promise<void> {
    if (this.abastoPage() >= this.abastoTotalPages()) return;
    this.abastoPage.set(this.abastoPage() + 1);
    await this.cargarAbasto();
  }

  async onAbastoLimitChange(value: string | number): Promise<void> {
    this.abastoLimit.set(Number(value) || 25);
    this.abastoPage.set(1);
    await this.cargarAbasto();
  }

  async previousCitasPage(): Promise<void> {
    if (this.citasPage() <= 1) return;
    this.citasPage.set(this.citasPage() - 1);
    await this.cargarCitas();
  }

  async nextCitasPage(): Promise<void> {
    if (this.citasPage() >= this.citasTotalPages()) return;
    this.citasPage.set(this.citasPage() + 1);
    await this.cargarCitas();
  }

  async onCitasLimitChange(value: string | number): Promise<void> {
    this.citasLimit.set(Number(value) || 25);
    this.citasPage.set(1);
    await this.cargarCitas();
  }

  estadoClass(row: IbOncoAbastoCpmRow): string {
    return row.estado_abasto === 'posible sobre abasto'
      ? 'bg-amber-50 text-amber-800'
      : 'bg-emerald-50 text-emerald-700';
  }

  trackAbasto(row: IbOncoAbastoCpmRow): string {
    return `${row.cluesimb}-${row.clave_cnis}`;
  }

  trackCita(row: IbOncoCitaPendiente): string {
    return `${row.id}-${row.orden_de_suministro ?? ''}`;
  }

  private async cargarClaves(cluesimb: string): Promise<void> {
    try {
      const response = await firstValueFrom(this.ibOncoService.obtenerClaves(cluesimb));
      this.claves.set(response.data ?? []);
    } catch {
      this.error.set('No se pudieron cargar las claves onco de la unidad seleccionada.');
      this.claves.set([]);
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

  private async cargarAbasto(): Promise<void> {
    this.loadingAbasto.set(true);
    this.error.set(null);

    try {
      const response = await firstValueFrom(this.ibOncoService.obtenerAbastoCpm({
        cluesimb: this.cluesimb(),
        clave_cnis: this.claveCnis(),
        estado_abasto: this.estadoAbasto(),
        search: this.search().trim(),
        page: this.abastoPage(),
        limit: this.abastoLimit(),
      }));
      this.abasto.set(response);
    } catch {
      this.error.set('No se pudo cargar la tabla de abasto CPM.');
      this.abasto.set(this.emptyPage<IbOncoAbastoCpmRow>(this.abastoLimit()));
    } finally {
      this.loadingAbasto.set(false);
    }
  }

  private async cargarCitas(): Promise<void> {
    this.loadingCitas.set(true);
    this.error.set(null);

    try {
      const response = await firstValueFrom(this.ibOncoService.obtenerCitasPendientes({
        cluesimb: this.cluesimb(),
        clave_cnis: this.claveCnis(),
        window_days: this.windowDays(),
        page: this.citasPage(),
        limit: this.citasLimit(),
      }));
      this.citas.set(response);
    } catch {
      this.error.set('No se pudo cargar la tabla de citas pendientes.');
      this.citas.set(this.emptyPage<IbOncoCitaPendiente>(this.citasLimit()));
    } finally {
      this.loadingCitas.set(false);
    }
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

  private rangeStart<T>(page: IbOncoPaginatedResponse<T>): number {
    return page.total === 0 ? 0 : page.offset + 1;
  }

  private rangeEnd<T>(page: IbOncoPaginatedResponse<T>): number {
    return Math.min(page.offset + page.rows.length, page.total);
  }
}
