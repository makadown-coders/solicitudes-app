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
import { TrazabilidadModalComponent } from '../../../../shared/trazabilidad-modal/trazabilidad-modal.component';
import { TrazabilidadService } from '../../../../services/trazabilidad.service';
import { FactorUnidad } from '../../../../models/factor-unidad';
import { CitasService } from '../../../../services/citas.service';

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
export class ExistenciasXClaveComponent implements OnInit, OnChanges, OnDestroy {
    private onDestroy$ = new Subject<void>();
    // arriba en la clase
    mostrarNotaFactor = false;

    @Input() existenciaUnidades: Map<string, Inventario[]> = new Map<string, Inventario[]>();
    @Input() cpms: CPMS[] = [];
    citasService = inject(CitasService);
    // @Input() citas: Cita[] = [];
    citas: Cita[] = []

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

    // trazabilidad
    modalVisible = false;
    claveSeleccionada = '';
    unidadSeleccionada = '';
    cpmSeleccionada = 0;
    existenciaReal = 0;
    trazabilidadService = inject(TrazabilidadService);

    // al principio del componente
    // factorConv = { en_dispensacion: false, cantidad_fc: 1 };
    private factorMap = new Map<string, FactorUnidad>(); // key = `${clave}|${cluesimb}`

    // Variable para loading mientras se busca toda la info sobre la clave
    loadingClave = signal(false);

    // helper
    /*private aplicarFactorBase(cantidad: number): number {
        if (!this.factorConv.en_dispensacion || this.factorConv.cantidad_fc <= 1) return cantidad;
        return Math.round(cantidad / this.factorConv.cantidad_fc); // base
    }*/

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
                    // this.buscarFactor();
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
                this.autocompleteResults = data.resultados.sort((a, b) => a.clave.localeCompare(b.clave))
                    || [];
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
                this.autocompleteResults = data.resultados.sort((a, b) => a.clave.localeCompare(b.clave))
                    || [];
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

    async selectClave(item: any, skipLocalStorage = false) {
        this.loadingClave.set(true);
        try {
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
            await this.filtrarClave(skipLocalStorage);
            this.claveConfirmada = true;
        } finally {
            this.loadingClave.set(false);
        }
    }

