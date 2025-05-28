import { Injectable, Renderer2, RendererFactory2 } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private renderer: Renderer2;
  private localStorageKey = 'theme'; // Clave para guardar en localStorage

  constructor(rendererFactory: RendererFactory2) {
    this.renderer = rendererFactory.createRenderer(null, null);
    this.initTheme(); // Inicializa el tema al cargar la aplicación
  }

  private initTheme(): void {
    const savedTheme = localStorage.getItem(this.localStorageKey);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme) {
      this.setTheme(savedTheme === 'dark');
    } else {
      this.setTheme(prefersDark); // Usa la preferencia del sistema por defecto
    }
  }

  private setTheme(isDarkMode: boolean): void {
    if (isDarkMode) {
      this.renderer.addClass(document.documentElement, 'dark'); // Añade la clase 'dark' al <html>
      localStorage.setItem(this.localStorageKey, 'dark');
    } else {
      this.renderer.removeClass(document.documentElement, 'dark'); // Elimina la clase 'dark'
      localStorage.setItem(this.localStorageKey, 'light');
    }
  }

  toggleTheme(): void {
    const isDarkMode = document.documentElement.classList.contains('dark');
    this.setTheme(!isDarkMode);
  }

  isDarkMode(): boolean {
    return document.documentElement.classList.contains('dark');
  }
}