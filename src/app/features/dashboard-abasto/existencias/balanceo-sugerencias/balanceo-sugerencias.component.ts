import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, OnInit, signal } from "@angular/core";
import { DetalleBalanceo } from "../../../../models/balanceo/DetalleBalanceo";
import { ResumenBalanceo } from "../../../../models/balanceo/ResumenBalanceo";
import { UltimaEjecucion } from "../../../../models/balanceo/UltimaEjecucion";
import { BalanceoService } from "../../../../services/balanceo.service";
import { GrupoClaveParaBalanceo, ResumenAgrupado } from "../../../../models/balanceo/ResumenAgrupado";
import { ArticulosService } from "../../../../services/articulos.service";
import { ExcelService } from "../../../../services/excel.service";
import { KitsService } from "../../../../services/kits.service";
import { Kit } from "../../../../models";
import { AbstractTabComponent } from "../../../../shared/abstract-tab.component";
import { ActivatedRoute } from "@angular/router";

@Component({
    selector: 'app-balanceo-sugerencias',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './balanceo-sugerencias.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BalanceoSugerenciasComponent extends AbstractTabComponent implements OnInit {
    mostradoPorPrimeraVez = false;
    loading = signal(false);
    ejecutando = signal(false);
    error = signal<string | null>(null);

    mostrarSoloExcedentes = signal(false);
    searchTerm = signal('');
    // ''  = sin filtro de Ruta
    // 'ALL' = todas las claves de todos los kits de Ruta de la Salud
    // 'KIT_180', 'KIT_96', etc = claves sólo de ese kit
    kitRutaSaludElegido = signal<string>('');

    // kitsRuta = ['KIT_180', 'KIT_96', 'KIT_920', 'KIT_147'];
    // Lista de kits de Ruta de la Salud (desde backend)
    kitsRuta = signal<string[]>([]);
    loadingKitsRuta = signal(false);
    clavesRutasSalud = signal<Set<string> | null>(null);

    ultimaEjecucion = signal<UltimaEjecucion | null>(null);
    resumen = signal<ResumenBalanceo[]>([]);
    detalle = signal<DetalleBalanceo[]>([]);
    filaSeleccionada = signal<ResumenAgrupado | null>(null);

    // 👇 nuevo: detalleGlobal para el Excel
    detalleGlobal = signal<DetalleBalanceo[]>([]);
    exportando = signal(false);

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

    constructor(
        private balanceoService: BalanceoService,
        private articulosService: ArticulosService,
        private excelService: ExcelService,
        private kitsService: KitsService,
        private activatedRoute: ActivatedRoute
    ) {
        super();
        if ( this.activatedRoute.snapshot.url[0].path === 'balanceo') {
            this.isActive = true;
        }
    }

    ngOnInit(): void {
        if (this.mostradoPorPrimeraVez === false && this.isActive) {
            this.onTabActivated();
        }
    }

    private cargarKitsRutaSalud(): void {

        this.loadingKitsRuta.set(true);

        this.kitsService.list().subscribe({
            next: (resp: Kit[]) => {

                const list = (resp ?? []).map(k => k.codigo);
                this.kitsRuta.set(list.sort());
                this.loadingKitsRuta.set(false);
            },
            error: (err) => {
                console.error('Error obteniendo kits Ruta de la Salud', err);
                // Fallback: si falla, dejamos al menos algo para que no muera la UI
                this.kitsRuta.set(['KIT_180', 'KIT_96', 'KIT_920', 'KIT_147']);
                this.loadingKitsRuta.set(false);
            },
        });
    }

    onKitRutaChange(value: string) {
        this.kitRutaSaludElegido.set(value);

        // Sin filtro de Ruta de la Salud
        if (!value) {
            this.clavesRutasSalud.set(null);
            return;
        }

        // 'ALL' => todas las claves de todos los kits
        const kitParam = value === 'ALL' ? undefined : value;

        this.balanceoService.obtenerClavesRutasSalud(kitParam).subscribe({
            next: (resp) => {
                const set = new Set<string>((resp.claves ?? []) as string[]);
                this.clavesRutasSalud.set(set);
            },
            error: (err) => {
                console.error('Error cargando claves de Rutas de la Salud', err);
                this.clavesRutasSalud.set(null);
            },
        });
    }

    private articulosMapa = signal<
        Record<string, { descripcion: string; presentacion?: string; categoria?: string | null }>
        | null
    >(null);


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

        // Detalle global
        this.balanceoService.obtenerDetalleGlobalActual().subscribe({
            next: (resp) => {
                const detalle = ((resp.detalle ?? resp['data']) ?? (resp || [])) as DetalleBalanceo[];
                this.detalleGlobal.set(detalle);
                this.exportando.set(false);
            },
            error: (err) => {
                console.error(err);
                this.error.set('Error al obtener el detalle global para la exportación');
                this.exportando.set(false);
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

    gruposPorClave = computed<GrupoClaveParaBalanceo[]>(() => {
        const lista = this.resumenAgrupado();
        const map = new Map<string, GrupoClaveParaBalanceo>();

        for (const item of lista) {
            let grupo = map.get(item.clave_cnis);
            if (!grupo) {
                grupo = { clave_cnis: item.clave_cnis, almacenes: [] };
                map.set(item.clave_cnis, grupo);
            }
            grupo.almacenes.push(item);
        }

        let grupos = Array.from(map.values()).sort((a, b) =>
            a.clave_cnis.localeCompare(b.clave_cnis)
        );

        // 🔍 Filtro: solo claves donde al menos un almacén tenga excedente
        if (this.mostrarSoloExcedentes()) {
            grupos = grupos.filter(g =>
                g.almacenes.some(a => (a.piezas_excedente ?? 0) > 0)
            );
        }

        // 2) Filtro: texto por clave / descripción
        const term = this.searchTerm().trim().toLowerCase();
        if (term) {
            const mapa = this.articulosMapa();

            grupos = grupos.filter(g => {
                const claveMatch = g.clave_cnis.toLowerCase().includes(term);

                let descMatch = false;
                if (mapa && mapa[g.clave_cnis]?.descripcion) {
                    descMatch = mapa[g.clave_cnis]!.descripcion
                        .toLowerCase()
                        .includes(term);
                }

                return claveMatch || descMatch;
            });
        }

        // 3) Filtro por Rutas de la Salud (kits)
        const kitSel = this.kitRutaSaludElegido();
        const setRutas = this.clavesRutasSalud();
        if (kitSel && setRutas) {
            grupos = grupos.filter((g) => setRutas.has(g.clave_cnis));
        }

        return grupos;
    });

    // trackBy helpers
    trackGrupo = (_: number, grupo: GrupoClaveParaBalanceo) => grupo.clave_cnis;
    trackAlmacen = (_: number, item: ResumenAgrupado) =>
        `${item.clave_cnis}-${item.jurisdiccion_almacen}`;
    /*trackAgrupado = (_: number, item: ResumenAgrupado) =>
        `${item.clave_cnis}-${item.jurisdiccion_almacen}`;*/

    trackDetalle = (_: number, item: DetalleBalanceo) =>
        `${item.clave_cnis}-${item.jurisdiccion_almacen}-${item.clues_destino}-${item.prioridad}`;

    getDescripcionClave(clave: string): string {
        const mapa = this.articulosMapa();
        if (!mapa) return '';
        return mapa[clave]?.descripcion ?? '';
    }

    /** Exporta usando la última ejecución + resumen actual + detalle global */
    async exportarExcelBalanceo() {
        try {
            const ejec = this.ultimaEjecucion();
            const resumen = this.resumen();
            const detalle = this.detalleGlobal();

            if (!resumen.length || !detalle.length) {
                console.warn('No hay datos de balanceo para exportar.');
                return;
            }

            const nombre = `Balanceo_${new Date().toISOString().slice(0, 10)}.xlsx`;
            await this.excelService.exportarBalanceoSugerencias(
                nombre,
                ejec,
                resumen,
                detalle
            );
        } catch (err) {
            console.error('Error al exportar Excel de balanceo', err);
        }
    }

    protected override onTabActivated(): void {
        if (this.mostradoPorPrimeraVez === false) {

            this.cargarUltimaEjecucionYResumen();
            //setTimeout(() => {
            // Cargar descripciones de artículos desde el JSON local
            this.articulosService.getArticulosMapa().subscribe({
                next: (mapa) => this.articulosMapa.set(mapa),
                error: (err) => {
                    console.error('Error cargando mapa de artículos', err);
                    // si falla, simplemente no mostramos descripción
                },
            });
            //}, 5000);

            // 🔹 Cargar las claves de Rutas de la Salud (kits)
            this.balanceoService.obtenerClavesRutasSalud().subscribe({
                next: (resp) => {
                    const set = new Set<string>((resp.claves ?? []) as string[]);
                    this.clavesRutasSalud.set(set);
                },
                error: (err) => {
                    console.error('Error obteniendo claves de Rutas de la Salud', err);
                    // si falla, el filtro simplemente no hará nada
                },
            });

            this.cargarKitsRutaSalud();
            this.mostradoPorPrimeraVez = true;
        }
    }
    protected override onTabDeactivated(): void {
        // No action needed
    }
}