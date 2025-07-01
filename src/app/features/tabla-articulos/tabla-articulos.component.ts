// src/app/features/tabla-articulos/tabla-articulos.component.ts
import { Component, Input, Output, EventEmitter, inject, ChangeDetectorRef, AfterContentChecked, AfterContentInit, OnChanges, SimpleChange, SimpleChanges, Sanitizer, SecurityContext, OnInit } from '@angular/core';
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

@Component({
  selector: 'app-tabla-articulos',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './tabla-articulos.component.html',
})
export class TablaArticulosComponent implements OnChanges, OnInit {

  @Input() articulosSolicitados: ArticuloSolicitud[] = [];
  @Input() modoEdicionIndex: number | null = null;
  @Input() cantidadTemporal: number = 0;
  @Input() inventario: InventarioDisponibles[] = [];

  cluesActual: string = '';
  cpmsPorClues: CPMS[] = [];
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

  constructor() {
    // console.log('constructor de TablaArticulosComponent');

  }

  ngOnInit(): void {
    this.inventarioService.cpms$.subscribe(cpms => {
      if (!cpms || cpms.length === 0) return;

      const cluesStr = this.storageSolicitudService.getDatosCluesFromLocalStorage();
      if (cluesStr) {
        const datosClues = JSON.parse(cluesStr) as DatosClues;
        this.cluesActual = datosClues.hospital?.cluesimb ?? '';
        // console.log('constructor - Buscando cpm por clues', this.cluesActual);
        this.cpmsPorClues = cpms.filter(cpms => cpms.cluesimb === this.cluesActual);
        this.inventarioService.emitirCPMSCluesActual(this.cpmsPorClues);
        // console.log('constructor - CPMSCluesActual ha sido emitido');
      }
    });
  }

  // Al actualizar articulosSolicitados refrescar CPMs
  ngOnChanges(changes: SimpleChanges) {
    // console.log('ngOnChanges', changes);
    if (changes['articulosSolicitados']) {
      // Actualizar CPMs por clave y clues
      const cluesStr = this.storageSolicitudService.getDatosCluesFromLocalStorage();
      if (cluesStr) {
        const datosClues = JSON.parse(cluesStr) as DatosClues;
        this.cluesActual = datosClues.hospital?.cluesimb ?? '';
        //  console.log('ngOnChanges - Buscando cpm por clues', this.cluesActual);
        const cpms = this.storageSolicitudService.getCPMSFromLocalStorage();
        // console.log('ngOnChanges - cpms totales', cpms.length);
        this.cpmsPorClues = cpms.filter(cpms => cpms.cluesimb === this.cluesActual);
        this.inventarioService.emitirCPMSCluesActual(this.cpmsPorClues);
        // console.log('ngOnChanges - cpms actualizados en articulosSolicitados', this.articulosSolicitados);
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

  buscarEnInventario(clave: string): InventarioDisponibles | undefined {
    return this.inventario.find(inventario => inventario.clave === clave) || undefined;
  }

  public buscarCPM(clave: string) {
    return this.cpmsPorClues.find(cpm => cpm.clave === clave)?.cantidad ?? 0;
  }
}
