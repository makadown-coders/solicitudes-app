import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { NavItem } from '../../models/NavItem';

@Component({
  selector: 'app-sidebar-accordion-estatal',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sidebar-accordion-estatal.component.html',
})
export class SidebarAccordionEstatalComponent {
  expandedGroupId = signal<string>('operacion');

  items = signal<NavItem[]>([
    {
      type: 'group',
      id: 'operacion',
      label: 'Operación estatal',
      children: [
        { type: 'link', id: 'resumen', label: 'Priorización por clave', route: 'resumen' },
        { type: 'link', id: 'roadmap-backend', label: 'Roadmap backend', route: 'roadmap-backend' },
      ],
    },
    {
      type: 'group',
      id: 'proximos-cortes',
      label: 'Próximos cortes',
      children: [
        { type: 'link', id: 'jurisdicciones', label: 'Jurisdicciones', route: 'jurisdicciones' },
        { type: 'link', id: 'unidades', label: 'Unidades médicas', route: 'unidades' },
        { type: 'link', id: 'ordenes', label: 'Órdenes pendientes', route: 'ordenes-pendientes' },
      ],
    },
  ]);

  toggleGroup(id: string): void {
    this.expandedGroupId.set(this.expandedGroupId() === id ? '' : id);
  }
}
