import { CommonModule } from '@angular/common';
import { Component, inject, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { NgSelectModule } from '@ng-select/ng-select';
import { Cita } from '../../../models/Cita';
import { StorageVariables } from '../../../shared/storage-variables';
import { PeriodoPickerDasboardComponent } from '../../../shared/periodo-picker/periodo-picker-dashboard.component';
import { PeriodoFechasService } from '../../../shared/periodo-fechas.service';
import { FormsModule } from '@angular/forms';
import { CitaFilterService } from '../../../shared/cita-filter.service';
import { FiltrosCita } from '../../../models/filtros-cita';
import { CitaChartService } from '../../../shared/cita-chart.service';

@Component({
  selector: 'app-resumen',
  standalone: true,
  imports: [CommonModule,
    FormsModule, BaseChartDirective, PeriodoPickerDasboardComponent,
    NgSelectModule,],
  templateUrl: './resumen.component.html',
  styleUrl: './resumen.component.css'
})
export class ResumenComponent implements OnInit, OnChanges {
  @Input() citas: Cita[] = [];
  // Opciones de filtros
  aniosDisponibles: number[] = [];
  estatusDisponibles: string[] = ['COMPLETO', 'INCOMPLETO'];
  tipoEntregaDisponibles: string[] = ['ENTREGA DIRECTA', 'OPERADOR LOGÍSTICO'];
  tiposCompraDisponibles: string[] = ['FEDERAL', 'ESTATAL', 'NO APLICA']; // ajusta según tus valores reales


  // Lo que el usuario seleccione
  filtrosSeleccionados = {
    anios: [] as number[],
    estatus: [] as string[],
    tipoEntrega: [] as string[],
    tipoCompra: [] as string[],
  };

  totalPiezas = 0;
  totalOrdenes = 0;
  totalHospitales = 0;
  totalPiezasEmitidas = 0;
  totalPiezasRecibidas = 0;
  porcentajeRecibidoVsEmitido = 0;
  totalEntregasEnFecha = 0;
  totalEntregasAtrasadas = 0;
  porcentajeCumplimiento = 0;
  totalOrdenesCompletas = 0;
  totalOrdenesIncompletas = 0;

  topProveedoresIncumplidos: {
    nombre: string;
    total: number;
    atrasos: number;
    porcentaje: number;
  }[] = [];

  topProveedoresCumplidos: {
    nombre: string;
    total: number;
    aTiempo: number;
    porcentaje: number;
  }[] = [];

  stackedBarData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  stackedBarOptions: ChartOptions<'bar'> = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${ctx.raw} entregas`
        }
      }
    },
    scales: {
      x: { stacked: true },
      y: {
        stacked: true,
        beginAtZero: true,
        ticks: { stepSize: 1 }
      }
    }
  };

  barChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  public barChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    indexAxis: 'y', // 👈 Hace que las unidades sean el eje Y y las barras crezcan horizontalmente
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#006341', // Color verde para los labels del gráfico
        }
      },
      tooltip: {
        callbacks: {
          label: function (context) {
            const label = context.dataset.label || '';
            const value = context.parsed.x || 0;
            return `${label}: ${value.toLocaleString()}`;
          }
        }
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        // stacked: true,
        ticks: {
          color: '#2E8B57',
          precision: 0,
        },
        grid: {
          color: '#e0e0e0',
        }
      },
      y: {
        //stacked: true,
        ticks: {
          color: '#2E8B57',
        },
        grid: {
          color: '#f0f0f0',
        }
      }
    }
  };
  lineChartData: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };

  fechaInicio: Date = new Date();
  fechaFin: Date = new Date();

  citaFilterService = inject(CitaFilterService);
  citaChartService = inject(CitaChartService);
  fechasService = inject(PeriodoFechasService);

  constructor() { }

  ngOnChanges(changes: SimpleChanges): void {
    console.log('changes', changes);
  }

  ngOnInit(): void {
    const compras = new Set(this.citas.map(c => c.compra).filter(Boolean));
        this.tiposCompraDisponibles = Array.from(compras).sort();
    this.cargarFechasIniciales();
    this.generarAniosDisponibles();
    this.calcularDatos();
  }

  generarAniosDisponibles() {
    const aniosSet = new Set<number>();
    this.citas.forEach(c => {
      if (c.ejercicio != null) {
        aniosSet.add(c.ejercicio);
      }
    });
    this.aniosDisponibles = Array.from(aniosSet).sort((a, b) => a - b);
  }

  cargarFechasIniciales() {
    const inicio = localStorage.getItem(StorageVariables.DASH_ABASTO_RESUMEN_FECHA_INICIO);
    const fin = localStorage.getItem(StorageVariables.DASH_ABASTO_RESUMEN_FECHA_FIN);
    // obtener los anios, estatus y tipos de entrega de localStorage
    this.filtrosSeleccionados.anios = JSON.parse(localStorage.getItem(StorageVariables.DASH_ABASTO_RESUMEN_ANIOS) || '[]');
    this.filtrosSeleccionados.estatus = JSON.parse(localStorage.getItem(StorageVariables.DASH_ABASTO_RESUMEN_ESTATUS) || '[]');
    this.filtrosSeleccionados.tipoEntrega = JSON.parse(localStorage.getItem(StorageVariables.DASH_ABASTO_RESUMEN_TIPOS_ENTREGA) || '[]');
    this.filtrosSeleccionados.tipoCompra = JSON.parse(localStorage.getItem(StorageVariables.DASH_ABASTO_RESUMEN_COMPRAS) || '[]');

    if (inicio && fin) {
      this.fechaInicio = new Date(inicio);
      this.fechaFin = new Date(fin);
    } else {
      const hoy = new Date();
      this.fechaFin = hoy;
      // this.fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1); // 1ero del mes actual
      this.fechaInicio = new Date(hoy.getFullYear(), 0, 1); // 1ero del 1er mes del año actual
    }
  }

  calcularDatos() {
    localStorage.setItem(StorageVariables.DASH_ABASTO_RESUMEN_ANIOS, JSON.stringify(this.filtrosSeleccionados.anios));
    localStorage.setItem(StorageVariables.DASH_ABASTO_RESUMEN_ESTATUS, JSON.stringify(this.filtrosSeleccionados.estatus));
    localStorage.setItem(StorageVariables.DASH_ABASTO_RESUMEN_TIPOS_ENTREGA, JSON.stringify(this.filtrosSeleccionados.tipoEntrega));
    localStorage.setItem(StorageVariables.DASH_ABASTO_RESUMEN_COMPRAS, JSON.stringify(this.filtrosSeleccionados.tipoCompra));

    const filtros: FiltrosCita = {
      fechaInicio: this.fechaInicio,
      fechaFin: this.fechaFin,
      anios: this.filtrosSeleccionados.anios,
      estatus: this.filtrosSeleccionados.estatus.map(e => e.toUpperCase()),
      tipoEntrega: this.filtrosSeleccionados.tipoEntrega.map(e => e.toUpperCase()),      
      tipoCompra: this.filtrosSeleccionados.tipoCompra.map(e => e.toUpperCase()), // nuevo
    };

    const citasFiltradas = this.citaFilterService.filtrar(this.citas, filtros);
    this.obtenerKPIs(citasFiltradas);

    // Gráficas
    this.barChartData = this.citaChartService.obtenerPiezasPorUnidad(citasFiltradas);
    this.lineChartData = this.citaChartService.obtenerTendenciaDiaria(citasFiltradas);
    this.generarCumplimientoMensualPorBarras(citasFiltradas);
    this.generarTopProveedores(citasFiltradas);
    this.generarTopProveedoresCumplidos(citasFiltradas);
  }

  obtenerKPIs(citasFiltradas: Cita[]) {
    this.totalPiezas = citasFiltradas.reduce((sum, c) => sum + (c.pzas_recibidas_por_la_entidad || 0), 0);
    this.totalOrdenes = new Set(citasFiltradas.map(c => c.orden_de_suministro)).size;
    this.totalHospitales = new Set(citasFiltradas.map(c => c.unidad)).size;
    // Total órdenes distintas ya se calcula, ahora contamos las vigentes
    const ordenesVigentes = new Set<string>();
    this.totalPiezasEmitidas = 0;
    this.totalEntregasEnFecha = 0;
    this.totalEntregasAtrasadas = 0;
    this.totalOrdenesCompletas = 0;
    this.totalOrdenesIncompletas = 0;

    const mapaOrdenes: Map<string, { recibidas: number; emitidas: number }> = new Map();

    for (const cita of citasFiltradas) {
      const orden = cita.orden_de_suministro;
      if (!orden) continue;

      // 1. completas e incompletas
      const actuales = mapaOrdenes.get(orden) || { recibidas: 0, emitidas: 0 };
      actuales.recibidas += cita.pzas_recibidas_por_la_entidad || 0;
      actuales.emitidas += cita.no_de_piezas_emitidas || 0;
      mapaOrdenes.set(orden, actuales);

      // 2. Piezas emitidas
      this.totalPiezasEmitidas += cita.no_de_piezas_emitidas || 0;
      this.totalPiezasRecibidas += cita.pzas_recibidas_por_la_entidad || 0;

      // 3. Cumplimiento de plazo
      if (cita.fecha_limite_de_entrega && cita.fecha_recepcion_almacen) {
        const fLimite = new Date(cita.fecha_limite_de_entrega);
        const fRecepcion = new Date(cita.fecha_recepcion_almacen);
        if (fRecepcion <= fLimite) {
          this.totalEntregasEnFecha++;
        } else {
          this.totalEntregasAtrasadas++;
        }
      }
    }

    // Guardamos resultado de completas vs incompletas
    mapaOrdenes.forEach(({ recibidas, emitidas }) => {
      if (recibidas >= emitidas) {
        this.totalOrdenesCompletas++;
      } else {
        this.totalOrdenesIncompletas++;
      }
    });

    // Porcentaje de piezas recibidas vs emitidas
    this.porcentajeRecibidoVsEmitido = this.totalPiezasEmitidas > 0
      ? (this.totalPiezas / this.totalPiezasEmitidas) * 100
      : 0;

    // Porcentaje de cumplimiento de plazo
    const totalEntregas = this.totalEntregasEnFecha + this.totalEntregasAtrasadas;
    this.porcentajeCumplimiento = totalEntregas > 0
      ? (this.totalEntregasEnFecha / totalEntregas) * 100
      : 0;
  }

  onPeriodoSeleccionado(event: { texto: string, fechaInicio: Date, fechaFin: Date }) {
    this.fechaInicio = event.fechaInicio;
    this.fechaFin = event.fechaFin;

    localStorage.setItem(StorageVariables.DASH_ABASTO_RESUMEN_FECHA_INICIO, this.fechaInicio.toISOString());
    localStorage.setItem(StorageVariables.DASH_ABASTO_RESUMEN_FECHA_FIN, this.fechaFin.toISOString());

    this.calcularDatos();
  }

  generarTopProveedores(citas: Cita[]) {
    const resumen = new Map<string, { total: number; atrasos: number }>();

    for (const cita of citas) {
      const proveedor = cita.proveedor || 'SIN PROVEEDOR';
      const total = resumen.get(proveedor) || { total: 0, atrasos: 0 };
      total.total++;
      if (cita.fecha_limite_de_entrega && cita.fecha_recepcion_almacen) {
        const f1 = new Date(cita.fecha_limite_de_entrega);
        const f2 = new Date(cita.fecha_recepcion_almacen);
        if (f2 > f1) total.atrasos++;
      }
      resumen.set(proveedor, total);
    }

    const lista = Array.from(resumen.entries()).map(([nombre, { total, atrasos }]) => ({
      nombre,
      total,
      atrasos,
      porcentaje: total > 0 ? ((total - atrasos) / total) * 100 : 0
    }));

    this.topProveedoresIncumplidos = lista
      .filter(p => p.total > 3 && p.atrasos > 0) // Umbral
      .sort((a, b) => b.atrasos - a.atrasos)
      .slice(0, 15)
      .sort((a, b) => a.porcentaje - b.porcentaje);
  }

  generarCumplimientoMensualPorBarras(citas: Cita[]) {
    const meses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    const entregasPorMes = Array(12).fill(null).map(() => ({
      enFecha: 0,
      atrasadas: 0
    }));

    for (const cita of citas) {
      if (!cita.fecha_recepcion_almacen || !cita.fecha_limite_de_entrega) continue;

      const fRecepcion = new Date(cita.fecha_recepcion_almacen);
      const fLimite = new Date(cita.fecha_limite_de_entrega);
      const mes = fRecepcion.getMonth();

      entregasPorMes[mes] = entregasPorMes[mes] || { enFecha: 0, atrasadas: 0 };
      if (fRecepcion <= fLimite) {
        entregasPorMes[mes].enFecha++;
      } else {
        entregasPorMes[mes].atrasadas++;
      }
    }

    this.stackedBarData = {
      labels: meses,
      datasets: [
        {
          label: 'Entregas a tiempo',
          data: entregasPorMes.map(m => m.enFecha),
          backgroundColor: '#2E8B57'
        },
        {
          label: 'Entregas atrasadas',
          data: entregasPorMes.map(m => m.atrasadas),
          backgroundColor: '#e74c3c'
        }
      ]
    };
  }

  generarTopProveedoresCumplidos(citas: Cita[]) {
    const resumen = new Map<string, { total: number; aTiempo: number }>();

    for (const cita of citas) {
      const proveedor = cita.proveedor || 'SIN PROVEEDOR';
      const actual = resumen.get(proveedor) || { total: 0, aTiempo: 0 };
      actual.total++;

      if (cita.fecha_limite_de_entrega && cita.fecha_recepcion_almacen) {
        const fRecepcion = new Date(cita.fecha_recepcion_almacen);
        const fLimite = new Date(cita.fecha_limite_de_entrega);
        if (fRecepcion <= fLimite) {
          actual.aTiempo++;
        }
      }
      resumen.set(proveedor, actual);
    }

    const lista = Array.from(resumen.entries()).map(([nombre, { total, aTiempo }]) => ({
      nombre,
      total,
      aTiempo,
      porcentaje: total > 0 ? (aTiempo / total) * 100 : 0
    }));

    this.topProveedoresCumplidos = lista
      .filter(p => p.total > 3 && p.porcentaje >= 90)
      .sort((a, b) => b.porcentaje - a.porcentaje)
      .sort((a, b) => b.aTiempo - a.aTiempo)
      .slice(0, 15);
  }
}
