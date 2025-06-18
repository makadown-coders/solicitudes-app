import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { CapturaCluesComponent } from '../../features/captura-clues/captura-clues.component';
import { SolicitudesComponent } from '../../features/solicitudes/solicitudes.component';
import { DatosClues } from '../../models/datos-clues';
import { LucideAngularModule, CircleHelp } from 'lucide-angular';

@Component({
  selector: 'app-layout',
  imports: [
    CommonModule,
    CapturaCluesComponent,
    SolicitudesComponent,
    LucideAngularModule
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css'
})
export class LayoutComponent implements OnInit {
  readonly CircleHelp = CircleHelp;
  activeTab: 'clues' | 'solicitud' = 'clues';
  datosClues: DatosClues | null = null;
  guiaVisible = false;

  ngOnInit() {
    const tabGuardado = localStorage.getItem('activeTab');
    this.activeTab = tabGuardado === 'solicitud' ? 'solicitud' : 'clues';
    
    const cluesStr = localStorage.getItem('datosClues');
    if (cluesStr) {
      this.datosClues = JSON.parse(cluesStr);
    }
  }

  onDatosCluesCapturados(datos: DatosClues) {
    this.datosClues = datos;
    localStorage.setItem('datosClues', JSON.stringify(datos));
  }


  irASolicitud() {
    this.setTabActivo('solicitud');
  }

  setTabActivo(tab: 'clues' | 'solicitud') {
    this.activeTab = tab;
    localStorage.setItem('activeTab', tab);
  }

  esFormularioCluesValido(): boolean {
    return !!(
      this.datosClues?.nombreHospital &&
      this.datosClues?.tipoInsumo?.length > 0 &&
      this.datosClues?.periodo &&
      this.datosClues?.responsableCaptura?.length > 0
    );
  }

  mostrarGuia() {
    this.guiaVisible = true;
  }
}
