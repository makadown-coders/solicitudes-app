import { Component, Input, OnInit } from '@angular/core';
import { ExistenciasTabInfo } from '../../../../models/existenciasTabInfo';

@Component({
    standalone: true,
    imports: [],
    selector: 'app-existencias-x-unidad',
    templateUrl: 'existencias-x-unidad.component.html'
})

export class ExistenciasXUnidadComponent implements OnInit {
    @Input() data: ExistenciasTabInfo = new ExistenciasTabInfo();
    constructor() { }

    ngOnInit() { }
}