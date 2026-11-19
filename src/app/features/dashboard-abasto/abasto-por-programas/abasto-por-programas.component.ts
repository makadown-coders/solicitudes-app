import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

type VertienteProgramatica = 'APS' | 'PROGRAMAS_PREVENTIVOS';

@Component({
  selector: 'app-abasto-por-programas',
  standalone: true,
  templateUrl: './abasto-por-programas.component.html',
  styleUrl: './abasto-por-programas.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AbastoPorProgramasComponent {
  readonly vertienteActiva = signal<VertienteProgramatica>('APS');

  seleccionarVertiente(vertiente: VertienteProgramatica): void {
    this.vertienteActiva.set(vertiente);
  }
}
