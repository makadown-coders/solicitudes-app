import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'solicitudes',
    // loadComponent: () => import('./features/solicitudes/solicitudes.component').then(m => m.SolicitudesComponent)
    loadComponent: () => import('./layout/layout/layout.component').then(m => m.LayoutComponent)
  },
  { path: '', redirectTo: '/solicitudes', pathMatch: 'full' },
  { path: '**', redirectTo: '/solicitudes' }
];
