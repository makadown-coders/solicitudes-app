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
      { type: 'link', id: 'citas-pend', label: 'Citas Pendientes', route: 'citas-pendientes' },
      { type: 'link', id: 'citas-comp', label: 'Citas Completadas', route: 'citas-completadas' },
      { type: 'link', id: 'resumen-citas', label: 'Resumen Citas (beta)', route: 'resumen-citas' },
    ]},
    { type: 'group', id: 'existencias', label: 'Existencias', children: [
      { type: 'link', id: 'existencias-beta', label: 'Existencias (beta)', route: 'existencias' },
      { type: 'link', id: 'rdls', label: 'RdlS', route: 'rdls' },
      { type: 'link', id: 'rdls-primer-nivel', label: 'RdlS (1er nivel)', route: 'rdls-primer-nivel' },
      { type: 'group', id: 'analisis', label: 'Análisis de Abasto', children: [
        { type: 'link', id: 'xclave', label: 'xClave', route: 'analisis/xclave' },
        { type: 'link', id: 'balanceo', label: 'Balanceo (beta)', route: 'analisis/balanceo' },
      ]},
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
