import { Component, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ServicioEvaluado, Unidad } from '../../../models/articulo-solicitud';
import { CapturaEvaluacionComponent } from '../captura-evaluacion/captura-evaluacion.component';
import { TablaServiciosComponent } from '../tabla-servicios/tabla-servicios.component';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-evaluador-smi-sg',
  standalone: true,
  imports: [CommonModule, FormsModule, CapturaEvaluacionComponent, TablaServiciosComponent],
  templateUrl: './evaluador-smi-sg.component.html',
})
export class EvaluadorSmiSgComponent {
  @Input() unidad!: Unidad;

  tabActivo = signal<'SMI' | 'SG'>('SMI');

  serviciosSMI = signal<ServicioEvaluado[]>([]);
  serviciosSG = signal<ServicioEvaluado[]>([]);

  agregarServicio(servicio: ServicioEvaluado) {
    if (servicio.categoria === 'SMI') {
      this.serviciosSMI.update(prev => [...prev, servicio]);
    } else {
      this.serviciosSG.update(prev => [...prev, servicio]);
    }
  }

  eliminarServicio(index: number, servicio: ServicioEvaluado) {
    const tipo = this.tabActivo();
    if (tipo === 'SMI') {
      this.serviciosSMI.update(prev => 
        prev.filter((_, i) => i !== index));
    } else {
      this.serviciosSG.update(prev => 
        prev.filter((_, i) => i !== index));
    }
  }

  cambiarTab(tab: 'SMI' | 'SG') {
    this.tabActivo.set(tab);
  }
}
