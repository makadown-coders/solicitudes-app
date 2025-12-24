// src/app/core/loader/loader-overlay.component.ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoaderService } from '../../services/loader.service';

@Component({
  selector: 'app-loader-overlay',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div *ngIf="visible()" class="z-[9999] fixed inset-0 grid place-items-center bg-black/35 backdrop-blur-[1px]">
    <div class="flex items-center gap-3 px-5 py-4 bg-white rounded-2xl border-gray-200 shadow-xl border">
      <svg class="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" opacity="0.2"/>
        <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
      </svg>
      <span class="text-sm font-medium text-gray-700">{{ customMessage() }} </span>
    </div>
  </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoaderOverlayComponent {
  private loader = inject(LoaderService);
  // agregar un mensaje customizado si hay que hacerlo
  customMessage = computed(() => this.loader.customMessage());

  visible = computed(() => this.loader.isLoading());
}
