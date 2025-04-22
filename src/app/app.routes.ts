import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'solicitudes',
    loadComponent: () => import('./layout/layout/layout.component').then(m => m.LayoutComponent)
  },
  {
    path: 'solicitudv1',
    loadComponent: () => import('./features/solicitudes/solicitudes.component').then(m => m.SolicitudesComponent)
  },  
  { path: '', redirectTo: '/solicitudes', pathMatch: 'full' },
  { path: '**', redirectTo: '/solicitudes' }
];
