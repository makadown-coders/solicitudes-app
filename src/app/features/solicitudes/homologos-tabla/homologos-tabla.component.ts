import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, inject, ChangeDetectorRef } from '@angular/core';
import { SugerenciaHomologoItem } from '../../../services/homologos-solicitud.service';
import { InventarioDisponibles } from '../../../models/Inventario';
import { ArticulosService } from '../../../services/articulos.service';
import { InventarioService } from '../../../services/inventario.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-homologos-tabla',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './homologos-tabla.component.html',
  styleUrls: ['./homologos-tabla.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomologosTablaComponent {
  @Input() sugerencias: SugerenciaHomologoItem[] = [];
  @Input() mostrarAcciones: boolean = true;
  @Input() titulo: string = '⚖️ Oportunidades de Homologación';
  @Input() inventarioDisponible: InventarioDisponibles[] = [];

  @Output() reemplazar = new EventEmitter<{ original: SugerenciaHomologoItem; candidato: any }>();
  @Output() verAlternativas = new EventEmitter<SugerenciaHomologoItem>();
  @Output() close = new EventEmitter<void>();

  private articulosService = inject(ArticulosService);
  private inventarioService = inject(InventarioService);
  private cdRef = inject(ChangeDetectorRef);

  // Mapa de artículos (mismo enfoque que homologo-sugerencia-modal)
  private artMap = new Map<string, { descripcion: string; presentacion?: string; categoria?: string | null }>();
  private artMapLoaded = false;

  // UI state
  expandedRows = new Set<string>();
  mapLoading = true;

  ngOnInit() {
    this.loadArtMapIfNeeded();
  }

  /**
   * Carga el mapa completo de artículos una sola vez
   * (mismo enfoque que homologo-sugerencia-modal)
   */
  private async loadArtMapIfNeeded() {
    if (this.artMapLoaded) return;
    try {
      const mapa = await firstValueFrom(this.articulosService.getArticulosMapa());
      this.artMap = new Map<string, any>(Object.entries(mapa));
      this.artMapLoaded = true;
      this.mapLoading = false;
      this.cdRef.markForCheck();
    } catch (error) {
      console.error('Error cargando mapa de artículos en homologos-tabla:', error);
      this.mapLoading = false;
      this.cdRef.markForCheck();
    }
  }

  /**
   * Obtiene descripción de un artículo desde el mapa
   */
  getDescripcionArticulo(clave: string): string {
    return this.artMap.get(clave)?.descripcion || '';
  }

  /**
   * Obtiene presentación/unidad de un artículo desde el mapa
   */
  getUnidadArticulo(clave: string): string {
    return this.artMap.get(clave)?.presentacion || '';
  }

  /**
   * Obtiene descripción corta (máx 50 caracteres)
   */
  getShortDescription(desc: string, maxLength = 50): string {
    if (!desc) return '—';
    return desc.length > maxLength ? desc.substring(0, maxLength) + '…' : desc;
  }

  /**
   * Calcula las existencias de una clave en los 3 almacenes
   */
  getExistenciasPorAlmacen(clave: string): { AZM: number; AZT: number; AZE: number } {
    const claveNorm = this.inventarioService.normalizarClave(clave);
    if (!claveNorm || !this.inventarioDisponible?.length) {
      return { AZM: 0, AZT: 0, AZE: 0 };
    }

    let azm = 0, azt = 0, aze = 0;
    for (const item of this.inventarioDisponible) {
      const itemNorm = this.inventarioService.normalizarClave(item.clave);
      if (itemNorm === claveNorm) {
        azm += item.existenciasAZM ?? 0;
        azt += item.existenciasAZT ?? 0;
        aze += item.existenciasAZE ?? 0;
      }
    }

    return { AZM: azm, AZT: azt, AZE: aze };
  }

  /**
   * Verifica si un candidato tiene suficiente stock total para satisfacer la cantidad requerida
   * Suma: AZM + AZT + AZE >= cantidad requerida
   */
  candidatoSatisfaceRequimiento(candidatoSustituto: string, cantidadRequerida: number): boolean {
    const exist = this.getExistenciasPorAlmacen(candidatoSustituto);
    const totalStock = (exist.AZM ?? 0) + (exist.AZT ?? 0) + (exist.AZE ?? 0);
    return totalStock >= cantidadRequerida;
  }

  /**
   * Toggle expandir fila
   */
  toggleExpanded(claveOriginal: string) {
    if (this.expandedRows.has(claveOriginal)) {
      this.expandedRows.delete(claveOriginal);
    } else {
      this.expandedRows.add(claveOriginal);
    }
  }

  isExpanded(claveOriginal: string): boolean {
    return this.expandedRows.has(claveOriginal);
  }

  /**
   * Emite reemplazo
   */
  onReemplazar(original: SugerenciaHomologoItem, candidato: any) {
    this.reemplazar.emit({ original, candidato });
  }

  /**
   * Emite ver alternativas
   */
  onVerAlternativas(sugerencia: SugerenciaHomologoItem) {
    this.verAlternativas.emit(sugerencia);
  }

  /**
   * Formatea números
   */
  fmt(n: number): string {
    return (n ?? 0).toLocaleString('es-MX');
  }

  /**
   * Obtiene color para almacén
   */
  getAlmacenColor(almacen: string): string {
    switch (almacen?.toUpperCase()) {
      case 'AZM': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'AZE': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
      case 'AZT': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
    }
  }

  /**
   * Obtiene nombre descriptivo del almacén
   */
  getAlmacenNombre(almacen: string): string {
    switch (almacen?.toUpperCase()) {
      case 'AZM': return 'Mexicali';
      case 'AZE': return 'Ensenada';
      case 'AZT': return 'Tijuana';
      default: return almacen || 'Flexible';
    }
  }

  /**
   * Helper para Number en templates
   */
  toNumber(value: any): number {
    return Number(value ?? 1);
  }
}
