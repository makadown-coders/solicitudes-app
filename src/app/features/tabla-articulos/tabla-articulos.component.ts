// src/app/features/tabla-articulos/tabla-articulos.component.ts
import { Component, Input, Output, EventEmitter, inject, ChangeDetectorRef, AfterContentChecked, AfterContentInit, OnChanges, SimpleChange, SimpleChanges, Sanitizer, SecurityContext, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { clasificacionMedicamentosData } from '../../models/clasificacionMedicamentosData';
import { ClasificadorVEN } from '../../models/clasificador-ven';
import { Inventario, InventarioDisponibles } from '../../models/Inventario';
import { DomSanitizer } from '@angular/platform-browser';
import { StorageSolicitudService } from '../../services/storage-solicitud.service';
import { DatosClues } from '../../models/datos-clues';
import { CPMS } from '../../models/CPMS';
import { InventarioService } from '../../services/inventario.service';
import { ArticuloSolicitud } from '../../models/articulo-solicitud';
import { AlertCircleIcon, InfoIcon, LucideAngularModule, TriangleAlertIcon } from 'lucide-angular';
import { CpmService } from '../../services/cpm.service';
import { Subject, takeUntil } from 'rxjs';
import { CpmUnionRow } from '../../models/CpmUnionRow';
import { CpmRowLite } from '../../models/CpmExpectedRow';

@Component({
  selector: 'app-tabla-articulos',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './tabla-articulos.component.html',
})
export class TablaArticulosComponent implements OnChanges, OnInit, OnDestroy {

  @Input() articulosSolicitados: ArticuloSolicitud[] = [];
  @Input() modoEdicionIndex: number | null = null;
  @Input() cantidadTemporal: number = 0;
  @Input() inventario: InventarioDisponibles[] = [];
  @Input() cluesimbActual: string = '';

  cpmsDeCluesActual: CPMS[] = [];
  private cpmIndex = new Map<string, number>();
  alertCircle = AlertCircleIcon;
  infoIcon = InfoIcon;
  triangleAlertIcon = TriangleAlertIcon;

  private cdRef = inject(ChangeDetectorRef);

  @Output() cantidadTemporalChange = new EventEmitter<number>();
  @Output() confirmar = new EventEmitter<number>();
  @Output() cancelar = new EventEmitter<void>();
  @Output() editar = new EventEmitter<number>();
  @Output() eliminar = new EventEmitter<number>();

  sanitizer = inject(DomSanitizer);
  storageSolicitudService = inject(StorageSolicitudService);
  inventarioService = inject(InventarioService);
  private cpmService = inject(CpmService);
  private onDestroy$ = new Subject<void>();

  constructor() {
    // console.log('constructor de TablaArticulosComponent');
  }

  ngOnDestroy(): void {
    this.onDestroy$.next();
    this.onDestroy$.complete();
  }

  /** true si la clave pertenece al KIT de la unidad actual */
  enKit(clave: string | null | undefined): boolean {
    if (!clave) return false;
    return this.cpmService.isClaveInKit(this.inventarioService.normalizarClave(clave), this.cluesimbActual);
  }

  ngOnInit(): void {

  }

  private normClave(clave: string | undefined | null): string {
    return this.inventarioService.normalizarClave((clave ?? '').toString().toUpperCase());
  }

  private mapCpmRowsToCPMS(rows: CpmRowLite[], cluesimbFallback?: string): CPMS[] {
    // Consolidamos por clave (si una clave aparece varias veces por distintos kits, tomamos el mayor CPM)
    const byClave = new Map<string, CPMS>();

    for (const r of rows) {
      const clave = (r.clave_cnis || '').toUpperCase();
      if (!clave) continue;

      const cpmVal = Number(r.cpm ?? 0);
      if (cpmVal <= 0) continue; // solo nos interesan CPMS > 0

      const cluesimb = (r.cluesimb || cluesimbFallback || '').toUpperCase();
      const prev = byClave.get(clave);

      if (!prev || cpmVal > prev.cantidad) {
        byClave.set(clave, {
          clave,
          cluesimb,
          cantidad: cpmVal,   // 👈 aquí ‘cantidad’ = CPM
        });
      }
    }

    return Array.from(byClave.values());
  }

  // Al actualizar articulosSolicitados refrescar CPMs
  ngOnChanges(changes: SimpleChanges) {
    if (changes['articulosSolicitados'] || changes['cluesimbActual']) {
      // Actualizar CPMs por clave y clues
      const cluesStr = this.storageSolicitudService.getDatosCluesFromLocalStorage();
      if (cluesStr) {
        const datosClues = JSON.parse(cluesStr) as DatosClues;
        this.cluesimbActual = datosClues.hospital?.cluesimb ?? '';
        
        this.cpmService.cpmsForImport(this.cluesimbActual)
          .pipe(takeUntil(this.onDestroy$))
          .subscribe((rows: CpmUnionRow[]) => {
            const clues = this.cluesimbActual;
            this.cpmsDeCluesActual = this.mapCpmRowsToCPMS(rows as any, clues);
            this.cpmIndex.clear();
            for (const r of this.cpmsDeCluesActual) {
              this.cpmIndex.set(this.normClave(r.clave), Number(r.cantidad) || 0);
            }
            this.cdRef.detectChanges();
          });
      }
    }
  }

  esCantidadInvalida(): boolean {
    const esInvalida = this.cantidadTemporal <= 0 || this.cantidadTemporal > 99999;
    return esInvalida;
  }

  mandarConfirmacion(index: number) {
    this.cantidadTemporalChange.emit(this.cantidadTemporal);
    this.confirmar.emit(index);
  }

  clasificacion(clave: string) {
    const clasificacion = clasificacionMedicamentosData.find(c => c.clave === clave);
    return clasificacion ? ClasificadorVEN[clasificacion.ven] : '';
  }

  getSafeHtml(html: string) {
    return this.sanitizer.sanitize(SecurityContext.HTML,
      this.sanitizer.bypassSecurityTrustHtml(html));
  }

  private normalizarClaveBusqueda(clave: string): string[] {
    const claveSinPuntos = clave.replace(/\./g, '');
    const prefijo = claveSinPuntos.substring(0, 3);

    if (['060', '533', '513', '535', '537', '080', '070'].includes(prefijo)) {
      if (claveSinPuntos.length === 10) {
        // Generar versión con .00
        const conPuntos12 = `${claveSinPuntos.substring(0, 3)}.${claveSinPuntos.substring(3, 6)}.${claveSinPuntos.substring(6, 10)}.00`;
        return [clave, conPuntos12];
      }
      if (claveSinPuntos.length === 12 && claveSinPuntos.endsWith('00')) {
        // Generar versión sin .00
        const clave10 = claveSinPuntos.substring(0, 10);
        const conPuntos10 = `${clave10.substring(0, 3)}.${clave10.substring(3, 6)}.${clave10.substring(6, 10)}`;
        return [clave, conPuntos10];
      }
    }
    // Claves normales (no especiales)
    return [clave];
  }

  buscarEnInventario(clave: string): InventarioDisponibles | undefined {
    const clavesBuscar = this.normalizarClaveBusqueda(clave);
    return this.inventario.find(inventario => clavesBuscar.includes(inventario.clave));
  }

  public buscarCPM(clave: string): number {
    const cpm = this.cpmsDeCluesActual.find(cpmItem => cpmItem.clave.trim()+'' === clave.trim()+'');    
    return cpm ? cpm.cantidad : 0;
  }

}
