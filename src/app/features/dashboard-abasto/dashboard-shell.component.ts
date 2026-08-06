import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ThemeService } from '../../services/theme.service';
import { CitasService } from '../../services/citas.service';
import { InventarioService } from '../../services/inventario.service';
import { Existencias } from '../../shared/storage-variables';
import { SidebarAccordionComponent } from '../../shared/side-bar/sidebar-accordion.component';

@Component({
    selector: 'app-dashboard-shell',
    standalone: true,
    imports: [RouterOutlet, SidebarAccordionComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './dashboard-shell.component.html',
    styleUrl: './dashboard-shell.component.css',
})
export class DashboardShellComponent implements OnInit {
    themeService = inject(ThemeService);
    inventarioService = inject(InventarioService);
    citasService = inject(CitasService);
    title = 'Dashboard Abasto';
    menuVisible = signal(typeof window !== 'undefined' && window.innerWidth >= 1024);

    get isDarkMode() { return this.themeService.isDarkMode(); }

    toggleMenu(): void {
        this.menuVisible.update(visible => !visible);
    }

    closeMenu(): void {
        this.menuVisible.set(false);
    }

    onNavigationSelected(): void {
        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
            this.closeMenu();
        }
    }

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
