// src/app/layout/layout/layout.component.ts
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnChanges, OnInit, signal, SimpleChanges } from '@angular/core';
import { CapturaCluesComponent } from '../../features/captura-clues/captura-clues.component';
import { SolicitudesComponent } from '../../features/solicitudes/solicitudes.component';
import { DatosClues } from '../../models/datos-clues';
import { LucideAngularModule, CircleHelp, RefreshCcwDotIcon, LoaderIcon, InfoIcon } from 'lucide-angular';
import { InventarioService } from '../../services/inventario.service';
import { StorageSolicitudService } from '../../services/storage-solicitud.service';
import { Router } from '@angular/router';
import { ModoCapturaSolicitud } from '../../shared/modo-captura-solicitud';
import { Title } from '@angular/platform-browser';
import { concatAll, finalize, map, of } from 'rxjs';
import { SurveyNudgeComponent } from '../../shared/survey/survey-nudge.component';
import { SurveyModalComponent } from '../../shared/survey/survey-modal.component';
import { NgFastToastComponent } from 'ng-fast-toast';
import { CpmService } from '../../services/cpm.service';
import { Unidadv2 } from '../../models';

@Component({
  selector: 'app-layout',
  imports: [
    CommonModule,
    CapturaCluesComponent,
    SolicitudesComponent,
    LucideAngularModule,
    SurveyNudgeComponent,
    SurveyModalComponent,
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LayoutComponent implements OnInit, OnChanges {
  acercaDeVisible = false;
  title: Title = inject(Title);
  readonly CircleHelp = CircleHelp;
  readonly InfoIcon = InfoIcon;
  readonly RefreshCCWDotIcon = RefreshCcwDotIcon;
  readonly LoaderIcon = LoaderIcon;
  activeTab: 'clues' | 'solicitud' = 'clues';
  datosClues: DatosClues | null = null;
  guiaVisible = false;
  inventarioService = inject(InventarioService);
  solicitudService = inject(StorageSolicitudService);
  private cpmService = inject(CpmService);

  private cdRef = inject(ChangeDetectorRef);
  private router = inject(Router);
  public storageSolicitudService = inject(StorageSolicitudService);
  refrescandoCPMSdesdeLayout = signal(false);

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

    this.refrescarInventario();
    // ⬇️ NUEVO: si ya había unidad, asegura CPM para esa CLUES
    if (this.datosClues?.hospital?.cluesimb) {
      this.refrescarCPMSPorClues(this.datosClues.hospital.cluesimb);
    }
    if (!this.storageSolicitudService.isPeriodoValidoAhora(true)) {
      this.activeTab = 'clues';
      if (this.datosClues) { this.datosClues.periodo = ''; }
    }
  }

  /**
   * Recarga las existencias en los almacenes
   */
  refrescarInventario() {
    // EN PRUEBA PILOTO (INVENTARIO - SAS / SACIA / SIAN )
    const timestampFallback = localStorage.getItem('ultimaVezRefrescadoInventario');
    const ahora = Date.now();
    const medioDiaMs = 12 * 60 * 60 * 1000;

    if (!timestampFallback ||
      ahora - Number(timestampFallback) > medioDiaMs
    ) {
      this.inventarioService.refrescarDatosInventario();
      // Esperar 12 horas para refrescar inventario despues de la última vez
      localStorage.setItem('ultimaVezRefrescadoInventario', ahora.toString());
    } else {
      const inventario = this.storageSolicitudService.getInventarioFromLocalStorage();
      this.inventarioService.emitirInventario(inventario);
    }
  }

  /** Sólo inventario; CPM pasa a CpmService (legacy mientras tanto) */
  refrescarExistenciasYCPMS(): void {
    this.inventarioService.refrescarDatosInventario();
    // CPM: preferimos cargarlo on-demand por clues con el nuevo servicio
    if (this.datosClues?.hospital?.cluesimb) {
      this.refrescarCPMSPorClues(this.datosClues.hospital.cluesimb, /*force*/ true);
    }
  }

  /**
   * Refresca CPMS para una unidad por cluesimb
   * @param cluesimb Clues de la unidad
   * @param force Si se debe refrescar fuerza la carga
   * @private
   */
  private refrescarCPMSPorClues(cluesimb: string, force = false): void {
    if (!cluesimb) return;
    this.refrescandoCPMSdesdeLayout.set(true);
    this.cpmService
      .ensureForCluesimb(cluesimb, { force })
      .pipe(finalize(() => this.refrescandoCPMSdesdeLayout.set(false)))
      .subscribe({
        next: () => { this.refrescandoCPMSdesdeLayout.set(false); },
        error: (e) => console.error('Error al cargar CPMs', e),
      });
  }

  onDatosCluesCapturados(datos: DatosClues) {
    this.datosClues = datos;
    this.datosClues.hospital = {...datos.hospital} as Unidadv2;
    this.title.setTitle(this.datosClues?.nombreHospital + '(' + this.datosClues.tipoInsumo + ')');
    this.solicitudService.setDatosCluesInLocalStorage(JSON.stringify(datos));
    const cluesimb = datos?.hospital?.cluesimb || '';

    if (cluesimb) this.cpmService.ensureForCluesimb(cluesimb, { force: true }).subscribe();
    this.cdRef.detectChanges();
  }


  irASolicitud() {
    this.setTabActivo('solicitud');
    // al pasar a la pestaña 2, asegura valores de CPM de la unidad actual
    const cluesimb = this.datosClues?.hospital?.cluesimb || '';

    if (cluesimb) this.cpmService.ensureForCluesimb(cluesimb, { force: true }).subscribe();
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

  mostrarAcercaDe() {
    this.acercaDeVisible = true;
  }

  anioActual() {
    return new Date().getFullYear();
  }
}
