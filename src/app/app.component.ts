import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NgFastToastComponent } from 'ng-fast-toast';
import { LoaderOverlayComponent } from './core/loader/loader-overlay.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NgFastToastComponent, LoaderOverlayComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'solicitudes-app';
}
