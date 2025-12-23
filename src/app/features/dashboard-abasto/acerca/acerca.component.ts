import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';

@Component({
    standalone: true,
    imports: [CommonModule],
    selector: 'app-acerca',
    templateUrl: 'acerca.component.html'
})

export class AcercaComponent implements OnInit {
    constructor() { }

    ngOnInit() { }

    anioActual() {
        return new Date().getFullYear();
    }
}