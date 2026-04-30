import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  BalanceoV2Apartado,
  BalanceoV2Detalle,
  BalanceoV2Ejecucion,
  BalanceoV2Resultado,
  BalanceoV2ResumenJurisdiccional,
} from '../../../../models/balanceo-v2';
import { BalanceoV2Service } from '../../../../services/balanceo-v2.service';

type BalanceoV2CoberturaFiltro = 'todas' | 'cubre' | 'no-cubre';
type BalanceoV2MovimientoFiltro = 'todos' | 'excedente' | 'recibe' | 'transfiere';
type BalanceoV2DetalleTab = 'sugerencias' | 'apartado' | 'resultados';

interface BalanceoV2ResumenDiscreto {
  label: string;
  value: string | number;
}

interface BalanceoV2ResumenGrupo {
  key: string;
  clave_cnis: string;
  descripcion: string;
  rows: BalanceoV2ResumenJurisdiccional[];
  cpm_jurisdiccional: number;
  existencia_original_almacen: number;
  cantidad_apartada: number;
  existencia_balanceable_inicial: number;
  transferido_a_otros: number;
  recibido_de_otros: number;
  excedente_final: number;
  delta_vs_cpm: number;
  deficitCount: number;
}

@Component({
  selector: 'app-balanceo-v2',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './balanceo-v2.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BalanceoV2Component {
  private balanceoV2Service = inject(BalanceoV2Service);

  loading = signal(false);
  ejecutando = signal(false);
  cargandoDetalle = signal(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);

  ejecuciones = signal<BalanceoV2Ejecucion[]>([]);
  ultimaEjecucion = signal<BalanceoV2Ejecucion | null>(null);
  ejecucionSeleccionadaId = signal<number | null>(null);

  resumenJurisdiccional = signal<BalanceoV2ResumenJurisdiccional[]>([]);
  detalle = signal<BalanceoV2Detalle[]>([]);
  apartados = signal<BalanceoV2Apartado[]>([]);
  resultados = signal<BalanceoV2Resultado[]>([]);
  filaSeleccionada = signal<BalanceoV2ResumenJurisdiccional | null>(null);

  filtroClave = signal('');
  filtroDescripcion = signal('');
  filtroJurisdiccion = signal('');
  filtroCobertura = signal<BalanceoV2CoberturaFiltro>('todas');
  filtroMovimiento = signal<BalanceoV2MovimientoFiltro>('todos');
  pageSize = signal(25);
  currentPage = signal(1);
  detalleTab = signal<BalanceoV2DetalleTab>('sugerencias');
  gruposColapsados = signal<string[]>([]);

  ejecucionSeleccionada = computed(() => {
    const id = this.ejecucionSeleccionadaId();
    return this.ejecuciones().find(ejecucion => ejecucion.id === id) ?? null;
  });

  jurisdicciones = computed(() => {
    const values = new Set(
      this.resumenJurisdiccional()
        .map(row => row.jurisdiccion)
        .filter(jurisdiccion => jurisdiccion.trim().length > 0)
    );
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  });

  tieneDescripcionesClave = computed(() =>
    this.resumenJurisdiccional().some(row => this.descripcionClave(row).length > 0)
  );

  resumenFiltrado = computed(() => {
    const clave = this.filtroClave().trim().toLowerCase();
    const descripcion = this.filtroDescripcion().trim().toLowerCase();
    const jurisdiccion = this.filtroJurisdiccion();
    const cobertura = this.filtroCobertura();
    const movimiento = this.filtroMovimiento();

    return this.resumenJurisdiccional().filter(row => {
      const tieneValoresOperativos = this.tieneValoresOperativos(row);
      const coincideClave = !clave || row.clave_cnis.toLowerCase().includes(clave);
      const coincideDescripcion = !descripcion || this.descripcionClave(row).toLowerCase().includes(descripcion);
      const coincideJurisdiccion = !jurisdiccion || row.jurisdiccion === jurisdiccion;
      const coincideCobertura =
        cobertura === 'todas' ||
        (cobertura === 'cubre' && row.cubre_cpm_jurisdiccional) ||
        (cobertura === 'no-cubre' && !row.cubre_cpm_jurisdiccional);
      const coincideMovimiento =
        movimiento === 'todos' ||
        (movimiento === 'excedente' && Number(row.excedente_final ?? 0) > 0) ||
        (movimiento === 'recibe' && Number(row.recibido_de_otros ?? 0) > 0) ||
        (movimiento === 'transfiere' && Number(row.transferido_a_otros ?? 0) > 0);

      return tieneValoresOperativos && coincideClave && coincideDescripcion && coincideJurisdiccion && coincideCobertura && coincideMovimiento;
    });
  });

  resumenAgrupado = computed<BalanceoV2ResumenGrupo[]>(() => {
    const groups = new Map<string, BalanceoV2ResumenGrupo>();

    for (const row of this.resumenFiltrado()) {
      const key = row.clave_cnis;
      const current = groups.get(key);

      if (current) {
        current.rows.push(row);
        this.acumularGrupo(current, row);
      } else {
        const group: BalanceoV2ResumenGrupo = {
          key,
          clave_cnis: row.clave_cnis,
          descripcion: this.descripcionClave(row),
          rows: [row],
          cpm_jurisdiccional: 0,
          existencia_original_almacen: 0,
          cantidad_apartada: 0,
          existencia_balanceable_inicial: 0,
          transferido_a_otros: 0,
          recibido_de_otros: 0,
          excedente_final: 0,
          delta_vs_cpm: 0,
          deficitCount: 0,
        };
        this.acumularGrupo(group, row);
        groups.set(key, group);
      }
    }

    return Array.from(groups.values()).sort((a, b) => a.clave_cnis.localeCompare(b.clave_cnis));
  });

  totalPages = computed(() =>
    Math.max(1, Math.ceil(this.resumenAgrupado().length / this.pageSize()))
  );

  gruposPaginados = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const start = (page - 1) * this.pageSize();
    return this.resumenAgrupado().slice(start, start + this.pageSize());
  });

  paginationStart = computed(() => {
    const total = this.resumenAgrupado().length;
    if (total === 0) return 0;
    return (Math.min(this.currentPage(), this.totalPages()) - 1) * this.pageSize() + 1;
  });

  paginationEnd = computed(() =>
    Math.min(this.paginationStart() + this.gruposPaginados().length - 1, this.resumenAgrupado().length)
  );

  resumenDiscreto = computed<BalanceoV2ResumenDiscreto[]>(() => {
    const rows = this.resumenFiltrado();
    const claves = new Set(rows.map(row => row.clave_cnis));
    const jurisdiccionesDeficit = new Set(
      rows
        .filter(row => !row.cubre_cpm_jurisdiccional)
        .map(row => row.jurisdiccion)
    );

    return [
      { label: 'Ejecucion', value: this.ejecucionSeleccionadaId() ? `#${this.ejecucionSeleccionadaId()}` : 'Sin seleccionar' },
      { label: 'Registros mostrados', value: rows.length },
      { label: 'Claves distintas', value: claves.size },
      { label: 'Jurisdicciones con deficit', value: jurisdiccionesDeficit.size },
    ];
  });

  resultadosRelacionados = computed(() => {
    const fila = this.filaSeleccionada();
    if (!fila) return [];
    return this.resultados().filter(row => row.clave_cnis === fila.clave_cnis);
  });

  constructor() {
    void this.cargarDatosIniciales();
  }

  async cargarDatosIniciales(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);

    try {
      const [ejecucionesResponse, ultimaResponse] = await Promise.all([
        firstValueFrom(this.balanceoV2Service.obtenerEjecuciones()),
        firstValueFrom(this.balanceoV2Service.obtenerUltimaEjecucion()),
      ]);

      this.ejecuciones.set(ejecucionesResponse.data ?? []);
      this.ultimaEjecucion.set(ultimaResponse.data ?? null);

      const idInicial = ultimaResponse.data?.id ?? ejecucionesResponse.data?.[0]?.id ?? null;
      if (idInicial) {
        await this.seleccionarEjecucion(idInicial);
      }
    } catch {
      this.error.set('No se pudo cargar la informacion de balanceo V2.');
    } finally {
      this.loading.set(false);
    }
  }

  async ejecutarBalanceoV2(): Promise<void> {
    this.ejecutando.set(true);
    this.error.set(null);
    this.success.set(null);

    try {
      const response = await firstValueFrom(this.balanceoV2Service.ejecutarBalanceoV2());
      if (!response.ok) {
        this.error.set('El backend no confirmo la ejecucion del balanceo V2.');
        return;
      }

      await this.recargarEjecuciones(response.ejecucionId);
      await this.seleccionarEjecucion(response.ejecucionId);
      this.success.set(`Balanceo V2 ejecutado correctamente. Ejecucion #${response.ejecucionId}.`);
    } catch {
      this.error.set('Error al ejecutar el balanceo V2.');
    } finally {
      this.ejecutando.set(false);
    }
  }

  async onEjecucionChange(value: string | number | null): Promise<void> {
    if (value === null || value === '') {
      this.ejecucionSeleccionadaId.set(null);
      this.resumenJurisdiccional.set([]);
      this.resultados.set([]);
      this.limpiarDetalle();
      return;
    }

    const id = Number(value);
    if (!Number.isFinite(id) || id <= 0) return;
    await this.seleccionarEjecucion(id);
  }

  async seleccionarEjecucion(ejecucionId: number): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);
    this.ejecucionSeleccionadaId.set(ejecucionId);
    this.limpiarDetalle();
    this.currentPage.set(1);

    try {
      const [resumenResponse, resultadosResponse] = await Promise.all([
        firstValueFrom(this.balanceoV2Service.obtenerResumenJurisdiccional(ejecucionId)),
        firstValueFrom(this.balanceoV2Service.obtenerResultadosPorEjecucion(ejecucionId)),
      ]);

      this.resumenJurisdiccional.set(resumenResponse.data ?? []);
      this.resultados.set(resultadosResponse.data ?? []);
    } catch {
      this.error.set('No se pudo cargar la ejecucion seleccionada.');
      this.resumenJurisdiccional.set([]);
      this.resultados.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async cargarDetalle(row: BalanceoV2ResumenJurisdiccional): Promise<void> {
    const ejecucionId = this.ejecucionSeleccionadaId();
    if (!ejecucionId) return;

    if (this.rowSeleccionada(row)) {
      this.limpiarDetalle();
      return;
    }

    this.cargandoDetalle.set(true);
    this.error.set(null);
    this.success.set(null);
    this.filaSeleccionada.set(row);
    this.detalle.set([]);
    this.apartados.set([]);
    this.detalleTab.set('sugerencias');

    try {
      const [detalleResponse, apartadosResponse] = await Promise.all([
        firstValueFrom(this.balanceoV2Service.obtenerDetallePorEjecucion(ejecucionId, {
          clave_cnis: row.clave_cnis,
          jurisdiccion_almacen: row.jurisdiccion,
        })),
        firstValueFrom(this.balanceoV2Service.obtenerApartadosPorEjecucion(ejecucionId, {
          clave_cnis: row.clave_cnis,
          jurisdiccion: row.jurisdiccion,
        })),
      ]);

      this.detalle.set(detalleResponse.data ?? []);
      this.apartados.set(apartadosResponse.data ?? []);
    } catch {
      this.error.set('No se pudo cargar el detalle de la fila seleccionada.');
    } finally {
      this.cargandoDetalle.set(false);
    }
  }

  limpiarFiltros(): void {
    this.filtroClave.set('');
    this.filtroDescripcion.set('');
    this.filtroJurisdiccion.set('');
    this.filtroCobertura.set('todas');
    this.filtroMovimiento.set('todos');
    this.currentPage.set(1);
  }

  refrescarDatos(): void {
    const id = this.ejecucionSeleccionadaId();
    if (id) {
      void this.seleccionarEjecucion(id);
      return;
    }
    void this.cargarDatosIniciales();
  }

  onFiltroChange(): void {
    this.currentPage.set(1);
  }

  onPageSizeChange(value: string | number): void {
    const nextSize = Number(value);
    this.pageSize.set(Number.isFinite(nextSize) ? nextSize : 25);
    this.currentPage.set(1);
  }

  previousPage(): void {
    this.currentPage.set(Math.max(1, this.currentPage() - 1));
  }

  nextPage(): void {
    this.currentPage.set(Math.min(this.totalPages(), this.currentPage() + 1));
  }

  descripcionClave(row: BalanceoV2ResumenJurisdiccional): string {
    return row.descripcion_clave ?? row.descripcion ?? '';
  }

  tieneValoresOperativos(row: BalanceoV2ResumenJurisdiccional): boolean {
    return [
      row.existencia_original_almacen,
      row.cantidad_apartada,
      row.existencia_balanceable_inicial,
      row.transferido_a_otros,
      row.recibido_de_otros,
      row.excedente_final,
    ].some(value => this.valorVisibleDistintoDeCero(value));
  }

  private valorVisibleDistintoDeCero(value: number | string | null | undefined): boolean {
    const parsed = typeof value === 'string'
      ? Number(value.replace(/,/g, '').trim())
      : Number(value ?? 0);

    if (!Number.isFinite(parsed)) return false;
    return Math.round(Math.abs(parsed)) > 0;
  }

  grupoExpandido(groupKey: string): boolean {
    return !this.gruposColapsados().includes(groupKey);
  }

  toggleGrupo(groupKey: string): void {
    const collapsed = this.gruposColapsados();
    if (collapsed.includes(groupKey)) {
      this.gruposColapsados.set(collapsed.filter(key => key !== groupKey));
      return;
    }
    this.gruposColapsados.set([...collapsed, groupKey]);
  }

  rowKey(row: BalanceoV2ResumenJurisdiccional): string {
    return `${row.ejecucion_id}-${row.clave_cnis}-${row.jurisdiccion}`;
  }

  rowSeleccionada(row: BalanceoV2ResumenJurisdiccional): boolean {
    const selected = this.filaSeleccionada();
    return !!selected && this.rowKey(selected) === this.rowKey(row);
  }

  private acumularGrupo(group: BalanceoV2ResumenGrupo, row: BalanceoV2ResumenJurisdiccional): void {
    group.cpm_jurisdiccional += Number(row.cpm_jurisdiccional ?? 0);
    group.existencia_original_almacen += Number(row.existencia_original_almacen ?? 0);
    group.cantidad_apartada += Number(row.cantidad_apartada ?? 0);
    group.existencia_balanceable_inicial += Number(row.existencia_balanceable_inicial ?? 0);
    group.transferido_a_otros += Number(row.transferido_a_otros ?? 0);
    group.recibido_de_otros += Number(row.recibido_de_otros ?? 0);
    group.excedente_final += Number(row.excedente_final ?? 0);
    group.delta_vs_cpm += Number(row.delta_vs_cpm ?? 0);
    if (!row.cubre_cpm_jurisdiccional) {
      group.deficitCount += 1;
    }
  }

  private async recargarEjecuciones(ejecucionId?: number): Promise<void> {
    const [ejecucionesResponse, ultimaResponse] = await Promise.all([
      firstValueFrom(this.balanceoV2Service.obtenerEjecuciones()),
      firstValueFrom(this.balanceoV2Service.obtenerUltimaEjecucion()),
    ]);

    this.ejecuciones.set(ejecucionesResponse.data ?? []);
    this.ultimaEjecucion.set(ultimaResponse.data ?? null);
    if (ejecucionId) {
      this.ejecucionSeleccionadaId.set(ejecucionId);
    }
  }

  private limpiarDetalle(): void {
    this.filaSeleccionada.set(null);
    this.detalle.set([]);
    this.apartados.set([]);
  }
}
