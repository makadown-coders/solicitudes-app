
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, Input, OnDestroy, OnInit } from '@angular/core';
import { Cita } from '../../../models/Cita';

import { FormsModule } from '@angular/forms';
import { StorageVariables } from '../../../shared/storage-variables';
import { DashboardService } from '../../../services/dashboard.service';
import { InventarioService } from '../../../services/inventario.service';
import { ClaveGrupo, CPMS } from '../../../models/CPMS';
import { Inventario, InventarioDisponibles } from '../../../models/Inventario';
import { Subject, take, takeUntil } from 'rxjs';
import { ExistenciasXClaveComponent } from './existencias-x-clave/existencias-x-clave.component';
import { ExistenciasHomologosComponent } from './existencias-homologos/existencias-homologos.component';
// import { ExistenciasXUnidadComponent } from './existencias-x-unidad/existencias-x-unidad.component';
// import { ExistenciasXGrupoComponent } from './existencias-x-grupo/existencias-x-grupo.component';
import { BalanceoSugerenciasComponent } from './balanceo-sugerencias/balanceo-sugerencias.component';
import { AbstractTabComponent } from '../../../shared/abstract-tab.component';

@Component({
    standalone: true,
    imports: [
    FormsModule,
    ExistenciasXClaveComponent,
    ExistenciasHomologosComponent,
    BalanceoSugerenciasComponent
],
    selector: 'app-existencias',
    templateUrl: 'existencias.component.html',
})

export class ExistenciasComponent extends AbstractTabComponent implements OnInit, OnDestroy {
    mostradoPorPrimeraVez = false;
    existenciaUnidades: Map<string, Inventario[]> = new Map<string, Inventario[]>();
    cpms: CPMS[] = [];
    claveGrupos: ClaveGrupo[] = [];
    cdRef: ChangeDetectorRef = inject(ChangeDetectorRef);
    dashboardService = inject(DashboardService);
    inventarioService = inject(InventarioService);
    // behaviorSubject para desuscribirme de todos los observables
    private onDestroy$ = new Subject<void>();

    // en construccion
    existenciasTabs = ['xClave', 'Homologos', /*'xUnidad', 'xGrupo',*/ 'Balanceo (beta)'];
    activeExistenciaTab = 'xClave';
    constructor() {
        super();
        const tabGuardado = localStorage.getItem(StorageVariables.DASH_ABASTO_ACTIVE_EXISTENCIA_TAB);
        if (tabGuardado) {
            this.activeExistenciaTab = tabGuardado;
        }
    }

    ngOnInit(): void {
        if (this.mostradoPorPrimeraVez === false && this.isActive) {
            this.onTabActivated();
        }
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
    protected override onTabActivated(): void {

        if (this.mostradoPorPrimeraVez === false) {


            this.inventarioService.existencias$.forEach((value, key) => {
                value.pipe(takeUntil(this.onDestroy$)).subscribe({
                    next: (data: Inventario[]) => {
                        // console.log('Cargando existencias de unidad', key);
                        this.existenciaUnidades.set(key, data as Inventario[]);
                    }
                });
            });

            // suscribirse al observable de claveGrupos
            this.inventarioService.claveGrupos$.pipe(takeUntil(this.onDestroy$)).subscribe({
                next: (claveGrupos: ClaveGrupo[]) => {
                    this.claveGrupos = [...claveGrupos];
                }
            });
            this.mostradoPorPrimeraVez = true;
        }
    }
    protected override onTabDeactivated(): void {
        // No es necesario hacer nada aquí, ya que las suscripciones se manejan con takeUntil en ngOnDestroy
    }
}