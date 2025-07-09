// src/app/features/dashboard-abasto/existencias/existencias-x-clave/existencias-x-clave.component.ts
import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { debounceTime, Subject, takeUntil } from 'rxjs';

import { DashboardService } from '../../../../services/dashboard.service';
import { Inventario, InventarioDisponibles } from '../../../../models/Inventario';
import { hospitalesData } from '../../../../models/hospitalesData';

import { AlmacenClaveResumen } from '../../../../models/almacen-clave-resumen.model';
import { UnidadClaveResumen } from '../../../../models/unidad-clave-resumen.model';
import { DatosClaveSeleccionada } from '../../../../models/datos-clave-seleccionada.model';
import { ArticulosService } from '../../../../services/articulos.service';
import { clasificacionMedicamentosData } from '../../../../models/clasificacionMedicamentosData';
import { ClasificadorVEN } from '../../../../models/clasificador-ven';
import { InventarioService } from '../../../../services/inventario.service';
import { ExistenciasTabInfo } from '../../../../models/existenciasTabInfo';
import { StorageVariables } from '../../../../shared/storage-variables';
import { Articulo, ArticuloSolicitud } from '../../../../models/articulo-solicitud';
import { LucideAngularModule, LucidePill } from 'lucide-angular';
import { Cita } from '../../../../models/Cita';
import { StorageSolicitudService } from '../../../../services/storage-solicitud.service';
import { controlados } from '../../../../models/controlados';

@Component({
    standalone: true,
    selector: 'app-existencias-x-clave',
    templateUrl: './existencias-x-clave.component.html',
    imports: [CommonModule, FormsModule, LucideAngularModule],
})
export class ExistenciasXClaveComponent implements OnInit, OnDestroy {
    private dashboardService = inject(DashboardService);
    private onDestroy$ = new Subject<void>();
    pillIcon = LucidePill

    data: ExistenciasTabInfo = new ExistenciasTabInfo();
    citasFull: Cita[] = [];
    citasHalladasPorClave: Cita[] = [];
    /**
     * Cita para la descripcion de la clave
     * solo para obtener datos como clasificacion, tipo de insumo, etc
     */
    citaParaDescripcionDeClave: Cita | null = null;
    inventario: Inventario[] = [];
    existenciaAlmacenes: InventarioDisponibles = new InventarioDisponibles();

    claveBusqueda = '';
    claveFiltrada = '';
    descripcion = '';
    unidad = '';
    clasificacion = ''; // aún no disponible
    claveConfirmada = false;

    datosAgrupados: AlmacenClaveResumen[] = [];

    autocompleteResults: any[] = [];
    moreResults = false;
    totalResults = 0;
    selectedIndex = -1;

    searchSubject = new Subject<string>();
    private cdRef = inject(ChangeDetectorRef); // Asegúrate de importar esto
    articulosService = inject(ArticulosService);
    inventarioService = inject(InventarioService);
    storageService = inject(StorageSolicitudService);

    constructor() {
    }

    ngOnInit(): void {
        // console.log('ExistenciasXClaveComponent ngOnInit');
        try {
            const articulo = localStorage.getItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_FILTRO_CLAVE);
            // console.log('ExistenciasXClaveComponent - cargando info desde localstorage', articulo);
            if (articulo && articulo.includes('{')) {
                // console.log('ExistenciasXClaveComponent - cargando más info desde localstorage...');
                this.claveConfirmada = true;
                const item = JSON.parse(articulo) as Articulo;
                this.claveBusqueda = item.clave;
                this.claveFiltrada = item.clave;
                this.descripcion = item.descripcion;
                this.unidad = item.presentacion ?? '';
                const clasificacion = clasificacionMedicamentosData.find(c => c.clave === item.clave);
                this.clasificacion = clasificacion ? ClasificadorVEN[clasificacion.ven] : '-';
                // obtener de DASH_ABASTO_EXISTENCIAS_CITAS_X_CLAVE
                const citasls = localStorage.getItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_CITAS_X_CLAVE);
                if (citasls) {
                    this.citasHalladasPorClave = JSON.parse(citasls) as Cita[];
                }
                // obtener de DASH_ABASTO_EXISTENCIAS_EXC_ALMACENES
                const exc = localStorage.getItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_EXC_ALMACENES);
                if (exc) {
                    this.existenciaAlmacenes = JSON.parse(exc) as InventarioDisponibles;
                }

