import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Check, LucideAngularModule, Minus, Plus, ShoppingBasket } from 'lucide-angular';
import { NecesidadArticulo } from '../../necesidades-unidad.models';

@Component({
  selector: 'app-resultados-insumos-necesidades',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './resultados-insumos.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultadosInsumosNecesidadesComponent {
  @Input({ required: true }) articulos: NecesidadArticulo[] = [];
  @Input() claveAgregada = '';
  @Output() agregar = new EventEmitter<{ articulo: NecesidadArticulo; cantidad: number }>();

  readonly MinusIcon = Minus;
  readonly PlusIcon = Plus;
  readonly BasketIcon = ShoppingBasket;
  readonly CheckIcon = Check;
  readonly cantidades = signal<Record<string, number>>({});

  cantidad(clave: string): number {
    return this.cantidades()[clave] ?? 1;
  }

  cambiarCantidad(clave: string, valor: unknown): void {
    const numero = Math.max(1, Math.min(99999, Math.trunc(Number(valor) || 1)));
    this.cantidades.update(actual => ({ ...actual, [clave]: numero }));
  }

  ajustar(clave: string, delta: number): void {
    this.cambiarCantidad(clave, this.cantidad(clave) + delta);
  }

  agregarArticulo(articulo: NecesidadArticulo): void {
    this.agregar.emit({ articulo, cantidad: this.cantidad(articulo.clave) });
  }

  descripcionVisible(descripcion: string): string {
    const texto = (descripcion || 'Descripción no disponible').trim();
    return texto.length <= 100 ? texto : `${texto.slice(0, 99).trimEnd()}…`;
  }
}
