import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import * as XLSX from 'xlsx';
import { Inventario } from '../../../../models/Inventario';
import { HomologoDTO } from '../../../../models/homologos/HomologoDto';
import {
  BalanceoV2Apartado,
  BalanceoV2Detalle,
  BalanceoV2Ejecucion,
  BalanceoV2Resultado,
  BalanceoV2ResumenJurisdiccional,
} from '../../../../models/balanceo-v2';
import { ArticulosService } from '../../../../services/articulos.service';
import { BalanceoV2Service } from '../../../../services/balanceo-v2.service';
import { HomologosService } from '../../../../services/homologos.service';
import { InventarioService } from '../../../../services/inventario.service';

type BalanceoV2CoberturaFiltro = 'todas' | 'cubre' | 'no-cubre';
type BalanceoV2MovimientoFiltro = 'todos' | 'excedente' | 'recibe' | 'transfiere';
type BalanceoV2DetalleTab = 'sugerencias' | 'apartado' | 'resultados';
type BalanceoV2VistaTab = 'tabla' | 'desglose' | 'sinCpm';
type BalanceoV2DestinoTipo = 'hospitales' | 'centrosSalud' | 'otrosAlmacenes' | 'otrosDestinos';
type BalanceoV2SinCpmFiltro = 'todos' | 'conHomologo' | 'sinHomologo' | 'vencidos' | 'criticos' | 'proximos' | 'sinCaducidad';

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

interface BalanceoV2DesgloseDestino {
  tipo: BalanceoV2DestinoTipo;
  label: string;
  cantidad: number;
  unidades: BalanceoV2Detalle[];
}

interface BalanceoV2LoteSugerido {
  lote: string;
  cantidad: number;
  caducidad: Date | null;
  diasCaducidad: number | null;
}

interface BalanceoV2DesgloseClave {
  key: string;
  clave_cnis: string;
  descripcion: string;
  cantidad: number;
  destinos: BalanceoV2DesgloseDestino[];
  lotesSugeridos: BalanceoV2LoteSugerido[];
}

interface BalanceoV2DesgloseAlmacen {
  key: string;
  almacen: string;
  cantidad: number;
  claves: BalanceoV2DesgloseClave[];
}

interface BalanceoV2SinCpmLote {
  lote: string;
  cantidad: number;
  caducidad: Date | null;
  diasCaducidad: number | null;
}

interface BalanceoV2SinCpmHomologo {
  clave_cnis: string;
  descripcion: string;
  factor: string;
  cpm_jurisdiccional: number;
  jurisdicciones: string[];
}

interface BalanceoV2SinCpmClave {
  key: string;
  clave_cnis: string;
  descripcion: string;
  almacen: string;
  cantidad: number;
  lotes: BalanceoV2SinCpmLote[];
  caducidadProxima: Date | null;
  diasCaducidad: number | null;
  estadoCaducidad: 'vencido' | 'critico' | 'proximo' | 'vigente' | 'sinCaducidad';
  accionSugerida: string;
  homologosCpm: BalanceoV2SinCpmHomologo[];
}

interface BalanceoV2SinCpmAlmacen {
  key: string;
  almacen: string;
  cantidad: number;
  claves: BalanceoV2SinCpmClave[];
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
  private articulosService = inject(ArticulosService);
  private homologosService = inject(HomologosService);
  private inventarioService = inject(InventarioService);

  loading = signal(false);
  ejecutando = signal(false);
  cargandoDetalle = signal(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);

  ejecuciones = signal<BalanceoV2Ejecucion[]>([]);
  ultimaEjecucion = signal<BalanceoV2Ejecucion | null>(null);
  ejecucionSeleccionadaId = signal<number | null>(null);

  resumenJurisdiccional = signal<BalanceoV2ResumenJurisdiccional[]>([]);
  articulosMapa = signal<Record<string, { descripcion?: string; presentacion?: string; categoria?: string | null }> | null>(null);
  homologosSinCpm = signal<Map<string, HomologoDTO[]>>(new Map());
  cargandoHomologosSinCpm = signal(false);
  inventarioAlmacenes = signal<Inventario[]>([]);
  cargandoInventario = signal(false);
  detalleEjecucion = signal<BalanceoV2Detalle[]>([]);
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
  vistaTab = signal<BalanceoV2VistaTab>('desglose');
  detalleTab = signal<BalanceoV2DetalleTab>('sugerencias');
  filtroSinCpm = signal<BalanceoV2SinCpmFiltro>('todos');
  gruposColapsados = signal<string[]>([]);
  desgloseAlmacenesColapsados = signal<string[]>([]);
  desgloseClavesColapsadas = signal<string[]>([]);

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

