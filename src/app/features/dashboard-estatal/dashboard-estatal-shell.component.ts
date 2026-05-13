import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { SidebarAccordionEstatalComponent } from './sidebar-accordion-estatal.component';

@Component({
  selector: 'app-dashboard-estatal-shell',
  standalone: true,
  imports: [RouterOutlet, SidebarAccordionEstatalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-estatal-shell.component.html',
})
export class DashboardEstatalShellComponent {}
