
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, Input, OnDestroy, OnInit } from '@angular/core';
import { Cita } from '../../../models/Cita';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StorageVariables } from '../../../shared/storage-variables';
import { DashboardService } from '../../../services/dashboard.service';
import { InventarioService } from '../../../services/inventario.service';
import { CPMS } from '../../../models/CPMS';
import { Inventario, InventarioDisponibles } from '../../../models/Inventario';
import { Subject, take, takeUntil } from 'rxjs';
import { ExistenciasXClaveComponent } from './existencias-x-clave/existencias-x-clave.component';
import { ExistenciasXUnidadComponent } from './existencias-x-unidad/existencias-x-unidad.component';

@Component({
    standalone: true,
    imports: [CommonModule, FormsModule, ExistenciasXClaveComponent, ExistenciasXUnidadComponent],
    selector: 'app-existencias',
    templateUrl: 'existencias.component.html',

})

export class ExistenciasComponent implements OnInit, OnDestroy {
    @Input() citas: Cita[] = [];
    existenciaUnidades: Map<string, Inventario[]> = new Map<string, Inventario[]>();
    cpms: CPMS[] = [];
    cdRef: ChangeDetectorRef = inject(ChangeDetectorRef);
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
    }

    ngOnInit(): void {                
        this.inventarioService.existencias$.forEach((value, key) => {
            value.pipe(takeUntil(this.onDestroy$)).subscribe({
                next: (data: Inventario[]) => {
                    // console.log('Cargando existencias de unidad', key);
                    this.existenciaUnidades.set(key, data as Inventario[]);
                }
            });
        });
        // suscribirse al observable de cpms 
        this.inventarioService.cpms$.pipe(takeUntil(this.onDestroy$)).subscribe({
            next: (cpms: CPMS[]) => {
                this.cpms = [...cpms];
            }
        });
    }

    seleccionarExistenciaTab(tab: string) {
        this.activeExistenciaTab = tab;
        localStorage.setItem(StorageVariables.DASH_ABASTO_ACTIVE_EXISTENCIA_TAB, tab.toString());
        this.cdRef.detectChanges();
    }

    ngOnDestroy(): void {
        console.log('Destroying ExistenciasComponent');
        this.onDestroy$.next();
        this.onDestroy$.complete();
    }
}