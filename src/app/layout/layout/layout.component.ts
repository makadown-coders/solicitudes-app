import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { CapturaCluesComponent } from '../../features/captura-clues/captura-clues.component';
import { SolicitudesComponent } from '../../features/solicitudes/solicitudes.component';
import { DatosClues } from '../../models/datos-clues';
import { LucideAngularModule, CircleHelp } from 'lucide-angular';
import { InventarioService } from '../../services/inventario.service';
import { StorageSolicitudService } from '../../services/storage-solicitud.service';
import { Router } from '@angular/router';
import { ModoCapturaSolicitud } from '../../shared/modo-captura-solicitud';
import { Title } from '@angular/platform-browser';

@Component({
  selector: 'app-layout',
  imports: [
    CommonModule,
    CapturaCluesComponent,
    SolicitudesComponent,
    LucideAngularModule
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LayoutComponent implements OnInit, OnChanges {
  title: Title = inject(Title);
  readonly CircleHelp = CircleHelp;
  activeTab: 'clues' | 'solicitud' = 'clues';
  datosClues: DatosClues | null = null;
  guiaVisible = false;
  inventarioService = inject(InventarioService);
  solicitudService = inject(StorageSolicitudService);
  private cdRef = inject(ChangeDetectorRef);
  private router = inject(Router);
  private storageSolicitudService = inject(StorageSolicitudService);

  ngOnChanges(changes: SimpleChanges): void {
    this.verificarRuta();
  }

  verificarRuta() {
    if (this.router.url === '/solicitud-unidad') {
      this.storageSolicitudService.setModoCapturaSolicitud(ModoCapturaSolicitud.PRIMER_NIVEL);
    } else {
      this.storageSolicitudService.setModoCapturaSolicitud(ModoCapturaSolicitud.SEGUNDO_NIVEL);
    }
  }

  ngOnInit() {
    this.verificarRuta();
    const tabGuardado = this.storageSolicitudService.getActiveTabFromLocalStorage();
    this.activeTab = tabGuardado === 'solicitud' ? 'solicitud' : 'clues';

    const cluesStr = this.solicitudService.getDatosCluesFromLocalStorage();
    if (cluesStr) {
      this.datosClues = JSON.parse(cluesStr);
      this.title.setTitle(this.datosClues?.nombreHospital + '(' + this.datosClues?.tipoInsumo + ')');
    }
    // EN PRUEBA PILOTO - TODO: Esperar 12 horas para refrescar inventario despues de la primera vez    
    this.inventarioService.refrescarDatosInventario();
    
    // EN PRUEBA PILOTO (CPMS) .
    const cpms = this.storageSolicitudService.getCPMSFromLocalStorage();
    // Si la cantidad de CPMS es 0 o si hoy es primero o 15 de mes, refrescar
    if (cpms.length === 0 || new Date().getDate() === 1 || 
    new Date().getDate() === 15) { this.inventarioService.refrescarDatosCPMS(); }
    else {
      this.inventarioService.emitirCPMS(cpms);
    }
  }

  onDatosCluesCapturados(datos: DatosClues) {
    this.datosClues = datos;
    this.title.setTitle(this.datosClues?.nombreHospital + '(' + this.datosClues.tipoInsumo + ')');
    this.solicitudService.setDatosCluesInLocalStorage(JSON.stringify(datos));
    this.cdRef.detectChanges();
  }


  irASolicitud() {
    this.setTabActivo('solicitud');
    this.cdRef.detectChanges();
  }

  setTabActivo(tab: 'clues' | 'solicitud') {
    this.activeTab = tab;
    this.storageSolicitudService.setActiveTabInLocalStorage(tab);
    this.cdRef.detectChanges();
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
