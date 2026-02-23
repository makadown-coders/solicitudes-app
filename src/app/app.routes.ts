import { Routes } from '@angular/router';
import { CargaMasivaComponent } from './features/carga-masiva/carga-masiva.component';
import { SolicitudesConfigComponent } from './features/solicitudes-config/solicitudes-config.component';

export const routes: Routes = [
  {
    path: 'dashboard-abasto-v2',
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
  {
    path: 'articulos-admin',
    title: 'Catalogo de articulos',
    loadComponent: () =>
      import('./features/articulos-admin/articulos-admin.component')
        .then(m => m.ArticulosAdminComponent)
  },
  {
    path: 'admin-kits',
    loadComponent: () => import('./features/kits/admin-kits/admin-kits.component')
      .then(m => m.AdminKitsComponent)
  },
  {
    path: 'carga-masiva-kits',
    loadComponent: () => import('./features/kits/kits-import/kits-import.component')
      .then(m => m.KitsImportComponent)
  },
  {
    path: 'carga-masiva-cpm-kits',
    loadComponent: () =>
      import('./features/carga-masiva/carga-cpm-kits.component')
        .then(m => m.CargaCpmKitsComponent)
  },
  {
    path: 'carga-masiva-cpm-1er-nivel',
    loadComponent: () =>
      import('./features/carga-masiva/carga-cpms-1er-nivel.component')
        .then(m => m.CargaCpms1erNivelComponent)
  },
  { path: 'solicitudes-config', component: SolicitudesConfigComponent },
  {
    path: 'sacia',
    children: [
      {
        path: 'validador-layout',
        title: 'SACIA · Validador de Layout',
        loadComponent: () =>
          import('./features/sacia/validador-layout/validador-layout.component')
            .then(m => m.ValidadorLayoutComponent)
      },
    ],
  },

  // Nueva versión del dashboard de abasto
  {
    path: 'dashboard-abasto',
    loadComponent: () => import('./features/dashboard-abasto/dashboard-shell.component')
      .then(m => m.DashboardShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'resumen' },
      {
        path: 'resumen',
        loadComponent: () => import('./features/dashboard-abasto/resumen/resumen.component')
          .then(m => m.ResumenComponent),
        title: 'Dashboard Abasto · Resumen'
      },
      {
        path: 'analisis',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'xclave' },

          {
            path: 'xclave',
            loadComponent: () => import('./features/dashboard-abasto/existencias/existencias-x-clave/existencias-x-clave.component')
              .then(m => m.ExistenciasXClaveComponent),
            title: 'Dashboard Abasto · Análisis · xClave'
          },
          {
            path: 'balanceo',
            loadComponent: () => import('./features/dashboard-abasto/existencias/balanceo-sugerencias/balanceo-sugerencias.component')
              .then(m => m.BalanceoSugerenciasComponent),
            title: 'Dashboard Abasto · Análisis · Balanceo'
          },
          {
            path: 'homologos',
            loadComponent: () => import('./features/dashboard-abasto/existencias/existencias-homologos/existencias-homologos.component')
              .then(m => m.ExistenciasHomologosComponent),
            title: 'Dashboard Abasto · Análisis · Homologos'
          },
        ]
      },
      {
        path: 'citas-completadas',
        loadComponent: () => import('./features/dashboard-abasto/proveedores/proveedores.component')
          .then(m => m.ProveedoresComponent),
        title: 'Dashboard Abasto · Citas Completadas'
      },
      {
        path: 'citas-pendientes',
        loadComponent: () => import('./features/dashboard-abasto/citas-pendientes/citas-pendientes.component')
          .then(m => m.CitasPendientesComponent),
        title: 'Dashboard Abasto · Citas Pendientes'
      },
      {
        path: 'resumen-citas',
        loadComponent: () => import('./features/dashboard-abasto/resumen-citas/resumen-citas.component')
          .then(m => m.ResumenCitasComponent),
        title: 'Dashboard Abasto · Resumen Citas'
      },
      {
        path: 'existencias',
        loadComponent: () => import('./features/dashboard-abasto/inventario-tab/inventario-tab.component')
          .then(m => m.InventarioTabComponent),
        title: 'Dashboard Abasto · Existencias'
      },
      {
        path: 'rdls',
        loadComponent: () => import('./features/dashboard-abasto/rdls/rdls.component')
          .then(m => m.RdlSComponent),
        title: 'RdlS'
      },
      {
        path: 'rdls-primer-nivel',
        loadComponent: () => import('./features/dashboard-abasto/rdls/rdls-primer-nivel.component')
          .then(m => m.RdlsPrimerNivelComponent),
        title: 'RdlS - Primer Nivel'
      },
      {
        path: 'solicitudes',
        loadComponent: () => import('./features/dashboard-abasto/solicitudes/solicitudes-tab.component')
          .then(m => m.SolicitudesTabComponent),
        title: 'Dashboard Abasto · Solicitudes (bitácora)'
      },
      {
        path: 'acerca',
        loadComponent: () => import('./features/dashboard-abasto/acerca/acerca.component')
          .then(m => m.AcercaComponent),
        title: 'Dashboard Abasto · Acerca de'
      },
    ],
  },
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  { path: '**', redirectTo: '/home' },
]; 
