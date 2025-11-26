import { Component, Input, OnChanges, SimpleChanges, ViewChildren, QueryList, ElementRef, OnInit, signal, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Cita } from '../../../models/Cita';
import { PeriodoFechasService } from '../../../shared/periodo-fechas.service';
import { FormsModule } from '@angular/forms';
import { PeriodoPickerDasboardComponent } from '../../../shared/periodo-picker/periodo-picker-dashboard.component';
import { DetalleCitaModalComponent } from '../../../shared/detalle-cita-modal/detalle-cita-modal.component';
import { StorageVariables } from '../../../shared/storage-variables';
import { CitaQueryResponse } from '../../../models/CitaQueryResponse';
import { CitasService } from '../../../services/citas.service';

interface GrupoUnidad {
  unidad: string;
  citas: Cita[];
}

@Component({
  selector: 'app-citas-pendientes',
  standalone: true,
  imports: [CommonModule, FormsModule, PeriodoPickerDasboardComponent, DetalleCitaModalComponent],
  templateUrl: './citas-pendientes.component.html',
  styleUrls: ['./citas-pendientes.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CitasPendientesComponent implements OnInit {
  // ============================================================
  //    STATE MAESTRO (igual que Proveedores)
  // ============================================================
  citas = signal<Cita[]>([]);

  // ============================================================
  //    STATE UI / cálculos derivados
  // ============================================================
  citasEntregaAtrasadas: Cita[] = [];
  citasPendientes: Cita[] = [];
  citasSinAgendar: Cita[] = [];
  citasInminentes: Cita[] = [];
  citasIncompletas: Cita[] = [];
  citasAgendadasSinRecepcion: Cita[] = [];
  unidadesUnicas: string[] = [];
  tiposCompra: string[] = [];
  unidadesAgrupadas: { unidad: string; citas: Cita[] }[] = [];

  unidadExpandida: string | null = null;

  filtroBusqueda = '';
  filtroUnidad = '';
  filtroCompra = '';
  incluirFechasNulas = true;

  fechaInicio = new Date(new Date().getFullYear(), 0, 1);
  fechaFin = new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000);

  citaSeleccionada: Cita | null = null;
  mostrarModalDetalle = false;

  loading = false;
  errorMsg: string | null = null;

  @ViewChildren('grupoUnidad') grupoRefs!: QueryList<ElementRef<HTMLDivElement>>;

  private fechasService = inject(PeriodoFechasService);
  private citasService = inject(CitasService);

  // ============================================================
  //                INIT
  // ============================================================
  ngOnInit(): void {
    this.cargarDeLocalStorage();
    this.cargarCitasDesdeBackend(true);
  }

  // ============================================================
  //         Método expuesto para DashboardComponent
  // ============================================================
  refrescarDatos(forceRefresh = false) {
    this.cargarCitasDesdeBackend(false, forceRefresh);
  }

  // ============================================================
  //         CARGA BACKEND + SIGNAL
  // ============================================================
  private toYmd(d: Date) {
    return d.toISOString().slice(0, 10);
  }

  private cargarCitasDesdeBackend(
    cargandoDesdeNgOnInit = false,
    forceRefresh = false
  ) {
    this.loading = true;
    this.errorMsg = null;

    const desde = this.toYmd(this.fechaInicio);
    const hasta = this.toYmd(this.fechaFin);

    this.citasService.searchCitasCached(
      {
        // desde,
        // hasta,
        // include_pendientes: '1',
        recibido: 'false',
        limit: 20000,
      },
      { forceRefresh }
    ).subscribe({
      next: (resp: CitaQueryResponse) => {
        // console.log('Citas pendientes:', resp.data);
        this.citas.set(resp?.data ?? []);
        this.loading = false;
        this.procesarCitas();
      },
      error: err => {
        this.loading = false;
        this.errorMsg = 'Error al obtener citas desde backend';
        this.citas.set([]);
      }
    });
  }

  // ============================================================
  //                LOCALSTORAGE
  // ============================================================
  cargarDeLocalStorage() {
    this.filtroBusqueda = localStorage.getItem(StorageVariables.DASH_ABASTO_CITAS_FILTRO_TEXTO) || '';
    this.filtroUnidad = localStorage.getItem(StorageVariables.DASH_ABASTO_CITAS_FILTRO_UNIDAD) || '';
    this.filtroCompra = localStorage.getItem(StorageVariables.DASH_ABASTO_CITAS_FILTRO_COMPRA) || '';
    this.incluirFechasNulas = localStorage.getItem(StorageVariables.DASH_ABASTO_CITAS_INCLUIR_NULAS) === 'true';

    const inicio = localStorage.getItem(StorageVariables.DASH_ABASTO_CITAS_FECHA_INICIO);
    const fin = localStorage.getItem(StorageVariables.DASH_ABASTO_CITAS_FECHA_FIN);

    if (inicio && fin) {
      this.fechaInicio = new Date(inicio);
      this.fechaFin = new Date(fin);
    }
  }

  // ============================================================
  //         PROCESAMIENTOS Y AGRUPACIONES
  // ============================================================
  procesarCitas() {
    const lista = this.citas();
    console.log('Lista Citas :', lista);

    this.citasPendientes = [...lista];
    /*this.citasPendientes = lista.filter(c =>
      ((!c.fecha_recepcion_almacen || c.fecha_recepcion_almacen.trim() === '') &&
        (c.estatus ?? '').toLowerCase() === 'vigente') ||
      (c.estatus ?? '').toLowerCase() === 'incompleto'
    );*/

    console.log('Citas pendientes:', this.citasPendientes);

    this.unidadesUnicas = Array.from(
      new Set(this.citasPendientes.map(c => c.unidad ?? 'Desconocida'))
    ).sort();

    this.tiposCompra = Array.from(
      new Set(this.citasPendientes.map(c => c.compra ?? 'Desconocido'))
    ).sort();

    this.actualizarAgrupacion();
  }  

  actualizarAgrupacion() {
    // Persistencia
    localStorage.setItem(StorageVariables.DASH_ABASTO_CITAS_FILTRO_TEXTO, this.filtroBusqueda);
    localStorage.setItem(StorageVariables.DASH_ABASTO_CITAS_FILTRO_UNIDAD, this.filtroUnidad);
    localStorage.setItem(StorageVariables.DASH_ABASTO_CITAS_FILTRO_COMPRA, this.filtroCompra);
    localStorage.setItem(StorageVariables.DASH_ABASTO_CITAS_FECHA_INICIO, this.fechaInicio.toISOString());
    localStorage.setItem(StorageVariables.DASH_ABASTO_CITAS_FECHA_FIN, this.fechaFin.toISOString());
    localStorage.setItem(StorageVariables.DASH_ABASTO_CITAS_INCLUIR_NULAS, this.incluirFechasNulas.toString());

    const hoy = new Date();
    const lista = this.citasPendientes;

    let debugCount = 0;
    const citasFiltradas = lista.filter(c => {
      if (c.ejercicio! > 2024) {
        debugCount++;
      }

      const busqueda = this.filtroBusqueda.toLowerCase().trim();
      const coincideBusqueda =
        busqueda.length === 0 ||
        (c.orden_de_suministro ?? '').toLowerCase().includes(busqueda) ||
        (c.proveedor ?? '').toLowerCase().includes(busqueda) ||
        (c.clave_cnis ?? '').toLowerCase().includes(busqueda) ||
        (c.descripcion ?? '').toLowerCase().includes(busqueda);

      const coincideUnidad = !this.filtroUnidad || c.unidad === this.filtroUnidad;
      const coincideCompra = !this.filtroCompra || c.compra === this.filtroCompra;

      // ✅ AHORA SÍ parseamos bien la fecha de cita
      const fechaCita = this.fechasService.toDateOrNull(c.fecha_de_cita);

      const coincideFecha =
        this.incluirFechasNulas && !fechaCita
          ? true
          : fechaCita
            ? fechaCita >= this.fechaInicio && fechaCita <= this.fechaFin
            : false;

      if (debugCount <= 5 && c.ejercicio! > 2024) {
        console.log('---- DEBUG CITA ----');
        console.log('Cita:', c);
        console.log('coincideBusqueda:', coincideBusqueda);
        console.log('coincideUnidad  :', coincideUnidad);
        console.log('coincideCompra  :', coincideCompra);
        console.log('fecha_de_cita   :', c.fecha_de_cita);
        console.log('fechaCita(Date) :', fechaCita);
        console.log('coincideFecha   :', coincideFecha);
        console.log(
          'RESULT:',
          coincideBusqueda && coincideUnidad && coincideCompra && coincideFecha
        );
        console.log('--------------------');
      }

      return coincideBusqueda && coincideUnidad && coincideCompra && coincideFecha;
    });

    console.log('Citas filtradas:', citasFiltradas);

    // ============================
    //    AGRUPACIONES NUEVAS
    // ============================
    const citasPorUnidad = new Map<string, Cita[]>();
    citasFiltradas.forEach(c => {
      const unidad = c.unidad ?? 'Desconocida';
      if (!citasPorUnidad.has(unidad)) citasPorUnidad.set(unidad, []);
      citasPorUnidad.get(unidad)!.push(c);
    });

    this.unidadesAgrupadas = Array.from(citasPorUnidad.entries()).map(([unidad, citas]) => ({
      unidad,
      citas,
    }));

    this.unidadesAgrupadas.sort((a, b) => b.citas.length - a.citas.length);

    // ============================
    //     KPIs derivados
    // ============================
    this.citasSinAgendar = citasFiltradas.filter(c => !c.fecha_de_cita);
    this.citasIncompletas = citasFiltradas.filter(
      c => (c.estatus ?? '').toLowerCase() === 'incompleto'
    );
    this.citasAgendadasSinRecepcion = citasFiltradas.filter(c => !!c.fecha_de_cita);

    /*this.citasEntregaAtrasadas = citasFiltradas.filter(cita =>
      cita.fecha_limite_de_entrega &&
      ( typeof (cita.fecha_limite_de_entrega) === 'string' ?
      this.fechasService.parseLocalDate(cita.fecha_limite_de_entrega) 
      : cita.fecha_limite_de_entrega  )
      < hoy 
    );*/

    this.citasEntregaAtrasadas = citasFiltradas.filter(c => {
      const fechaLim = this.fechasService.toDateOrNull(c.fecha_limite_de_entrega);
      return !!fechaLim && fechaLim < hoy;
    });

    this.citasInminentes = [
      ...this.citasSinAgendar.filter(c => {
        const fechaLim = this.fechasService.toDateOrNull(c.fecha_limite_de_entrega);
        return (
          !!fechaLim &&
          this.fechasService.getDiasEntreFechas(fechaLim, hoy) <= 5 &&
          this.fechasService.getDiasEntreFechas(fechaLim, hoy) >= 0
        );
      }),
      ...this.citasAgendadasSinRecepcion.filter(c => {
        const fc = this.fechasService.toDateOrNull(c.fecha_de_cita);
        return (
          !!fc &&
          this.fechasService.getDiasEntreFechas(fc, hoy) <= 5 &&
          this.fechasService.getDiasEntreFechas(fc, hoy) >= 0
        );
      }),
    ];
  }

  // ============================================================
  //      UI
  // ============================================================
  onPeriodoSeleccionado(_: any, inicio: Date, fin: Date) {
    [this.fechaInicio, this.fechaFin] = this.fechasService.ordenarFechas(inicio, fin);
    this.cargarCitasDesdeBackend();
  }

  toggleUnidad(unidad: string) {
    this.unidadExpandida = this.unidadExpandida === unidad ? null : unidad;
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
