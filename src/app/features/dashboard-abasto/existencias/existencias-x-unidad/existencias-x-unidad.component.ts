// src/app/features/dashboard-abasto/existencias/existencias-x-unidad/existencias-x-unidad.component.ts
import { ChangeDetectionStrategy, Component, inject, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Unidad, UnidadExistente } from '../../../../models/articulo-solicitud';
import { hospitalesData } from '../../../../models/hospitalesData';
import { Subject, takeUntil } from 'rxjs';
import { DashboardService } from '../../../../services/dashboard.service';
import { Inventario } from '../../../../models/Inventario';
import { StorageSolicitudService } from '../../../../services/storage-solicitud.service';
import { HospitalIcon, LucideAngularModule } from 'lucide-angular';
import { FormsModule } from '@angular/forms';
import { StorageVariables } from '../../../../shared/storage-variables';
import { CPMS } from '../../../../models/CPMS';
import { Cita } from '../../../../models/Cita';

@Component({
    standalone: true,
    imports: [CommonModule, LucideAngularModule, FormsModule],
    selector: 'app-existencias-x-unidad',
    templateUrl: 'existencias-x-unidad.component.html'
})

export class ExistenciasXUnidadComponent implements OnInit, OnChanges, OnDestroy {
    @Input() existenciaUnidades: Map<string, Inventario[]> = new Map<string, Inventario[]>();
    @Input() cpms: CPMS[] = [];
    @Input() citas: Cita[] = [];

    unidades: UnidadExistente[] = hospitalesData;
    dashboardService = inject(DashboardService);
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

        console.log('( seleccionarUnidad() ) this.data.cpms tamanio',
            this.cpms.map(item => item.clave).length);
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
        console.log('this.existenciaUnidadesElegidas', this.existenciaUnidadesElegidas);
        // guardar this.existenciaUnidadesElegidas en localStorage DASH_ABASTO_EXISTENCIAS_EXU_UNIDADES_ELEGIDAS
        localStorage.setItem(
            StorageVariables.DASH_ABASTO_EXISTENCIAS_EXU_UNIDADES_ELEGIDAS,
            JSON.stringify(this.existenciaUnidadesElegidas));
    }

    reiniciarBusquedaUnidad() {
        this.unidadConfirmada = false;
        this.unidadSeleccionada = null;
        this.unidadBusqueda = '';
        this.autocompleteResults = [];
        this.selectedIndex = -1;
        localStorage.removeItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_EXU_FILTRO_UNIDAD);
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
            const unidadesElegidasGuardadas = localStorage.getItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_EXU_UNIDADES_ELEGIDAS);
            if (unidadesElegidasGuardadas) {
                this.existenciaUnidadesElegidas = JSON.parse(unidadesElegidasGuardadas) as Inventario[];
            }
        }
        if (this.inventario.length === 0) {
            this.inventario = this.storageService.getInventarioFromLocalStorage();
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        // si el cambio es a data, actualizar this.cpmsElegidos
        if (changes['data']) {
            console.log('(ngOnChanges) this.data.cpms tamanio',
                this.cpms.map(item => item.clave).length);
        }
    }

    disponibles(clave: string): number {
        const filtrado = this.existenciaUnidadesElegidas.filter(item => item.clave === clave);
        if (filtrado.length === 0) return 0;
        return filtrado.reduce((total, item) => total + item.disponible, 0);
    }

    resumenCPMs() {
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

}