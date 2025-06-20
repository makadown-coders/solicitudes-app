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
  title = 'solicitudes-app';
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
    }
    // EN CONSTRUCCION
    this.inventarioService.refrescarDatosInventario();
  }

  onDatosCluesCapturados(datos: DatosClues) {
    this.datosClues = datos;
    this.title = this.datosClues?.nombreHospital + '('+ this.datosClues.tipoInsumo +')';
    this.solicitudService.setDatosCluesInLocalStorage(JSON.stringify(datos));
    this.cdRef.detectChanges();
  }


  irASolicitud() {
    this.setTabActivo('solicitud');
  }

  setTabActivo(tab: 'clues' | 'solicitud') {
    this.activeTab = tab;
    this.storageSolicitudService.setActiveTabInLocalStorage(tab);
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
