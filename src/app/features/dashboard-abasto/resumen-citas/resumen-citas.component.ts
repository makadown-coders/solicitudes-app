import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Cita } from '../../../models/Cita';
import { PeriodoFechasService } from '../../../shared/periodo-fechas.service';
import { StorageVariables } from '../../../shared/storage-variables';
import { PeriodoPickerDasboardComponent } from '../../../shared/periodo-picker/periodo-picker-dashboard.component';
import { FormsModule } from '@angular/forms';
import { DetalleOrdenesModalComponent } from '../../../shared/detalle-ordenes-modal/detalle-ordenes-modal.component';

@Component({
    selector: 'app-resumen-citas',
    standalone: true,
    imports: [
        CommonModule,
        PeriodoPickerDasboardComponent,
        FormsModule,
        DetalleOrdenesModalComponent],
    templateUrl: './resumen-citas.component.html',
    styleUrls: ['./resumen-citas.component.css']
})
export class ResumenCitasComponent implements OnInit, OnChanges {
    @Input() citas: Cita[] = [];

    // Variables de control
    filtroCompra = '';
    tiposCompra: string[] = [];
    fechaInicio: Date = new Date(Date.now());
    fechaFin: Date = new Date(Date.now() + 1);
    diasRango: string[] = [];

    datosAgrupados: {
        tipoEntrega: string;
        unidad: string;
        conteos: { [fecha: string]: number };
    }[] = [];

    private readonly STORAGE_KEY = StorageVariables.DASH_ABASTO_RESUMENCITAS_RANGO;

    grupoExpandido: { [tipoEntrega: string]: boolean } = {};

    detalleVisible = false;
    ordenesSeleccionadas: Cita[] = [];

    abrirDetalleOrdenes(tipoEntrega: string, unidad: string) {

        this.ordenesSeleccionadas = this.citas
            .filter(c =>
                c.tipo_de_entrega === tipoEntrega &&
                c.unidad === unidad &&
                this.diasRango.includes(c.fecha_de_cita + '') 
             ); // opcional según lógica
        // filtrar si tengo elegido tipo de compra
        if (this.filtroCompra) {
            this.ordenesSeleccionadas = this.ordenesSeleccionadas.filter(c => c.compra === this.filtroCompra);
        }
        this.detalleVisible = true;
    }

    cerrarModalDetalle() {
        this.detalleVisible = false;
    }


    constructor(private fechasService: PeriodoFechasService) { }

    /**
     * Triggereado cuando se cambian las citas
     * @param changes 
     */
    ngOnChanges(changes: SimpleChanges): void {
        if (!changes['citas']) return;

        this.inicializarFechas();
        this.recalcularAgrupacion();
    }

    ngOnInit(): void {
        
        const set = new Set<string>();
        this.citas.forEach(c => {
            if (c.compra) set.add(c.compra);
        });
        this.tiposCompra = Array.from(set).sort();

    }

