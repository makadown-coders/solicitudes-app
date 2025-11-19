import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, OnInit, signal } from "@angular/core";
import { DetalleBalanceo } from "../../../../models/balanceo/DetalleBalanceo";
import { ResumenBalanceo } from "../../../../models/balanceo/ResumenBalanceo";
import { UltimaEjecucion } from "../../../../models/balanceo/UltimaEjecucion";
import { BalanceoService } from "../../../../services/balanceo.service";
import { ResumenAgrupado } from "../../../../models/balanceo/ResumenAgrupado";

@Component({
    selector: 'app-balanceo-sugerencias',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './balanceo-sugerencias.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BalanceoSugerenciasComponent implements OnInit {
    loading = signal(false);
    ejecutando = signal(false);
    error = signal<string | null>(null);

    ultimaEjecucion = signal<UltimaEjecucion | null>(null);
    resumen = signal<ResumenBalanceo[]>([]);
    detalle = signal<DetalleBalanceo[]>([]);
    filaSeleccionada = signal<ResumenAgrupado | null>(null);

    // 🔹 Agrupamos por (clave_cnis, jurisdiccion_almacen)
    resumenAgrupado = computed<ResumenAgrupado[]>(() => {
        const rows = this.resumen();
        const map = new Map<string, ResumenAgrupado>();

        for (const r of rows) {
            const key = `${r.clave_cnis}||${r.jurisdiccion_almacen}`;

            if (!map.has(key)) {
                map.set(key, {
                    clave_cnis: r.clave_cnis,
                    jurisdiccion_almacen: r.jurisdiccion_almacen,
                    unidades_destino: 0,
                    piezas_destino: 0,
                    piezas_excedente: undefined,
                });
            }

            const entry = map.get(key)!;

            if (r.jurisdiccion_destino === '-') {
                // Es excedente del almacén
                entry.piezas_excedente =
                    (entry.piezas_excedente ?? 0) + r.total_piezas;
            } else {
                // Es un movimiento real a unidades destino
                entry.unidades_destino += r.total_unidades;
                entry.piezas_destino += r.total_piezas;
            }
        }

        return Array.from(map.values()).sort((a, b) => {
            // Ordenamos por clave y luego por jurisdicción
            if (a.clave_cnis === b.clave_cnis) {
                return a.jurisdiccion_almacen.localeCompare(b.jurisdiccion_almacen);
            }
            return a.clave_cnis.localeCompare(b.clave_cnis);
        });
    });

    constructor(private balanceoService: BalanceoService) { }

    ngOnInit(): void {
        this.cargarUltimaEjecucionYResumen();
    }

    cargarUltimaEjecucionYResumen(): void {
        this.loading.set(true);
        this.error.set(null);

        // Última ejecución
        this.balanceoService.obtenerUltimaEjecucion().subscribe({
            next: (resp) => {
                this.ultimaEjecucion.set(
                    (resp.ejecucion ?? null) as UltimaEjecucion | null
                );
            },
            error: (err) => {
                console.error(err);
                this.error.set('Error al obtener la última ejecución');
                this.loading.set(false);
            },
        });

        // Resumen actual
        this.balanceoService.obtenerResumenActual().subscribe({
            next: (resp) => {
                this.resumen.set((resp.resumen ?? []) as ResumenBalanceo[]);
                this.loading.set(false);
            },
            error: (err) => {
                console.error(err);
                this.error.set('Error al obtener el resumen actual');
                this.loading.set(false);
            },
        });
    }

    ejecutarBalanceo(): void {
        this.ejecutando.set(true);
        this.error.set(null);
        this.detalle.set([]);
        this.filaSeleccionada.set(null);

        this.balanceoService.ejecutarBalanceo().subscribe({
            next: () => {
                this.cargarUltimaEjecucionYResumen();
                this.ejecutando.set(false);
            },
            error: (err) => {
                console.error(err);
                this.error.set('Error al ejecutar el balanceo');
                this.ejecutando.set(false);
            },
        });
    }

    seleccionarFila(fila: ResumenAgrupado): void {
        this.filaSeleccionada.set(fila);
        this.cargarDetalle(fila);
    }

    private cargarDetalle(fila: ResumenAgrupado): void {
        this.detalle.set([]);
        this.balanceoService
            .obtenerDetalleActual({
                clave_cnis: fila.clave_cnis,
                jurisdiccion_almacen: fila.jurisdiccion_almacen,
            })
            .subscribe({
                next: (resp) => {
                    this.detalle.set((resp.detalle ?? []) as DetalleBalanceo[]);
                },
                error: (err) => {
                    console.error(err);
                    this.error.set('Error al obtener el detalle de la fila seleccionada');
                },
            });
    }

    prioridadLabel(prioridad: number): string {
        switch (prioridad) {
            case 1:
                return 'Misma jurisdicción';
            case 2:
                return 'Otras jurisdicciones';
            default:
                return `Prioridad ${prioridad}`;
        }
    }

    // trackBy helpers
    trackAgrupado = (_: number, item: ResumenAgrupado) =>
        `${item.clave_cnis}-${item.jurisdiccion_almacen}`;

    trackDetalle = (_: number, item: DetalleBalanceo) =>
        `${item.clave_cnis}-${item.jurisdiccion_almacen}-${item.clues_destino}-${item.prioridad}`;
}