import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NgFastToastComponent } from 'ng-fast-toast';
import { LoaderOverlayComponent } from './core/loader/loader-overlay.component';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NgFastToastComponent, LoaderOverlayComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  private readonly themeService = inject(ThemeService);
  title = 'solicitudes-app';
  readonly showLegacyOsWarning = this.isLegacyOs();

  private isLegacyOs(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';

    // Windows 7/8/8.1 -> NT 6.1 / 6.2 / 6.3
    return /Windows NT 6\.(1|2|3)/i.test(ua);
  }
}
