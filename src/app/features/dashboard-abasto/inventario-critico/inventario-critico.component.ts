import { ChangeDetectionStrategy, Component, inject, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Cita } from '../../../models/Cita';
import { ArticuloCritico, InventarioCriticoService } from '../../../shared/inventario-critico.service';
import { FormsModule } from '@angular/forms';
import { StorageVariables } from '../../../shared/storage-variables';
import { ExcelService } from '../../../services/excel.service';
import { InsumoDetalleModalComponent } from './insumo-detalle-modal.component';
import { TruncateDecimalPipe } from '../../../shared/truncate-decimal.pipe';


@Component({
    selector: 'app-inventario-critico',
    standalone: true,
    imports: [CommonModule, FormsModule, InsumoDetalleModalComponent, TruncateDecimalPipe],
    templateUrl: './inventario-critico.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class InventarioCriticoComponent implements OnInit {
    @Input() citas: Cita[] = [];
    citasFiltradas: Cita[] = [];
    filtroTexto = '';
    filtroUnidad = '';
    unidadesDisponibles: string[] = [];
    articulosFiltrados: ArticuloCritico[] = [];
    articulosCriticos: ArticuloCritico[] = [];
    excelService = inject(ExcelService);

    filtroCompra = '';
    tiposCompra: string[] = [];

    modalVisible = signal(false);
    selectedClave = signal('');
    selectedDescripcion = signal('');
    cerrarModal = () => {
       // console.log('cerrarModal desde padre!');
        this.modalVisible.set(false);
    }

    constructor(private inventarioCriticoService: InventarioCriticoService) { }

    ngOnInit(): void {
        this.modalVisible.set(false);
        this.filtroTexto = localStorage.getItem(StorageVariables.DASH_ABASTO_INV_FILTRO_TEXTO) || '';
        this.filtroUnidad = localStorage.getItem(StorageVariables.DASH_ABASTO_INV_FILTRO_UNIDAD) || '';
        this.filtroCompra = localStorage.getItem(StorageVariables.DASH_ABASTO_INV_FILTRO_COMPRAS) || '';
        this.calcularInventarioCritico();
    }

    calcularInventarioCritico() {
        // const articulos = this.inventarioCriticoService.detectarCriticos(this.citas);
        // this.articulosCriticos = articulos;

        const citasFiltradas = this.citas.filter(c => c.estatus.toLocaleUpperCase() !== 'NO RECIBIR');
        this.citasFiltradas = [...citasFiltradas]; // copia de citasFiltradas;

        // Extraer unidades únicas
        const unidades = new Set(this.citasFiltradas.map(c => c.unidad).filter(Boolean));
        this.unidadesDisponibles = Array.from(unidades).sort();

        const compras = new Set(this.citasFiltradas.map(c => c.compra).filter(Boolean));
        this.tiposCompra = Array.from(compras).sort();

        this.aplicarFiltros();
    }

    aplicarFiltros() {
        localStorage.setItem(StorageVariables.DASH_ABASTO_INV_FILTRO_TEXTO, this.filtroTexto);
        localStorage.setItem(StorageVariables.DASH_ABASTO_INV_FILTRO_UNIDAD, this.filtroUnidad);
        localStorage.setItem(StorageVariables.DASH_ABASTO_INV_FILTRO_COMPRAS, this.filtroCompra);

        if (this.filtroTexto && this.filtroTexto.length > 0) {
            const texto = this.filtroTexto.toLowerCase();

            // aplicar sobre citasFiltradas el filtro en citas por texto que coincida de la misma forma que con this.articulosFiltrados
            this.citasFiltradas = this.citas.filter(c => {
                const busqueda = this.filtroTexto.toLowerCase();
                const coincideBusqueda =
                    (c.clave_cnis ?? '').toLowerCase().includes(busqueda) ||
                    (c.descripcion ?? '').toLowerCase().includes(busqueda);
                return coincideBusqueda;
            });
        } else {
            // crear una copia de citas
            this.citasFiltradas = [...this.citas.filter(c => c.estatus.toLocaleUpperCase() !== 'NO RECIBIR')];
        }
        // adicionalmente, si hay unidad seleccionada, tambien aplicar filtro en citasFiltradas
        if (this.filtroUnidad && this.filtroUnidad.length > 0) {
            this.citasFiltradas = this.citasFiltradas.filter(c => c.unidad === this.filtroUnidad);
        }
        if (this.filtroCompra && this.filtroCompra.length > 0) {
            this.citasFiltradas = this.citasFiltradas
            .filter(c => c.compra.toLocaleUpperCase().trim() === this.filtroCompra.toLocaleUpperCase().trim());
        }

        // se recalcula el inventario critico con los filtros
        const articulos = this.inventarioCriticoService.detectarCriticos(this.citasFiltradas);
        this.articulosCriticos = articulos;

        this.articulosFiltrados = this.articulosCriticos;

        /*this.articulosFiltrados = this.articulosCriticos.filter(a => {
            const coincideTexto = ((this.filtroTexto && this.filtroTexto.length > 0) ?
                ( a.clave.toLowerCase().includes(this.filtroTexto.toLowerCase()) ||
                a.descripcion.toLowerCase().includes(this.filtroTexto.toLowerCase()) ) : true );

            const coincideUnidad =
                this.filtroUnidad === '' || this.citas.some(c =>
                    c.clave_cnis === a.clave &&
                    c.unidad === this.filtroUnidad
                );

            return coincideTexto && coincideUnidad;
        });*/
    }

    exportarExcel() {
        this.excelService.exportarInventarioCritico(this.articulosFiltrados);
    }

    abrirModal(insumo: { clave: string; descripcion: string }) {
        this.selectedClave.set(insumo.clave);
        this.selectedDescripcion.set(insumo.descripcion);
        this.modalVisible.set(true);
    }
}
