import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PeriodoPickerDasboardComponent } from '../../../shared/periodo-picker/periodo-picker-dashboard.component';

@Component({
  selector: 'app-rdls',
  standalone: true,
  imports: [CommonModule, PeriodoPickerDasboardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rdls.component.html',
  //styleUrls: ['./rdls.component.scss']
})
export class RdlSComponent {
  // Rango seleccionado
  fechaInicio = signal<Date | null>(null);
  fechaFin = signal<Date | null>(null);

  onPeriodoSeleccionado(inicio?: Date | null, fin?: Date | null) {
    this.fechaInicio.set(inicio ?? null);
    this.fechaFin.set(fin ?? null);
    // TODO: aquí disparas tu fetch real para la tabla con el rango seleccionado
    // this.rdlsService.page({ desde: inicio, hasta: fin, ... })
  }
}