    inicializarFechas() {
        const guardado = localStorage.getItem(this.STORAGE_KEY);
        this.filtroCompra = localStorage.getItem(StorageVariables.DASH_ABASTO_RESUMENCITAS_FILTRO_COMPRA) || '';
        if (guardado) {
            const parsed = JSON.parse(guardado);
            this.fechaInicio = new Date(parsed.inicio);
            this.fechaFin = new Date(parsed.fin);
        } else {
            // Calcular desde última fecha de cita menos 30 días
            const fechasValidas = this.citas
                .map(c => c.fecha_de_cita)
                .filter(f => f !== null);

            if (fechasValidas.length === 0) return;

            const ultimaFecha = fechasValidas.reduce((max, fechaAComparar) => {
                return fechaAComparar! > max! ? fechaAComparar : max;
            }, fechasValidas[0]!);

            // Convertir última fecha en objeto Date para poder manipular
            this.fechaInicio = this.parseFechaLocal(ultimaFecha + '');
            this.fechaFin = new Date(this.fechaInicio);
            this.fechaInicio.setDate(this.fechaInicio.getDate() - 10);

            localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
                inicio: this.fechaInicio,
                fin: this.fechaFin
            }));
        }

        this.generarDiasDelRango();
    }

    generarDiasDelRango() {
        const diasUnicos = new Set<string>();

        (this.citas as Cita[]).forEach(c => {
            if (c.fecha_de_cita !== null) {
                const fechaCita = this.parseFechaLocal(c.fecha_de_cita + '');
                if (fechaCita >= this.fechaInicio &&
                    fechaCita <= this.fechaFin) {
                    diasUnicos.add(c.fecha_de_cita + '');
                }
            }
        });
        this.diasRango = Array.from(diasUnicos).sort((a, b) => {
            const da = new Date(a.split('/').reverse().join('-'));
            const db = new Date(b.split('/').reverse().join('-'));
            return da.getTime() - db.getTime();
        });
    }

    formatFecha(date: Date): string {
        return date.toISOString ? date.toISOString().split('T')[0] : '';
    }

    parseFechaLocal(fechaStr: string): Date {
        const [year, month, day] = fechaStr.split('-').map(Number);
        return new Date(year, month - 1, day); // Mes comienza en 0
    }

    obtenerConteo(fila: any) {
        return this.diasRango.reduce((sum, dia) => sum + (fila.conteos[dia] || 0), 0);
    }

    recalcularAgrupacion() {
        localStorage.setItem(StorageVariables.DASH_ABASTO_RESUMENCITAS_FILTRO_COMPRA, this.filtroCompra);

        const agrupados = new Map<string, Map<string, { [fecha: string]: number }>>();

        const citasFiltradas = this.filtroCompra && this.filtroCompra !== '' ?
            [... this.citas.filter(c => c.compra === this.filtroCompra)] :
            [...this.citas];

        for (const cita of citasFiltradas) {

            if (!cita.fecha_de_cita) continue;

            const fechaCita = this.parseFechaLocal(cita.fecha_de_cita + '');
            // instanceof Date ? this.formatFecha(cita.fecha_de_cita) : null;           

            if (new Date(fechaCita) < this.fechaInicio || new Date(fechaCita) > this.fechaFin) continue;

            const tipoEntrega = cita.tipo_de_entrega || 'Sin tipo';
            const unidad = cita.unidad || 'Sin unidad';

            if (!agrupados.has(tipoEntrega)) {
                agrupados.set(tipoEntrega, new Map());
            }
            const mapaUnidades = agrupados.get(tipoEntrega)!;

            if (!mapaUnidades.has(unidad)) {
                mapaUnidades.set(unidad, {});
            }
            const conteoFechas = mapaUnidades.get(unidad)!;

            conteoFechas[cita.fecha_de_cita + ''] =
                (conteoFechas[cita.fecha_de_cita + ''] || 0) + 1;
        }

        this.datosAgrupados = [];
        agrupados.forEach((mapaUnidades, tipoEntrega) => {
            mapaUnidades.forEach((conteos, unidad) => {
                this.datosAgrupados.push({
                    tipoEntrega,
                    unidad,
                    conteos
                });
            });
        });
        // inicializando el grupoExpandido
        this.grupoExpandido = {};
        this.datosAgrupados.forEach(d => {
            this.grupoExpandido[d.tipoEntrega] = true;
        });
    }

    onPeriodoSeleccionado(inicio: Date, fin: Date) {
        this.fechaInicio = inicio;
        this.fechaFin = fin;

        this.generarDiasDelRango();
        this.recalcularAgrupacion();

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
            inicio: this.fechaInicio,
            fin: this.fechaFin
        }));
    }

    obtenerTotalPorDia(dia: string): number {
        return this.datosAgrupados.reduce((sum, fila) => sum + (fila.conteos[dia] || 0), 0);
    }

    obtenerTotalPorEntregaYDia(tipoEntrega: string, dia: string): number {
        return this.datosAgrupados
            .filter(d => d.tipoEntrega === tipoEntrega)
            .reduce((sum, d) => sum + (d.conteos[dia] || 0), 0);
    }

    obtenerGranTotal(): number {
        return this.datosAgrupados.reduce((sumFila, fila) => {
            return sumFila + this.diasRango.reduce((sumDia, dia) => sumDia + (fila.conteos[dia] || 0), 0);
        }, 0);
    }

    toggleGrupo(tipoEntrega: string) {
        this.grupoExpandido[tipoEntrega] = !this.grupoExpandido[tipoEntrega];
    }

    datosAgrupadosAgrupadosPorTipo() {
        const grupos: { tipoEntrega: string, unidades: any[] }[] = [];
        const mapa = new Map<string, any[]>();

        // ordeno primero por unidad
        this.datosAgrupados.sort((a, b) => {
            if (a.unidad < b.unidad) return -1;
            if (a.unidad > b.unidad) return 1;
            return 0;
        });

        for (const fila of this.datosAgrupados) {
            if (!mapa.has(fila.tipoEntrega)) {
                mapa.set(fila.tipoEntrega, []);
            }
            mapa.get(fila.tipoEntrega)!.push(fila);
        }

        mapa.forEach((unidades, tipoEntrega) => {
            grupos.push({ tipoEntrega, unidades });
        });

        // ordeno por tipo de entrega
        return grupos.sort((a, b) => {
            if (a.tipoEntrega < b.tipoEntrega) return -1;
            if (a.tipoEntrega > b.tipoEntrega) return 1;
            return 0;
        })
    }

    obtenerTotalTipoEntrega(tipoEntrega: string): number {
        return this.datosAgrupados
            .filter(d => d.tipoEntrega === tipoEntrega)
            .reduce((sum, d) => sum + this.obtenerConteo(d), 0);
    }


}
