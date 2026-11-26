import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  Input,
  OnChanges,
  Output,
  signal,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Building2, ChevronDown, LucideAngularModule, X } from 'lucide-angular';
import { RhUnidadAutorizada } from '../../../services/rh.service';

export interface RhUnidadSearchable extends RhUnidadAutorizada {
  cluessa?: string | null;
}

function normalizeSearchText(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

@Component({
  selector: 'app-rh-unidad-autocomplete',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative w-full">
      <div class="relative">
        <input
          #triggerInput
          type="text"
          role="combobox"
          [attr.aria-label]="ariaLabel"
          [attr.aria-expanded]="isOpen()"
          aria-autocomplete="list"
          [disabled]="disabled"
          [placeholder]="placeholder"
          [ngModel]="queryText()"
          (ngModelChange)="onQueryChange($event)"
          (focus)="openDropdown()"
          (keydown)="onKeyDown($event)"
          [ngClass]="
            compact
              ? 'w-full rounded-lg border border-gray-300 bg-white py-1 pr-12 pl-2.5 text-[11px] text-slate-900 placeholder:text-slate-400 focus:border-[#006341] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#006341]/30 disabled:cursor-not-allowed disabled:opacity-50'
              : 'w-full rounded-xl border border-gray-300 bg-white py-2 pr-14 pl-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#006341] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#006341]/30 disabled:cursor-not-allowed disabled:opacity-50'
          "
        />

        <div class="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-0.5">
          @if (selectedId !== null && !disabled) {
            <button
              type="button"
              (click)="clearSelection($event)"
              aria-label="Limpiar unidad seleccionada"
              class="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <lucide-icon [img]="icons.clear" class="h-3.5 w-3.5" aria-hidden="true"></lucide-icon>
            </button>
          }
          <button
            type="button"
            [disabled]="disabled"
            (click)="toggleDropdown($event)"
            aria-label="Mostrar opciones de unidad"
            class="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <lucide-icon [img]="icons.chevron" class="h-3.5 w-3.5" aria-hidden="true"></lucide-icon>
          </button>
        </div>
      </div>

      @if (isOpen()) {
        <div
          role="listbox"
          [style.position]="'fixed'"
          [style.top.px]="panelTop()"
          [style.left.px]="panelLeft()"
          [style.width.px]="panelWidth()"
          class="z-50 max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
        >
          @if (allowAllOption) {
            <button
              type="button"
              role="option"
              [attr.aria-selected]="selectedId === null"
              (mousedown)="selectOption(null, $event)"
              class="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-xs transition"
              [ngClass]="
                highlightedIndex() === -1
                  ? 'bg-emerald-50 text-emerald-900'
                  : 'text-slate-700 hover:bg-slate-50'
              "
            >
              <span class="font-semibold">{{ allOptionLabel }}</span>
            </button>
          }

          @for (u of filteredUnidades(); track u.id; let idx = $index) {
            <button
              type="button"
              role="option"
              [attr.aria-selected]="selectedId === u.id"
              (mousedown)="selectOption(u, $event)"
              class="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-xs transition"
              [ngClass]="
                highlightedIndex() === idx
                  ? 'bg-emerald-50 text-emerald-900'
                  : selectedId === u.id
                  ? 'bg-slate-50 font-semibold text-slate-900'
                  : 'text-slate-700 hover:bg-slate-50'
              "
            >
              <span class="truncate">{{ u.nombre }}</span>
              <span class="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                {{ formatCluesBadge(u) }}
              </span>
            </button>
          } @empty {
            <div class="px-3 py-2.5 text-center text-xs text-slate-500">
              Sin unidades coincidentes.
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class RhUnidadAutocompleteComponent implements OnChanges {
  private readonly hostEl = inject(ElementRef<HTMLElement>);

  @ViewChild('triggerInput') triggerInput?: ElementRef<HTMLInputElement>;

  @Input() unidades: RhUnidadSearchable[] = [];
  @Input() selectedId: number | null = null;
  @Input() allowAllOption = false;
  @Input() allOptionLabel = 'Todas las unidades';
  @Input() placeholder = 'Buscar unidad por nombre o CLUES...';
  @Input() ariaLabel = 'Seleccionar unidad médica o administrativa';
  @Input() disabled = false;
  @Input() compact = false;

  @Output() selectedIdChange = new EventEmitter<number | null>();

  readonly icons = {
    building: Building2,
    chevron: ChevronDown,
    clear: X,
  };

  private readonly unidadesSig = signal<RhUnidadSearchable[]>([]);
  readonly queryText = signal<string>('');
  readonly isOpen = signal<boolean>(false);
  readonly highlightedIndex = signal<number>(0);

  // Coordenadas fixed para evitar clipping dentro de contenedores con overflow
  readonly panelTop = signal<number>(0);
  readonly panelLeft = signal<number>(0);
  readonly panelWidth = signal<number>(280);

  readonly filteredUnidades = computed<RhUnidadSearchable[]>(() => {
    const q = normalizeSearchText(this.queryText());
    const all = this.unidadesSig();
    if (!q) {
      return all.slice(0, 30);
    }
    return all
      .filter((u) => {
        const nom = normalizeSearchText(u.nombre);
        const imb = normalizeSearchText(u.cluesimb);
        const ssa = normalizeSearchText(u.cluessa);
        return nom.includes(q) || imb.includes(q) || ssa.includes(q);
      })
      .slice(0, 30);
  });

  ngOnChanges(changes: SimpleChanges): void {
    if ('unidades' in changes) {
      this.unidadesSig.set(Array.isArray(this.unidades) ? this.unidades : []);
    }
    if ('selectedId' in changes || 'unidades' in changes) {
      this.syncQueryFromSelectedId();
    }
  }

  private syncQueryFromSelectedId(): void {
    if (this.selectedId === null || this.selectedId === undefined) {
      if (!this.isOpen()) {
        this.queryText.set('');
      }
      return;
    }
    const found = this.unidadesSig().find((u) => u.id === this.selectedId);
    if (found) {
      this.queryText.set(found.nombre);
    }
  }

  formatCluesBadge(u: RhUnidadSearchable): string {
    const imb = (u.cluesimb ?? '').trim().toUpperCase();
    if (imb && imb !== 'N/A') return imb;
    const ssa = (u.cluessa ?? '').trim().toUpperCase();
    if (ssa && ssa !== 'N/A') return ssa;
    return 'N/A';
  }

  private updatePanelPosition(): void {
    const el = this.triggerInput?.nativeElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedHeight = 240;
    const openAbove = spaceBelow < estimatedHeight && rect.top > estimatedHeight;
    this.panelTop.set(openAbove ? Math.max(8, rect.top - estimatedHeight - 4) : rect.bottom + 4);
    this.panelLeft.set(Math.max(8, rect.left));
    this.panelWidth.set(Math.max(220, rect.width));
  }

  openDropdown(): void {
    if (this.disabled) return;
    this.updatePanelPosition();
    this.isOpen.set(true);
    this.highlightedIndex.set(this.allowAllOption ? -1 : 0);
  }

  toggleDropdown(event: MouseEvent): void {
    event.stopPropagation();
    if (this.disabled) return;
    if (this.isOpen()) {
      this.closeDropdown();
    } else {
      this.openDropdown();
      this.triggerInput?.nativeElement.focus();
    }
  }

  closeDropdown(): void {
    this.isOpen.set(false);
    this.syncQueryFromSelectedId();
  }

  onQueryChange(value: string): void {
    this.queryText.set(value);
    if (!this.isOpen()) {
      this.openDropdown();
    } else {
      this.updatePanelPosition();
    }
    this.highlightedIndex.set(0);
  }

  selectOption(u: RhUnidadSearchable | null, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (u === null) {
      this.selectedId = null;
      this.queryText.set('');
      this.isOpen.set(false);
      this.selectedIdChange.emit(null);
      return;
    }
    this.selectedId = u.id;
    this.queryText.set(u.nombre);
    this.isOpen.set(false);
    this.selectedIdChange.emit(u.id);
  }

  clearSelection(event: MouseEvent): void {
    event.stopPropagation();
    this.selectOption(null);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (this.disabled) return;
    if (event.key === 'Escape') {
      this.closeDropdown();
      return;
    }
    if (!this.isOpen() && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      this.openDropdown();
      event.preventDefault();
      return;
    }
    if (!this.isOpen()) return;

    const list = this.filteredUnidades();
    const minIdx = this.allowAllOption ? -1 : 0;
    const maxIdx = list.length - 1;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = this.highlightedIndex() + 1;
      this.highlightedIndex.set(next > maxIdx ? minIdx : next);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = this.highlightedIndex() - 1;
      this.highlightedIndex.set(prev < minIdx ? maxIdx : prev);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const idx = this.highlightedIndex();
      if (idx === -1 && this.allowAllOption) {
        this.selectOption(null);
      } else if (idx >= 0 && idx < list.length) {
        this.selectOption(list[idx]);
      }
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.isOpen() && !this.hostEl.nativeElement.contains(event.target as Node)) {
      this.closeDropdown();
    }
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  onViewportChange(): void {
    if (this.isOpen()) {
      this.updatePanelPosition();
    }
  }
}
