// src/app/features/dashboard-abasto/existencias/existencias-x-clave/existencias-x-clave.component.ts
import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, Input, OnChanges, SimpleChanges, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { debounceTime, firstValueFrom, Subject, takeUntil } from 'rxjs';

import { Inventario, InventarioDisponibles } from '../../../../models/Inventario';
import { hospitalesData } from '../../../../models/hospitalesData';

import { AlmacenClaveResumen } from '../../../../models/almacen-clave-resumen.model';
import { UnidadClaveResumen } from '../../../../models/unidad-clave-resumen.model';
import { ArticulosService } from '../../../../services/articulos.service';
import { InventarioService } from '../../../../services/inventario.service';
import { StorageVariables } from '../../../../shared/storage-variables';
import { Articulo } from '../../../../models/articulo-solicitud';
import { BadgeInfoIcon, CircleAlertIcon, CircleCheckIcon, LucideAngularModule, LucidePill, OctagonAlertIcon, TriangleAlertIcon, TruckIcon } from 'lucide-angular';
import { Cita } from '../../../../models/Cita';
import { StorageSolicitudService } from '../../../../services/storage-solicitud.service';
import { controlados } from '../../../../models/controlados';
import { TrazabilidadModalComponent } from '../../../../shared/trazabilidad-modal/trazabilidad-modal.component';
import { TrazabilidadService } from '../../../../services/trazabilidad.service';
import { FactorUnidad } from '../../../../models/factor-unidad';
import { CitasService } from '../../../../services/citas.service';
import { AbstractTabComponent } from '../../../../shared/abstract-tab.component';
import { ActivatedRoute } from '@angular/router';
import { CpmService } from '../../../../services/cpm.service';
import { ExistenciasTempService } from '../../../../services/existencias-temp.service';

// TODO: por optimizar esto jalando del backend
const ALMACENES_JURIS: Record<string, { nombre: string; cluesimb: string }> = {
    mexicali: { nombre: 'ALMACÉN DE MEXICALI', cluesimb: 'BCIMB001405' },
    tijuana: { nombre: 'ALMACEN TIJUANA', cluesimb: 'BCIMB001335' },
    ensenada: { nombre: 'ALMACEN ENSENADA', cluesimb: 'BCIMB001340' },
};
const JURISDICCION_ALMACENES = ['mexicali', 'tijuana', 'ensenada'];

/**
 * Componente para mostrar las existencias por clave.
 * Tambien se usa en existencias x unidad por medio de un "modal dialog"
 */
@Component({
    standalone: true,
    selector: 'app-existencias-x-clave',
    templateUrl: './existencias-x-clave.component.html',
    imports: [CommonModule, FormsModule, LucideAngularModule, TrazabilidadModalComponent],
})
export class ExistenciasXClaveComponent extends AbstractTabComponent implements OnInit, OnDestroy {
    mostradoPorPrimeraVez = false;
    private onDestroy$ = new Subject<void>();
    // arriba en la clase
    mostrarNotaFactor = false;

    @Input() existenciaUnidades: Map<string, Inventario[]> = new Map<string, Inventario[]>();
    citasService = inject(CitasService);
    citas: Cita[] = []

    pillIcon = LucidePill;
    triangleAlert = TriangleAlertIcon;
    octagonAlert = OctagonAlertIcon;
    circleAlert = CircleAlertIcon;
    badgeInfo = BadgeInfoIcon;
    truck = TruckIcon;
    circleCheck = CircleCheckIcon
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
    claveConfirmada = false;

    datosAgrupados: AlmacenClaveResumen[] = [];

    get cpmEstatal(): number {
        return this.datosAgrupados
            .flatMap(almacen => almacen.unidades)
            .reduce((total, unidad) => total + Math.max(0, Number(unidad.clave.cpm) || 0), 0);
    }

    autocompleteResults: any[] = [];
    autocompleteVisible = signal(false);
    moreResults = false;
    totalResults = 0;
    selectedIndex = -1;

    searchSubject = new Subject<string>();
    private cdRef = inject(ChangeDetectorRef); // Asegúrate de importar esto
    articulosService = inject(ArticulosService);
    inventarioService = inject(InventarioService);
    storageService = inject(StorageSolicitudService);
    private cpmService = inject(CpmService);
    private existenciasTempService = inject(ExistenciasTempService);

