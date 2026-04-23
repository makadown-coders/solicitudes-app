// src/app/shared/articulo-autocomplete/articulo-autocomplete.component.ts
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime } from 'rxjs';
import { ArticulosService } from '../../services/articulos.service';

export type ArticuloAutocompleteItem = {
  clave: string;
  descripcion: string;
  unidadMedida?: string;
  presentacion?: string;
};

@Component({
  selector: 'app-articulo-autocomplete',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './articulo-autocomplete.component.html',
  styleUrls: ['./articulo-autocomplete.component.css'],
})
export class ArticuloAutocompleteComponent implements OnInit, OnChanges, OnDestroy {
  private articulosService = inject(ArticulosService);
  private cdr = inject(ChangeDetectorRef);
  private onDestroy$ = new Subject<void>();
  private search$ = new Subject<string>();

  @Input() label = 'Articulo';
  @Input() placeholder = 'Buscar clave o descripcion (min 3)';
  @Input() minChars = 3;
  @Input() model = '';
  @Input() inputId = '';
  @Input() describedBy = '';
  @Input() required = false;
  @Input() invalid = false;
  @Input() ariaLabel = '';

  @Output() modelChange = new EventEmitter<string>();
  @Output() selected = new EventEmitter<ArticuloAutocompleteItem>();

  @ViewChild('inputEl') private inputEl?: ElementRef<HTMLInputElement>;

  inputValue = '';
  results: ArticuloAutocompleteItem[] = [];
  selectedIndex = -1;
  searching = false;

  ngOnInit(): void {
    this.inputValue = this.model ?? '';
    this.search$
      .pipe(debounceTime(350), takeUntil(this.onDestroy$))
      .subscribe((texto) => this.buscarConFallback(texto));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('model' in changes) {
      const next = this.model ?? '';
      if (next !== this.inputValue) {
        this.inputValue = next;
        this.cdr.markForCheck();
      }
    }
  }

  ngOnDestroy(): void {
    this.onDestroy$.next();
    this.onDestroy$.complete();
  }

  focusInput(): void {
    this.inputEl?.nativeElement.focus();
  }

  onInputChange(value: string) {
    this.inputValue = value;
    this.modelChange.emit(value);
    const t = value.trim();
    if (t.length < this.minChars) {
      this.results = [];
      this.selectedIndex = -1;
      this.searching = false;
      this.cdr.markForCheck();
      return;
    }
    this.searching = true;
    this.cdr.markForCheck();
    this.search$.next(t);
  }

  onInputKeyDown(event: KeyboardEvent) {
    if (!this.results.length) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectedIndex = (this.selectedIndex + 1) % this.results.length;
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.selectedIndex = (this.selectedIndex - 1 + this.results.length) % this.results.length;
        break;
      case 'Enter':
        event.preventDefault();
        if (this.selectedIndex >= 0 && this.results[this.selectedIndex]) {
          this.selectItem(this.results[this.selectedIndex]);
        }
        break;
      case 'Escape':
        this.results = [];
        this.selectedIndex = -1;
        break;
    }
  }

  selectItem(item: ArticuloAutocompleteItem) {
    const clave = String(item.clave ?? '').trim().toUpperCase();
    this.inputValue = clave;
    this.modelChange.emit(clave);
    this.selected.emit({
      ...item,
      clave,
      descripcion: String(item.descripcion ?? '').trim(),
    });
    this.results = [];
    this.selectedIndex = -1;
  }

  optionId(index: number): string {
    return `${this.resolvedInputId}-option-${index}`;
  }

  get resolvedInputId(): string {
    return this.inputId || `articulo-autocomplete-${this.label.toLowerCase().replace(/\s+/g, '-')}`;
  }

  get activeDescendant(): string | null {
    if (this.selectedIndex < 0 || !this.results[this.selectedIndex]) return null;
    return this.optionId(this.selectedIndex);
  }

  get listId(): string {
    return `${this.resolvedInputId}-listbox`;
  }

  private buscarConFallback(texto: string) {
    this.articulosService.buscarArticulos(texto).subscribe({
      next: (data) => {
        const rows = (data?.resultados ?? []) as ArticuloAutocompleteItem[];
        this.results = rows.sort((a, b) => String(a.clave).localeCompare(String(b.clave))).slice(0, 24);
        this.selectedIndex = this.results.length ? 0 : -1;
        this.searching = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.articulosService.buscarArticulosv2(texto).subscribe({
          next: (data) => {
            const rows = (data?.resultados ?? []) as ArticuloAutocompleteItem[];
            this.results = rows.sort((a, b) => String(a.clave).localeCompare(String(b.clave))).slice(0, 24);
            this.selectedIndex = this.results.length ? 0 : -1;
            this.searching = false;
            this.cdr.markForCheck();
          },
          error: () => {
            this.results = [];
            this.selectedIndex = -1;
            this.searching = false;
            this.cdr.markForCheck();
          },
        });
      },
    });
  }
}
