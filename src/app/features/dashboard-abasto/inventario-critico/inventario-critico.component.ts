import { Component, inject, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Cita } from '../../../models/Cita';
import { ArticuloCritico, InventarioCriticoService } from '../../../shared/inventario-critico.service';
import { FormsModule } from '@angular/forms';
import { StorageVariables } from '../../../shared/storage-variables';
import { ExcelService } from '../../../services/excel.service';


@Component({
    selector: 'app-inventario-critico',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './inventario-critico.component.html'
})
export class InventarioCriticoComponent implements OnInit {
    @Input() citas: Cita[] = [];
    filtroTexto = '';
    filtroUnidad = '';
    unidadesDisponibles: string[] = [];
    articulosFiltrados: ArticuloCritico[] = [];
    articulosCriticos: ArticuloCritico[] = [];
    excelService = inject(ExcelService);

    constructor(private inventarioCriticoService: InventarioCriticoService) { }

    ngOnInit(): void {
        this.filtroTexto = localStorage.getItem(StorageVariables.DASH_ABASTO_INV_FILTRO_TEXTO) || '';
        this.filtroUnidad = localStorage.getItem(StorageVariables.DASH_ABASTO_INV_FILTRO_UNIDAD) || '';
        this.calcularInventarioCritico();
    }

    calcularInventarioCritico() {
        const articulos = this.inventarioCriticoService.detectarCriticos(this.citas);
        this.articulosCriticos = articulos;

        // Extraer unidades únicas
        const unidades = new Set(this.citas.map(c => c.unidad).filter(Boolean));
        this.unidadesDisponibles = Array.from(unidades).sort();

        this.aplicarFiltros();
    }

    aplicarFiltros() {
        localStorage.setItem(StorageVariables.DASH_ABASTO_INV_FILTRO_TEXTO, this.filtroTexto);
        localStorage.setItem(StorageVariables.DASH_ABASTO_INV_FILTRO_UNIDAD, this.filtroUnidad);
        const texto = this.filtroTexto.toLowerCase();

        this.articulosFiltrados = this.articulosCriticos.filter(a => {
            const coincideTexto =
                a.clave.toLowerCase().includes(texto) ||
                a.descripcion.toLowerCase().includes(texto);

            const coincideUnidad =
                this.filtroUnidad === '' || this.citas.some(c =>
                    c.clave_cnis === a.clave &&
                    c.unidad === this.filtroUnidad
                );

            return coincideTexto && coincideUnidad;
        });
    }

    exportarExcel() {
        this.excelService.exportarInventarioCritico(this.articulosFiltrados);
    }
}
