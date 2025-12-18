// src/app/features/dashboard-abasto/dashboard-abasto.component.ts
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnChanges, OnInit, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { BaseChartDirective } from 'ng2-charts';
import { ResumenComponent } from './resumen/resumen.component';
import { Cita } from '../../models/Cita';
import { DashboardService } from '../../services/dashboard.service';
import { ProveedoresComponent } from './proveedores/proveedores.component';
import { CitasPendientesComponent } from './citas-pendientes/citas-pendientes.component';
import { Existencias, StorageVariables } from '../../shared/storage-variables';
import { ResumenCitasComponent } from './resumen-citas/resumen-citas.component';
import { InventarioCriticoComponent } from './inventario-critico/inventario-critico.component';
import { ThemeService } from '../../services/theme.service';
import { InventarioService } from '../../services/inventario.service';
import { ExistenciasComponent } from "./existencias/existencias.component";
import { RdlSComponent } from './rdls/rdls.component';
import { InventarioTabComponent } from './inventario-tab/inventario-tab.component';
import { KPIsResumen } from '../../models/StatsCitas';
import { CitasService } from '../../services/citas.service';

@Component({
  selector: 'app-dashboard-abasto',
  imports: [CommonModule,
    FormsModule,
    ResumenComponent,
    RouterModule,
    ProveedoresComponent,
    CitasPendientesComponent,
    ResumenCitasComponent,
    // InventarioCriticoComponent,
    ExistenciasComponent,
    InventarioTabComponent,
    RdlSComponent
  ],
  templateUrl: './dashboard-abasto.component.html',
  styleUrl: './dashboard-abasto.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardAbastoComponent implements OnInit {
  @ViewChild(ProveedoresComponent) proveedoresTab?: ProveedoresComponent;
  @ViewChild(CitasPendientesComponent) citasPendientesTab?: CitasPendientesComponent;

  themeService = inject(ThemeService);
  inventarioService = inject(InventarioService);
  citasService = inject(CitasService);
  title = 'Dashboard Abasto';
  get isDarkMode() { return this.themeService.isDarkMode(); }

  // aquí recibiremos el arreglo de citas
  // citas: Cita[] = [];

  // controla la pestaña activa
  tabs = ['Resumen',
    'Existencias (CPM)',
    'Citas Completadas',
    'Citas pendientes',
    // 'Cumplimiento Claves',
    'Resumen Citas',
    'Existencias (beta)',
    'RdlS',
    'Acerca de'];
  activeTab = 'Resumen';

  kpis: KPIsResumen | null = null;

  constructor(private dashboardService: DashboardService) { }

  ngOnInit(): void {
    const tabGuardado = localStorage.getItem(StorageVariables.DASH_ABASTO_ACTIVE_TAB);
    if (tabGuardado) {
      this.activeTab = tabGuardado;
    }
    // ✅ Nuevo enfoque: dejar al servicio decidir si usa cache o backend
    this.inventarioService.initExistenciaAlmacenes();
    this.inventarioService.initCPMS();
    this.inventarioService.initTodasExistencias();
  }

  // opcionalmente puedes exponer un método para refrescar manualmente
  onRefresh() {
    this.citasService.clearCache();

    // this.inventarioService.refrescarDatosInventario(false);
    this.inventarioService.refrescarExistenciaAlmacenesDesdePostgres();
    this.inventarioService.refrescarDatosCPMS();
    for (const existencia of Object.values(Existencias)) {
      this.inventarioService.refrescarDatosExistencias(existencia);
    }

    // 2) Pedir a cada tab que recargue (desde backend, con forceRefresh = true)
    this.proveedoresTab?.refrescarDatos(true);
    this.citasPendientesTab?.refrescarDatos(true);
  }

  seleccionarTab(tab: string) {
    this.activeTab = tab;
    localStorage.setItem(StorageVariables.DASH_ABASTO_ACTIVE_TAB, tab.toString());
  }

  anioActual() {
    return new Date().getFullYear();
  }
}
