import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnChanges, OnInit, signal } from '@angular/core';
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

@Component({
  selector: 'app-dashboard-abasto',
  imports: [CommonModule,
    FormsModule,
    ResumenComponent,
    RouterModule,
    ProveedoresComponent,
    CitasPendientesComponent,
    ResumenCitasComponent,
    InventarioCriticoComponent, ExistenciasComponent],
  templateUrl: './dashboard-abasto.component.html',
  styleUrl: './dashboard-abasto.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardAbastoComponent implements OnInit {
   themeService = inject(ThemeService);
   inventarioService = inject(InventarioService);
  title = 'Dashboard Abasto';  
  get isDarkMode() { return this.themeService.isDarkMode(); }
  
  // aquí recibiremos el arreglo de citas
  citas: Cita[] = [];
  // isLoading: boolean = true;
  isLoading = signal(false);

  // controla la pestaña activa
  tabs = ['Resumen', 
    'Existencias (CPM)',
    'Proveedores y entregas',
    'Citas pendientes', 
    'Cumplimiento Claves',
    'Entregas pendientes'];
  activeTab = 'Resumen';

  constructor(private dashboardService: DashboardService) { }

  ngOnInit(): void {
    const tabGuardado = localStorage.getItem(StorageVariables.DASH_ABASTO_ACTIVE_TAB);
    if (tabGuardado) {
      this.activeTab = tabGuardado;
    }
    // 1) Suscríbete al BehaviorSubject para recibir actualizaciones
    this.dashboardService.citas$.subscribe({
      next: (data: Cita[]) => {
        this.citas = data as Cita[];
        this.isLoading.set(false); // Establece isLoading = false;
      }
    });

    // TODO: Refactorizar para recargar manualmente
    if (this.citas.length === 0) {
      // 2) Dispara la carga inicial desde el endpoint
      this.onRefresh();
    } else {
      this.isLoading.set(true);
      this.dashboardService.refrescarDeLocalStorage();
      this.isLoading.set(false);
    }
  }

  // opcionalmente puedes exponer un método para refrescar manualmente
  onRefresh() {
    this.dashboardService.limpiarDatos();
    this.isLoading.set(true); // Establece isLoading = true;
    this.dashboardService.refrescarDatos();    
    this.inventarioService.refrescarDatosInventario();
    this.inventarioService.refrescarDatosCPMS();
    for (const existencia of Object.values(Existencias)) {
      this.inventarioService.refrescarDatosExistencias(existencia);
    }
  }

  seleccionarTab(tab: string) {
    this.activeTab = tab;
    localStorage.setItem(StorageVariables.DASH_ABASTO_ACTIVE_TAB, tab.toString());
  }
}
