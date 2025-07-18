// src/app/features/dashboard-abasto/existencias/existencias-x-clave/existencias-x-clave.component.ts
import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { debounceTime, Subject, takeUntil } from 'rxjs';

import { Inventario, InventarioDisponibles } from '../../../../models/Inventario';
import { hospitalesData } from '../../../../models/hospitalesData';

import { AlmacenClaveResumen } from '../../../../models/almacen-clave-resumen.model';
import { UnidadClaveResumen } from '../../../../models/unidad-clave-resumen.model';
import { ArticulosService } from '../../../../services/articulos.service';
import { clasificacionMedicamentosData } from '../../../../models/clasificacionMedicamentosData';
import { ClasificadorVEN } from '../../../../models/clasificador-ven';
import { InventarioService } from '../../../../services/inventario.service';
import { StorageVariables } from '../../../../shared/storage-variables';
import { Articulo } from '../../../../models/articulo-solicitud';
import { CircleAlertIcon, CircleCheckIcon, LucideAngularModule, LucidePill, OctagonAlertIcon, TriangleAlertIcon, TruckIcon } from 'lucide-angular';
import { Cita } from '../../../../models/Cita';
import { StorageSolicitudService } from '../../../../services/storage-solicitud.service';
import { controlados } from '../../../../models/controlados';
import { CPMS } from '../../../../models/CPMS';

@Component({
    standalone: true,
    selector: 'app-existencias-x-clave',
    templateUrl: './existencias-x-clave.component.html',
    imports: [CommonModule, FormsModule, LucideAngularModule],
})
export class ExistenciasXClaveComponent implements OnInit, OnChanges, OnDestroy {
    private onDestroy$ = new Subject<void>();

    @Input() existenciaUnidades: Map<string, Inventario[]> = new Map<string, Inventario[]>();
    @Input() cpms: CPMS[] = [];
    @Input() citas: Cita[] = [];

    pillIcon = LucidePill;
    triangleAlert = TriangleAlertIcon;
    octagonAlert = OctagonAlertIcon;
    circleAlert = CircleAlertIcon;
    truck = TruckIcon;
    circleCheck = CircleCheckIcon
    //citasFull: Cita[] = [];
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

    // para cuando se abra este componente como si fuera modal dialog
    @Input() clavePreseleccionada: string | null = null;

    constructor() {
    }

    ngOnChanges(changes: SimpleChanges): void {

    }


    ngOnInit(): void {
        // console.log('ExistenciasXClaveComponent ngOnInit');
        try {
            if (this.clavePreseleccionada) {
                this.articulosService.buscarArticulos(this.clavePreseleccionada).subscribe({
                    next: (data) => {
                        const item = data.resultados.find(a => a.clave === this.clavePreseleccionada);
                        if (item) {
                            this.selectClave(item, true);
                        }
                    },
                    error: (err) => {
                        console.warn('⚠️ Error buscando clave en modal:', err);
                    }
                });
            } else {
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
            }

            if (this.inventario.length === 0) {
                this.inventario = this.storageService.getInventarioFromLocalStorage();
                // console.log('ExistenciasXClaveComponent - this.inventario len', this.inventario.length);
            }
        } catch (error) {
            console.error(error);
        }
    }


    getIconoFecha(fecha: Date): any {
        if (this.esVencida(fecha)) return this.triangleAlert;
        if (this.esHoy(fecha)) return this.octagonAlert;
        if (this.esProxima(fecha)) return this.circleAlert;
        return this.truck;
    }