                // obtener de DASH_ABASTO_EXISTENCIAS_EXC_DATOS_AGRUPADOS
                const exc2 = localStorage.getItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_EXC_DATOS_AGRUPADOS);
                if (exc2) {
                    this.datosAgrupados = JSON.parse(exc2) as AlmacenClaveResumen[];
                }

                // obtener de DASH_ABASTO_EXISTENCIAS_EXC_CITA_PARA_DESCRIPCION_DE_CLAVE
                const exc3 = localStorage.getItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_EXC_CITA_PARA_DESCRIPCION_DE_CLAVE);
                if (exc3 && exc3.includes('{')) {
                    this.citaParaDescripcionDeClave = JSON.parse(exc3) as Cita;
                }
            }

            this.dashboardService.existenciasTabInfo$
                .pipe(takeUntil(this.onDestroy$))
                .subscribe((data: ExistenciasTabInfo) => {
                    this.data = data;
                });

            this.searchSubject.pipe(debounceTime(400), takeUntil(this.onDestroy$))
                .subscribe(texto => {
                    if (texto.length > 2) {
                        this.buscarArticulosConFallback(texto);
                    } else {
                        this.autocompleteResults = [];
                        this.selectedIndex = -1;
                        this.moreResults = false;
                        this.totalResults = 0;
                    }
                });

            this.dashboardService.citas$
                .pipe(takeUntil(this.onDestroy$))
                .subscribe((data: Cita[]) => {
                    this.citasFull = data as Cita[];
                });

            if (this.inventario.length === 0) {
                this.inventario = this.storageService.getInventarioFromLocalStorage();
                // console.log('ExistenciasXClaveComponent - this.inventario len', this.inventario.length);
            }
        } catch (error) {
            console.error(error);
        }
    }

    buscarArticulosConFallback(texto: string) {
        this.articulosService.buscarArticulos(texto).subscribe({
            next: (data) => {
                this.autocompleteResults = data.resultados || [];
                this.totalResults = data.total || 0;
                this.moreResults = this.totalResults > 12;
                this.selectedIndex = 0;
                this.cdRef.detectChanges();
            },
            error: () => {
                console.warn('⚠️ Backend no disponible, usando fallback');
                this.usarBusquedaLocal(texto);
            }
        });
    }

    usarBusquedaLocal(texto: string) {
        this.articulosService.buscarArticulosv2(texto).subscribe({
            next: (data) => {
                this.autocompleteResults = data.resultados || [];
                this.totalResults = data.total || 0;
                this.moreResults = this.totalResults > 12;
                this.selectedIndex = 0;
                this.cdRef.detectChanges();
            },
            error: () => {
                this.autocompleteResults = [];
                this.totalResults = 0;
            }
        });
    }

    selectClave(item: any) {
        this.claveBusqueda = item.clave;

        localStorage.setItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_FILTRO_CLAVE, JSON.stringify(item));
        this.descripcion = item.descripcion;
        this.unidad = item.unidadMedida ?? item.presentacion ?? '';
        const clasificacion = clasificacionMedicamentosData.find(c => c.clave === item.clave);
        this.clasificacion = clasificacion ? ClasificadorVEN[clasificacion.ven] : '-';
        this.autocompleteResults = [];
        this.selectedIndex = -1;
        this.cdRef.detectChanges();
        this.filtrarClave();
        this.claveConfirmada = true;
    }

    reiniciarBusquedaClave() {
        this.claveConfirmada = false;
        this.claveBusqueda = '';
        this.claveFiltrada = '';
        this.autocompleteResults = [];
        this.descripcion = '';
        this.clasificacion = '';
        this.unidad = '';
        this.datosAgrupados = [];
        localStorage.removeItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_FILTRO_CLAVE);
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
                if (this.autocompleteResults[this.selectedIndex]) {
                    this.selectClave(this.autocompleteResults[this.selectedIndex]);
                }
                break;
            case 'Escape':
                this.autocompleteResults = [];
                this.selectedIndex = -1;
                break;
        }
    }


    ngOnDestroy(): void {
        // console.log('Destroying ExistenciasXClaveComponent');
        this.onDestroy$.next();
        this.onDestroy$.complete();
    }

    filtrarClave(): void {
        const clave = this.claveBusqueda.trim().toUpperCase();
        this.claveFiltrada = clave;
        this.datosAgrupados = [];

        if (!clave) return;

        // Buscar primer match para descripción
        // const primerMatch = this.buscarInventarioDeClave(clave);
        // console.log('primerMatch', primerMatch);

        const jurisdiccionAlmacenes = ['mexicali', 'tijuana', 'ensenada'];

        const agrupadoPorAlmacen = new Map<string, UnidadClaveResumen[]>();


        // iteramos por las jurisdicciones
        jurisdiccionAlmacenes.forEach((municipio) => {

            // Iteramos por los hospitales filtrado por cada uno de los 3 municipios
            const hospitalesDeJurisdiccion = hospitalesData.filter(h => h.jurisdiccion.toLocaleLowerCase() === municipio)
            hospitalesDeJurisdiccion.forEach(hospital => {
                const clues = hospital.cluesimb;
                // console.log(`Iterando municipio ${municipio} vs hospital ${hospital.key} `);
                // buscamos la existencia del insumo en el hospital
                const existenciasInsumo = this.data.existenciaUnidades.get(hospital.key)?.filter(i => i.clave === clave);
                // console.log('existenciasInsumo de hospital', existenciasInsumo);

                const unidadResumen: UnidadClaveResumen = {
                    unidad: hospital?.nombre ?? clues,
                    municipio: municipio,
                    clave: {
                        cpm: 0,
                        existencia: 0,
                        reposicion: 0,
                    },
                };
                const cpmEntry = this.data.cpms.find(c => c.clave === clave && c.cluesimb === clues);
                const cpm = cpmEntry?.cantidad ?? 0;

                unidadResumen.clave.cpm = cpm;

                if (existenciasInsumo) {
                    existenciasInsumo.forEach(i => {
                        unidadResumen.clave.existencia += i.disponible;
                    });
                }
                unidadResumen.clave.reposicion = cpm > unidadResumen.clave.existencia ?
                    cpm - unidadResumen.clave.existencia : 0;

                if (!agrupadoPorAlmacen.has(municipio)) {
                    agrupadoPorAlmacen.set(municipio, []);
                }

                agrupadoPorAlmacen.get(municipio)!.push(unidadResumen);
            });

        });
        // console.log('agrupadoPorAlmacen', agrupadoPorAlmacen);
        this.datosAgrupados = Array.from(agrupadoPorAlmacen.entries()).map(([almacen, unidades]) => ({
            almacen,
            unidades
        }));

        localStorage.setItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_EXC_DATOS_AGRUPADOS, JSON.stringify(this.datosAgrupados));

        this.buscarExistenciasDeClave();
        this.calcularInventarioDisponible(this.claveFiltrada);
    }

    /**
     * Busca las citas de un insumo en la variable que contiene todas las citas
     */
    buscarExistenciasDeClave() {
        const hoy = new Date();
        const hace15dias = new Date(hoy);
        hace15dias.setDate(hoy.getDate() - 200);

        this.citaParaDescripcionDeClave = this.citasFull.find(c => c.clave_cnis === this.claveFiltrada)!;

        this.citasHalladasPorClave = this.citasFull.filter(c => {
            const esClave = c.clave_cnis === this.claveFiltrada;
            const esVigente = c.estatus === 'Vigente';

            const fechaLimite = c.fecha_limite_de_entrega
                ? new Date(c.fecha_limite_de_entrega)
                : null;

            const fechaValida = fechaLimite &&
                (fechaLimite >= hoy || fechaLimite >= hace15dias);

            return esClave && esVigente && fechaValida;
        });
        localStorage.setItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_CITAS_X_CLAVE, JSON.stringify(this.citasHalladasPorClave));
        localStorage.setItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_EXC_CITA_PARA_DESCRIPCION_DE_CLAVE, JSON.stringify(this.citaParaDescripcionDeClave));
        this.cdRef.detectChanges();
    }

    totalExistenciaEnAlmacen(almacen: string): number {
        if (almacen.toLocaleLowerCase().includes('mexicali') && this.existenciaAlmacenes) {
            return this.existenciaAlmacenes?.existenciasAZM ?? 0;
        } else if (almacen.toLocaleLowerCase().includes('ensenada') && this.existenciaAlmacenes) {
            return this.existenciaAlmacenes?.existenciasAZE ?? 0;
        } else if (almacen.toLocaleLowerCase().includes('tijuana') && this.existenciaAlmacenes) {
            return this.existenciaAlmacenes?.existenciasAZT ?? 0;
        }
        return 0;
    }

    calcularInventarioDisponible(clave: string) {
        console.log('calcularInventarioDisponible', clave);
        this.existenciaAlmacenes = new InventarioDisponibles();
        this.existenciaAlmacenes.clave = clave;
        console.log('this.inventario', this.inventario);
        const inventarioItems = this.inventario.filter(item => item.clave === clave);
        console.log('buscando en inventarioItems', inventarioItems);
        this.existenciaAlmacenes.existenciasAZE = 0;
        this.existenciaAlmacenes.existenciasAZM = 0;
        this.existenciaAlmacenes.existenciasAZT = 0;
        inventarioItems.forEach(item => {
            if (item.almacen.toLowerCase().includes('almacen estatal zona mexicali') ||
                item.almacen.toLowerCase().includes('almacen zona mexicali')) {
                this.existenciaAlmacenes.existenciasAZM += item.disponible - item.comprometidos;
            } else if (item.almacen.toLowerCase().includes('almacen zona ensenada')) {
                this.existenciaAlmacenes.existenciasAZE += item.disponible - item.comprometidos;
            } else if (item.almacen.toLowerCase().includes('almacen zona tijuana')) {
                this.existenciaAlmacenes.existenciasAZT += item.disponible - item.comprometidos;
            }
        });
        console.log('this.existenciaAlmacenes', this.existenciaAlmacenes);
        // guardar en localstorage
        localStorage.setItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_EXC_ALMACENES, JSON.stringify(this.existenciaAlmacenes));
    }

    claveEsControlado(clave: string): boolean {
        return controlados.includes(clave);
    }

    esHoy(fechaLimite: Date) {
        const hoy = new Date();
        const fecha = new Date(fechaLimite);
        return fecha.toDateString() === hoy.toDateString();
    }

    esProxima(fechaLimite: Date) {
        const hoy = new Date();
        const fecha = new Date(fechaLimite);
        const diff = (fecha.getTime() - hoy.getTime()) / (1000 * 3600 * 24);
        return diff > 0 && diff <= 3;
    }

    esVencida(fechaLimite: Date) {
        if (!fechaLimite) return false;
        const hoy = new Date();
        const fecha = new Date(fechaLimite);
        const diff = (hoy.getTime() - fecha.getTime()) / (1000 * 3600 * 24);
        return diff > 0 && diff <= 15;
    }
}