  desglosePorAlmacen = computed<BalanceoV2DesgloseAlmacen[]>(() => {
    const rows = this.detalleEjecucion()
      .filter(row => Number(row.cantidad_sugerida ?? 0) > 0)
      .filter(row => this.coincideFiltrosDesglose(row));
    const byAlmacen = new Map<string, {
      almacen: string;
      cantidad: number;
      claves: Map<string, {
        clave_cnis: string;
        descripcion: string;
        cantidad: number;
        destinos: Map<BalanceoV2DestinoTipo, BalanceoV2DesgloseDestino>;
      }>;
    }>();

    for (const row of rows) {
      const almacen = row.jurisdiccion_almacen || 'Almacen sin zona';
      const cantidad = Number(row.cantidad_sugerida ?? 0);
      const almacenGroup = byAlmacen.get(almacen) ?? {
        almacen,
        cantidad: 0,
        claves: new Map(),
      };
      const descripcion = this.descripcionPorClave(row.clave_cnis);
      const claveGroup = almacenGroup.claves.get(row.clave_cnis) ?? {
        clave_cnis: row.clave_cnis,
        descripcion,
        cantidad: 0,
        destinos: new Map(),
      };
      const tipo = this.tipoDestino(row);
      const destinoGroup = claveGroup.destinos.get(tipo) ?? {
        tipo,
        label: this.destinoLabel(tipo),
        cantidad: 0,
        unidades: [],
      };

      almacenGroup.cantidad += cantidad;
      claveGroup.cantidad += cantidad;
      destinoGroup.cantidad += cantidad;
      destinoGroup.unidades.push(row);

      claveGroup.destinos.set(tipo, destinoGroup);
      almacenGroup.claves.set(row.clave_cnis, claveGroup);
      byAlmacen.set(almacen, almacenGroup);
    }

    return Array.from(byAlmacen.entries())
      .map(([key, almacen]) => ({
        key,
        almacen: almacen.almacen,
        cantidad: almacen.cantidad,
        claves: Array.from(almacen.claves.entries())
          .map(([claveKey, clave]) => ({
            key: `${key}-${claveKey}`,
            clave_cnis: clave.clave_cnis,
            descripcion: clave.descripcion,
            cantidad: clave.cantidad,
            destinos: this.ordenarDestinos(Array.from(clave.destinos.values())),
            lotesSugeridos: this.lotesSugeridosParaClave(clave.clave_cnis, almacen.almacen, clave.cantidad),
          }))
          .sort((a, b) => a.clave_cnis.localeCompare(b.clave_cnis, 'es', { numeric: true, sensitivity: 'base' })),
      }))
      .sort((a, b) => a.almacen.localeCompare(b.almacen, 'es', { numeric: true, sensitivity: 'base' }));
  });

