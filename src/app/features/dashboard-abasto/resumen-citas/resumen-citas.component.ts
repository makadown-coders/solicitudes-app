// src/app/features/dashboard-abasto/resumen-citas/resumen-citas.component.ts
import { Component, effect, inject, Input, OnChanges, OnInit, signal, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Cita } from '../../../models/Cita';
import { PeriodoFechasService } from '../../../shared/periodo-fechas.service';
import { StorageVariables } from '../../../shared/storage-variables';
import { PeriodoPickerDasboardComponent } from '../../../shared/periodo-picker/periodo-picker-dashboard.component';
import { FormsModule } from '@angular/forms';
import { DetalleOrdenesModalComponent } from '../../../shared/detalle-ordenes-modal/detalle-ordenes-modal.component';
import { CitaQueryResponse } from '../../../models/CitaQueryResponse';
import { CitasService } from '../../../services/citas.service';


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
export class ResumenCitasComponent implements OnInit {
    citas = signal<Cita[]>([]);

    // Variables de control
    filtroCompra = '';
    tiposCompra: string[] = [];
    // fecha de inicio es Hoy - 15 dias
    fechaInicio: Date = new Date(Date.now() - (1 * 24 * 60 * 60 * 1000));
    fechaFin: Date = new Date(Date.now() + (10 * 24 * 60 * 60 * 1000));
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

    loading = false;
    errorMsg: string | null = null;
    private citasService = inject(CitasService);

    abrirDetalleOrdenes(tipoEntrega: string, unidad: string) {

        this.ordenesSeleccionadas = this.citas()
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

    constructor(private fechasService: PeriodoFechasService) {
        effect(() => {
            const citas = this.citas();
            if (!citas.length) return;

            this.generarDiasDelRango();
            this.recalcularAgrupacion();
        });
    }

    ngOnInit(): void {
        const set = new Set<string>();
        this.tiposCompra = Array.from(set).sort();
        this.inicializarFechas();
        this.cargarCitasDesdeBackend(true);
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
            const fechasValidas = this.citas()
                .map(c => c.fecha_de_cita)
                .filter(f => f !== null);

            if (fechasValidas.length === 0) return;

            const ultimaFecha = fechasValidas.reduce((max, fechaAComparar) => {
                return fechaAComparar! > max! ? fechaAComparar : max;
            }, fechasValidas[0]!);

            // Convertir última fecha en objeto Date para poder manipular
            // this.fechaInicio = this.parseFechaLocal(ultimaFecha + '');
            this.fechaInicio = this.fechasService.toDateOrNull(ultimaFecha!)!;
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

        (this.citas() as Cita[]).forEach(c => {
            if (c.fecha_de_cita !== null) {
                const fechaCita = this.fechasService.toDateOrNull(c.fecha_de_cita);
                // const fechaCita = this.parseFechaLocal(c.fecha_de_cita + '');
                if (fechaCita! >= this.fechaInicio &&
                    fechaCita! <= this.fechaFin) {
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

    obtenerConteo(fila: any) {
        return this.diasRango.reduce((sum, dia) => sum + (fila.conteos[dia] || 0), 0);
    }

    recalcularAgrupacion() {
        localStorage.setItem(StorageVariables.DASH_ABASTO_RESUMENCITAS_FILTRO_COMPRA, this.filtroCompra);

        const agrupados = new Map<string, Map<string, { [fecha: string]: number }>>();

        const citasFiltradas = this.filtroCompra && this.filtroCompra !== '' ?
            [... this.citas().filter(c => c.compra === this.filtroCompra)] :
            [...this.citas()];

        for (const cita of citasFiltradas) {

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

        // this.generarDiasDelRango();
        // this.recalcularAgrupacion();

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
            inicio: this.fechaInicio,
            fin: this.fechaFin
        }));

        this.cargarCitasDesdeBackend();
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

    // ============================================================
    //         CARGA BACKEND + SIGNAL
    // ============================================================
    private toYmd(d: Date) {
        return d.toISOString().slice(0, 10);
    }

    private cargarCitasDesdeBackend(
        cargandoDesdeNgOnInit = false,
        forceRefresh = false
    ) {
        this.loading = true;
        this.errorMsg = null;

        this.citasService.searchCitasCached(
            {
                // include_pendientes: '1',
                recibido: 'false',
                limit: 20000,
            },
            { forceRefresh }
        ).subscribe({
            next: (resp: CitaQueryResponse) => {

                const citasFiltradasPorFechaDesdeHasta = (resp.data ?? []).filter(cita => {
                    if (!cita.fecha_de_cita) return false;
                    // fecha de cita tiene un formato ej. "2024-12-16T08:00:00.000Z"
                    const fechaCita = this.fechasService.toDateOrNull(cita.fecha_de_cita);
                    return fechaCita! >= this.fechaInicio && fechaCita! <= this.fechaFin;
                });

                this.citas.set(citasFiltradasPorFechaDesdeHasta ?? []);
                // this.citas.set(resp?.data ?? []);
                this.loading = false;
                this.procesarCitas();
                // this.generarDiasDelRango();
            },
            error: err => {
                this.loading = false;
                this.errorMsg = 'Error al obtener citas desde backend';
                this.citas.set([]);
            }
        });
    }

    // ============================================================
    //         PROCESAMIENTOS Y AGRUPACIONES
    // ============================================================
    procesarCitas() {
        const lista = this.citas();

        const citasPendientes = [...lista];

        this.tiposCompra = Array.from(
            new Set(citasPendientes.map(c => c.compra ?? 'Desconocido'))
        ).sort();
    }

}
