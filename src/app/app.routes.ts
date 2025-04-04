import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'solicitudes',
    loadComponent: () => import('./solicitudes/solicitudes.component').then(m => m.SolicitudesComponent)
  },
  { path: '', redirectTo: '/solicitudes', pathMatch: 'full' },
  { path: '**', redirectTo: '/solicitudes' }
];
