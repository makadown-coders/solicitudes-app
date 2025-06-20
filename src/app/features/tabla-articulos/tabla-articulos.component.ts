import { Component, Input, Output, EventEmitter, inject, ChangeDetectorRef, AfterContentChecked, AfterContentInit, OnChanges, SimpleChange, SimpleChanges, Sanitizer, SecurityContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { clasificacionMedicamentosData } from '../../models/clasificacionMedicamentosData';
import { ClasificadorVEN } from '../../models/clasificador-ven';
import { Inventario } from '../../models/Inventario';
import { DomSanitizer } from '@angular/platform-browser';

@Component({
  selector: 'app-tabla-articulos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tabla-articulos.component.html',
})
export class TablaArticulosComponent implements OnChanges {

  @Input() articulosSolicitados: any[] = [];
  @Input() modoEdicionIndex: number | null = null;
  @Input() cantidadTemporal: number = 0;
  @Input() inventario: Inventario[] = [];

  tooltips: string[] = [];

  private cdRef = inject(ChangeDetectorRef);

  @Output() cantidadTemporalChange = new EventEmitter<number>();
  @Output() confirmar = new EventEmitter<number>();
  @Output() cancelar = new EventEmitter<void>();
  @Output() editar = new EventEmitter<number>();
  @Output() eliminar = new EventEmitter<number>();

  activeTooltip: number | null = null;
  currentTooltip: any = null;
  tooltipPosition: { x: number, y: number } = { x: 0, y: 0 };
  sanitizer = inject(DomSanitizer);

  constructor() { }

  // Al actualizar articulosSolicitados, actualizar tooltips}
  ngOnChanges(changes: SimpleChanges) {
    // console.log('ngOnChanges', changes);
    if (changes['articulosSolicitados']) {
      this.actualizarTooltips();
    }
    /*if (changes['inventario'] && this.inventario.length > 0 && this.articulosSolicitados.length > 0) {
      this.actualizarTooltips();
    }*/
  }

  actualizarTooltips() {
    // Por cada articulo solicitado, buscar en inventario y actualizar tooltip.
    // El tooltip va mostrar en que almacen se encuentra el articulo, y cuantos hay, cuantos comprometidos.
    // Es probable que el articulo esté en varios almacenes y varios lotes.
    this.tooltips = [];
    for (let i: number = 0; i < this.articulosSolicitados.length; i++) {
      //const articuloSolicitado = this.articulosSolicitados[i];
      let tooltip = '';

      // TODO: quiza cambiar esto por leyenda sobre que este insumo no es medicamento
      //       cuando la captura de insumos no sea de medicamentos...
     /* if (this.inventario.length > 0) {
        const inventariosConArticulo = this.inventario.filter(inventario => inventario.clave === articuloSolicitado.clave);

        if (inventariosConArticulo.length > 0) {
          const inventario = inventariosConArticulo[0];
          tooltip = `Almacen: ${inventario.almacen}, Disponibles: ${inventario.disponible}, Comprometidos: ${inventario.comprometidos}`;
        }
      }*/
      this.tooltips.push(tooltip);
    }    
    // console.log(this.tooltips);
    this.cdRef.detectChanges();
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

showTooltip(index: number) {
  this.activeTooltip = index;
  this.currentTooltip = this.tooltips[index];
}

hideTooltip() {
  this.activeTooltip = null;
  this.currentTooltip = null;
}

moveTooltip(event: MouseEvent, i: number) {
  if (this.activeTooltip === i) {
    // Ajusta estos valores para cambiar el offset del tooltip
    const offsetX = 15;
    const offsetY = 15;

    this.tooltipPosition = {
      x: event.clientX + offsetX,
      y: event.clientY + offsetY
    };
  }
}

getSafeHtml(html: string) {
  return this.sanitizer.sanitize(SecurityContext.HTML,
    this.sanitizer.bypassSecurityTrustHtml(html));
}
}
