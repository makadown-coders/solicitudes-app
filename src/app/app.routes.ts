import { Routes } from '@angular/router';
import { CargaMasivaComponent } from './features/carga-masiva/carga-masiva.component';
import { SolicitudesConfigComponent } from './features/solicitudes-config/solicitudes-config.component';

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
  {
    path: 'carga-masiva-movimientos',
    loadComponent: () => import('./features/carga-masiva/carga-masiva.component')
      .then(m => m.CargaMasivaComponent)
  },
  {
    path: 'carga-masiva-existencias',
    loadComponent: () => import('./features/carga-masiva/carga-existencias.component')
      .then(m => m.CargaExistenciasComponent)
  },
  {
    path: 'carga-masiva-citas',
    loadComponent: () => import('./features/carga-masiva/carga-citas.component')
      .then(m => m.CargaCitasComponent)
  },
  {
    path: 'cpm-config',
    title: 'CPM por unidad (BC)',
    loadComponent: () => import('./features/cpm-editor/cpm-editor.component').then(m => m.CpmEditorComponent)
  },
  { path: 'solicitudes-config', component: SolicitudesConfigComponent },
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  { path: '**', redirectTo: '/home' }
];
