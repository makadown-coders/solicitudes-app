import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NgFastToastComponent } from 'ng-fast-toast';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NgFastToastComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'solicitudes-app';
}