    snapshotCargadoEn = signal<string | null>(null);
    snapshotInfoLoaded = signal(false);

    // para cuando se abra este componente como si fuera modal dialog
    @Input() clavePreseleccionada: string | null = null;

    // trazabilidad
    modalVisible = false;
    claveSeleccionada = '';
    unidadSeleccionada = '';
    cpmSeleccionada = 0;
    existenciaReal = 0;
    trazabilidadService = inject(TrazabilidadService);

    // al principio del componente
    // factorConv = { en_dispensacion: false, cantidad_fc: 1 };
    factorMap = new Map<string, FactorUnidad>(); // key = `${clave}|${cluesimb}`

    // Variable para loading mientras se busca toda la info sobre la clave
    loadingClave = signal(false);
    ordenesExpandidas = signal(typeof window !== 'undefined' && window.innerWidth >= 1024);

    toggleOrdenes(): void {
        this.ordenesExpandidas.update(expandidas => !expandidas);
    }

    constructor(activatedRoute: ActivatedRoute) {
        super();
        if (activatedRoute.snapshot.url[0].path === 'xclave') {
            // contenido de existencias.component... pero como aqui no es subtab, se reusa.
            this.inventarioService.existencias$.forEach((value, key) => {
                value.pipe(takeUntil(this.onDestroy$)).subscribe({
                    next: (data: Inventario[]) => {
                        // console.log('Cargando existencias de unidad', key);
                        this.existenciaUnidades.set(key, data as Inventario[]);
                    }
                });
            });
            this.isActive = true;
        }
    }

    ngOnInit(): void {
        void this.cargarInfoSnapshot();
        // console.log('ExistenciasXClaveComponent ngOnInit');
        if (this.isActive && !this.mostradoPorPrimeraVez) {
            this.onTabActivated();
        }
    }

    private async cargarInfoSnapshot(): Promise<void> {
        try {
            const info = await firstValueFrom(this.existenciasTempService.snapshotInfo());
            this.snapshotCargadoEn.set(info.cargado_en || null);
        } catch (error) {
            console.warn('No fue posible obtener la fecha del snapshot de existencias.', error);
            this.snapshotCargadoEn.set(null);
        } finally {
            this.snapshotInfoLoaded.set(true);
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
        this.autocompleteVisible.set(false);
        this.articulosService.buscarArticulos(texto).subscribe({
            next: (data) => {
                this.autocompleteResults = data.resultados.sort((a, b) => a.clave.localeCompare(b.clave))
                    || [];
                this.totalResults = data.total || 0;
                this.moreResults = this.totalResults > 12;
                this.selectedIndex = 0;
                this.autocompleteVisible.set(this.autocompleteResults.length > 0);
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
                this.autocompleteResults = data.resultados.sort((a, b) => a.clave.localeCompare(b.clave))
                    || [];
                this.totalResults = data.total || 0;
                this.moreResults = this.totalResults > 12;
                this.selectedIndex = 0;
                this.autocompleteVisible.set(this.autocompleteResults.length > 0);
                this.cdRef.detectChanges();
            },
            error: () => {
                this.autocompleteResults = [];
                this.autocompleteVisible.set(false);
                this.totalResults = 0;
            }
        });
    }

    async selectClave(item: any, skipLocalStorage = false) {
        this.loadingClave.set(true);
        try {
            this.claveBusqueda = item.clave;

            if (!skipLocalStorage) {
                localStorage.setItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_FILTRO_CLAVE, JSON.stringify(item));
            }
            this.descripcion = item.descripcion;
            this.unidad = item.unidadMedida ?? item.presentacion ?? '';
            this.autocompleteResults = [];
            this.autocompleteVisible.set(false);
            this.selectedIndex = -1;
            this.cdRef.detectChanges();
            await this.filtrarClave(skipLocalStorage);
            this.claveConfirmada = true;
        } finally {
            this.loadingClave.set(false);
        }
    }

    private async getFactor(clave: string, cluesimb: string): Promise<FactorUnidad> {
        const factor = this.normalizeFactor(
            await this.trazabilidadService.getFactorConversionPorUnidad(clave, cluesimb),
            clave,
            cluesimb
        );

        this.factorMap.set(this.factorKey(clave, cluesimb), factor);
        return factor;
    }

