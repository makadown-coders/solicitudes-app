import { Component, ViewChildren, QueryList, ElementRef, inject, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Cita } from '../../../models/Cita';
import { FormsModule } from '@angular/forms';
import { PeriodoFechasService } from '../../../shared/periodo-fechas.service';
import { PeriodoPickerDasboardComponent } from "../../../shared/periodo-picker/periodo-picker-dashboard.component";
import { StorageVariables } from '../../../shared/storage-variables';
import { DetalleCitaModalComponent } from '../../../shared/detalle-cita-modal/detalle-cita-modal.component';


@Component({
    selector: 'app-proveedores',
    standalone: true,
    imports: [CommonModule, FormsModule,
        PeriodoPickerDasboardComponent, DetalleCitaModalComponent],
    templateUrl: './proveedores.component.html',
    styleUrls: ['./proveedores.component.css']
})
export class ProveedoresComponent implements OnInit {

    @Input() citas: Cita[] = [];
    @ViewChildren('grupoRef') grupoRefs!: QueryList<ElementRef<HTMLDivElement>>;
    filtroBusqueda: string = '';
    filtroUnidad: string = '';
    filtroCompra: string = '';
    periodoFormateado: string = '';
    proveedorExpandido: string | null = null;
    fechasService = inject(PeriodoFechasService);
    proveedoresAgrupados: { proveedor: string; citas: Cita[] }[] = [];

    fechaInicio: Date = new Date(new Date().getFullYear(), 0, 1); // 1 de enero actual
    fechaFin: Date = new Date(); // hoy

    citaSeleccionada: Cita | null = null;
    mostrarModalDetalle = false;

    ngOnInit(): void {
        // Recuperar filtros de localStorage
        this.cargarDeLocalStorage();
        this.periodoFormateado = this.fechasService.formatearRango(this.fechaInicio, this.fechaFin);
        this.proveedoresAgrupados = this.getProveedoresAgrupados();
    }

    getTotalPiezasPorProveedor(citas: Cita[]): number {
        return citas.reduce((total, cita) => total + cita.pzas_recibidas_por_la_entidad!, 0);
    }

    cargarDeLocalStorage() {
        this.filtroBusqueda = localStorage.getItem(StorageVariables.DASH_ABASTO_PROV_FILTRO_PROVEEDOR) || '';
        this.filtroUnidad = localStorage.getItem(StorageVariables.DASH_ABASTO_PROV_FILTRO_UNIDAD) || '';
        this.filtroCompra = localStorage.getItem(StorageVariables.DASH_ABASTO_PROV_FILTRO_COMPRA) || '';
        const inicio = localStorage.getItem(StorageVariables.DASH_ABASTO_PROV_FECHA_INICIO);
        const fin = localStorage.getItem(StorageVariables.DASH_ABASTO_PROV_FECHA_FIN);
        if (inicio && fin) {
            this.fechaInicio = new Date(inicio);
            this.fechaFin = new Date(fin);
        }
    }

    onPeriodoSeleccionado(texto: string, fechaInicio: Date, fechaFin: Date) {
        this.periodoFormateado = texto;
        this.fechaInicio = fechaInicio;
        this.fechaFin = fechaFin;
        this.onBusqueda();
    }

    get unidadesUnicas(): string[] {
        const set = new Set<string>();
        this.citas.forEach(c => {
            if (c.unidad) set.add(c.unidad);
        });
        return Array.from(set).sort();
    }

    get tiposCompra(): string[] {
        const set = new Set<string>();
        this.citas.forEach(c => {
            if (c.compra) set.add(c.compra);
        });
        return Array.from(set).sort();
    }

    onBusqueda() {
        localStorage.setItem(StorageVariables.DASH_ABASTO_PROV_FILTRO_PROVEEDOR, this.filtroBusqueda);
        localStorage.setItem(StorageVariables.DASH_ABASTO_PROV_FILTRO_UNIDAD, this.filtroUnidad);
        localStorage.setItem(StorageVariables.DASH_ABASTO_PROV_FILTRO_COMPRA, this.filtroCompra);
        localStorage.setItem(StorageVariables.DASH_ABASTO_PROV_FECHA_INICIO, this.fechaInicio.toISOString());
        localStorage.setItem(StorageVariables.DASH_ABASTO_PROV_FECHA_FIN, this.fechaFin.toISOString());
        this.proveedoresAgrupados = this.getProveedoresAgrupados();
    }

    getProveedoresAgrupados(): { proveedor: string; citas: Cita[] }[] {
        const map = new Map<string, Cita[]>();
        // console.log('Aplicando filtro', this.filtroBusqueda);
        const citasFiltradas = this.citas.filter(c => {
            const filtro = this.filtroBusqueda.toLowerCase();
            const coincideBusqueda =
                (c.orden_de_suministro ?? '').toLowerCase().includes(filtro) ||
                (c.proveedor ?? '').toLowerCase().includes(filtro) ||
                (c.clave_cnis ?? '').toLowerCase().includes(filtro) ||
                (c.descripcion ?? '').toLowerCase().includes(filtro);
            const coincideUnidad = !this.filtroUnidad || c.unidad === this.filtroUnidad;
            const coincideCompra = !this.filtroCompra || c.compra === this.filtroCompra;
            const coincideFecha = this.fechasService.fechaEnRango(c.fecha_recepcion_almacen, this.fechaInicio, this.fechaFin);

            return coincideBusqueda && coincideUnidad && coincideCompra && coincideFecha;
        });
        // console.log('citasFiltradas fase 1', citasFiltradas);

        citasFiltradas.forEach(c => {
            const proveedor = c.proveedor ?? 'Desconocido';
            if (!map.has(proveedor)) map.set(proveedor, []);
            map.get(proveedor)!.push(c);
        });
        // console.log('citasFiltradas fase 2', citasFiltradas);

        let resultado = Array.from(map.entries())
            .map(([proveedor, citas]) => ({ proveedor, citas }));

        if (this.filtroUnidad) {
            resultado = resultado
                .map(g => ({
                    proveedor: g.proveedor,
                    citas: g.citas.filter(c => c.unidad === this.filtroUnidad)
                }))
                .filter(g => g.citas.length > 0); // descarta grupos sin resultados
        }
        // console.log('citasFiltradas fase 3', resultado);

        return resultado;
    }

    toggleProveedor(proveedor: string, index: number) {
        const yaExpandido = this.proveedorExpandido === proveedor;
        this.proveedorExpandido = yaExpandido ? null : proveedor;

        if (!yaExpandido && index >= 5) {
            setTimeout(() => {
                const el = this.grupoRefs.get(index);
                if (el) {
                    el.nativeElement.scrollIntoView({ behavior: 'instant', block: 'start' });
                }
            }, 100);
        }
    }

    abrirModalDetalle(cita: Cita) {
        this.citaSeleccionada = cita;
        this.mostrarModalDetalle = true;
      }
    
      cerrarModalDetalle() {
        this.mostrarModalDetalle = false;
        this.citaSeleccionada = null;
      }
}
