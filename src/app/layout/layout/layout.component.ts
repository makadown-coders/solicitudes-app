import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnChanges, OnInit, signal, SimpleChanges } from '@angular/core';
import { CapturaCluesComponent } from '../../features/captura-clues/captura-clues.component';
import { SolicitudesComponent } from '../../features/solicitudes/solicitudes.component';
import { DatosClues } from '../../models/datos-clues';
import { LucideAngularModule, CircleHelp } from 'lucide-angular';
import { InventarioService } from '../../services/inventario.service';
import { StorageSolicitudService } from '../../services/storage-solicitud.service';
import { Router } from '@angular/router';
import { ModoCapturaSolicitud } from '../../shared/modo-captura-solicitud';
import { Title } from '@angular/platform-browser';
import { concatAll, finalize, map, of } from 'rxjs';

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
    this.refrescarCPMS();
  }

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


  refrescarCPMS(): void {
    // TODO: PRUEBA PILOTO
    // 1. Establece el signal a true para mostrar el indicador de carga.
    this.refrescandoCPMSdesdeLayout.set(true);
    // console.log('refrescando CPMS (inicio)', this.refrescandoCPMSdesdeLayout());
    let banderaRefrescado = false;

    // Verificar si la fecha de refrescado es la misma que la actual para evitar refrescados innecesarios
    const timestampFallback = localStorage.getItem('ultimaVezRefrescadoCPMS');
    const ahora = Date.now(); 
    // verificar si hay valor en timestampFallback
    if (timestampFallback) {
       // si la fecha (NO EL NUMERO) de refrescado corresponde a la fecha actual, establecer la bandera a true
      if (new Date(timestampFallback).getDate() === new Date().getDate()) {
        banderaRefrescado = true;
      }    
    }

    // 2. Suscríbete al Observable que obtiene los CPMS del localStorage.
    this.storageSolicitudService.getCPMSFromLocalStorage$().pipe(
      // Este `map` se ejecuta una vez que los CPMS del localStorage han sido obtenidos.
      // Aquí decides qué operación asíncrona debe seguir.
      map(cpms => {
        //console.log('CPMS obtenidos de localStorage:', cpms); // Para depuración
        // Si la cantidad de CPMS es 0 o si hoy es primero o 15 de mes, refrescar datos del servicio.
        if (cpms.length === 0 ||
            ((new Date().getDate() === 1 || new Date().getDate() === 15 ) && banderaRefrescado === true)) {
          // Asume que inventarioService.refrescarDatosCPMS() también devuelve un Observable.
          // Por ejemplo, para una llamada HTTP.
          this.inventarioService.refrescarDatosCPMS();
          // crear una bandera para que no refresque mas de una vez en el mismo dia
          localStorage.setItem('ultimaVezRefrescadoCPMS', Date.now().toString());
        } else {
          // Si no necesita refrescar, simplemente emite los CPMS existentes.
          // Asume que inventarioService.emitirCPMS() es síncrono o devuelve un Observable
          // que se completa inmediatamente (ej. `of(null)`).
          this.inventarioService.emitirCPMS(cpms);          
        }
        return of(null); // Retorna un Observable que se completa inmediatamente.
      }),
      // El operador `concatAll` (o `mergeAll` si el orden no importa) "aplanará"
      // el Observable interno devuelto por el `map` (`of(null)`).
      // Esto asegura que esperamos a que esa operación interna también finalice.
      concatAll(),
      // El operador `finalize` se ejecuta cuando el Observable se completa o emite un error.
      finalize(() => {
        // 3. Establece el signal a false cuando todas las operaciones asíncronas han terminado.
        this.refrescandoCPMSdesdeLayout.set(false);
        // console.log('finalizacion de refresco de CPMS', this.refrescandoCPMSdesdeLayout());
      })
    ).subscribe(
      () => {
        // Esto se ejecuta cuando todas las operaciones del pipe se completan con éxito.
        // console.log('Flujo de refresco de CPMS completado con éxito.');
      }
    );
  }

  onDatosCluesCapturados(datos: DatosClues) {
    this.datosClues = datos;
    this.title.setTitle(this.datosClues?.nombreHospital + '(' + this.datosClues.tipoInsumo + ')');
    this.solicitudService.setDatosCluesInLocalStorage(JSON.stringify(datos));
    this.refrescarCPMS();
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
