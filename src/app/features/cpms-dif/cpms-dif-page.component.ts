// src/app/features/cpms-dif/cpms-dif-page.component.ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, ShieldCheck } from 'lucide-angular';
import { DetalleComponent } from './detalle/detalle.component';
import { ResumenComponent } from './resumen/resumen.component';

@Component({
  selector: 'app-cpms-dif-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DetalleComponent, ResumenComponent, LucideAngularModule],
  templateUrl: './cpms-dif-page.component.html'
})
export class CpmsDifPageComponent {
  tab: 'detalle' | 'resumen' = 'detalle';
  readonly ShieldCheckIcon = ShieldCheck;
}
