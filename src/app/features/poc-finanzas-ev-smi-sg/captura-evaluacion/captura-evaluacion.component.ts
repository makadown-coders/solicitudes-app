import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TablaServiciosComponent } from '../tabla-servicios/tabla-servicios.component';
import { ServicioEvaluado } from '../../../models/articulo-solicitud';
import { FormsModule } from '@angular/forms';


@Component({
  selector: 'app-captura-evaluacion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './captura-evaluacion.component.html',
  styleUrl: './captura-evaluacion.component.css'
})
export class CapturaEvaluacionComponent {
   @Input() categoria: 'SMI' | 'SG' = 'SMI';
  @Output() servicioAgregado = new EventEmitter<ServicioEvaluado>();

  estatuses: ServicioEvaluado['estatusContratacion'][] = [
    'No aplica',
    'Sin iniciar la contratación',
    'Proceso Inicial de contratación',
    'Proceso final de contratación',
    'Contratado',
  ];

  iniciales: ServicioEvaluado['inicialesContrata'][] = ['IB', 'CE', 'SSA', ''];

  calidades: ServicioEvaluado['evaluacionCalidad'][] = ['Bueno', 'Regular', 'Malo', 'No aplica'];

  serviciosSMI = [
    'ANESTESIOLOGÍA', 'BANCO DE SANGRE', 'CENTRAL DE MEZCLAS',
    'DIÁLISIS PERITONEAL AUTOMATIZADA', 'DIÁLISIS PERITONEAL CONTINUA AMBULATORIA',
    'HEMODIÁLISIS', 'IMAGENOLOGÍA INTEGRAL Y SUBROGADA', 'LABORATORIO CLÍNICO',
    'MÍNIMA INVASIÓN', 'OSTEOSÍNTESIS Y ENDOPRÓTESIS', 'TAMIZ METABÓLICO NEONATAL',
    'TERAPIA DE INFUSIÓN', 'NEUROLOGÍA PEDIÁTRICA', 'CIRUGÍA PEDIÁTRICA',
    'INFECTOLOGÍA PEDIÁTRICA', 'CARDIOLOGÍA PEDIÁTRICA', 'OFTALMOLOGÍA PEDIÁTRICA',
    'NEFROLOGÍA PEDIÁTRICA', 'NEUMOLOGÍA PEDIÁTRICA', 'DERMATOLOGÍA PEDIÁTRICA'
  ];

  serviciosSG = [
    'ALIMENTOS', 'CONSERVACIÓN Y MANTENIMIENTO DE EQUIPO', 'CONSERVACIÓN Y MANTENIMIENTO DE INFRAESTRUCTURA',
    'EXTINTORES', 'GAS LP', 'LAVANDERÍA', 'OXÍGENO', 'RECOLECCIÓN DE BASURA',
    'RED DE DATOS (VOZ E INTERNET)', 'RPBI', 'SERVICIO DE ENERGÍA ELÉCTRICA',
    'SERVICIO DE HIGIENE Y LIMPIEZA', 'SISTEMA DE VIGILANCIA', 'AGUA DE CONSUMO HUMANO',
    'FOTOCOPIADO', 'SANITIZACION'
  ];

  selectedServicio = '';
  selectedEstatus: ServicioEvaluado['estatusContratacion'] = 'Sin iniciar la contratación';
  selectedInicial: ServicioEvaluado['inicialesContrata'] = '';
  selectedCalidad: ServicioEvaluado['evaluacionCalidad'] = 'Regular';

  agregar() {
    if (!this.selectedServicio) return;

    const nuevo: ServicioEvaluado = {
      nombre: this.selectedServicio,
      categoria: this.categoria,
      estatusContratacion: this.selectedEstatus,
      inicialesContrata: this.selectedEstatus === 'Contratado' ? this.selectedInicial : '',
      evaluacionCalidad: this.selectedCalidad,
    };

    this.servicioAgregado.emit(nuevo);

    // Reseteo
    this.selectedServicio = '';
    this.selectedEstatus = 'Sin iniciar la contratación';
    this.selectedInicial = '';
    this.selectedCalidad = 'Regular';
  }

  get servicios() {
    return this.categoria === 'SMI' ? this.serviciosSMI : this.serviciosSG;
  }
}
