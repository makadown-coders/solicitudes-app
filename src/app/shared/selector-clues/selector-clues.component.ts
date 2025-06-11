import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Unidad } from '../../models/articulo-solicitud';
import { unidadesData } from '../../models/unidadesData';


@Component({
  selector: 'app-selector-clues',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './selector-clues.component.html',
})
export class SelectorCluesComponent implements OnInit {
  listaClues: Unidad[] = unidadesData;
  @Output() cluesSeleccionado = new EventEmitter<Unidad>();

  textoBusqueda: string = '';
  coincidencias: Unidad[] = [];
  seleccionado: Unidad | null = null;

  ngOnInit(): void {
    console.log(this.listaClues);
  }

  buscar(): void {
    const termino = this.textoBusqueda.toLowerCase();
    this.coincidencias = this.listaClues.filter(c =>
      c.cluesssa.toLowerCase().includes(termino) ||
      c.cluesimb.toLowerCase().includes(termino) ||
      c.nombre.toLowerCase().includes(termino)
    );
  }

  seleccionar(clues: Unidad): void {
    this.seleccionado = clues;
    this.coincidencias = [];
    this.textoBusqueda = clues.nombre;
    this.cluesSeleccionado.emit(clues);
  }
}
