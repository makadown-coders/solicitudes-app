// src/app/shared/abstract-tab.component.ts
import { Directive, Input, OnChanges, SimpleChanges } from '@angular/core';

@Directive()
export abstract class AbstractTabComponent implements OnChanges {
  @Input() isActive: boolean = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isActive'] && !changes['isActive'].firstChange) {
      if (this.isActive) {
        this.onTabActivated();
      } else {
        this.onTabDeactivated();
      }
    }
  }

  // Métodos abstractos: obligan a los hijos a implementarlos
  protected abstract onTabActivated(): void;
  protected abstract onTabDeactivated(): void;
}