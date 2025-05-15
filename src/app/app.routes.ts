import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'dashboard-abasto',
    loadComponent: () => import('./features/dashboard-abasto/dashboard-abasto.component')
        .then(m => m.DashboardAbastoComponent)
  },  
  {
    path: 'citas-abasto', // nombre provisional
    loadComponent: () => import('./features/citas-abasto/citas-abasto.component')
        .then(m => m.CitasAbastoComponent) // CitasAbastoComponent
  },
  {
    path: 'citas-builder', // nombre provisional
    loadComponent: () => import('./features/suministros/suministros.component')
        .then(m => m.SuministrosComponent) // SuministrosComponent
  },
  {
    path: 'solicitudes',
    loadComponent: () => import('./layout/layout/layout.component')
        .then(m => m.LayoutComponent)
  },
  {
    path: 'solicitudv1',
    loadComponent: () => import('./features/solicitudes/solicitudes.component')
        .then(m => m.SolicitudesComponent)
  },  
  { path: '', redirectTo: '/solicitudes', pathMatch: 'full' },
  { path: '**', redirectTo: '/solicitudes' }
];
