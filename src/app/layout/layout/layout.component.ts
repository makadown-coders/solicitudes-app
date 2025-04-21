import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { CapturaCluesComponent } from '../../features/captura-clues/captura-clues.component';
import { SolicitudesComponent } from '../../features/solicitudes/solicitudes.component';
import { DatosClues } from '../../models/datos-clues';

@Component({
  selector: 'app-layout',
  imports: [CommonModule, CapturaCluesComponent, SolicitudesComponent],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css'
})
export class LayoutComponent implements OnInit {

  activeTab: 'clues' | 'solicitud' = 'clues';
  datosClues: DatosClues | null = null;

  ngOnInit() {
    const tabGuardado = localStorage.getItem('activeTab');
    this.activeTab = tabGuardado === 'solicitud' ? 'solicitud' : 'clues';
    console.log('activeTab en layout', this.activeTab);
    const cluesStr = localStorage.getItem('datosClues');
    if (cluesStr) {
      this.datosClues = JSON.parse(cluesStr);
      console.log('datosClues en layout', this.datosClues);
    }
  }

  onDatosCluesCapturados(datos: DatosClues) {
    console.log('datos capturados', datos);
    this.datosClues = datos;
    localStorage.setItem('datosClues', JSON.stringify(datos));
  }
  

  irASolicitud() {
    this.activeTab = 'solicitud';
  }

  setTabActivo(tab: 'clues' | 'solicitud') {
    this.activeTab = tab;
    localStorage.setItem('activeTab', tab);
  }

  esFormularioCluesValido(): boolean {
    return !!(
      this.datosClues?.nombreHospital &&
      this.datosClues?.tipoInsumo?.length > 0 &&
      this.datosClues?.periodo
    );
  }
}
