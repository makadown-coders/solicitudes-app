// src/app/core/loader/loader.service.ts
import { Injectable, signal, computed } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoaderService {
  private inFlight = signal(0);

  // control de visibilidad con anti-flicker
  private _visible = signal(false);
  private showTimer: any = null;
  private hideTimer: any = null;

  // ajustes (tunea a tu gusto)
  private showDelayMs = 150;   // no muestres si termina muy rápido
  private minShowMs  = 400;    // si mostró, sostén un poco para evitar parpadeo

  // público (para componentes)
  readonly isLoading = computed(() => this._visible());

  inc() {
    if (this.inFlight() === 0) this.scheduleShow();
    this.inFlight.update(v => v + 1);
  }

  dec() {
    this.inFlight.update(v => Math.max(0, v - 1));
    if (this.inFlight() === 0) this.scheduleHide();
  }

  /** Permite saber si hay peticiones aunque el overlay aún no se muestre */
  readonly hasInFlight = computed(() => this.inFlight() > 0);

  // --- timers ---
  private scheduleShow() {
    clearTimeout(this.hideTimer);
    clearTimeout(this.showTimer);
    this.showTimer = setTimeout(() => {
      this._visible.set(true);
      // programa una "ventana mínima" de visibilidad
      this.hideTimer = setTimeout(() => {
        // nada: esto solo define el earliest-hide
      }, this.minShowMs);
    }, this.showDelayMs);
  }

  private scheduleHide() {
    // si todavía no alcanzamos minShowMs, espera a que el hideTimer expire
    const tryHide = () => {
      clearTimeout(this.showTimer);
      if (!this.hasInFlight()) this._visible.set(false);
    };

    if (this._visible()) {
      // ya visible → respeta minShowMs
      // si hideTimer ya expiró, oculta ya; si no, espera a su final
      if (this.hideTimer == null) {
        tryHide();
      } else {
        const leftover = 50; // colchón
        setTimeout(() => tryHide(), leftover);
      }
    } else {
      // nunca se mostró (terminó muy rápido)
      clearTimeout(this.showTimer);
      this._visible.set(false);
    }
  }
}
