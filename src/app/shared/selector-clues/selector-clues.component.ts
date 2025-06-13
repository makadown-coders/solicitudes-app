import { Component, ElementRef, EventEmitter, Input, OnInit, Output, QueryList, ViewChildren } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Unidad } from '../../models/articulo-solicitud';
import { unidadesData } from '../../models/unidadesData';
import { StorageVariables } from '../storage-variables';
import { HospitalIcon, LucideAngularModule } from 'lucide-angular';


@Component({
  selector: 'app-selector-clues',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, FormsModule],
  templateUrl: './selector-clues.component.html',
})
export class SelectorCluesComponent implements OnInit {
  readonly HospitalIcon = HospitalIcon;
  listaClues: Unidad[] = unidadesData;
  @ViewChildren('resultItem') resultItems!: QueryList<ElementRef>;
  @Output() cluesSeleccionado = new EventEmitter<Unidad>();
  selectedIndex = -1;

  textoBusqueda: string = '';
  coincidencias: Unidad[] = [];
  seleccionado: Unidad | null = null;

  ngOnInit(): void {
    const unidadGuardada = localStorage.getItem(StorageVariables.POC_FE_SMI_SG_SELECTED_CLUES);
    if (unidadGuardada) {
      const unidad: Unidad = JSON.parse(unidadGuardada);
      this.seleccionado = unidad;
      this.textoBusqueda = unidad.nombre;
      this.cluesSeleccionado.emit(unidad);
    }
  }

  buscar(): void {
    /* if (this.textoBusqueda.length < 3) {
       this.coincidencias = [];
       this.selectedIndex = 0;
       return;
     }*/

    const termino = this.textoBusqueda.toLowerCase();
    this.coincidencias = this.listaClues.filter(c =>
      c.cluesssa.toLowerCase().includes(termino) ||
      c.cluesimb.toLowerCase().includes(termino) ||
      c.nombre.toLowerCase().includes(termino)
    ); //.slice(0, 12);
  }

  focusSelectedItem() {
    const itemsArray = this.resultItems.toArray();
    if (itemsArray[this.selectedIndex]) {
      itemsArray[this.selectedIndex].nativeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }

  seleccionar(clues: Unidad): void {
    this.seleccionado = clues;
    this.textoBusqueda = clues.nombre;
    this.coincidencias = [];

    localStorage.setItem(StorageVariables.POC_FE_SMI_SG_SELECTED_CLUES, JSON.stringify(clues));
    this.cluesSeleccionado.emit(clues);
  }

  onUnidadKeyDown(event: KeyboardEvent) {
    const len = this.coincidencias.length;

    if (event.key === 'ArrowDown') {
      if (this.textoBusqueda === '' && this.selectedIndex === -1 && len === 0) {
        this.buscar();
        this.selectedIndex = 0;
        event.preventDefault();
        return;
      }
      this.selectedIndex = (this.selectedIndex + 1) % len;
      event.preventDefault();
      this.focusSelectedItem();
    }

    if (event.key === 'ArrowUp') {
      this.selectedIndex = (this.selectedIndex - 1 + len) % len;
      event.preventDefault();
      this.focusSelectedItem();
    }

    if (event.key === 'Enter' && this.selectedIndex >= 0) {
      this.seleccionar(this.coincidencias[this.selectedIndex]);
      event.preventDefault();
    }
  }
}
