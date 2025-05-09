import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { BaseChartDirective } from 'ng2-charts';
import { ResumenComponent } from './resumen/resumen.component';
import { Cita } from '../../models/Cita';
import { DashboardService } from '../../services/dashboard.service';

@Component({
  selector: 'app-dashboard-abasto',
  imports: [CommonModule,
    FormsModule,
    ResumenComponent,
    RouterModule,
  ],
  templateUrl: './dashboard-abasto.component.html',
  styleUrl: './dashboard-abasto.component.css'
})
export class DashboardAbastoComponent {
  // aquí recibiremos el arreglo de citas
  citas: Cita[] = [];
  isLoading: boolean = true;

  // controla la pestaña activa
  activeTab: 'resumen' | 'otro' = 'resumen';

  constructor(private dashboardService: DashboardService) { }

  ngOnInit(): void {
    // 1) Suscríbete al BehaviorSubject para recibir actualizaciones
    this.dashboardService.citas$.subscribe({      
      next: (data: Cita[]) => {
        this.citas = data as Cita[];
        this.isLoading = false;
      } 
    });

    // TODO: Refactorizar para recargar manualmente
    if (this.citas.length === 0) {
      // 2) Dispara la carga inicial desde el endpoint     
      this.onRefresh();
    }
  }

  // opcionalmente puedes exponer un método para refrescar manualmente
  onRefresh() {
    this.isLoading = true;
    this.dashboardService.refrescarDatos();
  }
}
