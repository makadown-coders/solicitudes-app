import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import type { ChartData, ChartOptions, Plugin } from 'chart.js';
import { coberturaPorUnidad, etiquetasInsumos, fechaSalida, llenarExcelSegundoNivel } from './concentrado-segundo-nivel-reporte';
import {
  ConcentradoSegundoNivelService, FuenteSas, InformeSegundoNivel, ModalidadNecesidades, VentanaSas,
} from '../../../services/concentrado-segundo-nivel.service';

@Component({
  standalone: true,
  imports: [FormsModule, DecimalPipe, BaseChartDirective],
  templateUrl: './concentrado-segundo-nivel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConcentradoSegundoNivelComponent implements OnInit {
  private readonly servicio = inject(ConcentradoSegundoNivelService);
  private readonly hoy = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Tijuana', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  readonly inicioMaximo = new Date(Date.parse(this.hoy + 'T00:00:00Z') - 29 * 86400000).toISOString().slice(0, 10);
  modalidad: ModalidadNecesidades = 'MES_CALENDARIO';
  mes = this.hoy.slice(0, 7);
  desde = this.inicioMaximo;
  private readonly fuentes: readonly FuenteSas[] = ['AZM', 'AZT', 'AZE', 'HOSPITAL'];
  private ventanaPersonalizada: Omit<VentanaSas, 'fuente'> | null = null;
  readonly informe = signal<InformeSegundoNivel | null>(null);
  readonly etiquetasInsumo = computed(() => etiquetasInsumos(this.informe()));
  readonly unidades = signal<InformeSegundoNivel['unidades']>([]);
  readonly cargando = signal(false);
  readonly error = signal('');
  readonly jurisdiccion = signal('');
  readonly clues = signal('');
  readonly pagina = signal(1);
  readonly paginaEjecutiva = signal(1);
  readonly exportando = signal(false);
  private readonly modalidadConsultada = signal<ModalidadNecesidades>('MES_CALENDARIO');
  readonly porPagina = 10;
  readonly jurisdicciones = computed(() => [...new Set(this.unidades().map(u => u.jurisdiccion))].sort());
  readonly unidadesDisponibles = computed(() => this.unidades().filter(u =>
    !this.jurisdiccion() || u.jurisdiccion === this.jurisdiccion(),
  ));
  readonly filas = computed(() => (this.informe()?.filas ?? []).filter(f =>
    (!this.jurisdiccion() || f.jurisdiccion === this.jurisdiccion()) &&
    (!this.clues() || f.clues === this.clues()),
  ).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.clave.localeCompare(b.clave)));
  readonly indicadores = computed(() => {
    const filas = this.filas();
    const necesidades = filas.filter(f => f.solicitudIds.length);
    const cantidad = filas.reduce((total, f) => total + f.cantidad, 0);
    const surtido = filas.reduce((total, f) => total + f.surtido, 0);
    return {
      unidades: new Set(necesidades.map(f => f.clues)).size,
      claves: new Set(necesidades.map(f => f.clave)).size,
      cantidad, surtido,
      pendiente: filas.reduce((total, f) => total + f.pendiente, 0),
      excedente: filas.reduce((total, f) => total + f.excedente, 0),
      cobertura: cantidad > 0 ? 100 * filas.reduce((total, f) => total + f.cubierto, 0) / cantidad : null,
      relacion: cantidad > 0 ? 100 * surtido / cantidad : null,
    };
  });
  readonly totalPaginas = computed(() => Math.max(1, Math.ceil(this.filas().length / this.porPagina)));
  readonly paginas = computed(() => Array.from({ length: this.totalPaginas() }, (_, i) => i + 1));
  readonly inicio = computed(() => (this.pagina() - 1) * this.porPagina);
  readonly visibles = computed(() => this.filas().slice(this.inicio(), this.inicio() + this.porPagina));
  readonly coberturaUnidades = computed(() => coberturaPorUnidad(
    this.unidadesDisponibles().filter(u => !this.clues() || u.clues === this.clues()), this.filas(),
  ));
  readonly paginasEjecutivas = computed(() => Array.from({
    length: Math.max(1, Math.ceil(this.coberturaUnidades().length / this.porPagina)),
  }, (_, i) => i + 1));
  readonly ejecutivasVisibles = computed(() => {
    const inicio = (this.paginaEjecutiva() - 1) * this.porPagina;
    return this.coberturaUnidades().slice(inicio, inicio + this.porPagina);
  });
  readonly coberturaGrafica = computed(() => this.coberturaUnidades().filter(u => u.porcentaje !== null));
  readonly alturaGrafica = computed(() => Math.max(140, this.coberturaGrafica().length * 72 + 45));
  readonly datosGrafica = computed<ChartData<'bar'>>(() => ({
    labels: this.coberturaGrafica().map(u => u.nombre),
    datasets: [{ data: this.coberturaGrafica().map(u => u.porcentaje!), backgroundColor: '#047857' }],
  }));
  readonly opcionesGrafica: ChartOptions<'bar'> = {
    indexAxis: 'y', maintainAspectRatio: false, animation: false,
    layout: { padding: { right: 64 } },
    interaction: { mode: 'nearest', axis: 'y', intersect: false },
    plugins: { legend: { display: false }, tooltip: { callbacks: {
      label: item => this.porcentajeGrafica(Number(item.raw)),
    } } },
    scales: {
      x: { min: 0, max: 100, ticks: { callback: value => value + '%' } },
      y: { ticks: { autoSkip: false, font: { size: 12 }, callback(valor) {
        const nombre = this.getLabelForValue(Number(valor));
        const { ctx, width } = this.chart;
        const maximo = Math.min(280, (width - 64) * 0.43);
        const lineas: string[] = [];
        let linea = '';
        ctx.save();
        ctx.font = '12px Arial';
        for (const palabra of nombre.split(/\s+/)) {
          const siguiente = linea ? linea + ' ' + palabra : palabra;
          if (linea && ctx.measureText(siguiente).width > maximo) {
            lineas.push(linea);
            linea = palabra;
          } else {
            linea = siguiente;
          }
        }
        ctx.restore();
        if (linea) lineas.push(linea);
        return lineas;
      } } },
    },
  };
  readonly complementosGrafica: Plugin<'bar'>[] = [{
    id: 'porcentajesSegundoNivel',
    afterDatasetsDraw: ({ ctx, scales, data }) => {
      ctx.save();
      ctx.fillStyle = '#0f172a';
      ctx.font = '600 12px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      data.datasets[0].data.forEach((valor, indice) => {
        if (typeof valor !== 'number') return;
        ctx.fillText(this.porcentajeGrafica(valor), scales['x'].getPixelForValue(valor) + 6,
          scales['y'].getPixelForValue(indice));
      });
      ctx.restore();
    },
  }];

  ngOnInit() { void this.analizar(); }

  readonly formatearSalida = fechaSalida;

  private porcentajeGrafica(valor: number) {
    return valor.toLocaleString('es-MX', { maximumFractionDigits: 2 }) + '%';
  }

  get ventanaSurtimiento(): Omit<VentanaSas, 'fuente'> {
    if (this.ventanaPersonalizada) return this.ventanaPersonalizada;
    if (this.modalidad === 'ULTIMOS_30_DIAS') return { desde: this.desde, hasta: this.hoy };
    const [anio, mes] = this.mes.split('-').map(Number);
    const finMes = /^\d{4}-(0[1-9]|1[0-2])$/.test(this.mes)
      ? new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10) : '';
    return { desde: finMes ? this.mes + '-01' : '', hasta: finMes };
  }

  editarVentana(campo: 'desde' | 'hasta', valor: string) {
    this.ventanaPersonalizada = { ...this.ventanaSurtimiento, [campo]: valor };
  }

  cambiarJurisdiccion(valor: string) {
    this.jurisdiccion.set(valor);
    this.clues.set('');
    this.pagina.set(1);
    this.paginaEjecutiva.set(1);
  }

  seleccionarUnidad(valor: string) {
    this.clues.set(valor);
    this.pagina.set(1);
    this.paginaEjecutiva.set(1);
  }

  irPagina(valor: number) {
    this.pagina.set(Math.max(1, Math.min(this.totalPaginas(), valor)));
  }

  irPaginaEjecutiva(valor: number) {
    this.paginaEjecutiva.set(Math.max(1, Math.min(this.paginasEjecutivas().length, valor)));
  }

  async exportarExcel() {
    const informe = this.informe();
    if (!informe || this.exportando()) return;
    if (!informe.enriquecimientoExcel) {
      this.error.set('No fue posible verificar homólogos o grupos terapéuticos. Vuelva a analizar el corte antes de exportar.');
      return;
    }
    const filas = this.filas();
    const cobertura = this.coberturaUnidades();
    const modalidad = this.modalidadConsultada();
    const unidad = this.unidades().find(u => u.clues === this.clues());
    const filtros = {
      jurisdiccion: this.jurisdiccion(),
      unidad: unidad ? unidad.nombre + ' (' + unidad.clues + ')' : '',
    };
    this.exportando.set(true);
    this.error.set('');
    try {
      const { Workbook } = await import('exceljs');
      const libro = new Workbook();
      llenarExcelSegundoNivel(libro, informe, modalidad, filas, cobertura, filtros);
      const contenido = await libro.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([contenido], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      const descarga = document.createElement('a');
      descarga.href = url;
      descarga.download = 'Concentrado-Segundo-Nivel-' + informe.corte + '.xlsx';
      descarga.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      this.error.set('No fue posible exportar el concentrado.');
    } finally {
      this.exportando.set(false);
    }
  }

  async analizar() {
    if (this.cargando()) return;
    const ventana = this.ventanaSurtimiento;
    if (!ventana.desde || !ventana.hasta || ventana.desde > ventana.hasta) {
      this.error.set('Indique un periodo de surtimiento válido. Desde debe ser anterior o igual a Hasta.');
      return;
    }
    this.cargando.set(true);
    this.informe.set(null);
    this.error.set('');
    this.pagina.set(1);
    this.paginaEjecutiva.set(1);
    try {
      const periodo = this.modalidad === 'MES_CALENDARIO'
        ? { modalidad: this.modalidad, mes: this.mes } : { modalidad: this.modalidad, desde: this.desde };
      const respuesta = await this.servicio.analizar({ ...periodo, ventanas: this.fuentes.map(fuente => ({ fuente, ...ventana })) });
      this.modalidadConsultada.set(periodo.modalidad);
      this.unidades.set(respuesta.unidades);
      if (!this.unidadesDisponibles().some(u => u.clues === this.clues())) this.clues.set('');
      this.informe.set(respuesta);
    } catch (e: unknown) {
      const detalle = (e as { error?: { error?: string } })?.error?.error;
      this.error.set(detalle || 'No fue posible consultar las necesidades hospitalarias.');
    } finally {
      this.cargando.set(false);
    }
  }
}
