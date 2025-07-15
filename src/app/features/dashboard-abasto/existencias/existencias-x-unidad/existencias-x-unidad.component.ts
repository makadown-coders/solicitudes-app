// src/app/features/dashboard-abasto/existencias/existencias-x-unidad/existencias-x-unidad.component.ts
import { ChangeDetectorRef, Component, inject, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Articulo, UnidadExistente } from '../../../../models/articulo-solicitud';
import { hospitalesData } from '../../../../models/hospitalesData';
import * as LZString from 'lz-string';
import { Subject } from 'rxjs';
import { DashboardService } from '../../../../services/dashboard.service';
import { Inventario, InventarioDisponibles } from '../../../../models/Inventario';
import { StorageSolicitudService } from '../../../../services/storage-solicitud.service';
import { AlertCircleIcon, HospitalIcon, InfoIcon, LucideAngularModule, TriangleAlertIcon } from 'lucide-angular';
import { FormsModule } from '@angular/forms';
import { StorageVariables } from '../../../../shared/storage-variables';
import { CPMS } from '../../../../models/CPMS';
import { Cita } from '../../../../models/Cita';
import { clasificacionMedicamentosData } from '../../../../models/clasificacionMedicamentosData';
import { ClasificadorVEN } from '../../../../models/clasificador-ven';
import { ArticulosService } from '../../../../services/articulos.service';
import { ChartConfiguration, ChartOptions, ChartType } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

@Component({
    standalone: true,
    imports: [CommonModule, LucideAngularModule, FormsModule, BaseChartDirective],
    selector: 'app-existencias-x-unidad',
    templateUrl: 'existencias-x-unidad.component.html'
})

export class ExistenciasXUnidadComponent implements OnInit, OnChanges, OnDestroy {
    @Input() existenciaUnidades: Map<string, Inventario[]> = new Map<string, Inventario[]>();
    @Input() cpms: CPMS[] = [];
    @Input() citas: Cita[] = [];

    unidades: UnidadExistente[] = hospitalesData;
    dashboardService = inject(DashboardService);
    articulosService = inject(ArticulosService);
    storageService = inject(StorageSolicitudService);
    inventario: Inventario[] = [];
    onDestroy$ = new Subject<void>();
    selectedIndex = -1;
    unidadBusqueda = '';
    unidadConfirmada = false;
    unidadSeleccionada: UnidadExistente | null = null;
    autocompleteResults: UnidadExistente[] = [];
    hospitalIcon = HospitalIcon;
    cpmsElegidos: CPMS[] = [];
    articulos: Articulo[] = [];
    articulosMap = new Map<string, Articulo>();
    cdRef = inject(ChangeDetectorRef);

    alertCircle = AlertCircleIcon;
    infoIcon = InfoIcon;
    triangleAlertIcon = TriangleAlertIcon;

