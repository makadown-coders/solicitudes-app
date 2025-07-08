import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core';
import { AlmacenExistenciaResumen, ClaveExistenciaResumen, ExistenciasTabInfo, UnidadExistenciaResumen } from '../../../../models/existenciasTabInfo';
import { hospitalesData } from '../../../../models/hospitalesData';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Inventario } from '../../../../models/Inventario';
import { DashboardService } from '../../../../services/dashboard.service';
import { Subject, takeUntil } from 'rxjs';



@Component({
    standalone: true,
    selector: 'app-existencias-x-clave',
    templateUrl: 'existencias-x-clave.component.html',
    imports: [CommonModule, FormsModule],
})
export class ExistenciasXClaveComponent implements OnInit, OnDestroy {
    //@Input() 
    data: ExistenciasTabInfo = new ExistenciasTabInfo();
    dashboardService = inject(DashboardService);

    claveBusqueda = '';
    claveFiltrada = '';
    datosAgrupados: AlmacenExistenciaResumen[] = [];

    onDestroy$ = new Subject<void>();

    ngOnInit() {
        this.dashboardService.existenciasTabInfo$
            .pipe(takeUntil(this.onDestroy$))
            .subscribe(
                (data: ExistenciasTabInfo) => {
                    this.data = data;
                    this.filtrarClave();
                });
    }

    ngOnDestroy(): void {
        this.onDestroy$.next();
        this.onDestroy$.complete();
    }

    filtrarClave() {
        const clave = this.claveBusqueda.trim().toUpperCase();
        this.claveFiltrada = clave;
        this.datosAgrupados = [];

        if (!clave) return;

        const agrupadoPorAlmacen: Map<string, UnidadExistenciaResumen[]> = new Map();
        console.log('this.data.existenciaAlmacenes', this.data.existenciaAlmacenes);

        this.data.existenciaUnidades.forEach((inventarios, clues) => {
            const inventarioFiltrado = inventarios.filter(i => i.clave === clave);
            if (inventarioFiltrado.length === 0) return;

            const unidad = hospitalesData.find(
                u => u.cluesimb === clues || u.cluesssa === clues
            );
            const jurisdiccion = unidad?.jurisdiccion ?? 'SIN_JURISDICCION';

            const claves: ClaveExistenciaResumen[] = inventarioFiltrado.map(i => {
                const cpmEntry = this.data.cpms.find(c => c.clave === clave && c.cluesimb === clues);
                const cpm = cpmEntry?.cantidad ?? 0;
                const reposicion = cpm > i.disponible ? cpm - i.disponible : 0;

                return {
                    descripcion: i.descripcion,
                    cpm,
                    existencia: i.disponible,
                    reposicion,
                };
            });

            if (!agrupadoPorAlmacen.has(jurisdiccion)) {
                agrupadoPorAlmacen.set(jurisdiccion, []);
            }

            agrupadoPorAlmacen.get(jurisdiccion)?.push({
                unidad: unidad?.nombre ?? clues,
                claves,
            });
        });

        this.datosAgrupados = Array.from(agrupadoPorAlmacen.entries()).map(([almacen, unidades]) => ({
            almacen,
            unidades,
        }));
    }
}
