// src/app/features/dashboard-abasto/existencias/existencias-x-unidad/existencias-x-unidad.component.ts
import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core';
import { ExistenciasTabInfo } from '../../../../models/existenciasTabInfo';
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

@Component({
    standalone: true,
    imports: [CommonModule, LucideAngularModule, FormsModule],
    selector: 'app-existencias-x-unidad',
    templateUrl: 'existencias-x-unidad.component.html'
})

export class ExistenciasXUnidadComponent implements OnInit, OnDestroy {
    @Input() data: ExistenciasTabInfo = new ExistenciasTabInfo();
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

    constructor() {
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

        this.cpmsElegidos = [...this.data.cpms.filter(cpms =>
             cpms.cluesimb.toLocaleLowerCase() === unidad.cluesimb.toLocaleLowerCase())];
        // ordenar this.cpmsElegidos por clave
        this.cpmsElegidos.sort((a, b) => a.clave.localeCompare(b.clave));
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
        }
        this.dashboardService.existenciasTabInfo$
            .pipe(takeUntil(this.onDestroy$))
            .subscribe((data: ExistenciasTabInfo) => {
                this.data = data;
            });
        if (this.inventario.length === 0) {
            this.inventario = this.storageService.getInventarioFromLocalStorage();
        }
    }

}