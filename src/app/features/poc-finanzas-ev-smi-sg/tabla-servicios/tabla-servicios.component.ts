import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EvaluacionServicio } from '../../../models/evaluacion-servicio';
import { ServicioEvaluado } from '../../../models/articulo-solicitud';
import { StorageVariables } from '../../../shared/storage-variables';

@Component({
  selector: 'app-tabla-servicios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tabla-servicios.component.html',
  styleUrl: './tabla-servicios.component.css'
})
export class TablaServiciosComponent {
  @Input() tipo: 'SMI' | 'SG' = 'SMI';

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

  evaluacionesCapturadas: ServicioEvaluado[] = [];

  estatusOpciones = [
    'No aplica',
    'Sin iniciar la contratación',
    'Proceso Inicial de contratación',
    'Proceso final de contratación',
    'Contratado'
  ];

  contratantes = ['IB', 'CE', 'SSA'];
  evaluaciones = ['Bueno', 'Regular', 'Malo', 'No aplica'];

  ngOnInit(): void {
  const key = this.tipo === 'SMI' ? StorageVariables.STORAGE_KEY_EVALUACIONES_SMI : StorageVariables.STORAGE_KEY_EVALUACIONES_SG;

  const fromStorage = localStorage.getItem(key);

  if (fromStorage) {
    this.evaluacionesCapturadas = JSON.parse(fromStorage);
  } else {
    const servicios = this.tipo === 'SMI' ? this.serviciosSMI : this.serviciosSG;

    this.evaluacionesCapturadas = servicios.map(nombre => ({
      nombre,
      categoria: this.tipo,
      estatusContratacion: 'Sin iniciar la contratación',
      inicialesContrata: '',
      evaluacionCalidad: 'No aplica'
    }));

    // Guardar por primera vez
    localStorage.setItem(key, JSON.stringify(this.evaluacionesCapturadas));
  }
}

  deshabilitarCampos(servicio: ServicioEvaluado): boolean {
    return servicio.estatusContratacion === 'No aplica';
  }
}
