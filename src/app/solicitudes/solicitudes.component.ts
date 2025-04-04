import { ArticuloSolicitud } from '../models/articulo-solicitud';
import { Component, OnInit, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import initSqlJs, { Database } from 'sql.js';
import { debounceTime, Subject } from 'rxjs';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-solicitudes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './solicitudes.component.html'
})
export class SolicitudesComponent implements OnInit {
  articulosSolicitados: ArticuloSolicitud[] = [];
  db!: Database;

  claveInput = '';
  descripcionInput = '';
  unidadInput = '';
  cantidadInput!: number;

  autocompleteResults: any[] = [];
  moreResults = false;
  totalResults = 0;

  selectedIndex = -1;

  private searchSubject = new Subject<string>();

  @ViewChildren('resultItem') resultItems!: QueryList<ElementRef>;

  async ngOnInit() {
    const guardados = localStorage.getItem('articulosSolicitados');
    if (guardados) {
      this.articulosSolicitados = JSON.parse(guardados);
    }
    
    const SQL = await initSqlJs({
      locateFile: () => 'https://sql.js.org/dist/sql-wasm.wasm'
    });

    const dbData = await fetch('/data/articulos.sqlite').then(res => res.arrayBuffer());
    this.db = new SQL.Database(new Uint8Array(dbData));

    this.searchSubject.pipe(debounceTime(1000)).subscribe(texto => {
      if (texto.length > 2) {
        this.buscarEnDB(texto);
      } else {
        this.autocompleteResults = [];
        this.selectedIndex = -1;
        this.moreResults = false;
        this.totalResults = 0;
      }
    });
  }

  onClaveInput() {
    this.searchSubject.next(this.claveInput.trim());
  }

  buscarEnDB(texto: string) {
    const stmt = this.db.prepare(`
      SELECT clave, descripcion, presentacion FROM ARTICULOS
      WHERE clave LIKE $texto OR descripcion LIKE $texto
      LIMIT 13
    `);

    const textoLike = `%${texto}%`;
    stmt.bind({ $texto: textoLike });

    const results: any[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push(row);
    }
    stmt.free();

    this.moreResults = results.length > 12;
    this.totalResults = results.length;
    this.autocompleteResults = results.slice(0, 12);

    // Inicializa selección automática en primer elemento
    this.selectedIndex = 0;
    setTimeout(() => this.focusSelectedItem(), 0);
  }

  selectArticulo(item: any) {
    this.claveInput = item.clave;
    this.descripcionInput = item.descripcion;
    this.unidadInput = item.presentacion;
    this.autocompleteResults = [];
    this.selectedIndex = -1;
  }

  onInputKeyDown(event: KeyboardEvent) {
    if (!this.autocompleteResults.length) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectedIndex = (this.selectedIndex + 1) % this.autocompleteResults.length;
        this.focusSelectedItem();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.selectedIndex =
          (this.selectedIndex - 1 + this.autocompleteResults.length) % this.autocompleteResults.length;
        this.focusSelectedItem();
        break;
      case 'Enter':
        event.preventDefault();
        if (this.autocompleteResults[this.selectedIndex]) {
          this.selectArticulo(this.autocompleteResults[this.selectedIndex]);
        }
        break;
      case 'Escape':
        this.autocompleteResults = [];
        this.selectedIndex = -1;
        break;
    }
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

  agregarArticulo() {
    if (this.claveInput && this.descripcionInput && this.unidadInput && this.cantidadInput > 0) {
      this.articulosSolicitados.push({
        clave: this.claveInput,
        descripcion: this.descripcionInput,
        unidadMedida: this.unidadInput,
        cantidad: this.cantidadInput
      });

      // Guarda en LocalStorage
      localStorage.setItem('articulosSolicitados', JSON.stringify(this.articulosSolicitados));

      // Limpia inputs para siguiente captura
      this.claveInput = '';
      this.descripcionInput = '';
      this.unidadInput = '';
      this.cantidadInput = 0;
    }
  }

}
