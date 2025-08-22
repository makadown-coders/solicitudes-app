// src/app/features/dashboard-abasto/inventario/inventario-tab.component.ts
import { AfterViewInit, ChangeDetectionStrategy, Component, computed, effect, ElementRef, EnvironmentInjector, inject, OnDestroy, runInInjectionContext, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InventarioVistaRow } from '../../../models/inventario-vista.model';
import { ArticulosService } from '../../../services/articulos.service';
import { CitasService } from '../../../services/citas.service';
import { InventarioService } from '../../../services/inventario.service';
import { Inventario } from '../../../models/Inventario';
import { combineLatest } from 'rxjs';
import { DashboardService } from '../../../services/dashboard.service';
import { UnidadesService } from '../../../services/unidades.service';
import { TrazabilidadService } from '../../../services/trazabilidad.service';
import { FactorUnidad } from '../../../models/factor-unidad';
import { ProveedoresService } from '../../../services/proveedores.service';
import { GruposClavesService } from '../../../services/grupo-clases.service';
import * as XLSX from 'xlsx';
// amCharts v5
import * as am5 from "@amcharts/amcharts5";
import * as am5xy from "@amcharts/amcharts5/xy";
import * as am5percent from "@amcharts/amcharts5/percent";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";
import { StorageSolicitudService } from '../../../services/storage-solicitud.service';


type FuenteRow = { categoria: string; hospital: number; almacen: number };

// Paleta IMSS-Bienestar (hex -> am5.color)
const IMSS_COLORS = {
    verde: 0x006341,       // Hospital
    verdeClaro: 0x00A67C,
    dorado: 0xFFD166,
    azul: 0x3B82F6,        // Almacén
    gris: 0x6B7280,
    celeste: 0x60A5FA,
};

const NO_CAT = 'NO ESPECIFICADO';

function normalizeCategoria(cat?: string | null): string {
    const s = (cat ?? '').trim();
    return s ? s : NO_CAT;
}


function imssColorList(root: am5.Root) {
    return [
        am5.color(IMSS_COLORS.verde),
        am5.color(IMSS_COLORS.azul),
        am5.color(IMSS_COLORS.dorado),
        am5.color(IMSS_COLORS.verdeClaro),
        am5.color(IMSS_COLORS.gris),
        am5.color(IMSS_COLORS.celeste),
    ];
}