    private normalizeFactor(resp: FactorUnidad | null | undefined, clave: string, cluesimb: string): FactorUnidad {
        const cantidadFc = Math.max(1, Number(resp?.cantidad_fc ?? 1));
        const enDispensacion = Number(resp?.en_dispensacion ?? 0) > 0 || cantidadFc > 1;

        return {
            clave: resp?.clave || clave,
            cluesimb: resp?.cluesimb || cluesimb,
            en_dispensacion: enDispensacion ? 1 : 0,
            cantidad_fc: cantidadFc,
        };
    }

    private factorKey(clave: string, cluesimb: string): string {
        return `${clave.trim()}|${cluesimb.trim()}`;
    }

    private roundToTwo(value: number): number {
        return Math.round((value + Number.EPSILON) * 100) / 100;
    }

    reiniciarBusquedaClave() {
        this.claveConfirmada = false;
        this.claveBusqueda = '';
        this.claveFiltrada = '';
        this.autocompleteResults = [];
        this.autocompleteVisible.set(false);
        this.descripcion = '';
        this.unidad = '';
        this.datosAgrupados = [];
        this.citasHalladasPorClave = [];
        this.mostrarNotaFactor = false;
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
                this.autocompleteVisible.set(false);
                this.selectedIndex = -1;
                break;
        }
    }


    ngOnDestroy(): void {
        // console.log('Destroying ExistenciasXClaveComponent');
        this.onDestroy$.next();
        this.onDestroy$.complete();
    }

    async filtrarClave(skipLocalStorage = false) {
        /*if (this.cpms.length === 0) {
            this.cpms = [...this.storageService.getCPMSFromLocalStorage()];
        }*/

        const clave = this.claveBusqueda.trim().toUpperCase();
        this.claveFiltrada = clave;
        this.datosAgrupados = [];
        this.mostrarNotaFactor = false;
        if (!clave) return;
        const agrupadoPorAlmacen = new Map<string, UnidadClaveResumen[]>();
        const hospitalesPorJurisdiccion = new Map<string, typeof hospitalesData>();
        const cluesMap = new Map<string, string>();

        for (const hospital of hospitalesData) {
            const jurisdiccion = hospital.jurisdiccion.toLocaleLowerCase();
            if (!hospitalesPorJurisdiccion.has(jurisdiccion)) {
                hospitalesPorJurisdiccion.set(jurisdiccion, []);
            }
            hospitalesPorJurisdiccion.get(jurisdiccion)!.push(hospital);
            cluesMap.set(hospital.key, hospital.cluesimb);
        }
        const cluesList = [
            cluesMap.get('HGTKT'),  // Tecate
            cluesMap.get('HMITIJ'),
            cluesMap.get('HGTZE'),
            cluesMap.get('HGTIJ'),
            cluesMap.get('HGPR'),
            cluesMap.get('HGMXL'),
            cluesMap.get('HMIMXL'),
            cluesMap.get('UOMXL'),
            cluesMap.get('HGSF'),
            cluesMap.get('HGENS'),
        ].filter((x): x is string => !!x);

        const cpmsPorUnidad = new Map<string, number>();
        // asegurar que el cache por unidad esté cargado (in-flight + shareReplay ya lo hace eficiente)
        // y llenar cpmsPorUnidad
        await Promise.all(
            cluesList.map(async cluesimb => {
                const cpms = await firstValueFrom(this.cpmService.cpmsFor(cluesimb))
                for (const cpm of cpms) {
                    if (cpm.clave_cnis === clave) {
                        cpmsPorUnidad.set(cpm.cluesimb, cpm.cpm ?? 0);
                    }
                }
                return ;
            })
        );

        const sumExistenciaPorClave = (items?: Inventario[]) => {
            if (!items) return 0;
            let total = 0;
            for (const item of items) {
                if (item.clave === clave) {
                    total += (item.disponible - item.comprometidos);
                }
            }
            return total;
        };
        const factorTasks: Promise<void>[] = [];

        for (const municipio of JURISDICCION_ALMACENES) {
            const hospitalesDeJurisdiccion = hospitalesPorJurisdiccion.get(municipio) ?? [];
            const unidadesResumen: UnidadClaveResumen[] = [];
            console.log('Procesando municipio', municipio, 'con', hospitalesDeJurisdiccion.length, 'hospitales');
            agrupadoPorAlmacen.set(municipio, unidadesResumen);

            for (const hospital of hospitalesDeJurisdiccion) {
                const hospitalClues = hospital.cluesimb;

                const existenciaDisp = sumExistenciaPorClave(this.existenciaUnidades.get(hospital.key));

                const unidadResumen: UnidadClaveResumen = {
                    unidad: hospital?.nombre ?? hospitalClues,
                    municipio,
                    cluesimb: hospitalClues,
                    clave: { cpm: 0, existencia: 0, reposicion: 0 },
                } as any;

                const cpm = cpmsPorUnidad.get(hospitalClues) ?? 0;
                unidadResumen.clave.cpm = cpm;
                unidadResumen.clave.existencia = existenciaDisp;

                if (clave === '010.000.0254.00' ) {
                    console.log('Existencia en unidad', hospitalClues, existenciaDisp, 'CPM:', cpm);
                }

                const factorTask = this.getFactor(clave, hospitalClues).then((factor) => {
                    const enDisp = !!factor.en_dispensacion;
                    const fc = factor.cantidad_fc;

                    if (clave === '010.000.0254.00' ) {
                      console.log('Factor para unidad', hospitalClues, factor);
                      console.log('Existencia en unidad', existenciaDisp, 'CPM:', cpm);
                    }

                    const existenciaBase = enDisp && fc > 1
                        ? this.roundToTwo(existenciaDisp / fc)
                        : existenciaDisp;

                    unidadResumen.clave.existencia = existenciaBase;
                    unidadResumen.clave.reposicion = cpm > existenciaBase ? (cpm - existenciaBase) : 0;
                    unidadResumen.factorConversion = factor;
                    unidadResumen.existenciaDispensacion = existenciaDisp;
                    (unidadResumen as any)._existenciaDisp = existenciaDisp;
                });
                factorTasks.push(factorTask);

                console.log('unidadesResumen', unidadesResumen);
                unidadesResumen.push(unidadResumen);
            }
            // calcular existencia de almacen
            const imssb = ALMACENES_JURIS[municipio]?.cluesimb;
            if (imssb) {
                const existenciaDisp = sumExistenciaPorClave(this.existenciaUnidades.get(imssb));
                if (municipio.toLocaleLowerCase().includes('mexicali') && this.existenciaAlmacenes) {
                    this.existenciaAlmacenes.existenciasAZM = existenciaDisp;
                } else if (municipio.toLocaleLowerCase().includes('ensenada') && this.existenciaAlmacenes) {
                    this.existenciaAlmacenes.existenciasAZE = existenciaDisp;
                } else if (municipio.toLocaleLowerCase().includes('tijuana') && this.existenciaAlmacenes) {
                    this.existenciaAlmacenes.existenciasAZT = existenciaDisp;
                }
            }
        }

        console.log('Ejecutando tareas de factor de conversión para cada unidad...');
        await Promise.all(factorTasks);

        // Construir estructura final
        this.datosAgrupados = Array.from(agrupadoPorAlmacen.entries()).map(([municipio, unidades]) => {
            const meta = ALMACENES_JURIS[municipio] ?? { nombre: municipio.toUpperCase(), cluesimb: '' };
            return { almacen: municipio, cluesimb: meta.cluesimb, unidades } as AlmacenClaveResumen;
        });

        // Nota “¿Qué estoy viendo?”
        this.mostrarQueEstoyViendo();

        if (!skipLocalStorage) {
            localStorage.setItem(
                StorageVariables.DASH_ABASTO_EXISTENCIAS_EXC_DATOS_AGRUPADOS,
                JSON.stringify(this.datosAgrupados)
            );
            // meter this.factorMap en DASH_ABASTO_EXISTENCIAS_EXC_FACTOR_MAP
            localStorage.setItem(
                StorageVariables.DASH_ABASTO_EXISTENCIAS_EXC_FACTOR_MAP,
                JSON.stringify([...this.factorMap])
            );
        }

        this.calcularInventarioDisponible(this.claveFiltrada, skipLocalStorage);
        this.buscarExistenciasDeClave(skipLocalStorage);
    }

    private mostrarQueEstoyViendo() {
        this.mostrarNotaFactor = this.getFactoresDeClaveActual()
            .some(f => f.en_dispensacion === 1 && (f.cantidad_fc ?? 1) > 1);
    }

    private getFactoresDeClaveActual(): FactorUnidad[] {
        const factoresPorUnidad = this.datosAgrupados
            .flatMap(almacen => almacen.unidades)
            .map(unidad => unidad.factorConversion)
            .filter((factor): factor is FactorUnidad => !!factor);

        if (factoresPorUnidad.length) return factoresPorUnidad;

        return Array.from(this.factorMap.entries())
            .filter(([key]) => key.startsWith(`${this.claveFiltrada}|`))
            .map(([, factor]) => factor);
    }

    /**
     * Busca las citas de un insumo en la variable que contiene todas las citas
     */
    /**
   * Busca las citas de un insumo en backend (30d recientes) y pendientes.
   */
    async buscarExistenciasDeClave(skipLocalStorage = false) {
        const hoy = new Date();
        // const hace90dias = new Date(hoy); hace90dias.setDate(hoy.getDate() - 90);

        // si quieres pasar el rango de “Recepción lista” tal cual desde el periodo activo, puedes
        // usar el PeriodoPicker del tab Resumen; aquí, por simplicidad, no forzamos esos dates.
        try {
            const resp = await firstValueFrom(
                this.citasService.getCitasPorClaveXClave({
                    clave: this.claveFiltrada,
                    // desde: this.toISO(this.fechaInicio)  // si decides pasar fechas del picker
                    // hasta: this.toISO(this.fechaFin),
                    windowDays: 365,
                    incluyeNoRecibidas: true,
                    limit: 10 // ultimos 10
                })
            );

            const rows = resp?.rows ?? [];
            this.citasHalladasPorClave = rows as Cita[];
            this.citasHalladasPorClave.forEach(cita => {
                if (!cita.fecha_recepcion_almacen) {
                    cita.fecha_recepcion_almacen = this.obtenerFechaRecepcion(cita);
                }
            });
            this.citaParaDescripcionDeClave = (resp?.ref ?? rows[0] ?? null) as Cita | null;

        } catch (err) {
            console.warn('⚠️ Backend /xclave no disponible, usando filtro local', err);
            // ⬇️  fallback local: tu lógica original
            /*
            this.citaParaDescripcionDeClave = this.citas.find(c => c.clave_cnis === this.claveFiltrada)!;
            this.citasHalladasPorClave = this.citas.filter(c => {
                const esClave = c.clave_cnis === this.claveFiltrada;

                const fechaLimite = c.fecha_limite_de_entrega
                    ? new Date(c.fecha_limite_de_entrega)
                    : null;

                const fechaValida = !!fechaLimite && (fechaLimite >= hoy || fechaLimite >= hace90dias);

                const recibidoRecientementeONoSeHaRecibido = c.fecha_recepcion_almacen
                    ? new Date(c.fecha_recepcion_almacen) >= hace90dias
                    : true;

                return esClave && fechaValida && recibidoRecientementeONoSeHaRecibido;
            });
            */
        }

        if (!skipLocalStorage) {
            localStorage.setItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_CITAS_X_CLAVE, JSON.stringify(this.citasHalladasPorClave));
            if (this.citaParaDescripcionDeClave) {
                localStorage.setItem(
                    StorageVariables.DASH_ABASTO_EXISTENCIAS_EXC_CITA_PARA_DESCRIPCION_DE_CLAVE,
                    JSON.stringify(this.citaParaDescripcionDeClave)
                );
            }
        }
        this.cdRef.detectChanges();
    }

    obtenerFechaRecepcion(cita: Cita): string | null {
        if (!cita.fecha_recepcion_almacen) {
            if (cita.fecha_recepcion_lista && cita.fecha_recepcion_lista.length > 0) {
                // obtener la primer fecha
                return cita.fecha_recepcion_lista[0];
            }
        }
        return cita.fecha_recepcion_almacen;
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
                item.almacen.toLowerCase().includes('almacen imss bienestar mexicali') ||
                item.almacen.toLowerCase().includes('almacen zona mexicali')) {
                this.existenciaAlmacenes.existenciasAZM += item.disponible - item.comprometidos;
            } else if (item.almacen.toLowerCase().includes('almacen imss bienestar ensenada') ||
                       item.almacen.toLowerCase().includes('almacen zona ensenada')) {
                this.existenciaAlmacenes.existenciasAZE += item.disponible - item.comprometidos;
            } else if (item.almacen.toLowerCase().includes('almacen imss bienestar tijuana') ||
                       item.almacen.toLowerCase().includes('almacen zona tijuana')) {
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

    /**
     * Abre el modal de trazabilidad para la clave y unidad especificadas.
     * @param clave Clave del insumo
     * @param cluesimb Cluesimb de la unidad
     */
    abrirTrazabilidad(clave: string, cluesimb: string, cpm: number, descripcion: string, existenciaReal: number) {
        this.claveSeleccionada = clave;
        this.unidadSeleccionada = cluesimb;
        // si mando -1, es almacen
        this.cpmSeleccionada = cpm;
        this.existenciaReal = existenciaReal;
        this.descripcion = ((descripcion.length > 250) ? descripcion.slice(0, 240) + ' [...]' : descripcion);
        // por si quedó en true por alguna razón, fuerza el flanco de bajada/subida
        this.modalVisible = false;
        queueMicrotask(() => this.modalVisible = true);
    }

    onModalClosed() {
        this.modalVisible = false; // cierra de verdad
    }

    getTooltipExistencia(unidad: any): string {
        if (!unidad) return '—';

        const key = this.factorKey(this.claveFiltrada, unidad.cluesimb);
        const factor = this.factorMap.get(key);  // 👈 usar el map real

        if (!factor) return '—';

        const fc = Math.max(1, Number(factor.cantidad_fc ?? 1));
        const enDisp = factor.en_dispensacion === 1 || factor.en_dispensacion === true as any;

        if (enDisp && fc > 1) {
            // usamos la existencia en dispensación cruda si la guardaste,
            // si no, la calculamos desde la base mostrada
            const disp = (unidad as any)._existenciaDisp ?? (Number(unidad?.clave?.existencia ?? 0) * fc);
            return +disp > 0 ? `Disp.: ${disp} (fc ${fc})` : '';
        }

        return '—';
    }

    cargaOnTabActivated(): void {
        try {
            if (this.clavePreseleccionada) {
                console.log('ExistenciasXClaveComponent - sin clave preseleccionada.');
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
                // console.log('ExistenciasXClaveComponent - intentando carga de info desde localstorage', articulo);
                if (articulo && articulo.includes('{')) {
                    // console.log('ExistenciasXClaveComponent - cargando más info desde localstorage...');
                    this.claveConfirmada = true;
                    const item = JSON.parse(articulo) as Articulo;
                    this.claveBusqueda = item.clave;
                    // this.buscarFactor();
                    this.claveFiltrada = item.clave;
                    this.descripcion = item.descripcion;
                    this.unidad = item.presentacion ?? '';
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

                    // obtener de DASH_ABASTO_EXISTENCIAS_EXC_FACTOR_MAP para this.factorMap
                    const exc4 = localStorage.getItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_EXC_FACTOR_MAP);
                    if (exc4) {
                        const mapEntries: [string, FactorUnidad][] = JSON.parse(exc4);
                        this.factorMap = new Map(mapEntries);
                        this.mostrarQueEstoyViendo();
                    }
                }

                this.searchSubject.pipe(debounceTime(400), takeUntil(this.onDestroy$))
                    .subscribe(texto => {
                        if (texto.length > 2) {
                            this.buscarArticulosConFallback(texto);
                        } else {
                            this.autocompleteResults = [];
                            this.autocompleteVisible.set(false);
                            this.selectedIndex = -1;
                            this.moreResults = false;
                            this.totalResults = 0;
                        }
                    });
            }

            this.inventarioService.inventario$
                .pipe(takeUntil(this.onDestroy$))
                .subscribe({
                    next: (data) => {
                        if (!data || data.length === 0) return;
                        this.inventario = [...data];
                        this.cdRef.detectChanges();
                    },
                    error: (error) => {
                        console.error('Error al obtener el inventario:', error);
                    }
                });
        } catch (error) {
            console.error(error);
        }
    }

    protected override onTabActivated(): void {
        if (!this.mostradoPorPrimeraVez) {
            this.cargaOnTabActivated();
            this.mostradoPorPrimeraVez = true;
        }
    }
    protected override onTabDeactivated(): void {
        // no es necesario hacer algo
    }
}
