import { Component, ChangeDetectionStrategy, signal, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { NavItem, NavGroup, NavLink } from '../../models/NavItem';

@Component({
  selector: 'app-sidebar-accordion',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sidebar-accordion.component.html',
})
export class SidebarAccordionComponent {
  private router = inject(Router);

  // 👇 Solo 1 expandido
  expandedGroupId = signal<string>('dashboard'); // default

  items = signal<NavItem[]>([
    { type: 'group', id: 'dashboard', label: 'Dashboard', children: [
      { type: 'link', id: 'resumen', label: 'Resumen', route: 'resumen' },
      { type: 'link', id: 'citas-pend', label: 'Órdenes Pendientes', route: 'ordenes-pendientes' },
      { type: 'link', id: 'citas-comp', label: 'Órdenes Completadas', route: 'ordenes-completadas' },
    ]},
    { type: 'group', id: 'existencias', label: 'Existencias', children: [
      { type: 'link', id: 'existencias-beta', label: 'Existencias (beta)', route: 'existencias' },
      { type: 'link', id: 'rdls', label: 'RdlS', route: 'rdls' },
      { type: 'link', id: 'rdls-primer-nivel', label: 'RdlS (1er nivel)', route: 'rdls-primer-nivel' },
      { type: 'group', id: 'analisis', label: 'Análisis de Abasto', children: [
        { type: 'link', id: 'xclave', label: 'xClave', route: 'analisis/xclave' },
        { type: 'link', id: 'homologos', label: 'Homologos', route: 'analisis/homologos' },
        { type: 'link', id: 'balanceo', label: 'Balanceo (beta)', route: 'analisis/balanceo' },
        { type: 'link', id: 'balanceo-v2', label: 'Balanceo V2', route: 'analisis/balanceo-v2' },
        { type: 'link', id: 'ib-onco', label: 'IB-ONCO', route: '/ib-onco' },
      ]},
    ]},
     { type: 'group', id: 'solicitudes-unidades', label: 'Solicitudes', children: [
      { type: 'link', id: 'solicitudes', label: 'Solicitudes', route: 'solicitudes' },
      { type: 'link', id: 'radar-global', label: 'Radar global', route: 'radar-global' },
      { type: 'link', id: 'radar-desabasto', label: 'Radar de desabasto', route: 'radar-desabasto' },
    ]},
    { type: 'group', id: 'sistema', label: 'Sistema', children: [
      { type: 'link', id: 'about', label: 'Acerca de', route: 'acerca' },
    ]},
  ]);

  toggleGroup(id: string) {
    // Solo una rama abierta
    this.expandedGroupId.set(this.expandedGroupId() === id ? '' : id);
  }
}
