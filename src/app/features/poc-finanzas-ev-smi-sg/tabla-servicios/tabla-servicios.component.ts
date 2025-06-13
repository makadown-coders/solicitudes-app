import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EvaluacionServicio } from '../../../models/evaluacion-servicio';
import { ServicioEvaluado, Unidad } from '../../../models/articulo-solicitud';
import { StorageVariables } from '../../../shared/storage-variables';

@Component({
  selector: 'app-tabla-servicios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tabla-servicios.component.html',
  styleUrl: './tabla-servicios.component.css'
})
export class TablaServiciosComponent implements OnInit, OnChanges {

  @Input() tipo: 'SMI' | 'SG' = 'SMI';
  @Input() unidad!: Unidad;

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
    this.cargarEvaluacionesDesdeLocalStorage();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['unidad'] && this.unidad) {
      this.cargarEvaluacionesDesdeLocalStorage();
    }
  }

  cargarEvaluacionesDesdeLocalStorage() {
    const claveAlmacenamiento =
      this.tipo === 'SMI'
        ? StorageVariables.POC_FE_SMI_SG_EVALUACIONES_SMI
        : StorageVariables.POC_FE_SMI_SG_EVALUACIONES_SG;

    const datosPorUnidad: Record<string, ServicioEvaluado[]> = JSON.parse(
      localStorage.getItem(claveAlmacenamiento) || '{}'
    );

    const datosUnidad = datosPorUnidad[this.unidad.cluesimb];

    if (datosUnidad) {
      // Cargar desde localStorage si ya existen datos guardados para esta unidad
      this.evaluacionesCapturadas = datosUnidad;
    } else {
      // Si no hay datos, inicializar con la lista estándar
      const listaServicios = this.tipo === 'SMI' ? this.serviciosSMI : this.serviciosSG;
      this.evaluacionesCapturadas = listaServicios.map(nombre => ({
        nombre,
        categoria: this.tipo,
        estatusContratacion: 'Sin iniciar la contratación',
        inicialesContrata: '',
        evaluacionCalidad: 'No aplica'
      }));
      // Guardar esta nueva inicialización por si se navega entre unidades
      this.guardarEnLocalStorage();
    }
  }

  guardarEnLocalStorage() {
    const claveAlmacenamiento =
      this.tipo === 'SMI'
        ? StorageVariables.POC_FE_SMI_SG_EVALUACIONES_SMI
        : StorageVariables.POC_FE_SMI_SG_EVALUACIONES_SG;

    const datosPorUnidad: Record<string, ServicioEvaluado[]> = JSON.parse(
      localStorage.getItem(claveAlmacenamiento) || '{}'
    );

    datosPorUnidad[this.unidad.cluesimb] = this.evaluacionesCapturadas;

    localStorage.setItem(claveAlmacenamiento, JSON.stringify(datosPorUnidad));
  }

  deshabilitarCampos(servicio: ServicioEvaluado): boolean {
    return servicio.estatusContratacion === 'No aplica';
  }
}
