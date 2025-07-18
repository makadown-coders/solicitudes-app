import { Component, Input, OnChanges, SimpleChanges, ViewChildren, QueryList, ElementRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Cita } from '../../../models/Cita';
import { PeriodoFechasService } from '../../../shared/periodo-fechas.service';
import { FormsModule } from '@angular/forms';
import { PeriodoPickerDasboardComponent } from '../../../shared/periodo-picker/periodo-picker-dashboard.component';
import { DetalleCitaModalComponent } from '../../../shared/detalle-cita-modal/detalle-cita-modal.component';
import { StorageVariables } from '../../../shared/storage-variables';

interface GrupoUnidad {
  unidad: string;
  citas: Cita[];
}

@Component({
  selector: 'app-citas-pendientes',
  standalone: true,
  imports: [CommonModule, FormsModule, PeriodoPickerDasboardComponent, DetalleCitaModalComponent],
  templateUrl: './citas-pendientes.component.html',
  styleUrls: ['./citas-pendientes.component.css']
})
export class CitasPendientesComponent implements OnInit {
  @Input() citas: Cita[] = [];

  citasEntregaAtrasadas: Cita[] = [];
  citasPendientes: Cita[] = [];
  citasSinAgendar: Cita[] = [];
  citasInminentes: Cita[] = [];
  citasIncompletas: Cita[] = [];
  citasAgendadasSinRecepcion: Cita[] = [];

  unidadesUnicas: string[] = [];
  tiposCompra: string[] = [];

  unidadesAgrupadas: GrupoUnidad[] = [];

  unidadExpandida: string | null = null;

