import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, OnInit, inject, ChangeDetectionStrategy, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MiniBalanceHomologoCand } from '../../../services/homologos-solicitud.service';
import { InventarioDisponibles } from '../../../models/Inventario';
import { ArticulosService } from '../../../services/articulos.service';
import { InventarioService } from '../../../services/inventario.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-homologo-sugerencia-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './homologo-sugerencia-modal.component.html',
  styleUrls: ['./homologo-sugerencia-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomologoSugerenciaModalComponent implements OnInit {
  @Input() originalClave: string = '';
  @Input() originalCantidad: number = 0;
  @Input() originalDescripcion: string = '';
  @Input() topCandidates: MiniBalanceHomologoCand[] = [];
  @Input() inventarioDisponible: InventarioDisponibles[] = [];

  @Output() reemplazar = new EventEmitter<MiniBalanceHomologoCand>();
  @Output() mantener = new EventEmitter<void>();
  @Output() verDetalles = new EventEmitter<MiniBalanceHomologoCand[]>();
  @Output() noSugerirMas = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  private articulosService = inject(ArticulosService);
  private inventarioService = inject(InventarioService);

  private artMap = new Map<string, { descripcion: string; presentacion?: string; categoria?: string | null }>();
  private artMapLoaded = false;

  private cdRef = inject(ChangeDetectorRef);

  // Existencias de la clave original
  originalExistencias: { AZM: number; AZT: number; AZE: number } = { AZM: 0, AZT: 0, AZE: 0 };

  // UI state
  mostrarDetalles = false;
  autoCloseSeconds = 10;
  private autoCloseTimer: any;
  noSugerirMasChecked = false;

  // Descripciones de artículos (caché local)
  descriptionCache = new Map<string, string>();

  constructor() {
  }

  ngOnInit() {
    // this.startAutoClose(); // Desactivado: usuario respira sin presión de tiempo
    this.loadArtMapIfNeeded();
    this.calcularExistenciasOriginales();
  }

  ngOnDestroy() {
    this.clearAutoCloseTimer();
  }

  private async loadArtMapIfNeeded() {
    if (this.artMapLoaded) return;
    const mapa = await firstValueFrom(this.articulosService.getArticulosMapa());
    this.artMap = new Map<string, any>(Object.entries(mapa));
    this.artMapLoaded = true;
    setTimeout(() => this.cdRef.markForCheck()); // Forzar actualización después de cargar el mapa
  }

  /**
   * Calcula las existencias de la clave original en los 3 almacenes
   */
  private calcularExistenciasOriginales() {
    const claveNorm = this.inventarioService.normalizarClave(this.originalClave);
    if (!claveNorm || !this.inventarioDisponible?.length) {
      this.originalExistencias = { AZM: 0, AZT: 0, AZE: 0 };
      return;
    }

    // Sumar existencias por almacén para la clave original
    let azm = 0, azt = 0, aze = 0;
    for (const item of this.inventarioDisponible) {
      const itemNorm = this.inventarioService.normalizarClave(item.clave);
      if (itemNorm === claveNorm) {
        azm += item.existenciasAZM ?? 0;
        azt += item.existenciasAZT ?? 0;
        aze += item.existenciasAZE ?? 0;
      }
    }

    this.originalExistencias = { AZM: azm, AZT: azt, AZE: aze };
    this.cdRef.markForCheck();
  }

  /**
   * Inicia autocerrado en 10 segundos (si no hay interacción)
   */
  private startAutoClose() {
    const resetTimer = () => {
      this.clearAutoCloseTimer();
      this.autoCloseTimer = setTimeout(() => {
        if (!this.mostrarDetalles) {  // Solo si el usuario no está interactuando
          this.onMantener();
        }
      }, this.autoCloseSeconds * 1000);
    };

    // Resetear timer en cualquier interacción del usuario
    document.addEventListener('click', resetTimer);
    document.addEventListener('mousemove', resetTimer);

    resetTimer();
  }

  private clearAutoCloseTimer() {
    if (this.autoCloseTimer) clearTimeout(this.autoCloseTimer);
  }

  /**
   * Obtiene descripción de un artículo (desde caché o vacío)
   */
  getDescription(clave: string): string {
    const norm = this.inventarioService.normalizarClave(clave);
    return this.descriptionCache.get(norm) ?? 'Sin descripción';
  }

  /**
   * Emite reemplazo por homólogo TOP
   */
  onReemplazar() {
    if (this.topCandidates.length > 0) {
      if (this.noSugerirMasChecked) {
        this.noSugerirMas.emit();
      }
      this.reemplazar.emit(this.topCandidates[0]);
      this.close.emit();
    }
  }

  /**
   * Mantiene el artículo original
   */
  onMantener() {
    if (this.noSugerirMasChecked) {
      this.noSugerirMas.emit();
    }
    this.mantener.emit();
    this.close.emit();
  }

  /**
   * Muestra detalles de todas las opciones
   */
  onVerDetalles() {
    this.verDetalles.emit(this.topCandidates);
    this.mostrarDetalles = true;
  }

  /**
   * Retorna descripción corta (máx 50 caracteres)
   */
  getShortDescription(desc: string, maxLength = 50): string {
    if (!desc) return '—';
    return desc.length > maxLength ? desc.substring(0, maxLength) + '…' : desc;
  }

  getDescripcionArticulo(clave: string): string {
    return this.artMap.get(clave)?.descripcion || '';
  }

  getUnidadArticulo(clave: string): string {
    return this.artMap.get(clave)?.presentacion || '';
  }

  /**
   * Formatea número de existencia
   */
  fmt(n: number): string {
    return (n ?? 0).toLocaleString('es-MX');
  }

  /**
   * Cierra el modal
   */
  onClose() {
    this.close.emit();
  }
}
