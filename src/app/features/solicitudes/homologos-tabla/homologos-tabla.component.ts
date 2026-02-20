import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, inject, ChangeDetectorRef } from '@angular/core';
import { SugerenciaHomologoItem, MiniBalanceHomologoCand } from '../../../services/homologos-solicitud.service';
import { InventarioDisponibles } from '../../../models/Inventario';
import { ArticuloSolicitud } from '../../../models/articulo-solicitud';
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
  @Input() existingClaves: string[] = [];

  @Output() reemplazar = new EventEmitter<{ original: SugerenciaHomologoItem; candidato: any }>();
  @Output() verAlternativas = new EventEmitter<SugerenciaHomologoItem>();
  @Output() close = new EventEmitter<void>();
  @Output() selectionCountChange = new EventEmitter<number>();

  private articulosService = inject(ArticulosService);
  private inventarioService = inject(InventarioService);
  private cdRef = inject(ChangeDetectorRef);

  // Mapa de artículos (mismo enfoque que homologo-sugerencia-modal)
  private artMap = new Map<string, { descripcion: string; presentacion?: string; categoria?: string | null }>();
  private artMapLoaded = false;

  // UI state
  mapLoading = true;

  // State tracking: selecciones[originalClave] = selectedCandidate (o null = usar topCandidate por defecto)
  selecciones: Map<string, MiniBalanceHomologoCand | null> = new Map();

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
   * Toggle de selección para un candidato
   * Si ya estaba seleccionado, lo deselecciona (vuelve al top por defecto = null)
   */
  toggleSeleccion(originalClave: string, candidato: MiniBalanceHomologoCand | null) {
    const actual = this.selecciones.get(originalClave);

    // Si ya estaba seleccionado este mismo candidato, deseleccionar (volver a null = default)
    if (actual && candidato && this.sonIguales(actual, candidato)) {
      this.selecciones.delete(originalClave);
    } else {
      // Si no, seleccionar este candidato
      this.selecciones.set(originalClave, candidato);
    }

    this.emitSelectionCount();
    this.cdRef.markForCheck();
  }

  private isSugerenciaTopVisible(item: SugerenciaHomologoItem): boolean {
    const topCandidate = item?.mejores?.[0];
    if (!topCandidate) return false;
    const cantidadSugerida = item.originalCantidad * this.toNumber(topCandidate.factor);
    return this.candidatoSatisfaceRequimiento(topCandidate.sustituto || '', cantidadSugerida);
  }

  getTotalElegibles(): number {
    return this.sugerencias.filter(s => this.isSugerenciaTopVisible(s)).length;
  }

  areAllTopSelected(): boolean {
    const elegibles = this.sugerencias.filter(s => this.isSugerenciaTopVisible(s));
    if (!elegibles.length) return false;
    return elegibles.every(item => {
      const topCandidate = item.mejores?.[0] ?? null;
      return this.isSeleccionado(item.originalClave, topCandidate);
    });
  }

  toggleElegirTodas() {
    const elegibles = this.sugerencias.filter(s => this.isSugerenciaTopVisible(s));
    if (!elegibles.length) return;

    if (this.areAllTopSelected()) {
      for (const item of elegibles) {
        this.selecciones.delete(item.originalClave);
      }
      this.emitSelectionCount();
      this.cdRef.markForCheck();
      return;
    }

    for (const item of elegibles) {
      const topCandidate = item.mejores?.[0] ?? null;
      if (topCandidate) {
        this.selecciones.set(item.originalClave, topCandidate);
      }
    }
    this.emitSelectionCount();
    this.cdRef.markForCheck();
  }

  /**
   * Verifica si un candidato está seleccionado para este artículo
   */
  isSeleccionado(originalClave: string, candidato: MiniBalanceHomologoCand | null): boolean {
    const seleccionado = this.selecciones.get(originalClave);

    // Si no hay selección explícita (null/undefined), usar el topCandidate por defecto
    if (!seleccionado) {
      // El topCandidate es la primera opción por defecto
      // Estamos preguntando si este candidato es el seleccionado
      // Necesitamos saber cuál es el topCandidate para comparar
      return false; // No está seleccionado explícitamente
    }

    // Si hay selección, comparar
    return this.sonIguales(seleccionado, candidato);
  }

  /**
   * Verifica si hay alguna selección activa para este artículo
   * (da igual si es TOP o ALT, lo importante es que cambió del default)
   */
  isAnySelectionActive(originalClave: string): boolean {
    return this.selecciones.get(originalClave) !== undefined;
  }

  /**
   * Compara dos candidatos por sustituto (clave)
   */
  private sonIguales(a: MiniBalanceHomologoCand | null, b: MiniBalanceHomologoCand | null): boolean {
    if (!a || !b) return false;
    return (a.sustituto ?? '').toUpperCase() === (b.sustituto ?? '').toUpperCase();
  }

  /**
   * Obtiene el candidato final para un articulo (solo seleccionado explicitamente)
   */
  getCandidatoFinal(item: SugerenciaHomologoItem): MiniBalanceHomologoCand | null {
    return this.selecciones.get(item.originalClave) ?? null;
  }

  /**
   * Retorna solo homologaciones seleccionadas por el usuario
   * Incluye referencia a la clave original para facilitar el matching en el padre
   * Returns: { originalClave, articulo }[]
   */
  getSeleccionesFinales(): Array<{ originalClave: string; articulo: ArticuloSolicitud }> {
    const articulos: Array<{ originalClave: string; articulo: ArticuloSolicitud }> = [];

    for (const sugerencia of this.sugerencias) {
      const candidatoFinal = this.getCandidatoFinal(sugerencia);
      if (!candidatoFinal) continue;

      // Articulo con sugerencia (usamos el candidato final seleccionado)
      const nuevaCantidad = Math.round(
        sugerencia.originalCantidad * this.toNumber(candidatoFinal.factor)
      );

      const art = new ArticuloSolicitud();
      art.clave = candidatoFinal.sustituto;
      art.cantidad = nuevaCantidad;
      art.descripcion = this.getDescripcionArticulo(candidatoFinal.sustituto);
      art.presentacion = this.getUnidadArticulo(candidatoFinal.sustituto);
      art.unidadMedida = this.getUnidadArticulo(candidatoFinal.sustituto);
      art.cpm = 0; // Se obtendra despues en autocompletarDatos()
      art.observaciones = `Reemplazo de ${sugerencia.originalClave}.`;

      articulos.push({
        originalClave: sugerencia.originalClave,
        articulo: art
      });
    }

    return articulos;
  }

  getSeleccionesCount(): number {
    return this.getSeleccionesFinales().length;
  }

  private emitSelectionCount() {
    this.selectionCountChange.emit(this.getSeleccionesCount());
  }

  /**
   * Emite reemplazo (DEPRECATED - mantener para compatibilidad temporal)
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

  private normClave(clave: string): string {
    return this.inventarioService.normalizarClave(clave || '');
  }

  isClaveDuplicadaEnLista(originalClave: string, candidataClave: string): boolean {
    const candidataNorm = this.normClave(candidataClave);
    const originalNorm = this.normClave(originalClave);
    if (!candidataNorm || candidataNorm === originalNorm) return false;
    const existing = new Set((this.existingClaves || []).map(c => this.normClave(c)));
    return existing.has(candidataNorm);
  }
}