  // Filtros
  filtroBusqueda = '';
  filtroUnidad = '';
  filtroCompra = '';
  fechaInicio = this.inicializarInicio();
  fechaFin = new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000); // 30 días después
  incluirFechasNulas = true;

  @ViewChildren('grupoUnidad') grupoRefs!: QueryList<ElementRef<HTMLDivElement>>;

  citaSeleccionada: Cita | null = null;
  mostrarModalDetalle = false;

  constructor(private fechasService: PeriodoFechasService) { }
  ngOnInit(): void {
    // inicializar filtros de localStorage
    this.cargarDeLocalStorage();
    this.procesarCitas();
  }

  cargarDeLocalStorage() {
    this.filtroBusqueda = localStorage.getItem(StorageVariables.DASH_ABASTO_CITAS_FILTRO_TEXTO) || '';
    this.filtroUnidad = localStorage.getItem(StorageVariables.DASH_ABASTO_CITAS_FILTRO_UNIDAD) || '';
    this.filtroCompra = localStorage.getItem(StorageVariables.DASH_ABASTO_CITAS_FILTRO_COMPRA) || '';
    const inicio = localStorage.getItem(StorageVariables.DASH_ABASTO_CITAS_FECHA_INICIO);
    const fin = localStorage.getItem(StorageVariables.DASH_ABASTO_CITAS_FECHA_FIN);
    this.incluirFechasNulas = localStorage.getItem(StorageVariables.DASH_ABASTO_CITAS_INCLUIR_NULAS) === 'true';
    if (inicio && fin) {
      this.fechaInicio = new Date(inicio);
      this.fechaFin = new Date(fin);
    }
  }

  /* ngOnChanges(changes: SimpleChanges): void {
     if (changes['citas']) {
       // this.procesarCitas();
     }
   }*/

  inicializarInicio(): Date {
    const inicio = new Date();
    inicio.setMonth(0);
    inicio.setDate(1);
    return inicio;
  }

  procesarCitas(): void {
    /*this.citasPendientes = this.citas.filter(c =>
      !c.fecha_recepcion_almacen || c.fecha_recepcion_almacen.trim() === ''
    );*/   
   
    this.citasPendientes = this.citas.filter(c =>
      ((!c.fecha_recepcion_almacen || c.fecha_recepcion_almacen.trim() === '') &&
        (c.estatus ?? '').toLowerCase() === 'vigente') ||
      (c.estatus ?? '').toLowerCase() === 'incompleto'
    );

    this.unidadesUnicas = Array.from(
      new Set(this.citasPendientes.map(c => c.unidad ?? 'Desconocida'))
    ).sort();

    this.tiposCompra = Array.from(
      new Set(this.citasPendientes.map(c => c.compra ?? 'Desconocido'))
    ).sort();

    this.actualizarAgrupacion();
  }

  actualizarAgrupacion(): void {
    // Guardar en storage
    localStorage.setItem(StorageVariables.DASH_ABASTO_CITAS_FILTRO_TEXTO, this.filtroBusqueda);
    localStorage.setItem(StorageVariables.DASH_ABASTO_CITAS_FILTRO_UNIDAD, this.filtroUnidad);
    localStorage.setItem(StorageVariables.DASH_ABASTO_CITAS_FILTRO_COMPRA, this.filtroCompra);
    localStorage.setItem(StorageVariables.DASH_ABASTO_CITAS_FECHA_INICIO, this.fechaInicio.toISOString());
    localStorage.setItem(StorageVariables.DASH_ABASTO_CITAS_FECHA_FIN, this.fechaFin.toISOString());
    localStorage.setItem(StorageVariables.DASH_ABASTO_CITAS_INCLUIR_NULAS, this.incluirFechasNulas.toString());

    const citasFiltradas = this.citasPendientes.filter(c => {
      const busqueda = this.filtroBusqueda.toLowerCase().trim();

      const coincideBusqueda = busqueda.length === 0 ||
        (c.orden_de_suministro ?? '').toLowerCase().trim().includes(busqueda) ||
        (c.proveedor ?? '').toLowerCase().includes(busqueda) ||
        (c.clave_cnis ?? '').toLowerCase().includes(busqueda) ||
        (c.descripcion ?? '').toLowerCase().includes(busqueda);

      const coincideUnidad = !this.filtroUnidad || this.filtroUnidad.length === 0 || c.unidad === this.filtroUnidad;

      const coincideCompra = !this.filtroCompra || this.filtroCompra.length === 0 || c.compra === this.filtroCompra;

      const fechaCitaValida = c.fecha_de_cita ?
        typeof c.fecha_de_cita === 'string' ?
          this.fechasService.parseLocalDate(c.fecha_de_cita) :
          new Date(c.fecha_de_cita) : null;
      const coincideFecha =
        this.incluirFechasNulas && !fechaCitaValida
          ? true
          : fechaCitaValida
            ? fechaCitaValida >= this.fechaInicio && fechaCitaValida <= this.fechaFin
            : false;

      return coincideBusqueda && coincideUnidad && coincideCompra && coincideFecha;
    });

    const citasPorUnidad = new Map<string, Cita[]>();
    citasFiltradas.forEach(c => {
      const unidad = c.unidad ?? 'Desconocida';
      if (!citasPorUnidad.has(unidad)) citasPorUnidad.set(unidad, []);
      citasPorUnidad.get(unidad)!.push(c);
    });

    const hoy = new Date(); 
    this.citasEntregaAtrasadas = citasFiltradas.filter(cita =>
      cita.fecha_limite_de_entrega &&
      ( typeof cita.fecha_limite_de_entrega === 'string' ?
      this.fechasService.parseLocalDate(cita.fecha_limite_de_entrega) 
      : cita.fecha_limite_de_entrega  )
      < hoy /*&&
      (cita.pzas_recibidas_por_la_entidad ?? 0) === 0*/
    );

    this.citasSinAgendar = citasFiltradas.filter(c => !c.fecha_de_cita);    

    this.citasIncompletas = citasFiltradas.filter(c => 
      c.estatus.toLocaleLowerCase().trim() === 'incompleto'
    );
    this.citasAgendadasSinRecepcion = citasFiltradas.filter(c => !!c.fecha_de_cita);

    this.citasInminentes = this.citasSinAgendar.filter(c => 
      c.fecha_limite_de_entrega &&      
      this.fechasService.getDiasEntreFechas(
        new Date(c.fecha_limite_de_entrega), hoy) <= 5 &&
      this.fechasService.getDiasEntreFechas(
        new Date(c.fecha_limite_de_entrega), hoy) >= 0
    );
    const addCitasInminentes = this.citasAgendadasSinRecepcion.filter(c => 
      c.fecha_de_cita &&       
      this.fechasService.getDiasEntreFechas(
        new Date(c.fecha_de_cita), hoy) <= 5 &&
      this.fechasService.getDiasEntreFechas(
        new Date(c.fecha_de_cita), hoy) >= 0    
    );
    this.citasInminentes = this.citasInminentes.concat(addCitasInminentes);
      

    this.unidadesAgrupadas = Array.from(citasPorUnidad.entries()).map(([unidad, citas]) => ({ unidad, citas }));
    
    // ordenar this.unidadesAgrupadas por total de citas
    this.unidadesAgrupadas.sort((a, b) => b.citas.length - a.citas.length);
  }

  onPeriodoSeleccionado(_: any, inicio: Date, fin: Date) {
    [this.fechaInicio, this.fechaFin] = this.fechasService.ordenarFechas(inicio, fin);
    this.actualizarAgrupacion();
  }

  toggleUnidad(unidad: string): void {
    if (this.unidadExpandida === unidad) {
      this.unidadExpandida = null;
      return;
    }

    this.unidadExpandida = unidad;

    setTimeout(() => {
      const index = this.unidadesAgrupadas.findIndex(g => g.unidad === unidad);
      const grupo = this.grupoRefs.get(index);
      const topOffset = grupo?.nativeElement.getBoundingClientRect().top ?? 0;

      if (grupo && topOffset > 200) {
        grupo.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        grupo.nativeElement.style.scrollMarginTop = '6rem';
      }
    }, 50);
  }

  abrirModalDetalle(cita: Cita) {
    this.citaSeleccionada = cita;
    this.mostrarModalDetalle = true;
  }

  cerrarModalDetalle() {
    this.mostrarModalDetalle = false;
    this.citaSeleccionada = null;
  }
}
