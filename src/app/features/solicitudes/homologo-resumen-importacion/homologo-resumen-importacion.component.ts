import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { HomologosTablaComponent } from '../homologos-tabla/homologos-tabla.component';
import { SugerenciaHomologoItem } from '../../../services/homologos-solicitud.service';
import { InventarioDisponibles } from '../../../models/Inventario';
import { ArticuloSolicitud } from '../../../models/articulo-solicitud';

@Component({
  selector: 'app-homologo-resumen-importacion',
  standalone: true,
  imports: [CommonModule, HomologosTablaComponent],
  templateUrl: './homologo-resumen-importacion.component.html',
  styleUrls: ['./homologo-resumen-importacion.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomologoResumenImportacionComponent {
  @Input() sugerencias: SugerenciaHomologoItem[] = [];
  @Input() totalImportados: number = 0;
  @Input() inventarioDisponible: InventarioDisponibles[] = [];
  @Input() existingClaves: string[] = [];
  @Input() origen: 'importacion' | 'modales' = 'importacion';

  @Output() reemplazarTodos = new EventEmitter<Array<{ originalClave: string; articulo: ArticuloSolicitud }>>();
  @Output() personalizarSeleccion = new EventEmitter<SugerenciaHomologoItem[]>();
  @Output() ignorar = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  @ViewChild(HomologosTablaComponent) homologosTablaRef!: HomologosTablaComponent;

  // UI state
  mostrarDetalles = false;
  selectedCount = 0;

  /**
   * Emite reemplazo de todos los TOP candidatos (DEPRECATED)
   * Mantener para compatibilidad temporal
   */
  onReemplazarTodos() {
    // Crear resultado con formato { originalClave, articulo }
    const resultado: Array<{ originalClave: string; articulo: ArticuloSolicitud }> = this.sugerencias.map(sug => {
      const topCandidate = sug.mejores[0];
      const nuevaCantidad = Math.round(
        sug.originalCantidad * Number(topCandidate.factor)
      );

      const art = new ArticuloSolicitud();
      art.clave = topCandidate.sustituto;
      art.cantidad = nuevaCantidad;
      art.descripcion = sug.originalDescripcion || '';
      art.presentacion = '';
      art.unidadMedida = '';
      art.cpm = 0;
      art.observaciones = '';

      return {
        originalClave: sug.originalClave,
        articulo: art
      };
    });

    this.reemplazarTodos.emit(resultado);
    this.close.emit();
  }

  /**
   * Confirma las selecciones realizadas en la tabla y cierra el modal
   * Obtiene las selecciones finales del componente hijo
   */
  confirmarSeleccion() {
    if (!this.homologosTablaRef) return;

    // Obtener las selecciones finales del componente hijo (incluye originalClave para matching)
    const seleccionesFinales = this.homologosTablaRef.getSeleccionesFinales();

    // Emitir resultado al abuelo (SolicitudesComponent) - ya vienen en formato { originalClave, articulo }
    this.reemplazarTodos.emit(seleccionesFinales);

    // Cerrar modal
    this.close.emit();
  }

  onSelectionCountChange(count: number) {
    this.selectedCount = count ?? 0;
  }

  /**
   * Muestra tabla para personalizar selección
   */
  onPersonalizarSeleccion() {
    this.mostrarDetalles = true;
  }

  /**
   * Ignora sugerencias y continúa
   */
  onIgnorar() {
    this.ignorar.emit();
    this.close.emit();
  }

  /**
   * Calcula los artículos sin sugerencias
   */
  get sinSugerencias(): number {
    return Math.max(0, this.totalImportados - this.sugerencias.length);
  }

  get tituloPrincipal(): string {
    return this.origen === 'modales'
      ? 'Carga por CPM/KIT completada'
      : 'Importacion completada';
  }

  get subtituloPrincipal(): string {
    return this.origen === 'modales'
      ? 'Se agregaron claves desde CPM/KIT a tu solicitud'
      : 'Se cargaron correctamente tus articulos solicitados';
  }

  get etiquetaTotal(): string {
    return this.origen === 'modales' ? 'Claves agregadas' : 'Claves importadas';
  }

  get tituloDesglose(): string {
    return this.origen === 'modales'
      ? 'Desglose de la carga por CPM/KIT:'
      : 'Desglose de importacion:';
  }

  get tituloTablaDetalle(): string {
    return this.origen === 'modales'
      ? 'Revisar oportunidades de CPM/KIT'
      : 'Revisar oportunidades de importacion';
  }

  get tituloTablaAlternativas(): string {
    return this.origen === 'modales'
      ? 'Alternativas disponibles para CPM/KIT'
      : 'Alternativas disponibles para importacion';
  }
}