    /*async buscarFactor() {
        // 🔹 cargar factor de conversión después de fijar la clave
        try {
            const resp = await firstValueFrom(this.trazabilidadService.getFactorConversion(this.claveBusqueda));
            if (resp) {
                this.factorConv = resp;
            } else {
                this.factorConv = { en_dispensacion: false, cantidad_fc: 1 };
            }
            this.cdRef.detectChanges();
        } catch {
            this.factorConv = { en_dispensacion: false, cantidad_fc: 1 };
        }
    }*/
    private async getFactor(clave: string, cluesimb: string): Promise<FactorUnidad> {
        const key = `${clave}|${cluesimb}`;
        const cached = this.factorMap.get(key);
        if (cached) return cached;

        // Si tu servicio regresa Observable, descomenta firstValueFrom:
        // const resp = await firstValueFrom(this.trazabilidadService.getFactorConversionPorUnidad(clave, cluesimb));
        const resp = await this.trazabilidadService.getFactorConversionPorUnidad(clave, cluesimb);

        const factor: FactorUnidad = {
            clave,
            cluesimb,
            en_dispensacion: (!!(resp as any)?.en_dispensacion) ? 1 : 0,
            cantidad_fc: Math.max(1, Number((resp as any)?.cantidad_fc ?? 1)),
        };

        this.factorMap.set(key, factor);
        return factor;
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
        this.citasHalladasPorClave = [];
        this.mostrarNotaFactor = false;
        // this.factorConv = { en_dispensacion: false, cantidad_fc: 1 };
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

    async filtrarClave(skipLocalStorage = false) {
        if (this.cpms.length === 0) {
            this.cpms = [...this.storageService.getCPMSFromLocalStorage()];
        }

        const clave = this.claveBusqueda.trim().toUpperCase();
        this.claveFiltrada = clave;
        this.datosAgrupados = [];
        this.mostrarNotaFactor = false;
        if (!clave) return;
        // TODO: por optimizar esto jalando del backend
        const ALMACENES_JURIS: Record<string, { nombre: string; cluesimb: string }> = {
            mexicali: { nombre: 'ALMACÉN DE MEXICALI', cluesimb: 'BCIMB001405' },
            tijuana: { nombre: 'ALMACEN TIJUANA', cluesimb: 'BCIMB001335' },
            ensenada: { nombre: 'ALMACEN ENSENADA', cluesimb: 'BCIMB001340' },
        };
        const jurisdiccionAlmacenes = ['mexicali', 'tijuana', 'ensenada'];

        const agrupadoPorAlmacen = new Map<string, UnidadClaveResumen[]>();

        for (const municipio of jurisdiccionAlmacenes) {
            const hospitalesDeJurisdiccion = hospitalesData
                .filter(h => h.jurisdiccion.toLocaleLowerCase() === municipio);

            for (const hospital of hospitalesDeJurisdiccion) {
                const hospitalClues = hospital.cluesimb;

                // existencia DISP cruda de la unidad
                const existenciasInsumo = this.existenciaUnidades
                    .get(hospital.key)
                    ?.filter(i => i.clave === clave);

                const unidadResumen: UnidadClaveResumen = {
                    unidad: hospital?.nombre ?? hospitalClues,
                    municipio,
                    cluesimb: hospitalClues,
                    clave: { cpm: 0, existencia: 0, reposicion: 0 },
                } as any;

                // CPM
                const cpmEntry = this.cpms.find(c => c.clave === clave && c.cluesimb === hospitalClues);
                const cpm = cpmEntry?.cantidad ?? 0;
                unidadResumen.clave.cpm = cpm;

                if (existenciasInsumo) {
                    for (const i of existenciasInsumo) {
                        unidadResumen.clave.existencia += (i.disponible - i.comprometidos);
                    }
                }
                const existenciaDisp = unidadResumen.clave.existencia;

                // FC por unidad (CLUES)
                const factor = await this.getFactor(clave, hospitalClues);
                const enDisp = !!factor.en_dispensacion;
                const fc = factor.cantidad_fc;

                const existenciaBase = enDisp && fc > 1
                    ? Math.round(existenciaDisp / fc)
                    : existenciaDisp;

                unidadResumen.clave.existencia = existenciaBase;
                unidadResumen.clave.reposicion = cpm > existenciaBase ? (cpm - existenciaBase) : 0;

                // guarda DISP cruda para tooltip
                (unidadResumen as any)._existenciaDisp = existenciaDisp;

                if (!agrupadoPorAlmacen.has(municipio)) {
                    agrupadoPorAlmacen.set(municipio, []);
                }
                agrupadoPorAlmacen.get(municipio)!.push(unidadResumen);
            }
            // calcular existencia de almacen
            const imssb = ALMACENES_JURIS[municipio].cluesimb;
            if (imssb) {
                const existenciasInsumo = this.existenciaUnidades
                    .get(imssb)
                    ?.filter(i => i.clave === clave);
                console.info('existenciasInsumo', existenciasInsumo);
                let existenciaDisp = 0;
                if (existenciasInsumo) {
                    for (const i of existenciasInsumo) {
                        existenciaDisp += (i.disponible - i.comprometidos);
                    }

                    if (municipio.toLocaleLowerCase().includes('mexicali') && this.existenciaAlmacenes) {
                        this.existenciaAlmacenes.existenciasAZM = existenciaDisp;
                    } else if (municipio.toLocaleLowerCase().includes('ensenada') && this.existenciaAlmacenes) {
                        this.existenciaAlmacenes.existenciasAZE = existenciaDisp;
                    } else if (municipio.toLocaleLowerCase().includes('tijuana') && this.existenciaAlmacenes) {
                        this.existenciaAlmacenes.existenciasAZT = existenciaDisp;
                    }
                }

            }
        }

        // Construir estructura final
        this.datosAgrupados = Array.from(agrupadoPorAlmacen.entries()).map(([municipio, unidades]) => {
            const meta = ALMACENES_JURIS[municipio] ?? { nombre: municipio.toUpperCase(), cluesimb: '' };
            return { almacen: municipio, cluesimb: meta.cluesimb, unidades } as AlmacenClaveResumen;
        });

        // Nota “¿Qué estoy viendo?”
        this.mostrarNotaFactor = Array.from(this.factorMap.entries())
            .some(([key, f]) =>
                key.startsWith(`${this.claveFiltrada}|`) &&
                f.en_dispensacion === 1 &&
                (f.cantidad_fc ?? 1) > 1
            );

        if (!skipLocalStorage) {
            localStorage.setItem(
                StorageVariables.DASH_ABASTO_EXISTENCIAS_EXC_DATOS_AGRUPADOS,
                JSON.stringify(this.datosAgrupados)
            );
        }

        this.calcularInventarioDisponible(this.claveFiltrada, skipLocalStorage);
        this.buscarExistenciasDeClave(skipLocalStorage);
    }

    /**
     * Busca las citas de un insumo en la variable que contiene todas las citas
     */
    /**
   * Busca las citas de un insumo en backend (30d recientes) y pendientes.
   */
    async buscarExistenciasDeClave(skipLocalStorage = false) {
        const hoy = new Date();
        const hace30dias = new Date(hoy); hace30dias.setDate(hoy.getDate() - 30);

        // si quieres pasar el rango de “Recepción lista” tal cual desde el periodo activo, puedes
        // usar el PeriodoPicker del tab Resumen; aquí, por simplicidad, no forzamos esos dates.
        try {
            const resp = await firstValueFrom(
                this.citasService.getCitasPorClaveXClave({
                    clave: this.claveFiltrada,
                    // desde: this.toISO(this.fechaInicio)  // si decides pasar fechas del picker
                    // hasta: this.toISO(this.fechaFin),
                    windowDays: 30,
                    incluyeNoRecibidas: true,
                    limit: 500
                })
            );

            const rows = resp?.rows ?? [];
            this.citasHalladasPorClave = rows as Cita[];
            this.citaParaDescripcionDeClave = (resp?.ref ?? rows[0] ?? null) as Cita | null;

        } catch (err) {
            console.warn('⚠️ Backend /xclave no disponible, usando filtro local', err);
            // ⬇️  fallback local: tu lógica original
            this.citaParaDescripcionDeClave = this.citas.find(c => c.clave_cnis === this.claveFiltrada)!;
            this.citasHalladasPorClave = this.citas.filter(c => {
                const esClave = c.clave_cnis === this.claveFiltrada;

                const fechaLimite = c.fecha_limite_de_entrega
                    ? new Date(c.fecha_limite_de_entrega)
                    : null;

                const fechaValida = !!fechaLimite && (fechaLimite >= hoy || fechaLimite >= hace30dias);

                const recibidoRecientementeONoSeHaRecibido = c.fecha_recepcion_almacen
                    ? new Date(c.fecha_recepcion_almacen) >= hace30dias
                    : true;

                return esClave && fechaValida && recibidoRecientementeONoSeHaRecibido;
            });
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

        const key = `${this.claveFiltrada}|${unidad.cluesimb}`;
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
}
