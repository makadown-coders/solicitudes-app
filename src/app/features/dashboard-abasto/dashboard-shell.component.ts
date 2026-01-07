import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme.service';
import { CitasService } from '../../services/citas.service';
import { InventarioService } from '../../services/inventario.service';
import { Existencias } from '../../shared/storage-variables';
import { SidebarAccordionComponent } from '../../shared/side-bar/sidebar-accordion.component';

@Component({
    selector: 'app-dashboard-shell',
    standalone: true,
    imports: [CommonModule, RouterOutlet, SidebarAccordionComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './dashboard-shell.component.html',
})
export class DashboardShellComponent implements OnInit {
    themeService = inject(ThemeService);
    inventarioService = inject(InventarioService);
    citasService = inject(CitasService);
    title = 'Dashboard Abasto';

    get isDarkMode() { return this.themeService.isDarkMode(); }

    constructor() {
        // this.onRefresh();
     }

    ngOnInit(): void {
        // ✅ Nuevo enfoque: dejar al servicio decidir si usa cache o backend
        this.inventarioService.initExistenciaAlmacenes();
        this.inventarioService.initTodasExistencias();
    }

    onRefresh() {
        this.citasService.clearCache();
        this.inventarioService.refrescarExistenciaAlmacenesDesdePostgres();
        for (const existencia of Object.values(Existencias)) {
            this.inventarioService.refrescarDatosExistencias(existencia);
        }
    }
}