    getColorClase(fecha: Date): string {
        if (this.esVencida(fecha)) return 'text-red-600';
        if (this.esHoy(fecha)) return 'text-yellow-500';
        if (this.esProxima(fecha)) return 'text-orange-500';
        return 'text-green-600';
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

    selectClave(item: any, skipLocalStorage = false) {
        this.claveBusqueda = item.clave;

        if (!skipLocalStorage) {
            localStorage.setItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_FILTRO_CLAVE, JSON.stringify(item));
        }
        this.descripcion = item.descripcion;
        this.unidad = item.unidadMedida ?? item.presentacion ?? '';
        const clasificacion = clasificacionMedicamentosData.find(c => c.clave === item.clave);
        this.clasificacion = clasificacion ? ClasificadorVEN[clasificacion.ven] : '-';
        this.autocompleteResults = [];
        this.selectedIndex = -1;
        this.cdRef.detectChanges();
        this.filtrarClave(skipLocalStorage);
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

    filtrarClave(skipLocalStorage = false): void {
        //console.log('filtrarClave');
        if (this.cpms.length === 0) {
            this.cpms = [...this.storageService.getCPMSFromLocalStorage()];
        }
        const clave = this.claveBusqueda.trim().toUpperCase();
        this.claveFiltrada = clave;
        this.datosAgrupados = [];

        if (!clave) return;

        const jurisdiccionAlmacenes = ['mexicali', 'tijuana', 'ensenada'];

        const agrupadoPorAlmacen = new Map<string, UnidadClaveResumen[]>();

        // iteramos por las jurisdicciones
        jurisdiccionAlmacenes.forEach((municipio) => {

            // Iteramos por los hospitales filtrado por cada uno de los 3 municipios
            const hospitalesDeJurisdiccion = hospitalesData.filter(h => h.jurisdiccion.toLocaleLowerCase() === municipio)
            hospitalesDeJurisdiccion.forEach(hospital => {
                const clues = hospital.cluesimb;
                //console.log(`Iterando municipio ${municipio} vs hospital ${hospital.key} `);
                // buscamos la existencia del insumo en el hospital
                const existenciasInsumo = this.existenciaUnidades.get(hospital.key)?.filter(i => i.clave === clave);
                //console.log('existenciasInsumo de hospital', existenciasInsumo);

                const unidadResumen: UnidadClaveResumen = {
                    unidad: hospital?.nombre ?? clues,
                    municipio: municipio,
                    clave: {
                        cpm: 0,
                        existencia: 0,
                        reposicion: 0,
                    },
                };
                const cpmEntry = this.cpms.find(c => c.clave === clave && c.cluesimb === clues);
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

        if (!skipLocalStorage) {
            localStorage.setItem(
                StorageVariables.DASH_ABASTO_EXISTENCIAS_EXC_DATOS_AGRUPADOS,
                JSON.stringify(this.datosAgrupados));
        }
        this.calcularInventarioDisponible(this.claveFiltrada, skipLocalStorage);
        this.buscarExistenciasDeClave(skipLocalStorage);
    }

    /**
     * Busca las citas de un insumo en la variable que contiene todas las citas
     */
    buscarExistenciasDeClave(skipLocalStorage = false) {
        const hoy = new Date();
        const hace15dias = new Date(hoy);
        hace15dias.setDate(hoy.getDate() - 15);

        this.citaParaDescripcionDeClave = this.citas.find(c => c.clave_cnis === this.claveFiltrada)!;

        this.citasHalladasPorClave = this.citas.filter(c => {
            const esClave = c.clave_cnis === this.claveFiltrada;

            const fechaLimite = c.fecha_limite_de_entrega
                ? new Date(c.fecha_limite_de_entrega)
                : null;

            const fechaValida = fechaLimite &&
                (fechaLimite >= hoy || fechaLimite >= hace15dias);

            // si se recibio recientemente o si fecha_recepcion_almacen es null
            const recibidoRecientementeONoSeHaRecibido = c.fecha_recepcion_almacen
                ? new Date(c.fecha_recepcion_almacen) >= hace15dias
                : true;

            return esClave && fechaValida && recibidoRecientementeONoSeHaRecibido;
        });

        if (!skipLocalStorage) {
            localStorage.setItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_CITAS_X_CLAVE, JSON.stringify(this.citasHalladasPorClave));
            localStorage.setItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_EXC_CITA_PARA_DESCRIPCION_DE_CLAVE, JSON.stringify(this.citaParaDescripcionDeClave));
        }
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

    calcularInventarioDisponible(clave: string, skipLocalStorage = false) {

        this.existenciaAlmacenes = new InventarioDisponibles();
        this.existenciaAlmacenes.clave = clave;

        const inventarioItems = this.inventario.filter(item => item.clave === clave);

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
        if (!skipLocalStorage) {
            // guardar en localstorage
            localStorage.setItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_EXC_ALMACENES, JSON.stringify(this.existenciaAlmacenes));
        }
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
        return diff > 0;
    }
}
