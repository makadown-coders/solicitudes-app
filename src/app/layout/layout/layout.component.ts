import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { CapturaCluesComponent } from '../../features/captura-clues/captura-clues.component';
import { SolicitudesComponent } from '../../features/solicitudes/solicitudes.component';
import { DatosClues } from '../../models/datos-clues';

@Component({
  selector: 'app-layout',
  imports: [CommonModule, CapturaCluesComponent, SolicitudesComponent],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css'
})
export class LayoutComponent {
  activeTab: 'clues' | 'solicitud' = 'clues';
  datosClues: DatosClues | null = null;

  onDatosCluesCapturados(datos: DatosClues) {
    this.datosClues = datos;
    // Podrías pasarlo a solicitudes más adelante si se requiere
  }

  irASolicitud() {
    this.activeTab = 'solicitud';
  }
}