  clavesSinCpmPorAlmacenBase = computed<BalanceoV2SinCpmAlmacen[]>(() => {
    const clavesConCpm = this.clavesConCpmSet();
    const byAlmacen = new Map<string, {
      almacen: string;
      cantidad: number;
      claves: Map<string, {
        clave_cnis: string;
        almacen: string;
        cantidad: number;
        lotes: Map<string, BalanceoV2SinCpmLote>;
      }>;
    }>();

    this.inventarioAlmacenes()
      .filter(row => this.existenciaNeta(row) > 0)
      .filter(row => !clavesConCpm.has(this.normalizarClave(row.clave)))
      .filter(row => this.coincideFiltrosSinCpm(row))
      .forEach(row => {
        const clave = this.normalizarClave(row.clave);
        const almacen = String(row.almacen ?? 'Almacen sin zona').trim() || 'Almacen sin zona';
        const cantidad = this.existenciaNeta(row);
        const almacenGroup = byAlmacen.get(almacen) ?? {
          almacen,
          cantidad: 0,
          claves: new Map(),
        };
        const claveGroup = almacenGroup.claves.get(clave) ?? {
          clave_cnis: clave,
          almacen,
          cantidad: 0,
          lotes: new Map(),
        };
        const caducidad = this.parseCaducidad(row.caducidad);
        const loteKey = `${String(row.lote ?? 'Sin lote').trim() || 'Sin lote'}-${caducidad?.toISOString() ?? 'sin-caducidad'}`;
        const lote = claveGroup.lotes.get(loteKey) ?? {
          lote: String(row.lote ?? 'Sin lote').trim() || 'Sin lote',
          cantidad: 0,
          caducidad,
          diasCaducidad: this.diasParaCaducidad(caducidad),
        };

        almacenGroup.cantidad += cantidad;
        claveGroup.cantidad += cantidad;
        lote.cantidad += cantidad;
        claveGroup.lotes.set(loteKey, lote);
        almacenGroup.claves.set(clave, claveGroup);
        byAlmacen.set(almacen, almacenGroup);
      });

    return Array.from(byAlmacen.entries())
      .map(([key, almacen]) => ({
        key,
        almacen: almacen.almacen,
        cantidad: almacen.cantidad,
        claves: Array.from(almacen.claves.entries())
          .map(([claveKey, clave]) => {
            const lotes = Array.from(clave.lotes.values())
              .sort((a, b) => this.caducidadSortValue(a.caducidad) - this.caducidadSortValue(b.caducidad));
            const caducidadProxima = lotes.find(lote => lote.caducidad)?.caducidad ?? null;
            const diasCaducidad = this.diasParaCaducidad(caducidadProxima);
            const estadoCaducidad = this.estadoCaducidad(diasCaducidad);

            const homologosCpm = this.homologosConCpmParaClave(clave.clave_cnis);
            return {
              key: `${key}-${claveKey}`,
              clave_cnis: clave.clave_cnis,
              descripcion: this.descripcionPorClave(clave.clave_cnis),
              almacen: clave.almacen,
              cantidad: clave.cantidad,
              lotes,
              caducidadProxima,
              diasCaducidad,
              estadoCaducidad,
              homologosCpm,
              accionSugerida: this.accionSinCpm(estadoCaducidad, homologosCpm.length),
            };
          })
          .sort((a, b) => {
            const caducidadCompare = this.caducidadSortValue(a.caducidadProxima) - this.caducidadSortValue(b.caducidadProxima);
            if (caducidadCompare !== 0) return caducidadCompare;
            return b.cantidad - a.cantidad;
          }),
      }))
      .filter(almacen => almacen.claves.length > 0)
      .sort((a, b) => a.almacen.localeCompare(b.almacen, 'es', { numeric: true, sensitivity: 'base' }));
  });

  clavesSinCpmPorAlmacen = computed<BalanceoV2SinCpmAlmacen[]>(() =>
    this.clavesSinCpmPorAlmacenBase()
      .map(almacen => ({
        ...almacen,
        claves: almacen.claves.filter(clave => this.coincideFiltroSinCpmRapido(clave)),
      }))
      .filter(almacen => almacen.claves.length > 0)
  );

  sinCpmConteos = computed<Record<BalanceoV2SinCpmFiltro, number>>(() => {
    const initial: Record<BalanceoV2SinCpmFiltro, number> = {
      todos: 0,
      conHomologo: 0,
      sinHomologo: 0,
      vencidos: 0,
      criticos: 0,
      proximos: 0,
      sinCaducidad: 0,
    };

    for (const almacen of this.clavesSinCpmPorAlmacenBase()) {
      for (const clave of almacen.claves) {
        initial.todos++;
        if (clave.homologosCpm.length > 0) initial.conHomologo++;
        if (clave.homologosCpm.length === 0) initial.sinHomologo++;
        if (clave.estadoCaducidad === 'vencido') initial.vencidos++;
        if (clave.estadoCaducidad === 'critico') initial.criticos++;
        if (clave.estadoCaducidad === 'proximo') initial.proximos++;
        if (clave.estadoCaducidad === 'sinCaducidad') initial.sinCaducidad++;
      }
    }

    return initial;
  });

