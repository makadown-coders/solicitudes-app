import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { BaseChartDirective } from 'ng2-charts';
import { ResumenComponent } from './resumen/resumen.component';
import { Cita } from '../../models/Cita';
import { DashboardService } from '../../services/dashboard.service';
import { ProveedoresComponent } from './proveedores/proveedores.component';
import { CitasPendientesComponent } from './citas-pendientes/citas-pendientes.component';
import { StorageVariables } from '../../shared/storage-variables';
import { ResumenCitasComponent } from './resumen-citas/resumen-citas.component';
import { InventarioCriticoComponent } from './inventario-critico/inventario-critico.component';

@Component({
  selector: 'app-dashboard-abasto',
  imports: [CommonModule,
    FormsModule,
    ResumenComponent,
    RouterModule,
    ProveedoresComponent,
    CitasPendientesComponent,
    ResumenCitasComponent,
    InventarioCriticoComponent
  ],
  templateUrl: './dashboard-abasto.component.html',
  styleUrl: './dashboard-abasto.component.css'
})
export class DashboardAbastoComponent {
  // aquí recibiremos el arreglo de citas
  citas: Cita[] = [];
  isLoading: boolean = true;

  // controla la pestaña activa
  tabs = ['Resumen', 
    'Proveedores y entregas',
    'Citas pendientes', 
    'Inventario Crítico',
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
        // console.log('recibiendo data en componente dashboardAbasto desde subscripcion al BehaviorSubject');
        // console.log('asignado data a this.citas');
        this.citas = data as Cita[];
        // console.log('this.citas', this.citas);
        this.isLoading = false;
      }
    });

    // TODO: Refactorizar para recargar manualmente
    if (this.citas.length === 0) {
      // 2) Dispara la carga inicial desde el endpoint     
      // console.log('disparando carga inicial...');
      this.onRefresh();
    }
  }

  // opcionalmente puedes exponer un método para refrescar manualmente
  onRefresh() {
    this.isLoading = true;
    this.dashboardService.refrescarDatos();
  }

  seleccionarTab(tab: string) {
    this.activeTab = tab;
    localStorage.setItem(StorageVariables.DASH_ABASTO_ACTIVE_TAB, tab.toString());
  }
}