@Component({
    selector: 'app-inventario-tab',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './inventario-tab.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventarioTabComponent implements AfterViewInit, OnDestroy {
    private invSrv = inject(InventarioService);
    private artSrv = inject(ArticulosService);
    // private citasSrv = inject(CitasService);
    private dashSrv = inject(DashboardService);
    private unidadesSrv = inject(UnidadesService);
    private trazSrv = inject(TrazabilidadService);
    private provSrv = inject(ProveedoresService);
    private gruposSrv = inject(GruposClavesService);
    private storageSolicitudService = inject(StorageSolicitudService);

    private env = inject(EnvironmentInjector);

    // cache reactivo de factores: key = `${clave}__${clues}`
    private factoresMap = signal<Map<string, FactorUnidad>>(new Map());
    private gruposMapa = signal<Map<string, { categoria: string; grupoInsumo: string }>>(new Map());
    grupoFiltro = signal<string>('');

    // para evitar disparar múltiples fetches simultáneos
    private fetchingKeys = new Set<string>();

    // Filtros UI
    query = signal('');
    fuente = signal<'ALL' | 'HOSPITAL' | 'ALMACEN'>('ALL');
    categoriaFiltro = signal<string>('');

    // Paginación front
    page = signal(1);
    pageSize = signal(50);
    // 👇 páginas totales según filtro + pageSize
    totalPages = computed(() =>
        Math.max(1, Math.ceil(this.totalItems() / this.pageSize()))
    );

    // Estado
    loading = signal(true);

    // Datos crudos
    private almacenes = signal<Inventario[]>([]);    // inventario$ (almacenes)
    private hospitales = signal<Inventario[]>([]);   // suma de existencias$ por cada unidad

    // Set de claves que están en CPM (de tu cpms$)
    private cpmsSet = signal<Set<string>>(new Set());
    // + signals
    private articulosMapa = signal<Record<string, { descripcion: string; presentacion?: string; categoria?: string | null }>>({});
    private citasByClaveLote = signal<Map<string, { precio?: number | null; orden?: string | null; fte?: string | null; proveedor?: string | null }>>(new Map());

    @ViewChild('gridScroll', { static: true }) gridScroll!: ElementRef<HTMLDivElement>;
    @ViewChild('topScroll', { static: true }) topScroll!: ElementRef<HTMLDivElement>;
    @ViewChild('dataTable', { static: true }) dataTable!: ElementRef<HTMLTableElement>;
    @ViewChild('theadEl', { static: true }) theadEl!: ElementRef<HTMLTableSectionElement>;

    tableScrollWidth = 0;
    theadHeight = 0;

    @ViewChild('chartAbasto', { static: true }) chartAbasto!: ElementRef<HTMLDivElement>;
    @ViewChild('chartCategoria', { static: true }) chartCategoria!: ElementRef<HTMLDivElement>;
    @ViewChild('chartFuente', { static: true }) chartFuente!: ElementRef<HTMLDivElement>;

    // amCharts roots / series
    private rootAbasto?: am5.Root;
    private rootCategoria?: am5.Root;
    private rootFuente?: am5.Root;

    private pieSeries?: am5percent.PieSeries;
    private catSeries?: am5xy.ColumnSeries;
    private fuenteSeriesHosp?: am5xy.ColumnSeries;
    private fuenteSeriesAlm?: am5xy.ColumnSeries;

    private onGridScroll = () => { };
    private onTopScroll = () => { };
    private onResize = () => { };

    ngAfterViewInit() {

        // sincronizar scrolls (horizontal)
        const grid = this.gridScroll.nativeElement;
        const top = this.topScroll.nativeElement;

        this.onGridScroll = () => { top.scrollLeft = grid.scrollLeft; };
        this.onTopScroll = () => { grid.scrollLeft = top.scrollLeft; };
        this.onResize = () => this.measureGrid();
        // Crear charts una sola vez
        this.createCharts();

        grid.addEventListener('scroll', this.onGridScroll, { passive: true });
        top.addEventListener('scroll', this.onTopScroll, { passive: true });
        window.addEventListener('resize', this.onResize);

        // ✅ crear el effect dentro de un injection context válido
        runInInjectionContext(this.env, () => {
            effect(() => {
                this.pageSlice();                 // lee la signal/computed
                queueMicrotask(() => this.measureGrid());
            });
        });
    }

    private measureGrid() {
        const table = this.dataTable?.nativeElement;
        const thead = this.theadEl?.nativeElement;
        if (!table || !thead) return;

        // ancho real scrolleable de la tabla
        this.tableScrollWidth = table.scrollWidth;

        // alto real del thead para posicionar la barra top
        this.theadHeight = thead.getBoundingClientRect().height;
    }


    constructor() {
        // 0) Cargar grupos de claves una vez (cachea e indexa)
        this.gruposSrv.load().subscribe(mp => {
            // console.log('mp', mp);
            // lo guardamos como Map<string, {categoria, grupoInsumo}>
            const flat = new Map<string, { categoria: string; grupoInsumo: string }>();
            for (const [k, v] of mp.entries()) flat.set(k, { categoria: v.categoria, grupoInsumo: v.grupoInsumo });
            this.gruposMapa.set(flat);
            // console.log('gruposMapa', this.gruposMapa());
        });
        // 1)  Cargar unidades una vez (cachea e indexa)
        this.unidadesSrv.load().subscribe();
        // 2)  Cargar proveedores una vez (cachea e indexa)
        this.provSrv.load().subscribe();
        // 3) Almacenes (ya lo emite tu servicio)
        this.invSrv.inventario$.subscribe(rows => {
            if (!rows || rows.length === 0) {
                rows = this.storageSolicitudService.getInventarioFromLocalStorage();
            }
            this.almacenes.set(rows ?? []);
        });

        // 4) Hospitales: combinamos TODAS las existencias$ (map) en un solo arreglo
        const existenciasStreams = Array.from(this.invSrv.existencias$.values());
        if (existenciasStreams.length) {
            combineLatest(existenciasStreams).subscribe(listas => {
                const merged = ([] as Inventario[]).concat(...listas);
                this.hospitales.set(merged);
            });
        }

        // 5) CPMS → set de claves con cantidad > 0 (considera los "ESTATAL" que generas)
        this.invSrv.cpms$.subscribe(cpms => {
            const claves = new Set<string>();
            for (const r of (cpms ?? [])) {
                if (r && r.clave && r.cantidad > 0) claves.add(this.invSrv.normalizarClave(r.clave));
            }
            this.cpmsSet.set(claves);
        });

        // 6) Artículos → mapa por clave { descripcion, presentacion }
        this.artSrv.getArticulosMapaFromLocal?.().subscribe((m: any) => {
            this.articulosMapa.set(m ?? {});
        });

        // 7) Citas “slim” → mapear por (clave,lote)
        // Estructura esperada: { clave_cnis, lote, precio_unitario?, orden_de_suministro?, fte_fmto? }
        this.dashSrv.citasSlimMap$.subscribe(mp => {
            this.citasByClaveLote.set(mp ?? new Map());
        });

        // 8) Quitar loading cuando tengamos algo
        effect(() => {
            if (this.almacenes().length || this.hospitales().length) this.loading.set(false);
        });

        // 9)🔎 Prefetch de factores para las filas visibles (página actual)
        effect(() => {
            const current = this.pageSlice(); // filas ya enriquecidas con clave, lote, clues (ver mapRow)
            // junta los pares únicos clave__clues
            const missing: Array<{ clave: string; cluesimb: string; key: string }> = [];
            const cache = this.factoresMap();

            for (const r of current) {
                const clave = r.clave;
                const cluesimb = (r.clues || '').trim();
                if (!clave || !cluesimb) continue;
                const key = `${clave}__${cluesimb}`;
                if (!cache.has(key) && !this.fetchingKeys.has(key)) {
                    missing.push({ clave, cluesimb, key });
                }
            }

            if (!missing.length) return;

            // dispara en paralelo pero con cache y control de re-entradas
            (async () => {
                for (const m of missing) this.fetchingKeys.add(m.key);
                try {
                    const results = await Promise.all(
                        missing.map(({ clave, cluesimb }) => this.trazSrv.getFactorConversionPorUnidad(clave, cluesimb))
                    );
                    const next = new Map(cache);
                    for (let i = 0; i < missing.length; i++) {
                        const k = missing[i].key;
                        next.set(k, results[i]);
                        this.fetchingKeys.delete(k);
                    }
                    this.factoresMap.set(next); // trigger recompute de rows
                } catch {
                    // en error, liberamos llaves para reintentos futuros
                    for (const m of missing) this.fetchingKeys.delete(m.key);
                }
            })();
        });

        effect(() => {
            this.query();
            this.fuente();
            this.categoriaFiltro();
            this.page.set(1); // volver a página 1
        });

        effect(() => {
            // cuando cambia la categoría seleccionada, limpiamos el grupo seleccionado
            this.categoriaFiltro();
            this.grupoFiltro.set('');
        });

        effect(() => {
            const tp = this.totalPages();
            const p = this.page();
            if (p > tp) this.page.set(tp);
            if (p < 1) this.page.set(1);
        });

        effect(() => {
            // cuando cambian filtros/paginación, actualizamos gráficos con TODO el filtrado (no solo slice)
            this.filtered();
            queueMicrotask(() => this.updateCharts());
        });
    }

    // Normaliza a “base” de categoría (medicamento / material / otro)
    catBase = (s: string | null | undefined) => {
        const t = (s ?? '').toLowerCase();
        if (t.includes('medica')) return 'MEDICAMENTO';             // “Medicamentos”
        if (t.includes('material')) return 'MATERIAL DE CURACIÓN';  // “Material de Curación”
        return 'OTRA';
    };

    gruposDisponibles = computed(() => {
        const catSel = this.categoriaFiltro();
        const base = this.catBase(catSel);
        if (base === 'OTRA') return [];

        const set = new Set<string>();
        for (const r of this.rows()) {
            if (!r.grupoInsumo) continue;
            const baseRow = this.catBase(r.categoria ?? '');
            if (baseRow === base) set.add(r.grupoInsumo);
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    });

    categoriasDisponibles = computed(() => {
        const set = new Set(this.rows().map(r => r.categoria).filter(Boolean) as string[]);
        return Array.from(set).sort();
    });

    // saltar varias páginas de un jalón
    jump(by: number) {
        const target = Math.min(this.totalPages(), Math.max(1, this.page() + by));
        this.page.set(target);
        // opcional: subir el grid al inicio
        this.gridScroll?.nativeElement?.scrollTo({ top: 0, behavior: 'smooth' });
    }

    goTo(n: number) {
        if (n >= 1 && n <= this.totalPages()) {
            this.page.set(n);
            this.gridScroll?.nativeElement?.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    // 🔎 Mapeo a las 18 columnas + extras
    rows = computed<InventarioVistaRow[]>(() => {
        const cpms = this.cpmsSet();
        const grupos = this.gruposMapa();

        const mapRow = (inv: Inventario, tipo: 'HOSPITAL' | 'ALMACEN'): InventarioVistaRow => {
            const clave = this.invSrv.normalizarClave(inv.clave);

            // 1) CLUES: directo si viene; si no, por nombre de unidad/almacén
            const cluesDirecto = (inv as any).clues ?? (inv as any).cluesimb ?? null;
            const nombreUnidad = (inv as any).unidad ?? (inv as any).almacen ?? null;
            const clues = (cluesDirecto ?? this.unidadesSrv.getCluesimbFor(nombreUnidad ?? undefined, undefined) ?? '').trim();
            const cluesSSA = this.unidadesSrv.getCluesSSAFor(nombreUnidad ?? undefined, undefined) ?? '';

            // 2) Citas y Artículos
            const keyCita = `${clave}__${cleanLote(inv.lote)}`;
            const citaInfo = this.citasByClaveLote().get(keyCita) || {};
            const art = this.articulosMapa()[clave] ?? {};

            // 3) Factor por clave+clues
            const keyFactor = `${clave}__${clues}`;
            const factor = this.factoresMap().get(keyFactor); // { en_dispensacion, cantidad_fc }
            const dispBase = Math.max(0, toNum(inv.disponible) - toNum(inv.comprometidos));
            const dispAjustado = aplicarFactor(dispBase, factor);

            // 4) categoria de clave
            let grupoInsumo: string | null = null;
            // let categoria: string | null = art.categoria ?? null;
            const hit = grupos.get(clave);
            if (hit) {
                // const esMedsOMat = catLower.includes('medicamentos') || catLower.includes('material');
                grupoInsumo = hit.grupoInsumo;
            }

            const prov = this.provSrv.findByNombre(citaInfo.proveedor ?? '');
            const rfcProveedor = prov?.rfc ?? null;

            return {
                entidadFederativa: 'BAJA CALIFORNIA',
                clues,
                ordenDeSuministro: citaInfo.orden ?? null,
                rfcProveedor: rfcProveedor,
                fuenteFinanciamiento: citaInfo.fte ?? (inv as any).fuente ?? null,
                partidaPresupuestal: slicePartida(inv.partida),
                clave,
                categoria: normalizeCategoria(art.categoria),
                grupoInsumo,
                descripcion: safeStr(inv.descripcion) || art.descripcion || null,
                precioUnitario: (citaInfo.precio ?? null) as number | null,
                valorTotal: (citaInfo.precio != null ? citaInfo.precio * dispAjustado : null) as number | null,
                insumoEnCPM: cpms.has(clave) ? 'SI' : 'NO',
                estadoInsumo: 1,
                inventarioDisponible: dispAjustado,
                unidadMedida: art.presentacion ?? null,
                lote: cleanLote(inv.lote),
                fechaCaducidad: inv.caducidad ? 
                                formatOrDefault(inv.caducidad, '2025-01-01') :
                                null,
                fechaFabricacion: '2025-01-01',
                fechaRecepcion: formatOrDefault(inv.fecha_entrada, '2025-01-01'),
                unidadOrigenTexto: safeStr((inv as any).almacen) ?? safeStr((inv as any).unidad) ?? null,
                tipoFuente: tipo,
                cluesSSA: cluesSSA
            } as InventarioVistaRow;
        };


        const hos = this.hospitales().map(r => mapRow(r, 'HOSPITAL'));
        const alm = this.almacenes().map(r => mapRow(r, 'ALMACEN'));
        return [...hos, ...alm];
    });

    filtered = computed(() => {
        const q = this.query().toLowerCase().trim();
        const f = this.fuente();
        const cat = this.categoriaFiltro();
        const grp = this.grupoFiltro();

        const baseCatSel = this.catBase(cat);

        return this.rows().filter(r => {
            // Filtro fuente (ALL | HOSPITAL | ALMACEN)
            const okFuente = (f === 'ALL') || (r.tipoFuente === f);

            // Filtro categoría:
            // - Si seleccionaste “MEDICAMENTO”, acepta filas cuya categoría “huela” a medicamento
            // - Si seleccionaste “MATERIAL DE CURACIÓN, idem para material
            // - En cualquier otro caso (categorías enumeradas) requiere igualdad exacta si cat tiene valor
            const baseRow = this.catBase(r.categoria ?? '');
            const okCat =
                !cat ||
                (baseCatSel === 'MEDICAMENTO' && baseRow === 'MEDICAMENTO') ||
                (baseCatSel === 'MATERIAL DE CURACIÓN' && baseRow === 'MATERIAL DE CURACIÓN') ||
                (baseCatSel === 'OTRA' && r.categoria === cat);

            // Filtro grupo (solo aplica si el grupoFiltro tiene valor)
            const okGrupo = !grp || r.grupoInsumo === grp;

            // Filtro texto libre
            if (!q) return okFuente && okCat && okGrupo;
            const bag = `${r.clave} ${r.categoria ?? ''} ${r.grupoInsumo ?? ''} ${r.descripcion ?? ''} ${r.lote ?? ''} ${r.unidadOrigenTexto ?? ''} ${r.clues} ${r.ordenDeSuministro ?? ''} ${r.rfcProveedor ?? ''} ${r.fuenteFinanciamiento ?? ''} ${r.partidaPresupuestal ?? ''}`.toLowerCase();
            return okFuente && okCat && okGrupo && bag.includes(q);
        });
    });


    totalItems = computed(() => this.filtered().length);
    pageSlice = computed(() => {
        const p = this.page(), ps = this.pageSize();
        const start = (p - 1) * ps;
        return this.filtered().slice(start, start + ps);
    });

    prevPage() { this.page.set(Math.max(1, this.page() - 1)); }
    nextPage() { if (this.page() * this.pageSize() < this.totalItems()) this.page.set(this.page() + 1); }

    ngOnDestroy() {
        const grid = this.gridScroll?.nativeElement;
        const top = this.topScroll?.nativeElement;
        if (grid) grid.removeEventListener('scroll', this.onGridScroll);
        if (top) top.removeEventListener('scroll', this.onTopScroll);
        window.removeEventListener('resize', this.onResize);
        if (this.rootAbasto) { this.rootAbasto.dispose(); this.rootAbasto = undefined; }
        if (this.rootCategoria) { this.rootCategoria.dispose(); this.rootCategoria = undefined; }
        if (this.rootFuente) { this.rootFuente.dispose(); this.rootFuente = undefined; }
    }

    private updateCharts() {
        const rows = this.filtered();

        // ----- Donut % abasto -----        
        const totalCpm = this.cpmsSet().size; // rows.filter(r => r.insumoEnCPM === 'SI').length;
        // console.log('updateDonut totalCpms', totalCpm);
        const conInventario = rows.filter(r => r.insumoEnCPM === 'SI' && (r.inventarioDisponible ?? 0) > 0);
        // hacer un distinct de clave en conInventario
        const conInv = new Set(conInventario.map(r => r.clave)).size;
        // console.log('updateDonut conInv', conInv);
        const abastoData = [
            { label: "Con inventario", value: conInv },
            { label: "Sin inventario", value: Math.max(0, totalCpm - conInv) }
        ];
        if (this.pieSeries) {
            this.pieSeries.data.setAll(abastoData);
            const pct = totalCpm ? Math.round((conInv * 100) / totalCpm) : 0;
            const lbl = (this as any)._abastoCenterLabel as am5.Label | undefined;
            lbl?.set("text", `${conInv}/${totalCpm} (${pct}%)`);
        }

        // ----- Barras por categoría -----
        const byCat = new Map<string, number>();
        for (const r of rows) {
            const cat = r.categoria ?? NO_CAT;
            byCat.set(cat, (byCat.get(cat) ?? 0) + (Number(r.inventarioDisponible) || 0));
        }
        const catData = Array.from(byCat, ([categoria, inventario]) => ({ categoria, inventario }));
        if (this.catSeries) {
            const x = this.catSeries.get("xAxis") as am5xy.CategoryAxis<any>;
            x.data.setAll(catData);
            this.catSeries.data.setAll(catData);
        }

        // ----- Stacked por fuente -----
        const mapa = new Map<string, { categoria: string; HOSPITAL: number; ALMACEN: number }>();
        for (const r of rows) {
            const cat = r.categoria ?? NO_CAT;
            if (!mapa.has(cat)) mapa.set(cat, { categoria: cat, HOSPITAL: 0, ALMACEN: 0 });
            const acc = mapa.get(cat)!;
            const val = Number(r.inventarioDisponible) || 0;
            if (r.tipoFuente === 'HOSPITAL') acc.HOSPITAL += val;
            else if (r.tipoFuente === 'ALMACEN') acc.ALMACEN += val;
        }
        const fuenteData = Array.from(mapa.values());
        if (this.fuenteSeriesHosp && this.fuenteSeriesAlm) {
            const x = this.fuenteSeriesHosp.get("xAxis") as am5xy.CategoryAxis<any>;
            x.data.setAll(fuenteData);
            this.fuenteSeriesHosp.data.setAll(fuenteData);
            this.fuenteSeriesAlm.data.setAll(fuenteData);
        }
    }

    private createCharts() {
        // 1) % Abasto CPM (donut)
        this.rootAbasto = am5.Root.new(this.chartAbasto.nativeElement);
        this.rootAbasto.setThemes([am5themes_Animated.new(this.rootAbasto)]);
        const chartA = this.rootAbasto.container.children.push(
            am5percent.PieChart.new(this.rootAbasto, {
                endAngle: 360,
                innerRadius: am5.percent(50)
            })
        );
        this.pieSeries = chartA.series.push(
            am5percent.PieSeries.new(this.rootAbasto, {
                valueField: "value",
                categoryField: "label",
                endAngle: 360
            })
        );

        // Evita recortes: quita labels/ticks del pie y agrega padding al chart
        /*this.pieSeries.labels.template.setAll({ forceHidden: true });
        this.pieSeries.ticks.template.setAll({ forceHidden: true });
        chartA.setAll({ paddingTop: 8, paddingRight: 12, paddingBottom: 8, paddingLeft: 12 });*/
        this.pieSeries.labels.template.setAll({
            text: "{category}",
            inside: true,
            radius: 10
        });
        this.pieSeries.ticks.template.setAll({ visible: true });
        chartA.setAll({ paddingLeft: 64, paddingRight: 64, paddingTop: 18, paddingBottom: 18 });


        // Leyenda centrada abajo
        const legendA = chartA.children.push(am5.Legend.new(this.rootAbasto, {
            centerX: am5.p50, x: am5.p50,
            centerY: am5.p100, y: am5.p100,
            paddingTop: 8
        }));
        legendA.data.setAll(this.pieSeries.dataItems);


        this.pieSeries.set("colors", am5.ColorSet.new(this.rootAbasto, {
            colors: [am5.color(IMSS_COLORS.verde), am5.color(IMSS_COLORS.gris)]
        }));

        // label central (guárdalo en la instancia para actualizarlo)
        const centerLabel = chartA.children.push(am5.Label.new(this.rootAbasto, {
            // text: "0%",
            centerX: am5.p50,
            x: am5.p50,
            layout: this.rootAbasto.verticalLayout,
            // centerY: am5.p50,
            // fontSize: 26,
            // fontWeight: "700",
        }));
        // @ts-ignore: guardamos referencia para updateCharts
        (this as any)._abastoCenterLabel = centerLabel;

        // 2) Inventario por categoría (barras)
        this.rootCategoria = am5.Root.new(this.chartCategoria.nativeElement);
        this.rootCategoria.setThemes([am5themes_Animated.new(this.rootCategoria)]);
        const chartC = this.rootCategoria.container.children.push(
            am5xy.XYChart.new(this.rootCategoria, {
                layout: this.rootCategoria.verticalLayout
            })
        );
        const colorSetCat = am5.ColorSet.new(this.rootCategoria, { colors: imssColorList(this.rootCategoria) });
        chartC.set("colors", colorSetCat);

        const xCat = chartC.xAxes.push(am5xy.CategoryAxis.new(this.rootCategoria, {
            categoryField: "categoria",
            renderer: am5xy.AxisRendererX.new(this.rootCategoria, { minGridDistance: 20 }),
            tooltip: am5.Tooltip.new(this.rootCategoria, {})
        }));
        xCat.get("renderer")!.labels.template.setAll({
            fontSize: 10,
            rotation: -30,
            centerY: am5.p50,
            dy: 10,
            maxWidth: 110,
            oversizedBehavior: "truncate" // evita empalmes
        });
        const yCat = chartC.yAxes.push(am5xy.ValueAxis.new(this.rootCategoria, {
            renderer: am5xy.AxisRendererY.new(this.rootCategoria, {})
        }));
        this.catSeries = chartC.series.push(am5xy.ColumnSeries.new(this.rootCategoria, {
            name: "Inventario",
            xAxis: xCat,
            yAxis: yCat,
            valueYField: "inventario",
            categoryXField: "categoria",
            tooltip: am5.Tooltip.new(this.rootCategoria, { labelText: "{valueY}" })
        }));
        // etiquetas pequeñas
        xCat.get("renderer")!.labels.template.setAll({ fontSize: 10, rotation: -30, centerY: am5.p50, dy: 10 });

        // 3) Inventario por fuente (stacked HOSPITAL vs ALMACEN)
        this.rootFuente = am5.Root.new(this.chartFuente.nativeElement);
        this.rootFuente.setThemes([am5themes_Animated.new(this.rootFuente)]);
        const chartF = this.rootFuente.container.children.push(
            am5xy.XYChart.new(this.rootFuente, {
                layout: this.rootFuente.verticalLayout
            })
        );
        const xFuente = chartF.xAxes.push(am5xy.CategoryAxis.new(this.rootFuente, {
            categoryField: "categoria",
            renderer: am5xy.AxisRendererX.new(this.rootFuente, { minGridDistance: 20 })
        }));
        xFuente.get("renderer")!.labels.template.setAll({
            fontSize: 10,
            rotation: -15,
            centerY: am5.p50,
            dy: 8,
            maxWidth: 110,
            oversizedBehavior: "truncate"
        });
        const yFuente = chartF.yAxes.push(am5xy.ValueAxis.new(this.rootFuente, {
            renderer: am5xy.AxisRendererY.new(this.rootFuente, {})
        }));

        this.fuenteSeriesHosp = chartF.series.push(am5xy.ColumnSeries.new(this.rootFuente, {
            name: "Hospital",
            stacked: true,
            xAxis: xFuente, yAxis: yFuente,
            valueYField: "HOSPITAL",
            categoryXField: "categoria",
            tooltip: am5.Tooltip.new(this.rootFuente, { labelText: "Hospital: {valueY}" })
        }));

        this.fuenteSeriesAlm = chartF.series.push(am5xy.ColumnSeries.new(this.rootFuente, {
            name: "Almacén",
            stacked: true,
            xAxis: xFuente, yAxis: yFuente,
            valueYField: "ALMACEN",
            categoryXField: "categoria",
            tooltip: am5.Tooltip.new(this.rootFuente, { labelText: "Almacén: {valueY}" })
        }));

        // Leyenda para stacked
        const legend = chartF.children.push(am5.Legend.new(this.rootFuente, { centerX: am5.p50, x: am5.p50 }));
        legend.data.setAll([this.fuenteSeriesHosp, this.fuenteSeriesAlm]);

        // Primera carga
        this.updateCharts();
    }


    exportarExcel() {
        // 1) Tomamos TODO lo filtrado (no solo la página)
        const rows = this.filtered();

        // 👇 comparación estricta (respeta acento y mayúsculas)
        const esMedOMat = (cat?: string | null) => {
            if (!cat) return false;
            return (
                cat.localeCompare('MEDICAMENTO', 'es', { sensitivity: 'variant' }) === 0 ||
                cat.localeCompare('MATERIAL DE CURACIÓN', 'es', { sensitivity: 'variant' }) === 0
            );
        };

        // 2) Definimos el orden de columnas (1..20)
        const headers = [
            'ENTIDAD FEDERATIVA',  // 1
            'CLUES',               // 2
            'UNIDAD',
            'ORDEN DE SUMINISTRO', // 3
            'RFC PROVEEDOR',       // 4
            'FUENTE DE FINANCIAMIENTO', // 5
            'PARTIDA PRESUPUESTAL',     // 6
            'CLAVE/CNIS',          // 7
            'CATEGORÍA',            // 8
            'GRUPO / INSUMO',       // 9
            'DESCRIPCIÓN',         // 10
            'PRECIO UNITARIO',     // 11
            'VALOR TOTAL',         // 12
            'INSUMO EN CPM',       // 13
            'ESTADO DEL INSUMO',   // 14
            'INVENTARIO DISPONIBLE', // 15
            'UNIDAD DE MEDIDA',    // 16
            'LOTE',                // 17
            'FECHA DE CADUCIDAD',  // 18
            'FECHA DE FABRICACIÓN',// 19
            'FECHA DE RECEPCIÓN',  // 20
        ] as const;

        // 3) Mapeo a la forma requerida
        const data = rows.map(r => {
            const incluirGrupo = esMedOMat(r.categoria);
            const unidad = (r.clues && this.unidadesSrv.findByCluesimb(r.clues)?.nombre)
                || r.unidadOrigenTexto
                || '';

            return {
                'ENTIDAD FEDERATIVA': 'BAJA CALIFORNIA',
                'CLUES': r.clues ?? '',
                'UNIDAD': unidad,
                'ORDEN DE SUMINISTRO': r.ordenDeSuministro ?? '',
                'RFC PROVEEDOR': r.rfcProveedor ?? '',
                'FUENTE DE FINANCIAMIENTO': r.fuenteFinanciamiento ?? '',
                'PARTIDA PRESUPUESTAL': r.partidaPresupuestal ?? '',
                'CLAVE/CNIS': r.clave ?? '',
                'CATEGORÍA': r.categoria ?? '',
                'GRUPO / INSUMO': incluirGrupo ? (r.grupoInsumo ?? '') : '',
                'DESCRIPCIÓN': r.descripcion ?? '',
                'PRECIO UNITARIO': r.precioUnitario ?? null,
                'VALOR TOTAL': r.valorTotal ?? null,
                'INSUMO EN CPM': r.insumoEnCPM ?? 'NO',
                'ESTADO DEL INSUMO': r.estadoInsumo ?? 1,
                'INVENTARIO DISPONIBLE': r.inventarioDisponible ?? 0,
                'UNIDAD DE MEDIDA': r.unidadMedida ?? '',
                'LOTE': r.lote ?? '',

                // ⬇⬇ aquí el formateo fijo a "dd/mm/yyyy 00:00:00", sin UTC
                'FECHA DE CADUCIDAD': formatExcelDate0(
                    r.fechaCaducidad, '31/12/2025 00:00:00'
                ),
                'FECHA DE FABRICACIÓN': formatExcelDate0(
                    r.fechaFabricacion, '01/01/2025 00:00:00'
                ),
                'FECHA DE RECEPCIÓN': formatExcelDate0(
                    r.fechaRecepcion, '01/01/2025 00:00:00'
                ),
            };
        });

        // 4) Hoja y libro
        const ws = XLSX.utils.json_to_sheet(data, { header: [...headers] as any });

        // 5) Ajustes visuales (anchos de columnas aproximados)
        ws['!cols'] = [
            { wch: 18 }, // ENTIDAD
            { wch: 16 }, // CLUES
            { wch: 30 }, // ORDEN
            { wch: 18 }, // RFC
            { wch: 26 }, // FUENTE FIN.
            { wch: 12 }, // PARTIDA
            { wch: 18 }, // CLAVE/CNIS
            { wch: 18 }, // CATEGORÍA
            { wch: 24 }, // GRUPO / INSUMO
            { wch: 60 }, // DESCRIPCIÓN
            { wch: 14 }, // PRECIO UNIT.
            { wch: 16 }, // VALOR TOTAL
            { wch: 12 }, // EN CPM
            { wch: 8 }, // ESTADO
            { wch: 16 }, // DISPONIBLE
            { wch: 18 }, // U. MEDIDA
            { wch: 18 }, // LOTE
            { wch: 20 }, // CADUCIDAD
            { wch: 20 }, // FABRICACIÓN
            { wch: 20 }, // RECEPCIÓN
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Inventario');

        // 6) Nombre del archivo con timestamp
        const stamp = new Date();
        const yyyy = stamp.getFullYear();
        const mm = String(stamp.getMonth() + 1).padStart(2, '0');
        const dd = String(stamp.getDate()).padStart(2, '0');
        const hh = String(stamp.getHours()).padStart(2, '0');
        const mi = String(stamp.getMinutes()).padStart(2, '0');
        const ss = String(stamp.getSeconds()).padStart(2, '0');
        const filename = `Inventario_IMSSB_${yyyy}${mm}${dd}_${hh}${mi}${ss}.xlsx`;

        // 7) Descargar
        XLSX.writeFile(wb, filename, { bookType: 'xlsx' });
    }

    /**
     * Exporta a Excel la información del inventario en formato requerido por SACIA
     * 
     * @remarks
     * La exportación incluye solo las filas con ordenes de suministro válidas y con inventario disponible > 0.
     * Se mantiene el orden de columnas siguiente:
     * 1. ENTIDAD
     * 2. CLUES
     * 3. ORDEN DE SUMINISTRO
     * 4. RFC
     * 5. CLAVE
     * 14. ESTADO DEL INSUMO
     * 15. INVENTARIO DISPONIBLE
     * 16. LOTE
     * 18. F_CAD (fecha de caducidad)
     * 19. F_FAB (fecha de fabricación)
     * 20. F_REC (fecha de recepción)
     * 
     * El nombre del archivo se genera con un timestamp en formato "dd/mm/yyyy hh:mm:ss"
     */
    exportarExcelSACIA() {
        // 1) Tomamos TODO lo filtrado (no solo la página)
        const rows = this.filtered();

        // 2) Definimos el orden de columnas (1..20)
        const headers = [
            'ENTIDAD',  // 1
            'CLUES',               // 2
            'ORDEN DE SUMINISTRO', // 3
            'RFC',       // 4
            'CLAVE',          // 7
            'ESTADO DEL INSUMO',   // 14
            'INVENTARIO DISPONIBLE', // 15
            'LOTE',              // 16
            'F_CAD',  // 18
            'F_FAB',// 19
            'F_REC',  // 20
        ] as const;

        // 3) Mapeo a la forma requerida ignorando ordenes de suministro nulas y con inventario disponible > 0
        const data = rows.filter(r => r.ordenDeSuministro !== null && 
            r.ordenDeSuministro !== '' && 
            r.inventarioDisponible > 0).map(r => {
            return {
                'ENTIDAD': 'BAJA CALIFORNIA',
                'CLUES': r.cluesSSA ?? (r.clues ?? ''),
                'ORDEN DE SUMINISTRO': r.ordenDeSuministro ?? '',
                'RFC': r.rfcProveedor ?? '',
                'CLAVE': r.clave ?? '',
                'ESTADO DEL INSUMO': r.estadoInsumo ?? 1,
                'INVENTARIO DISPONIBLE': r.inventarioDisponible ?? 0,
                'LOTE': r.lote ?? '',
                // ⬇⬇ aquí el formateo fijo a "dd/mm/yyyy 00:00:00", sin UTC
                'F_CAD': formatExcelDate0(
                    r.fechaCaducidad, '31/12/2025 00:00:00'
                ),
                'F_FAB': formatExcelDate0(
                    r.fechaFabricacion, '01/01/2025 00:00:00'
                ),
                'F_REC': formatExcelDate0(
                    r.fechaRecepcion, '01/01/2025 00:00:00'
                ),
            };
        });

        // 4) Hoja y libro
        const ws = XLSX.utils.json_to_sheet(data, { header: [...headers] as any });

        // 5) Ajustes visuales (anchos de columnas aproximados)
        ws['!cols'] = [
            { wch: 18 }, // ENTIDAD
            { wch: 16 }, // CLUES
            { wch: 30 }, // ORDEN
            { wch: 18 }, // RFC
            { wch: 18 }, // CLAVE/CNIS
            { wch: 8 }, // ESTADO
            { wch: 16 }, // DISPONIBLE
            { wch: 18 }, // LOTE
            { wch: 20 }, // CADUCIDAD
            { wch: 20 }, // FABRICACIÓN
            { wch: 20 }, // RECEPCIÓN
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Inventario');

        // 6) Nombre del archivo con timestamp
        const stamp = new Date();
        const yyyy = stamp.getFullYear();
        const mm = String(stamp.getMonth() + 1).padStart(2, '0');
        const dd = String(stamp.getDate()).padStart(2, '0');
        const hh = String(stamp.getHours()).padStart(2, '0');
        const mi = String(stamp.getMinutes()).padStart(2, '0');
        const ss = String(stamp.getSeconds()).padStart(2, '0');
        const filename = `LAYOUT_SACIA_IMSSB_${yyyy}${mm}${dd}_${hh}${mi}${ss}.xlsx`;

        // 7) Descargar
        XLSX.writeFile(wb, filename, { bookType: 'xlsx' });
    }

    private buildInventarioPorCategoria(containerId: string, rows: Array<{ categoria: string, total: number }>) {
        const root = am5.Root.new(containerId);
        root.setThemes([am5themes_Animated.new(root)]);
        root._logo?.dispose?.();

        const chart = root.container.children.push(am5xy.XYChart.new(root, {
            layout: root.verticalLayout,
            panX: false, panY: false, wheelX: 'none', wheelY: 'none'
        }));

        // Ejes
        const xRenderer = am5xy.AxisRendererX.new(root, { minGridDistance: 20, inside: false });
        // oculta/estiliza la grilla DESPUÉS de crear el renderer
        xRenderer.grid.template.setAll({ visible: false });       // o { strokeOpacity: 0 }

        const x = chart.xAxes.push(am5xy.CategoryAxis.new(root, {
            categoryField: 'categoria',
            renderer: xRenderer,
        }));

        const yRenderer = am5xy.AxisRendererY.new(root, {});
        yRenderer.grid.template.setAll({ strokeOpacity: 0.1 });
        const y = chart.yAxes.push(am5xy.ValueAxis.new(root, { renderer: yRenderer }));

        x.data.setAll(rows);

        const series = chart.series.push(am5xy.ColumnSeries.new(root, {
            name: 'Inventario',
            xAxis: x, yAxis: y,
            valueYField: 'total',
            categoryXField: 'categoria',
            tooltip: am5.Tooltip.new(root, { labelText: '{valueY.formatNumber("#,###")}' })
        }));

        const colorSet = am5.ColorSet.new(root, { colors: imssColorList(root) });
        chart.set('colors', colorSet);

        // columnas y labels de valor
        series.columns.template.setAll({
            width: am5.percent(70),
            strokeOpacity: 0,
        });

        series.bullets.push(() => am5.Bullet.new(root, {
            locationY: 0.5,
            sprite: am5.Label.new(root, {
                text: '{valueY.formatNumber("#,###")}',
                centerX: am5.p50, centerY: am5.p100,
                dy: -12, fontSize: 12, fill: am5.color(0x111827)
            })
        }));

        series.data.setAll(rows);

        return root;
    }

    private buildAbastoDonut(containerId: string, data: Array<{ label: string, value: number }>) {
        const root = am5.Root.new(containerId);
        root.setThemes([am5themes_Animated.new(root)]);

        // paleta
        root.interfaceColors.set('grid', am5.color(0xE5E7EB));
        root.interfaceColors.set('text', am5.color(0x111827));
        root._logo?.dispose?.();

        const chart = root.container.children.push(
            am5percent.PieChart.new(root, {
                layout: root.verticalLayout,
                innerRadius: am5.percent(60),
                radius: am5.percent(95)
            })
        );

        const series = chart.series.push(
            am5percent.PieSeries.new(root, {
                name: 'Abasto',
                valueField: 'value',
                categoryField: 'label'
            })
        );

        // Colores: disponible (verde) / sin inventario (gris)
        series.get('colors')!.set('colors', [
            am5.color(IMSS_COLORS.verde),
            am5.color(IMSS_COLORS.gris)
        ]);

        series.data.setAll(data);

        // Label central con % (primer elemento asumido como “Con inventario”)
        const total = data.reduce((a, b) => a + b.value, 0) || 1;
        const pct = Math.round((data[0]?.value ?? 0) * 100 / total);
        chart.children.push(am5.Label.new(root, {
            text: `${pct}%`,
            centerX: am5.p50, centerY: am5.p50,
            fontSize: 24, fontWeight: '700'
        }));

        // tooltips
        series.slices.template.setAll({
            tooltipText: '{category}: {value.formatNumber("#,###")}'
        });

        // bullets de valor en cada slice (opcional)
        series.labels.template.setAll({
            text: '{category}',
            fill: am5.color(0x374151),
        });

        return root;
    }

    private buildInventarioPorFuenteStacked(containerId: string, rows: FuenteRow[]) {
        const root = am5.Root.new(containerId);
        root.setThemes([am5themes_Animated.new(root)]);
        root._logo?.dispose?.();

        const chart = root.container.children.push(am5xy.XYChart.new(root, {
            layout: root.verticalLayout,
            panX: false, panY: false, wheelX: 'none', wheelY: 'none'
        }));

        const xRenderer = am5xy.AxisRendererX.new(root, { minGridDistance: 20 });
        xRenderer.grid.template.setAll({ visible: false });  // o { strokeOpacity: 0 }

        const x = chart.xAxes.push(am5xy.CategoryAxis.new(root, {
            categoryField: 'categoria',
            renderer: xRenderer
        }));

        const y = chart.yAxes.push(am5xy.ValueAxis.new(root, {
            renderer: am5xy.AxisRendererY.new(root, {}),
            calculateTotals: true
        }));

        x.data.setAll(rows);

        const makeSeries = (name: string, field: keyof FuenteRow, colorHex: number) => {
            const s = chart.series.push(am5xy.ColumnSeries.new(root, {
                name, xAxis: x, yAxis: y,
                valueYField: field as string,
                categoryXField: 'categoria',
                stacked: true,
                tooltip: am5.Tooltip.new(root, { labelText: `${name}: {valueY.formatNumber("#,###")}` })
            }));
            s.columns.template.setAll({
                width: am5.percent(80),
                strokeOpacity: 0,
                fill: am5.color(colorHex)
            });
            // labels
            s.bullets.push(() => am5.Bullet.new(root, {
                locationY: 0.5,
                sprite: am5.Label.new(root, {
                    text: '{valueY.formatNumber("#,###")}',
                    centerX: am5.p50, centerY: am5.p100, dy: -12, fontSize: 11
                })
            }));
            s.data.setAll(rows);
            return s;
        };

        const sHospital = makeSeries('Hospital', 'hospital', IMSS_COLORS.verde);
        const sAlmacen = makeSeries('Almacén', 'almacen', IMSS_COLORS.azul);

        // Leyenda
        chart.children.push(am5.Legend.new(root, {
            useDefaultMarker: true,
            centerX: am5.p50, x: am5.p50,
            dy: 8
        })).data.setAll([sHospital, sAlmacen]);

        return root;
    }


}

function aplicarFactor(disponible: number, factor?: FactorUnidad): number {
    if (!factor) return disponible; // aún no cargado → muestra base (se actualizará cuando llegue)
    // en_dispensacion: 1/0, cantidad_fc: >0
    if ((factor.en_dispensacion ?? 0) === 1 && toNum(factor.cantidad_fc) > 0) {
        return disponible / Number(factor.cantidad_fc);
    }
    return disponible;
}

// ===== helpers =====
function toNum(v: any): number { const n = Number(v); return isFinite(n) ? n : 0; }
function safeStr(v: any): string | null { return v == null ? null : String(v); }
function formatOrDefault(d: any, fallback: string) {
    // null/undefined/cadena vacía → fallback
    if (d == null || d === '') return fallback;

    // 🔸 Si ya es string, NO la toques: regresa tal cual
    if (typeof d === 'string') {
        const s = d.trim();
        if (!s || s.includes('NaN')) return fallback; // sanidad básica
        return s; // <-- sin convertir ni re-formatear
    }

    // 🔸 Si es un Date válido, formatea DD/MM/AAAA HH:mm:ss
    if (d instanceof Date && !isNaN(+d)) {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    // 🔸 Otros tipos (número Excel serial, etc.) → intenta como Date, si no, a string
    const maybe = new Date(d);
    if (!isNaN(+maybe)) {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${pad(maybe.getDate())}/${pad(maybe.getMonth() + 1)}/${maybe.getFullYear()} ${pad(maybe.getHours())}:${pad(maybe.getMinutes())}:${pad(maybe.getSeconds())}`;
    }

    return String(d);
}

function cleanLote(l?: string) {
    if (!l) return '';
    return l.replace(/[\/"']/g, '').slice(0, 20).trim();
}
function slicePartida(p?: string | number | null) {
    if (p == null) return null;
    if (typeof p === 'number') return String(p);
    const m = String(p).match(/\d{5,6}/);
    return m ? m[0] : String(p);
}

function formatExcelDate0(d: any, fallback: string) {
    // 1) vacío → fallback
    if (d == null || d === '') return fallback;

    // 2) si ya es string:
    if (typeof d === 'string') {
        const s = d.trim();
        if (!s || s.includes('NaN')) return fallback;

        // a) ISO corto: YYYY-MM-DD → dd/mm/yyyy 00:00:00
        const iso = /^(\d{4})-(\d{2})-(\d{2})$/;
        const mIso = s.match(iso);
        if (mIso) {
            const [, yyyy, mm, dd] = mIso;
            return `${dd}/${mm}/${yyyy} 00:00:00`;
        }

        // b) Ya viene como dd/mm/yyyy o dd/mm/yyyy hh:mm:ss → normalizar a 00:00:00
        const dmy = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+\d{2}:\d{2}:\d{2})?$/;
        const mDmy = s.match(dmy);
        if (mDmy) {
            const [, dd, mm, yyyy] = mDmy;
            return `${dd}/${mm}/${yyyy} 00:00:00`;
        }

        // c) Otro string → lo dejamos tal cual (mejor no tocar)
        return s;
    }

    // 3) Date u otros tipos -> formatear a dd/mm/yyyy 00:00:00 sin cambiar huso
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(+dt)) return fallback;
    const pad = (n: number) => String(n).padStart(2, '0');
    const dd = pad(dt.getDate());
    const mm = pad(dt.getMonth() + 1);
    const yyyy = dt.getFullYear();
    return `${dd}/${mm}/${yyyy} 00:00:00`;
}