    public doughnutChartOptions: ChartOptions<'doughnut'> = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
            legend: {
                position: 'right',
                align: 'center',
                labels: {
                    boxWidth: 10,
                    padding: 6,
                    font: {
                        size: 11,
                    },
                    usePointStyle: true,
                },
            },
            tooltip: {
                callbacks: {
                    label: function (context) {
                        let label = context.label || '';
                        let value = context.formattedValue || '';
                        return `${label}: ${value}`;
                    }
                }
            }
        },
    }
    public doughnutChartLabels: string[] = ['Disponibles', 'Faltantes'];
    public doughnutChartData: ChartConfiguration<'doughnut'>['data'] = {

        labels: this.doughnutChartLabels,
        datasets: [
            {
                data: [0, 0], // inicial
            },
        ],
    };
    public doughnutChartType: ChartType = 'doughnut';

    existenciaUnidadesElegidas: Inventario[] = [];
    cmp: any;

    constructor() {
        // si this.unidades no tiene el resumen estatal lo agregamos
        if (!this.unidades.find(u => u.key === 'ESTATAL')) {
            // crear una UnidadExistente para 'Estado' que seria el resumen estatal
            const resumenEstatal: UnidadExistente =
            {
                key: "ESTATAL",
                cluesssa: "ESTATAL",
                cluesimb: "ESTATAL",
                nombre: "Baja California",
                municipio: "ESTATAL",
                localidad: "ESTATAL",
                jurisdiccion: "ESTATAL",
                direccion: "ESTATAL",
                latitud: "31.825117",
                longitud: "-116.600282",
                estratoUnidad: "ESTATAL",
                nivelAtencion: "ESTATAL",
                tipoUnidad: "ESTATAL"
            };
            // agregar el resumen estatal al inicio del array
            this.unidades.unshift(resumenEstatal);
        }
    }

    ngOnDestroy(): void {
        this.onDestroy$.next();
        this.onDestroy$.complete();
    }

    filtrarUnidades() {
        const texto = this.unidadBusqueda.trim().toLowerCase();
        if (texto.length < 3) {
            this.autocompleteResults = [];
            this.selectedIndex = -1;
            return;
        }
        this.autocompleteResults = this.unidades.filter(u =>
            u.nombre.toLowerCase().includes(texto) ||
            u.cluesimb.toLowerCase().includes(texto) ||
            u.cluesssa.toLowerCase().includes(texto)
        ).slice(0, 12);
        this.selectedIndex = 0;
    }

    onInputKeyDown(event: KeyboardEvent) {
        if (!this.autocompleteResults.length) return;

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.selectedIndex = (this.selectedIndex + 1) % this.autocompleteResults.length;
                break;
            case 'ArrowUp':
                event.preventDefault();
                this.selectedIndex = (this.selectedIndex - 1 + this.autocompleteResults.length) % this.autocompleteResults.length;
                break;
            case 'Enter':
                event.preventDefault();
                const selected = this.autocompleteResults[this.selectedIndex];
                if (selected) this.seleccionarUnidad(selected);
                break;
            case 'Escape':
                this.autocompleteResults = [];
                this.selectedIndex = -1;
                break;
        }
    }

    seleccionarUnidad(unidad: UnidadExistente) {
        this.unidadSeleccionada = unidad;
        this.unidadBusqueda = unidad.nombre;
        this.unidadConfirmada = true;
        this.autocompleteResults = [];
        this.selectedIndex = -1;
        localStorage.setItem(
            StorageVariables.DASH_ABASTO_EXISTENCIAS_EXU_FILTRO_UNIDAD,
            JSON.stringify(unidad));

        // console.log('( seleccionarUnidad() ) this.data.cpms tamanio', this.cpms.map(item => item.clave).length);
        this.cpmsElegidos = [...this.cpms.filter(cpms =>
            cpms.cluesimb.toLocaleLowerCase() === unidad.cluesimb.toLocaleLowerCase())];
        // ordenar this.cpmsElegidos por clave
        this.cpmsElegidos.sort((a, b) => a.clave.localeCompare(b.clave));
        // guardar this.cpmsElegidos en localStorage DASH_ABASTO_EXISTENCIAS_EXU_CPMS_ELEGIDOS
        localStorage.setItem(
            StorageVariables.DASH_ABASTO_EXISTENCIAS_EXU_CPMS_ELEGIDOS,
            JSON.stringify(this.cpmsElegidos));
        // cargar existenciaUnidadesElegidas de this.existenciaUnidades
        this.existenciaUnidadesElegidas = this.existenciaUnidades.get(unidad.key) || [];
        // console.log('this.existenciaUnidadesElegidas', this.existenciaUnidadesElegidas);
        /* si this.existenciaUnidadesElegidas no tiene el resumen estatal 
            lo agregamos a this.existenciaUnidadesElegidas y a this.existenciaUnidades con esa key */
        if (this.existenciaUnidadesElegidas.length === 0) {
            // para crear el resumen estatal "peino" todas las keys de this.existenciaUnidades y acumulo cada clave en this.existenciaUnidadesElegidas
            this.existenciaUnidadesElegidas = [...this.existenciaUnidades.values()].reduce((acc, val) => [...acc, ...val], []);
            this.existenciaUnidades.set('ESTATAL', this.existenciaUnidadesElegidas);
        }


        // comprimir this.existenciaUnidadesElegidas y
        // guardar this.existenciaUnidadesElegidas en localStorage DASH_ABASTO_EXISTENCIAS_EXU_UNIDADES_ELEGIDAS
        const existenciaUnidadesElegidasString = JSON.stringify(this.existenciaUnidadesElegidas);
        const existenciaUnidadesElegidasComprimido = LZString.compress(existenciaUnidadesElegidasString);
        localStorage.setItem(
            StorageVariables.DASH_ABASTO_EXISTENCIAS_EXU_UNIDADES_ELEGIDAS,
            JSON.stringify(existenciaUnidadesElegidasComprimido));

    }

    reiniciarBusquedaUnidad() {
        this.unidadConfirmada = false;
        this.unidadSeleccionada = null;
        this.unidadBusqueda = '';
        this.autocompleteResults = [];
        this.selectedIndex = -1;
        // LIMPIAR DE LOCALSTORAGE TODO LO DE ESTA PESTAÑA EXCEPTO DASH_ABASTO_EXISTENCIAS_EXU_ARTICULOS_MAP
        localStorage.removeItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_EXU_FILTRO_UNIDAD);
        localStorage.removeItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_EXU_CPMS_ELEGIDOS);
        localStorage.removeItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_EXU_UNIDADES_ELEGIDAS);
        this.cdRef.detectChanges();
    }

    ngOnInit() {
        const guardada = localStorage.getItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_EXU_FILTRO_UNIDAD);
        if (guardada) {
            this.unidadSeleccionada = JSON.parse(guardada) as UnidadExistente;
            this.unidadBusqueda = this.unidadSeleccionada.nombre;
            this.unidadConfirmada = true;
            // obtener de localStorage DASH_ABASTO_EXISTENCIAS_EXU_CPMS_ELEGIDOS y guardar en this.cpmsElegidos
            const cpmsElegidosGuardados = localStorage.getItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_EXU_CPMS_ELEGIDOS);
            if (cpmsElegidosGuardados) {
                this.cpmsElegidos = JSON.parse(cpmsElegidosGuardados) as CPMS[];
            }
            // obtener de localstorage DASH_ABASTO_EXISTENCIAS_EXU_UNIDADES_ELEGIDAS y guardar en this.existenciaUnidadesElegidas
            const comprimidoUnidadesElegidasGuardadas = localStorage.getItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_EXU_UNIDADES_ELEGIDAS);
            if (comprimidoUnidadesElegidasGuardadas) {
                // descomprimir
                const unidadesElegidasGuardadas = LZString.decompress(comprimidoUnidadesElegidasGuardadas);
                this.existenciaUnidadesElegidas = JSON.parse(unidadesElegidasGuardadas) as Inventario[];
            }
            // obtener DASH_ABASTO_EXISTENCIAS_EXU_ARTICULOS_MAP de localstorage y guardar en this.articulosMap
            this.cargarArticulosMapDeLocalStorage();
            this.seleccionarUnidad(this.unidadSeleccionada);
        }
        if (this.inventario.length === 0) {
            this.inventario = this.storageService.getInventarioFromLocalStorage();
        }

        // suscribirse a buscarArticulosv2 si DASH_ABASTO_EXISTENCIAS_EXU_ARTICULOS_MAP de localstorage no existe
        if (localStorage.getItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_EXU_ARTICULOS_MAP) === null) {
            this.articulosService.buscarArticulosv2('')  // vacío para traer todo
                .subscribe({
                    next: (response) => {
                        this.articulos = response.resultados.map(r => ({
                            clave: r.clave,
                            descripcion: r.descripcion,
                            presentacion: r.unidadMedida ?? '',
                        })) as Articulo[];
                        // al cargar:
                        this.articulos.forEach(a => this.articulosMap.set(a.clave, a));
                        // Guardar comprimido de articulosMap en localStorage (DASH_ABASTO_EXISTENCIAS_EXU_ARTICULOS_MAP)
                        const articulosString = JSON.stringify(Array.from(this.articulosMap.entries()));
                        const articulosComprimido = LZString.compress(articulosString);
                        localStorage.setItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_EXU_ARTICULOS_MAP, articulosComprimido);
                    },
                    error: (err) => {
                        console.warn('⚠️ Error cargando artículos:', err);
                    }
                });
        } else {
            this.cargarArticulosMapDeLocalStorage();
        }
    }

    cargarArticulosMapDeLocalStorage() {
        const articulosMapComprimido = localStorage.getItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_EXU_ARTICULOS_MAP);
        if (articulosMapComprimido) {
            // descomprimir 
            const articulosMapGuardados = LZString.decompress(articulosMapComprimido);
            this.articulosMap = new Map(JSON.parse(articulosMapGuardados));
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
    }

    disponibles(clave: string): number {
        if (!this.existenciaUnidadesElegidas || this.existenciaUnidadesElegidas.length === 0) return 0; // si no hay this.existenciaUnidadesElegidas

        const filtrado = this.existenciaUnidadesElegidas.filter(item => item.clave === clave);
        if (filtrado.length === 0) return 0;
        return filtrado.reduce((total, item) => total + item.disponible, 0);
    }

    resumenCPMs() {
        if (!this.cpmsElegidos || this.cpmsElegidos.length === 0) return { totalPiezasDisponibles: 0, totalClaveDisponibles: 0 };

        let totalPiezasDisponibles = 0;
        let totalClaveDisponibles = 0;

        for (const cpm of this.cpmsElegidos) {
            const cantidad = this.disponibles(cpm.clave);
            totalPiezasDisponibles += cantidad;
            if (cantidad > 0) {
                totalClaveDisponibles++;
            }
        }
        return { totalPiezasDisponibles, totalClaveDisponibles };
    }

    obtenerClasificacion(clave: string): string {
        const clasificacion = clasificacionMedicamentosData.find(c => c.clave === clave);
        return clasificacion ? ClasificadorVEN[clasificacion.ven] : '-';
    }

    obtenerDescripcion(clave: string): string {
        return this.articulosMap.get(clave)?.descripcion || '-';
    }

    obtenerUnidad(clave: string): string {
        return this.articulosMap.get(clave)?.presentacion || '-';
    }

    obtenerExistenciaAlmacenes(clave: string): InventarioDisponibles {
        const existenciaAlmacenes = new InventarioDisponibles();
        existenciaAlmacenes.clave = clave;

        const inventarioItems = this.inventario.filter(item => item.clave === clave);

        existenciaAlmacenes.existenciasAZE = 0;
        existenciaAlmacenes.existenciasAZM = 0;
        existenciaAlmacenes.existenciasAZT = 0;
        inventarioItems.forEach(item => {
            if (item.almacen.toLowerCase().includes('almacen estatal zona mexicali') ||
                item.almacen.toLowerCase().includes('almacen zona mexicali')) {
                existenciaAlmacenes.existenciasAZM += item.disponible - item.comprometidos;
            } else if (item.almacen.toLowerCase().includes('almacen zona ensenada')) {
                existenciaAlmacenes.existenciasAZE += item.disponible - item.comprometidos;
            } else if (item.almacen.toLowerCase().includes('almacen zona tijuana')) {
                existenciaAlmacenes.existenciasAZT += item.disponible - item.comprometidos;
            }
        });
        // console.log('existenciaAlmacenes', existenciaAlmacenes);
        return existenciaAlmacenes;
    }

    obtenerPorcentajeAbasto(totalClaveDisponibles: number, cpmsElegidos: number): number {
        this.actualizarGraficoResumen(totalClaveDisponibles, cpmsElegidos - totalClaveDisponibles);
        return totalClaveDisponibles / cpmsElegidos;
    }

    actualizarGraficoResumen(conAbasto: number, sinAbasto: number) {

        this.doughnutChartData = {
            labels: this.doughnutChartLabels,
            datasets: [
                {
                    data: [conAbasto, sinAbasto],
                    backgroundColor: ['#16a34a', '#f87171'], // verde, rojo
                    hoverBackgroundColor: ['#16a34a', '#dc2626'],  // verde oscuro, rojo intenso al pasar mouse
                    borderWidth: 1,
                },
            ],
        };

        // this.cdRef.detectChanges();

    }
}