  constructor() {
    this.inventarioService.inventario$
      .pipe(takeUntilDestroyed())
      .subscribe(rows => {
        this.inventarioAlmacenes.set(rows ?? []);
        if (this.resumenJurisdiccional().length > 0) {
          void this.cargarHomologosSinCpm();
        }
      });

    this.inventarioService.cargandoInventario$
      .pipe(takeUntilDestroyed())
      .subscribe(loading => this.cargandoInventario.set(loading));

    void this.cargarDatosIniciales();
    void this.cargarArticulosMapa();
    this.inventarioService.initExistenciaAlmacenes();
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
      this.detalleEjecucion.set([]);
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
    this.detalleEjecucion.set([]);

    try {
      const [resumenResponse, resultadosResponse, detalleResponse] = await Promise.all([
        firstValueFrom(this.balanceoV2Service.obtenerResumenJurisdiccional(ejecucionId)),
        firstValueFrom(this.balanceoV2Service.obtenerResultadosPorEjecucion(ejecucionId)),
        firstValueFrom(this.balanceoV2Service.obtenerDetallePorEjecucion(ejecucionId)),
      ]);

      this.resumenJurisdiccional.set(resumenResponse.data ?? []);
      this.resultados.set(resultadosResponse.data ?? []);
      this.detalleEjecucion.set(detalleResponse.data ?? []);
      void this.cargarHomologosSinCpm();
    } catch {
      this.error.set('No se pudo cargar la ejecucion seleccionada.');
      this.resumenJurisdiccional.set([]);
      this.detalleEjecucion.set([]);
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

  exportarDesglosePorAlmacen(): void {
    const almacenes = this.desglosePorAlmacen();
    const workbook = XLSX.utils.book_new();

    const resumenRows = almacenes.map(almacen => ({
      Almacen: almacen.almacen,
      Claves: almacen.claves.length,
      Piezas: almacen.cantidad,
    }));

    const claveRows = almacenes.flatMap(almacen =>
      almacen.claves.map(clave => ({
        Almacen: almacen.almacen,
        'Clave CNIS': clave.clave_cnis,
        Descripcion: clave.descripcion,
        Piezas: clave.cantidad,
        Hospitales: clave.destinos.find(destino => destino.tipo === 'hospitales')?.cantidad ?? 0,
        'Centros de salud': clave.destinos.find(destino => destino.tipo === 'centrosSalud')?.cantidad ?? 0,
        'Otros almacenes': clave.destinos.find(destino => destino.tipo === 'otrosAlmacenes')?.cantidad ?? 0,
        'Otros destinos': clave.destinos.find(destino => destino.tipo === 'otrosDestinos')?.cantidad ?? 0,
      }))
    );

    const destinoRows = almacenes.flatMap(almacen =>
      almacen.claves.flatMap(clave =>
        clave.destinos.flatMap(destino =>
          destino.unidades.map(unidad => ({
            Almacen: almacen.almacen,
            'Clave CNIS': clave.clave_cnis,
            Descripcion: clave.descripcion,
            'Tipo destino': destino.label,
            'Jurisdiccion destino': unidad.jurisdiccion_destino,
            'CLUES destino': unidad.clues_destino,
            'Unidad destino': unidad.nombre_unidad_destino,
            'Necesidad original': unidad.necesidad_original,
            'Cantidad sugerida': unidad.cantidad_sugerida,
            Prioridad: unidad.prioridad,
          }))
        )
      )
    );

    const loteRows = almacenes.flatMap(almacen =>
      almacen.claves.flatMap(clave =>
        clave.lotesSugeridos.map(lote => ({
          Almacen: almacen.almacen,
          'Clave CNIS': clave.clave_cnis,
          Descripcion: clave.descripcion,
          Lote: lote.lote,
          Piezas: lote.cantidad,
          Caducidad: this.formatDate(lote.caducidad),
          'Dias a caducar': lote.diasCaducidad,
        }))
      )
    );

    this.appendJsonSheet(workbook, 'Resumen almacenes', resumenRows);
    this.appendJsonSheet(workbook, 'Claves', claveRows);
    this.appendJsonSheet(workbook, 'Destinos', destinoRows);
    this.appendJsonSheet(workbook, 'Surtido FEFO', loteRows);
    this.appendJsonSheet(workbook, 'Notas', [
      { Nota: 'Exportacion informativa del desglose operativo por almacen.' },
      { Nota: 'El surtido FEFO es sugerido por caducidad y no modifica las cantidades calculadas por el motor.' },
      { Nota: `Ejecucion: ${this.ejecucionSeleccionadaId() ? '#' + this.ejecucionSeleccionadaId() : 'Sin seleccionar'}` },
      { Nota: `Generado: ${new Date().toLocaleString('es-MX')}` },
    ]);

    XLSX.writeFile(workbook, `BALANCEO_V2_DESGLOSE_${this.timestamp()}.xlsx`, { bookType: 'xlsx' });
  }

  exportarSinCpmAlmacen(): void {
    const almacenes = this.clavesSinCpmPorAlmacen();
    const workbook = XLSX.utils.book_new();

    const resumenRows = almacenes.map(almacen => ({
      Almacen: almacen.almacen,
      Claves: almacen.claves.length,
      Piezas: almacen.cantidad,
    }));

    const claveRows = almacenes.flatMap(almacen =>
      almacen.claves.map(clave => ({
        Almacen: almacen.almacen,
        'Clave CNIS': clave.clave_cnis,
        Descripcion: clave.descripcion,
        'Existencia neta': clave.cantidad,
        'Caducidad proxima': this.formatDate(clave.caducidadProxima),
        'Dias a caducar': clave.diasCaducidad,
        Estado: this.estadoCaducidadLabel(clave.estadoCaducidad),
        'Homologos con CPM': clave.homologosCpm.length,
        'Accion sugerida': clave.accionSugerida,
      }))
    );

    const loteRows = almacenes.flatMap(almacen =>
      almacen.claves.flatMap(clave =>
        clave.lotes.map(lote => ({
          Almacen: almacen.almacen,
          'Clave CNIS': clave.clave_cnis,
          Descripcion: clave.descripcion,
          Lote: lote.lote,
          Piezas: lote.cantidad,
          Caducidad: this.formatDate(lote.caducidad),
          'Dias a caducar': lote.diasCaducidad,
        }))
      )
    );

    const homologoRows = almacenes.flatMap(almacen =>
      almacen.claves.flatMap(clave =>
        clave.homologosCpm.map(homologo => ({
          Almacen: almacen.almacen,
          'Clave sin CPM': clave.clave_cnis,
          'Descripcion sin CPM': clave.descripcion,
          'Clave homologa con CPM': homologo.clave_cnis,
          'Descripcion homologa': homologo.descripcion,
          Factor: homologo.factor,
          'CPM jurisdiccional agregado': homologo.cpm_jurisdiccional,
          Jurisdicciones: homologo.jurisdicciones.join(', '),
        }))
      )
    );

    this.appendJsonSheet(workbook, 'Resumen almacenes', resumenRows);
    this.appendJsonSheet(workbook, 'Claves sin CPM', claveRows);
    this.appendJsonSheet(workbook, 'Lotes', loteRows);
    this.appendJsonSheet(workbook, 'Homologos CPM', homologoRows);
    this.appendJsonSheet(workbook, 'Notas', [
      { Nota: 'Exportacion informativa de claves sin CPM con existencia neta en almacenes.' },
      { Nota: 'Los homologos son coincidencias candidatas y requieren validacion operativa antes de transferir o sustituir.' },
      { Nota: `Filtro rapido aplicado: ${this.filtroSinCpm()}` },
      { Nota: `Generado: ${new Date().toLocaleString('es-MX')}` },
    ]);

    XLSX.writeFile(workbook, `BALANCEO_V2_SIN_CPM_${this.timestamp()}.xlsx`, { bookType: 'xlsx' });
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
    return row.descripcion_clave?.trim()
      || row.descripcion?.trim()
      || this.descripcionArticulo(row.clave_cnis);
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

  desgloseAlmacenExpandido(groupKey: string): boolean {
    return this.desgloseAlmacenesColapsados().includes(groupKey);
  }

  toggleDesgloseAlmacen(groupKey: string): void {
    const expanded = this.desgloseAlmacenesColapsados();
    if (expanded.includes(groupKey)) {
      this.desgloseAlmacenesColapsados.set(expanded.filter(key => key !== groupKey));
      return;
    }
    this.desgloseAlmacenesColapsados.set([...expanded, groupKey]);
  }

  sinCpmAlmacenExpandido(groupKey: string): boolean {
    return this.desgloseAlmacenExpandido(`sin-cpm-${groupKey}`);
  }

  toggleSinCpmAlmacen(groupKey: string): void {
    this.toggleDesgloseAlmacen(`sin-cpm-${groupKey}`);
  }

  desgloseClaveExpandida(groupKey: string): boolean {
    return this.desgloseClavesColapsadas().includes(groupKey);
  }

  toggleDesgloseClave(groupKey: string): void {
    const expanded = this.desgloseClavesColapsadas();
    if (expanded.includes(groupKey)) {
      this.desgloseClavesColapsadas.set(expanded.filter(key => key !== groupKey));
      return;
    }
    this.desgloseClavesColapsadas.set([...expanded, groupKey]);
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

  private coincideFiltrosDesglose(row: BalanceoV2Detalle): boolean {
    const clave = this.filtroClave().trim().toLowerCase();
    const descripcion = this.filtroDescripcion().trim().toLowerCase();
    const jurisdiccion = this.filtroJurisdiccion();

    const coincideClave = !clave || row.clave_cnis.toLowerCase().includes(clave);
    const coincideDescripcion = !descripcion || this.descripcionPorClave(row.clave_cnis).toLowerCase().includes(descripcion);
    const coincideJurisdiccion = !jurisdiccion || row.jurisdiccion_almacen === jurisdiccion || row.jurisdiccion_destino === jurisdiccion;

    return coincideClave && coincideDescripcion && coincideJurisdiccion;
  }

  private coincideFiltrosSinCpm(row: Inventario): boolean {
    const claveFiltro = this.filtroClave().trim().toLowerCase();
    const descripcionFiltro = this.filtroDescripcion().trim().toLowerCase();
    const jurisdiccion = this.filtroJurisdiccion();
    const clave = this.normalizarClave(row.clave);
    const descripcion = this.descripcionPorClave(clave).toLowerCase();
    const almacen = String(row.almacen ?? '');

    const coincideClave = !claveFiltro || clave.toLowerCase().includes(claveFiltro);
    const coincideDescripcion = !descripcionFiltro || descripcion.includes(descripcionFiltro);
    const coincideJurisdiccion = !jurisdiccion || this.normalizarTexto(almacen).includes(this.normalizarTexto(jurisdiccion));

    return coincideClave && coincideDescripcion && coincideJurisdiccion;
  }

  private coincideFiltroSinCpmRapido(clave: BalanceoV2SinCpmClave): boolean {
    const filtro = this.filtroSinCpm();

    if (filtro === 'todos') return true;
    if (filtro === 'conHomologo') return clave.homologosCpm.length > 0;
    if (filtro === 'sinHomologo') return clave.homologosCpm.length === 0;
    if (filtro === 'vencidos') return clave.estadoCaducidad === 'vencido';
    if (filtro === 'criticos') return clave.estadoCaducidad === 'critico';
    if (filtro === 'proximos') return clave.estadoCaducidad === 'proximo';
    if (filtro === 'sinCaducidad') return clave.estadoCaducidad === 'sinCaducidad';

    return true;
  }

  private clavesConCpmSet(): Set<string> {
    return new Set(
      this.resumenJurisdiccional()
        .filter(row => Number(row.cpm_jurisdiccional ?? 0) > 0)
        .map(row => this.normalizarClave(row.clave_cnis))
    );
  }

  private clavesSinCpmInventario(): string[] {
    const clavesConCpm = this.clavesConCpmSet();
    return Array.from(new Set(
      this.inventarioAlmacenes()
        .filter(row => this.existenciaNeta(row) > 0)
        .map(row => this.normalizarClave(row.clave))
        .filter(clave => clave.length > 0 && !clavesConCpm.has(clave))
    ));
  }

  private homologosConCpmParaClave(clave: string): BalanceoV2SinCpmHomologo[] {
    const claveNorm = this.normalizarClave(clave);
    const clavesConCpm = this.clavesConCpmSet();
    const rows = this.homologosSinCpm().get(claveNorm) ?? [];
    const byClave = new Map<string, BalanceoV2SinCpmHomologo>();

    rows.forEach(row => {
      const candidato = this.normalizarClave(row.candidato);
      if (!clavesConCpm.has(candidato)) return;

      const resumenRows = this.resumenJurisdiccional()
        .filter(item => this.normalizarClave(item.clave_cnis) === candidato && Number(item.cpm_jurisdiccional ?? 0) > 0);
      const current = byClave.get(candidato) ?? {
        clave_cnis: candidato,
        descripcion: this.descripcionPorClave(candidato),
        factor: row.factor,
        cpm_jurisdiccional: 0,
        jurisdicciones: [],
      };

      current.cpm_jurisdiccional = resumenRows.reduce((total, item) => total + Number(item.cpm_jurisdiccional ?? 0), 0);
      current.jurisdicciones = Array.from(new Set(resumenRows.map(item => item.jurisdiccion).filter(Boolean))).sort((a, b) => a.localeCompare(b));
      byClave.set(candidato, current);
    });

    return Array.from(byClave.values())
      .sort((a, b) => b.cpm_jurisdiccional - a.cpm_jurisdiccional);
  }

  private descripcionPorClave(clave: string): string {
    const resumenRow = this.resumenJurisdiccional().find(row => row.clave_cnis === clave);
    return resumenRow ? this.descripcionClave(resumenRow) : this.descripcionArticulo(clave);
  }

  private descripcionArticulo(clave: string): string {
    const mapa = this.articulosMapa();
    if (!mapa) return '';

    const normalized = String(clave ?? '').trim();
    return mapa[normalized]?.descripcion?.trim()
      || mapa[normalized.toUpperCase()]?.descripcion?.trim()
      || Object.entries(mapa).find(([key]) => key.toLowerCase() === normalized.toLowerCase())?.[1]?.descripcion?.trim()
      || '';
  }

  private existenciaNeta(row: Inventario): number {
    return Math.max(0, Number(row.disponible ?? 0) - Number(row.comprometidos ?? 0));
  }

  private lotesSugeridosParaClave(clave: string, almacen: string, cantidadObjetivo: number): BalanceoV2LoteSugerido[] {
    let restante = Math.max(0, Number(cantidadObjetivo ?? 0));
    if (restante <= 0) return [];

    const claveNorm = this.normalizarClave(clave);
    const almacenNorm = this.normalizarTexto(almacen);
    const lotes = this.inventarioAlmacenes()
      .filter(row => this.normalizarClave(row.clave) === claveNorm)
      .filter(row => this.existenciaNeta(row) > 0)
      .filter(row => this.esMismoAlmacen(row.almacen, almacenNorm))
      .map(row => ({
        lote: String(row.lote ?? 'Sin lote').trim() || 'Sin lote',
        disponible: this.existenciaNeta(row),
        caducidad: this.parseCaducidad(row.caducidad),
      }))
      .sort((a, b) => this.caducidadSortValue(a.caducidad) - this.caducidadSortValue(b.caducidad));

    const sugeridos: BalanceoV2LoteSugerido[] = [];

    for (const lote of lotes) {
      if (restante <= 0) break;

      const cantidad = Math.min(lote.disponible, restante);
      sugeridos.push({
        lote: lote.lote,
        cantidad,
        caducidad: lote.caducidad,
        diasCaducidad: this.diasParaCaducidad(lote.caducidad),
      });
      restante -= cantidad;
    }

    return sugeridos;
  }

  private esMismoAlmacen(rowAlmacen: string, almacenNorm: string): boolean {
    const rowNorm = this.normalizarTexto(rowAlmacen);
    if (!rowNorm || !almacenNorm) return false;

    return rowNorm.includes(almacenNorm) || almacenNorm.includes(rowNorm);
  }

  private parseCaducidad(value: string | Date | null | undefined): Date | null {
    if (!value) return null;

    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;

    return parsed;
  }

  private diasParaCaducidad(value: Date | null): number | null {
    if (!value) return null;

    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const target = new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();

    return Math.ceil((target - start) / 86_400_000);
  }

  private estadoCaducidad(dias: number | null): BalanceoV2SinCpmClave['estadoCaducidad'] {
    if (dias === null) return 'sinCaducidad';
    if (dias < 0) return 'vencido';
    if (dias <= 90) return 'critico';
    if (dias <= 180) return 'proximo';
    return 'vigente';
  }

  estadoCaducidadLabel(estado: BalanceoV2SinCpmClave['estadoCaducidad']): string {
    const labels: Record<BalanceoV2SinCpmClave['estadoCaducidad'], string> = {
      vencido: 'Vencido',
      critico: '0-90 dias',
      proximo: '91-180 dias',
      vigente: '>180 dias',
      sinCaducidad: 'Sin caducidad',
    };

    return labels[estado];
  }

  private accionSinCpm(estado: BalanceoV2SinCpmClave['estadoCaducidad'], homologosCpmCount = 0): string {
    if (estado === 'vencido') return 'Validar baja o bloqueo antes de cualquier movimiento.';
    if (homologosCpmCount > 0 && estado === 'critico') return 'Prioridad alta: revisar homologo con CPM para uso inmediato.';
    if (homologosCpmCount > 0) return 'Revisar homologo con CPM antes de poner a disposicion.';
    if (estado === 'critico') return 'Prioridad alta: revisar homologo/uso inmediato o poner a disposicion.';
    if (estado === 'proximo') return 'Revisar homologo y posible transferencia manual antes de caducar.';
    if (estado === 'sinCaducidad') return 'Validar lote/caducidad y revisar homologo antes de disponer.';
    return 'Revisar homologo o demanda manual estatal/externa.';
  }

  estadoCaducidadClass(estado: BalanceoV2SinCpmClave['estadoCaducidad']): string {
    const classes: Record<BalanceoV2SinCpmClave['estadoCaducidad'], string> = {
      vencido: 'bg-red-50 text-red-700',
      critico: 'bg-amber-50 text-amber-800',
      proximo: 'bg-yellow-50 text-yellow-800',
      vigente: 'bg-emerald-50 text-emerald-700',
      sinCaducidad: 'bg-gray-100 text-gray-700',
    };

    return classes[estado];
  }

  private caducidadSortValue(value: Date | null): number {
    return value?.getTime() ?? Number.MAX_SAFE_INTEGER;
  }

  private normalizarClave(clave: string): string {
    return this.inventarioService.normalizarClave(String(clave ?? '').trim());
  }

  private tipoDestino(row: BalanceoV2Detalle): BalanceoV2DestinoTipo {
    const destino = this.normalizarTexto(`${row.nombre_unidad_destino} ${row.clues_destino} ${row.jurisdiccion_destino}`);

    if (destino.includes('ALMACEN')) return 'otrosAlmacenes';
    if (destino.includes('HOSPITAL') || /\bHG\b/.test(destino) || /\bHMI\b/.test(destino)) return 'hospitales';
    if (destino.includes('CENTRO DE SALUD') || /\bCS\b/.test(destino) || destino.includes('C.S.')) return 'centrosSalud';

    return 'otrosDestinos';
  }

  private destinoLabel(tipo: BalanceoV2DestinoTipo): string {
    const labels: Record<BalanceoV2DestinoTipo, string> = {
      hospitales: 'Hospitales',
      centrosSalud: 'Centros de salud',
      otrosAlmacenes: 'Otros almacenes',
      otrosDestinos: 'Otros destinos',
    };

    return labels[tipo];
  }

  private ordenarDestinos(destinos: BalanceoV2DesgloseDestino[]): BalanceoV2DesgloseDestino[] {
    const order: Record<BalanceoV2DestinoTipo, number> = {
      hospitales: 1,
      centrosSalud: 2,
      otrosAlmacenes: 3,
      otrosDestinos: 4,
    };

    return destinos.sort((a, b) => order[a.tipo] - order[b.tipo]);
  }

  private normalizarTexto(value: string): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLocaleUpperCase();
  }

  private async cargarArticulosMapa(): Promise<void> {
    try {
      const mapa = await firstValueFrom(this.articulosService.getArticulosMapa());
      this.articulosMapa.set(mapa);
    } catch {
      this.articulosMapa.set(null);
    }
  }

  private async cargarHomologosSinCpm(): Promise<void> {
    const claves = this.clavesSinCpmInventario();
    if (claves.length === 0) {
      this.homologosSinCpm.set(new Map());
      return;
    }

    this.cargandoHomologosSinCpm.set(true);
    try {
      const resultado = new Map<string, HomologoDTO[]>();
      const batchSize = 500;

      for (let i = 0; i < claves.length; i += batchSize) {
        const lote = claves.slice(i, i + batchSize);
        const parcial = await firstValueFrom(this.homologosService.batch(lote));
        for (const [clave, homologos] of parcial) {
          resultado.set(this.normalizarClave(clave), homologos);
        }
      }

      this.homologosSinCpm.set(resultado);
    } catch {
      this.homologosSinCpm.set(new Map());
    } finally {
      this.cargandoHomologosSinCpm.set(false);
    }
  }

  private appendJsonSheet(
    workbook: XLSX.WorkBook,
    name: string,
    rows: Record<string, string | number | null>[]
  ): void {
    const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Mensaje: 'Sin datos' }]);
    const range = worksheet['!ref'] ? XLSX.utils.decode_range(worksheet['!ref']) : null;

    if (range) {
      worksheet['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  }

  private formatDate(value: Date | null): string {
    if (!value) return '';

    const pad = (part: number) => String(part).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }

  private timestamp(): string {
    const now = new Date();
    const pad = (value: number) => value.toString().padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
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
