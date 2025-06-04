import { ChangeDetectionStrategy, Component, HostListener, Input, OnChanges, computed, inject, signal } from '@angular/core';
import { Cita } from '../../../models/Cita';
import { NgIf, NgFor, DatePipe, UpperCasePipe } from '@angular/common';
import { PeriodoFechasService } from '../../../shared/periodo-fechas.service';
import { TruncateDecimalPipe } from '../../../shared/truncate-decimal.pipe';
import { MaxLengthPipe } from '../../../shared/max-length.pipe';
import { CitasPorInsumoModalComponent } from './citas-por-insumo-modal.component';
import { ExcelService } from '../../../services/excel.service';

@Component({
    selector: 'app-insumo-detalle-modal',
    standalone: true,
    imports: [NgIf, NgFor, DatePipe, UpperCasePipe, TruncateDecimalPipe,
        MaxLengthPipe, CitasPorInsumoModalComponent],
    templateUrl: './insumo-detalle-modal.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class InsumoDetalleModalComponent implements OnChanges {
    @Input() citas: Cita[] = [];
    @Input() clave_cnis: string = '';
    @Input() cerrar: () => void = () => { };

    citasFiltradas: Cita[] = [];
    totalEmitidas = 0;
    totalRecibidas = 0;
    porcentajeCumplimiento = 0;
    tiempoPromedioEntrega: number | null = null;
    entregasATiempo = 0;
    entregasTarde = 0;
    proveedoresFrecuentes: { nombre: string; ordenes: number }[] = [];
    tiposDeCompraRelacionados: { nombre: string; ordenes: number }[] = [];
    completamenteSurtidoAlgunaVez = false;
    excelService: ExcelService = inject(ExcelService);

    @Input() visible: boolean = false;
    @Input() descripcion: string = '';

    // Computed: total de órdenes
    totalOrdenes = 0;

    // Computed: % cumplimiento
    cumplimiento = 0;

    // Computed: unidades afectadas
    unidadesAfectadas: any[] = [];

    // Computed: fechas de recepción más recientes (si hay entregas)
    fechasFrecuentes: Date[] = [];

    fechasService = inject(PeriodoFechasService);

    detalleCitasVisible = false;

    mostrarCitasPorInsumo() {
        this.detalleCitasVisible = true;
    }

    ocultarCitasPorInsumo() {
        this.detalleCitasVisible = false;
    }

    exportarExcelCitas() {
        this.excelService.exportarDetalleCitasPorInsumo('Suministros-' + this.clave_cnis + '.xlsx', this.citasFiltradas);
    }

    @HostListener('document:keydown.escape', ['$event'])
    onEscapeKey(event: KeyboardEvent) {
        this.cerrar();
    }

    ngOnChanges(): void {
        this.citasFiltradas = this.citas
            .filter(c => c.clave_cnis === this.clave_cnis &&
                c.estatus.toLocaleUpperCase() !== 'NO RECIBIR');
        this.totalEmitidas = this.citasFiltradas.reduce((sum, c) => sum + (c.no_de_piezas_emitidas || 0), 0);
        this.totalRecibidas = this.citasFiltradas.reduce((sum, c) => sum + (c.pzas_recibidas_por_la_entidad || 0), 0);
        this.totalOrdenes = this.citas.filter((c) => c.clave_cnis === this.clave_cnis).length;

        const emitidas = this.totalEmitidas;
        const recibidas = this.totalRecibidas;
        this.cumplimiento = emitidas > 0 ? (recibidas / emitidas) * 100 : 0;

        this.porcentajeCumplimiento = this.totalEmitidas > 0
            ? Math.round((this.totalRecibidas / this.totalEmitidas) * 100)
            : 0;

        const parseFechaEntrega = (str: string | null): Date | null => {
            if (!str) return null;
            const partes = str.split('-').map(s => s.trim()).filter(Boolean);
            return partes.length ? new Date(partes[0]) : null;
        };

        const tiemposEntrega = this.citasFiltradas
            .filter(c => c.fecha_de_cita && c.fecha_recepcion_almacen)
            .map(c => {
                const fechaEntrega = parseFechaEntrega(c.fecha_recepcion_almacen);
                if (!fechaEntrega) return 0;
                return (fechaEntrega.getTime() - new Date(c.fecha_de_cita!).getTime()) / (1000 * 60 * 60 * 24);
            })
            .filter(d => !isNaN(d));

        this.tiempoPromedioEntrega = tiemposEntrega.length
            ? Math.round(tiemposEntrega.reduce((a, b) => a + b, 0) / tiemposEntrega.length)
            : null;

        this.entregasATiempo = this.citasFiltradas.filter(c => {
            const entrega = parseFechaEntrega(c.fecha_recepcion_almacen);
            return entrega && entrega <= new Date(c.fecha_limite_de_entrega);
        }).length;

        this.entregasTarde = this.citasFiltradas.filter(c => {
            const entrega = parseFechaEntrega(c.fecha_recepcion_almacen);
            return entrega && entrega > new Date(c.fecha_limite_de_entrega);
        }).length;

        const proveedorStats = this.citasFiltradas.reduce((acc, cita) => {
            const proveedor = cita.proveedor?.trim();
            if (!proveedor) return acc;
            acc[proveedor] = (acc[proveedor] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        this.proveedoresFrecuentes = Object.entries(proveedorStats)
            .map(([nombre, ordenes]) => ({ nombre, ordenes }))
            .sort((a, b) => b.ordenes - a.ordenes)
            .slice(0, 5);

        const comprasStats = this.citasFiltradas.reduce((acc, cita) => {
            const compra = cita.compra?.trim();
            if (!compra) return acc;
            acc[compra] = (acc[compra] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        this.tiposDeCompraRelacionados = Object.entries(comprasStats)
            .map(([nombre, ordenes]) => ({ nombre, ordenes }))
            .sort((a, b) => b.ordenes - a.ordenes)
            .slice(0, 5);

        this.completamenteSurtidoAlgunaVez = this.citasFiltradas.some(
            c => (c.no_de_piezas_emitidas || 0) > 0 &&
                c.no_de_piezas_emitidas === c.pzas_recibidas_por_la_entidad
        );

        const citasFiltradasFechas = Array.from(new Set(this.citas
            .filter((c) => c.clave_cnis === this.clave_cnis && c.fecha_recepcion_almacen)
            .map((c) => c.fecha_recepcion_almacen)));
        //console.log('citasFiltradasFechas', citasFiltradasFechas);
        const fechas = citasFiltradasFechas
            .flatMap((fecha_recepcion_almacen) =>
                (fecha_recepcion_almacen ?? '')
                    .split('/')
                    .map((f) => f.trim())
                    .filter((f) => !!f)
            )
            .map((f) => this.fechasService.parseLocalDate(f));

        //console.log('fechas', new Set(fechas));
        fechas.sort((a, b) => b.getTime() - a.getTime());
        this.fechasFrecuentes = Array.from(new Set(fechas)).slice(0, 5);

        const mapa = new Map<string, number>();
        for (const cita of this.citasFiltradas) {
            const clave = cita.unidad + ' (' + cita.clues_destino + ')';
            const emitidas = cita.no_de_piezas_emitidas ?? 0;
            const recibidas = cita.pzas_recibidas_por_la_entidad ?? 0;
            const faltantes = Math.max(emitidas - recibidas, 0);
            if (!mapa.has(clave)) {
                mapa.set(clave, faltantes);
            } else {
                mapa.set(clave, mapa.get(clave)! + faltantes);
            }
        }
        this.unidadesAfectadas = Array.from(mapa.entries()).map(([clues, faltantes]) => ({ clues, faltantes }));

    }


}
