import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Check, LucideAngularModule, Minus, Plus, ShoppingBasket } from 'lucide-angular';
import { SandboxArticulo } from '../../solicitud-unidad-sandbox.models';

@Component({
  selector: 'app-resultados-insumos-sandbox',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './resultados-insumos.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultadosInsumosSandboxComponent {
  @Input({ required: true }) articulos: SandboxArticulo[] = [];
  @Input() claveAgregada = '';
  @Output() agregar = new EventEmitter<{ articulo: SandboxArticulo; cantidad: number }>();

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

  agregarArticulo(articulo: SandboxArticulo): void {
    this.agregar.emit({ articulo, cantidad: this.cantidad(articulo.clave) });
  }
}
