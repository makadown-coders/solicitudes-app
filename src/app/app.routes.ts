import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'dashboard-abasto',
    loadComponent: () => import('./features/dashboard-abasto/dashboard-abasto.component')
        .then(m => m.DashboardAbastoComponent)
  },
  {
    path: 'poc-finanzas-ev-smi-sg', 
    loadComponent: () => import('./features/poc-finanzas-ev-smi-sg/poc-finanzas-ev-smi-sg.component')
        .then(m => m.PocFinanzasEvSmiSgComponent)
  },
  {
    path: 'solicitudes',
    loadComponent: () => import('./layout/layout/layout.component')
        .then(m => m.LayoutComponent)
  },
  {
    path: 'solicitud-unidad',
    loadComponent: () => import('./layout/layout/layout.component')
        .then(m => m.LayoutComponent)
  },
  {
    path: 'solicitudv1',
    loadComponent: () => import('./features/solicitudes/solicitudes.component')
        .then(m => m.SolicitudesComponent)
  },
  {
    path: 'home',
    loadComponent: () => import('./features/home/home.component')
        .then(m => m.HomeComponent)
  },
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  { path: '**', redirectTo: '/home' }
];
