
import { ChangeDetectionStrategy, Component, inject, Input, OnDestroy, OnInit } from '@angular/core';
import { Cita } from '../../../models/Cita';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StorageVariables } from '../../../shared/storage-variables';
import { DashboardService } from '../../../services/dashboard.service';
import { InventarioService } from '../../../services/inventario.service';
import { CPMS } from '../../../models/CPMS';
import { Inventario, InventarioDisponibles } from '../../../models/Inventario';
import { Subject, take, takeUntil } from 'rxjs';
import { ExistenciasTabInfo } from '../../../models/existenciasTabInfo';
import { ExistenciasXClaveComponent } from './existencias-x-clave/existencias-x-clave.component';
import { ExistenciasXUnidadComponent } from './existencias-x-unidad/existencias-x-unidad.component';

@Component({
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule, ExistenciasXClaveComponent, ExistenciasXUnidadComponent],
    selector: 'app-existencias',
    templateUrl: 'existencias.component.html',

})

export class ExistenciasComponent implements OnInit, OnDestroy {
    existenciasTabInfo: ExistenciasTabInfo = new ExistenciasTabInfo();

    dashboardService = inject(DashboardService);
    inventarioService = inject(InventarioService);
    // behaviorSubject para desuscribirme de todos los observables
    private onDestroy$ = new Subject<void>();

    // en construccion
    existenciasTabs = ['xClave', 'xUnidad'];
    activeExistenciaTab = 'xClave';
    constructor() {
        const tabGuardado = localStorage.getItem(StorageVariables.DASH_ABASTO_ACTIVE_EXISTENCIA_TAB);
        if (tabGuardado) {
            this.activeExistenciaTab = tabGuardado;
        }
        // 1) Suscríbete al BehaviorSubject para recibir actualizaciones
        this.dashboardService.citas$.pipe(takeUntil(this.onDestroy$)).subscribe({
            next: (data: Cita[]) => {
                this.existenciasTabInfo.citas = data as Cita[];
            }
        });

        // 2) Suscribirse al BehaviorSubject para recibir CPMS
        this.inventarioService.cpms$.pipe(takeUntil(this.onDestroy$)).subscribe({
            next: (data: CPMS[]) => {
                this.existenciasTabInfo.cpms = [...data];                

                if (data && data.length > 0) {
                    let resumenEstatal = this.agregarResumenEstatal(data);
                    // crear un arreglo de claves en resumenEstatal que tienen CPM total > 0
                    const clavesConCpmTotal = resumenEstatal.filter(item => item.cantidad > 0).map(item => item.clave);
                    console.log('clavesConCpmTotal', clavesConCpmTotal);
                    // filtrar this.existenciasTabInfo.cpms para mantener solo las claves que tienen CPM total > 0
                    const cpmsFiltrados: CPMS[] = []; // [...this.existenciasTabInfo.cpms.filter(item => clavesConCpmTotal.includes(item.clave))];
                    for(let i=0; i<clavesConCpmTotal.length; i++){
                        const clave = clavesConCpmTotal[i];
                        const cpm = this.existenciasTabInfo.cpms.find(item => item.clave === clave && item.cantidad > 0);
                        if (cpm) {
                            cpmsFiltrados.push(cpm);
                        }                        
                    }
                    console.log('cpmsFiltrados tamanio', cpmsFiltrados.filter(item => item.cantidad > 0).map(item => item.clave).length);
                    // quitar de resumenEstatal las claves que tienen CPM total === 0
                    resumenEstatal = resumenEstatal.filter(item => clavesConCpmTotal.includes(item.clave));
                    console.log('resumenEstatal tamanio', resumenEstatal.filter(item => item.cantidad > 0).map(item => item.clave).length);

                    this.existenciasTabInfo.cpms = [];
                    
                    this.existenciasTabInfo.cpms = [...resumenEstatal, ...cpmsFiltrados];
                    console.log('this.existenciasTabInfo.cpms tamanio', this.existenciasTabInfo.cpms.filter(item => item.cantidad > 0).map(item => item.clave).length);
                }
            }
        });

        // 3) iterar sobre this.inventarioService.existencias$ y suscribirse al BehaviorSubject para recibir existencias de unidades
        this.inventarioService.existencias$.forEach((value, key) => {
            value.pipe(takeUntil(this.onDestroy$)).subscribe({
                next: (data: Inventario[]) => {
                    // console.log('Cargando existencias de unidad', key);
                    this.existenciasTabInfo.existenciaUnidades.set(key, data as Inventario[]);
                }
            });
        });
    }

    private agregarResumenEstatal(cpmsList: CPMS[]): CPMS[] {
        const resumenPorClave = new Map<string, number>();

        cpmsList.forEach(item => {
            const clave = item.clave;
            const cantidadActual = resumenPorClave.get(clave) || 0;
            resumenPorClave.set(clave, cantidadActual + item.cantidad);
        });

        const registrosEstatales: CPMS[] = Array.from(resumenPorClave.entries()).map(([clave, cantidad]) => ({
            cluesimb: 'ESTATAL',
            clave: clave,
            cantidad: cantidad,
            // otros campos opcionales: nombre: '', fecha: null, etc.
        }));

        return registrosEstatales;
    }

    ngOnInit(): void {

    }

    seleccionarExistenciaTab(tab: string) {
        this.activeExistenciaTab = tab;
        localStorage.setItem(StorageVariables.DASH_ABASTO_ACTIVE_EXISTENCIA_TAB, tab.toString());
    }

    ngOnDestroy(): void {
        console.log('Destroying ExistenciasComponent');
        this.onDestroy$.next();
        this.onDestroy$.complete();
    }
}