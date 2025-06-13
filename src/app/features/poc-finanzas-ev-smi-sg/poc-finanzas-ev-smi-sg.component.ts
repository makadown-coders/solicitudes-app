import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SelectorCluesComponent } from '../../shared/selector-clues/selector-clues.component';
import { Unidad } from '../../models/articulo-solicitud';
import { EvaluadorSmiSgComponent } from './evaluador-smi-sg/evaluador-smi-sg.component';
import { ThemeService } from '../../services/theme.service';
import { StorageVariables } from '../../shared/storage-variables';

@Component({
  selector: 'app-poc-finanzas-ev-smi-sg',
  standalone: true,
  imports: [CommonModule, EvaluadorSmiSgComponent, SelectorCluesComponent],
  templateUrl: './poc-finanzas-ev-smi-sg.component.html',
})
export class PocFinanzasEvSmiSgComponent implements OnInit {
  themeService = inject(ThemeService);
  title = 'Evaluaciones SMI/SG';
  get isDarkMode() { return this.themeService.isDarkMode(); }
  isLoading = signal(false);
  unidadSeleccionada = signal<Unidad | null>(null);

  ngOnInit(): void {
    const guardado = localStorage.getItem(StorageVariables.POC_FE_SMI_SG_SELECTED_CLUES);
    if (guardado) {
      try {
        const unidad = JSON.parse(guardado) as Unidad;
        this.unidadSeleccionada.set(unidad);
      } catch {
        localStorage.removeItem(StorageVariables.POC_FE_SMI_SG_SELECTED_CLUES);
      }
    }
  }

  actualizarUnidad(unidad: Unidad) {
    this.unidadSeleccionada.set(unidad);
    localStorage.setItem(
      StorageVariables.POC_FE_SMI_SG_SELECTED_CLUES,
      JSON.stringify(unidad)
    );
  }
}
