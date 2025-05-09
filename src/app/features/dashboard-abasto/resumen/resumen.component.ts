import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { ChartConfiguration } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { Cita } from '../../../models/Cita';

@Component({
  selector: 'app-resumen',
  imports: [CommonModule, BaseChartDirective],
  templateUrl: './resumen.component.html',
  styleUrl: './resumen.component.css'
})
export class ResumenComponent {
  @Input() citas: Cita[] = [];

  // KPI calculados a partir de this.citas
  getTotalPiezas() {
    console.log('typeof this.citas',typeof this.citas);
    console.log('this.citas',this.citas);    
    return (this.citas as Cita[]).reduce((sum, c) => sum + (c.pzas_recibidas_por_la_entidad || 0), 0);
  }

  getTotalOrdenes() {
    return new Set((this.citas as Cita[]).map(c => c.orden_de_suministro)).size;
  }

  getTotalHospitales() {
    return new Set((this.citas as Cita[]).map(c => c.almacen_hospital_que_recibio)).size;
  }

  // Datos para barra: piezas por hospital
  get barChartData(): ChartConfiguration<'bar'>['data'] {
    const map = new Map<string, number>();
    (this.citas as Cita[]).forEach(c => {
      const h = c.almacen_hospital_que_recibio;
      map.set(h, (map.get(h) || 0) + (c.pzas_recibidas_por_la_entidad || 0));
    });
    return {
      labels: Array.from(map.keys()),
      datasets: [{ data: Array.from(map.values()), label: 'Piezas recibidas' }]
    };
  }

  // Datos para línea: tendencia diaria
  get lineChartData(): ChartConfiguration<'line'>['data'] {
    const map = new Map<string, number>();
    (this.citas as Cita[]).forEach(c => {
      const d = c.fecha_recepcion_almacen || '';
      map.set(d, (map.get(d) || 0) + (c.pzas_recibidas_por_la_entidad || 0));
    });
    const labels = Array.from(map.keys()).sort();
    return {
      labels,
      datasets: [{
        data: labels.map(l => map.get(l) || 0),
        label: 'Tendencia diaria',
        fill: true,
        tension: 0.3,
        borderColor: '#2E8B57',
        backgroundColor: 'rgba(46, 139, 87, 0.2)'
      }]
    };
  }
}
