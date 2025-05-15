import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { ChartConfiguration } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { Cita } from '../../../models/Cita';
import { StorageVariables } from '../../../shared/storage-variables';
import { PeriodoPickerDasboardComponent } from '../../../shared/periodo-picker/periodo-picker-dashboard.component';
import { PeriodoFechasService } from '../../../shared/periodo-fechas.service';

@Component({
  selector: 'app-resumen',
  standalone: true,
  imports: [CommonModule, BaseChartDirective, PeriodoPickerDasboardComponent],
  templateUrl: './resumen.component.html',
  styleUrl: './resumen.component.css'
})
export class ResumenComponent implements OnInit {
  @Input() citas: Cita[] = [];

  totalPiezas = 0;
  totalOrdenes = 0;
  totalHospitales = 0;

  barChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  lineChartData: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };

  fechaInicio: Date = new Date();
  fechaFin: Date = new Date();

  constructor(private fechasService: PeriodoFechasService) { }

  ngOnInit(): void {
    this.cargarFechasIniciales();
    this.calcularDatos();
  }

  cargarFechasIniciales() {
    const inicio = localStorage.getItem(StorageVariables.DASH_ABASTO_RESUMEN_FECHA_INICIO);
    const fin = localStorage.getItem(StorageVariables.DASH_ABASTO_RESUMEN_FECHA_FIN);

    if (inicio && fin) {
      this.fechaInicio = new Date(inicio);
      this.fechaFin = new Date(fin);
    } else {
      const hoy = new Date();
      this.fechaFin = hoy;
      this.fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1); // 1ero del mes actual
    }
  }

  calcularDatos() {
    /*const citasFiltradas: Cita[] = this.citas.filter(c =>
      this.fechasService.fechaEnRango(c.fecha_recepcion_almacen, this.fechaInicio, this.fechaFin)
    );*/
    let citasFiltradas: Cita[] = [];
    for (let i = 0; i < this.citas.length; i++) {
      const fecha_recepcion_almacen = this.citas[i].fecha_recepcion_almacen;
      if (fecha_recepcion_almacen && this.fechasService.fechaEnRango(fecha_recepcion_almacen,
        this.fechaInicio, this.fechaFin)) {
        // creando una copia
        const filtrado = { ...this.citas[i] };
        if (!filtrado.almacen_hospital_que_recibio) { filtrado.almacen_hospital_que_recibio = filtrado.unidad; }
        citasFiltradas.push(filtrado);
      }
    }

    // KPIs
    this.totalPiezas = citasFiltradas.reduce((sum, c) => sum + (c.pzas_recibidas_por_la_entidad || 0), 0);
    this.totalOrdenes = new Set(citasFiltradas.map(c => c.orden_de_suministro)).size;
    this.totalHospitales = new Set(citasFiltradas.map(c => c.almacen_hospital_que_recibio)).size;

    // Gráfica de barras (por hospital)
    const mapHospital = new Map<string, number>();
    citasFiltradas.forEach(c => {
      const h = c.almacen_hospital_que_recibio;
      mapHospital.set(h, (mapHospital.get(h) || 0) + (c.pzas_recibidas_por_la_entidad || 0));
    });
    this.barChartData = {
      labels: Array.from(mapHospital.keys()),
      datasets: [{ data: Array.from(mapHospital.values()), label: 'Piezas recibidas' }]
    };

    // Gráfica de línea (por día)
    const mapFecha = new Map<string, number>();
    citasFiltradas.forEach(c => {
      const d = c.fecha_recepcion_almacen;
      mapFecha.set(d!, (mapFecha.get(d!) || 0) + (c.pzas_recibidas_por_la_entidad || 0));
    });
    const labels = Array.from(mapFecha.keys()).sort();
    this.lineChartData = {
      labels,
      datasets: [{
        data: labels.map(l => mapFecha.get(l) || 0),
        label: 'Tendencia diaria',
        fill: true,
        tension: 0.3,
        borderColor: '#2E8B57',
        backgroundColor: 'rgba(46, 139, 87, 0.2)'
      }]
    };
  }

  onPeriodoSeleccionado(event: { texto: string, fechaInicio: Date, fechaFin: Date }) {
    this.fechaInicio = event.fechaInicio;
    this.fechaFin = event.fechaFin;

    localStorage.setItem(StorageVariables.DASH_ABASTO_RESUMEN_FECHA_INICIO, this.fechaInicio.toISOString());
    localStorage.setItem(StorageVariables.DASH_ABASTO_RESUMEN_FECHA_FIN, this.fechaFin.toISOString());

    this.calcularDatos();
  }
}
