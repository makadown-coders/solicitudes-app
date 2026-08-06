import { Injectable, Renderer2, RendererFactory2 } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private renderer: Renderer2;
  private readonly localStorageKey = 'theme';

  constructor(rendererFactory: RendererFactory2) {
    this.renderer = rendererFactory.createRenderer(null, null);
    this.enforceLightTheme();
  }

  private enforceLightTheme(): void {
    if (typeof document !== 'undefined') {
      this.renderer.removeClass(document.documentElement, 'dark');
      this.renderer.setStyle(document.documentElement, 'color-scheme', 'light');
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.localStorageKey, 'light');
    }
  }
}
