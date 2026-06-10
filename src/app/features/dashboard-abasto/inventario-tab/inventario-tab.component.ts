// src/app/features/dashboard-abasto/inventario/inventario-tab.component.ts
import {
    AfterViewInit,
    // AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    ElementRef,
    EnvironmentInjector,
    inject,
    OnDestroy,
    runInInjectionContext,
    signal,
    ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InventarioVistaRow } from '../../../models/inventario-vista.model';
import { ArticulosService } from '../../../services/articulos.service';
import { InventarioService } from '../../../services/inventario.service';
import { Inventario } from '../../../models/Inventario';
import { combineLatest } from 'rxjs';
import { UnidadesService } from '../../../services/unidades.service';
import { TrazabilidadService } from '../../../services/trazabilidad.service';
import { aplicarFactorConversion, FactorUnidad } from '../../../models/factor-unidad';
import { ProveedoresService } from '../../../services/proveedores.service';
import { GruposClavesService } from '../../../services/grupo-clases.service';
import * as XLSX from 'xlsx';
import { StorageSolicitudService } from '../../../services/storage-solicitud.service';
import { BalanceoService } from '../../../services/balanceo.service';
import { KitsService } from '../../../services/kits.service';
import { AbstractTabComponent } from '../../../shared/abstract-tab.component';
import { ActivatedRoute } from '@angular/router';

const NO_CAT = 'NO ESPECIFICADO';

type RdlSMode = 'INV_ALL' | 'RDLS_ALL' | string; // string = codigo de kit

function normalizeCategoria(cat?: string | null): string {
    const s = (cat ?? '').trim();
    return s ? s : NO_CAT;
}

/**
 * Tab de Inventario. Cancelado. Se reemplazará por un módulo más completo a futuro.
 */
@Component({
    selector: 'app-inventario-tab',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './inventario-tab.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventarioTabComponent extends AbstractTabComponent implements AfterViewInit, OnDestroy {
    mostradoPorPrimeraVez = false;
    private invSrv = inject(InventarioService);
    private artSrv = inject(ArticulosService);
    private unidadesSrv = inject(UnidadesService);
    private trazSrv = inject(TrazabilidadService);
    private provSrv = inject(ProveedoresService);
    private gruposSrv = inject(GruposClavesService);
    private storageSolicitudService = inject(StorageSolicitudService);
    kitRutaSaludElegido = signal<string>('ALL');
    kitsRuta = signal<string[]>([]);
    loadingKitsRuta = signal<boolean>(false);
    rdlsMode = signal<RdlSMode>('INV_ALL'); // default: NO filtrar por RdlS
    clavesRutasSalud = signal<Set<string> | null>(null);
    private balanceoService = inject(BalanceoService);
    private kitsService = inject(KitsService);

    private env = inject(EnvironmentInjector);

    // cache reactivo de factores: key = `${clave}__${clues}`
    private factoresMap = signal<Map<string, FactorUnidad>>(new Map());
    private gruposMapa = signal<Map<string, { categoria: string; grupoInsumo: string }>>(new Map());
    // grupoFiltro = signal<string>('');

    // para evitar disparar múltiples fetches simultáneos
    private fetchingKeys = new Set<string>();

    // Filtros UI
    query = signal('');
    fuente = signal<'ALL' | 'HOSPITAL' | 'ALMACEN'>('ALL');
    // categoriaFiltro = signal<string>('');

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

    // Set de claves que están en CPM 
    private cpmsSet = signal<Set<string>>(new Set());
    // + signals
    private articulosMapa = signal<Record<string, { descripcion: string; presentacion?: string; categoria?: string | null }>>({});
    //private citasByClaveLote = signal<Map<string, { precio?: number | null; orden?: string | null; fte?: string | null; proveedor?: string | null }>>(new Map());

    @ViewChild('gridScroll', { static: true }) gridScroll!: ElementRef<HTMLDivElement>;
    @ViewChild('topScroll', { static: true }) topScroll!: ElementRef<HTMLDivElement>;
    @ViewChild('dataTable', { static: true }) dataTable!: ElementRef<HTMLTableElement>;
    @ViewChild('theadEl', { static: true }) theadEl!: ElementRef<HTMLTableSectionElement>;

    tableScrollWidth = 0;
    theadHeight = 0;

    @ViewChild('chartAbasto', { static: true }) chartAbasto!: ElementRef<HTMLDivElement>;
    @ViewChild('chartCategoria', { static: true }) chartCategoria!: ElementRef<HTMLDivElement>;
    @ViewChild('chartFuente', { static: true }) chartFuente!: ElementRef<HTMLDivElement>;

    private onGridScroll = () => { };
    private onTopScroll = () => { };
    private onResize = () => { };

    ngAfterViewInit() {
        if (this.mostradoPorPrimeraVez === false && this.isActive) {
            this.onTabActivated();
        }
    }

    private cargarKitsAfterInit() {
        const grid = this.gridScroll.nativeElement;
        const top = this.topScroll.nativeElement;

        this.onGridScroll = () => { top.scrollLeft = grid.scrollLeft; };
        this.onTopScroll = () => { grid.scrollLeft = top.scrollLeft; };
        this.onResize = () => this.measureGrid();

        grid.addEventListener('scroll', this.onGridScroll, { passive: true });
        top.addEventListener('scroll', this.onTopScroll, { passive: true });
        window.addEventListener('resize', this.onResize);

        // ✅ crear el effect dentro de un injection context válido
        runInInjectionContext(this.env, () => {
            effect(() => {
                this.pageSlice(); // lee la signal/computed
                queueMicrotask(() => this.measureGrid());
            });
        });

        this.cargarKitsRutaSalud();
        this.onRdlSModeChange('INV_ALL');
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

    constructor(activatedRoute: ActivatedRoute) {
        super();
        this.constructorDeTab();
        // Si viene con parámetros de ruta (que la ruta contenga el texto 'existencias'), hacer this.isActive = true
        if (activatedRoute.snapshot.url[0].path === 'existencias') {
            this.isActive = true;
            this.mostradoPorPrimeraVez = true;
            setTimeout(() => { this.cargarKitsAfterInit(); }, 100);
        }
    }

    constructorDeTab() {
        this.invSrv.loadCitasSlimIfNeeded();
        // 0) Cargar grupos de claves una vez (cachea e indexa)
        this.gruposSrv.load().subscribe(mp => {
            // lo guardamos como Map<string, {categoria, grupoInsumo}>
            const flat = new Map<string, { categoria: string; grupoInsumo: string }>();
            for (const [k, v] of mp.entries()) flat.set(k, { categoria: v.categoria, grupoInsumo: v.grupoInsumo });
            this.gruposMapa.set(flat);
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

        // 6) Artículos → mapa por clave { descripcion, presentacion }
        // TODO: Corregir la obtencion de articulo para que traiga campos descripcion y presentacion
        this.artSrv.getArticulosMapa?.().subscribe((m: any) => {
            this.articulosMapa.set(m ?? {});
        });

        // 7) Quitar loading cuando tengamos algo
        effect(() => {
            if (this.almacenes().length || this.hospitales().length) this.loading.set(false);
        });

        // 8)🔎 Prefetch de factores para las filas visibles (página actual)
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
            this.kitRutaSaludElegido();
            this.page.set(1);
        });

        // effect(() => {
        // cuando cambia la categoría seleccionada, limpiamos el grupo seleccionado
        // this.categoriaFiltro();
        // this.grupoFiltro.set('');
        // });

        effect(() => {
            const tp = this.totalPages();
            const p = this.page();
            if (p > tp) this.page.set(tp);
            if (p < 1) this.page.set(1);
        });

        effect(() => {
            // cuando cambian filtros/paginación, actualizamos gráficos con TODO el filtrado (no solo slice)
            this.filtered();
        });
    }

    // Normaliza a “base” de categoría (medicamento / material / otro)
    /* catBase = (s: string | null | undefined) => {
        const t = (s ?? '').toLowerCase();
        if (t.includes('medica')) return 'MEDICAMENTO';             // “Medicamentos”
        if (t.includes('material')) return 'MATERIAL DE CURACIÓN';  // “Material de Curación”
        return 'OTRA';
    }; */

    /*
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
    });*/

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
        const cpms = new Set<string>(); // this.cpmsSet();
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
            const citas = this.invSrv.citasByClaveLote().get(keyCita) || [];
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

            const ordenDeSuministro = this.joinUnique(citas.map(x => x.orden));
            // const proveedorTexto = this.joinUnique(citas.map(x => x.proveedor));

            const proveedorPrimero = (citas.find(x => !!x.proveedor)?.proveedor) ?? '';
            const prov = this.provSrv.findByNombre(proveedorPrimero);
            const rfcProveedor = prov?.rfc ?? null;

            // Para precio/fuente: mantengo compatibilidad tomando el primer valor “usable”
            const precioUnitario = this.firstNum(citas.map(x => x.precio));
            const fuenteFin = this.firstStr(citas.map(x => x.fte)) ?? (inv as any).fuente ?? null;

            return {
                entidadFederativa: 'BAJA CALIFORNIA',
                clues,
                ordenDeSuministro: ordenDeSuministro || null,
                rfcProveedor: rfcProveedor,
                fuenteFinanciamiento: fuenteFin,
                partidaPresupuestal: slicePartida(inv.partida),
                clave,
                categoria: normalizeCategoria(art.categoria),
                grupoInsumo,
                descripcion: safeStr(inv.descripcion) || art.descripcion || null,
                precioUnitario: precioUnitario,
                valorTotal: (precioUnitario != null ? precioUnitario * dispAjustado : null),
                insumoEnCPM: 'SI', // cpms.has(clave) ? 'SI' : 'NO',
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

        // Nota: aquí kitSel realmente solo sirve para disparar onKitRutaChange; el filtro lo manda el setRutas
        const kitSel = this.kitRutaSaludElegido();
        const setRdlS = this.clavesRutasSalud();

        return this.rows().filter(r => {
            // 1) Fuente
            const okFuente = (f === 'ALL') || (r.tipoFuente === f);

            // 2) RdlS: si ya hay set cargado, filtramos por claves del set
            //    (con 'ALL' el backend te trae todas las claves de todos los kits)
            const okRdlS = !setRdlS
                ? true
                : setRdlS.has(this.invSrv.normalizarClave(r.clave));

            // 3) Texto (tu búsqueda actual)
            const okText = !q
                || (r.clave ?? '').toLowerCase().includes(q)
                || (r.descripcion ?? '').toLowerCase().includes(q)
                || (r.lote ?? '').toLowerCase().includes(q)
                || (r.unidadOrigenTexto ?? '').toLowerCase().includes(q)
                || (r.clues ?? '').toLowerCase().includes(q);

            return okFuente && okRdlS && okText;
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
    }

    joinUnique(list: Array<string | null | undefined>): string {
        const out: string[] = [];
        const seen = new Set<string>();
        for (const v of list) {
            const s = (v ?? '').trim();
            if (!s) continue;
            if (seen.has(s)) continue;
            seen.add(s);
            out.push(s);
        }
        return out.join(', ');
    }

    firstStr(list: Array<string | null | undefined>): string | null {
        for (const v of list) {
            const s = (v ?? '').trim();
            if (s) return s;
        }
        return null;
    }

    firstNum(list: Array<number | null | undefined>): number | null {
        for (const v of list) {
            if (v == null) continue;
            const n = Number(v);
            if (Number.isFinite(n)) return n;
        }
        return null;
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

                // ⬇⬇ aquí el formateo fijo a 'dd/mm/yyyy 00:00:00', sin UTC
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

    private cargarKitsRutaSalud(): void {
        this.loadingKitsRuta.set(true);

        this.kitsService.list().subscribe({
            next: (resp: any[]) => {
                const list = (resp ?? []).map(k => k.codigo as string);
                this.kitsRuta.set(list.sort());
                this.loadingKitsRuta.set(false);
            },
            error: (err) => {
                console.error('Error obteniendo kits Ruta de la Salud', err);
                this.kitsRuta.set([]);
                this.loadingKitsRuta.set(false);
            },
        });
    }

    onKitRutaChange(value: string) {
        this.kitRutaSaludElegido.set(value);

        const kitParam = value === 'ALL' ? undefined : value;

        this.balanceoService.obtenerClavesRutasSalud(kitParam).subscribe({
            next: (resp: any) => {
                const set = new Set<string>(
                    (resp.claves ?? []).map((c: string) => this.invSrv.normalizarClave(c))
                );
                this.clavesRutasSalud.set(set);
            },
            error: (err) => {
                console.error('Error cargando claves de Rutas de la Salud', err);
                this.clavesRutasSalud.set(null);
            },
        });
    }

    onRdlSModeChange(value: RdlSMode) {
        this.rdlsMode.set(value);

        // ✅ Caso 1: Inventario · todas (sin filtro RdlS)
        if (value === 'INV_ALL') {
            this.clavesRutasSalud.set(null);  // null => "no aplicar filtro"
            return;                           // y NO pegamos al backend
        }

        // ✅ Caso 2: RdlS · todas o kit específico
        const kitParam = (value === 'RDLS_ALL') ? undefined : value;

        this.balanceoService.obtenerClavesRutasSalud(kitParam).subscribe({
            next: (resp: any) => {
                const set = new Set<string>(
                    (resp.claves ?? []).map((c: string) => this.invSrv.normalizarClave(c))
                );
                this.clavesRutasSalud.set(set);
            },
            error: (err) => {
                console.error('Error cargando claves de RdlS', err);
                this.clavesRutasSalud.set(null); // fallback: no filtrar
            },
        });
    }

    protected override onTabActivated(): void {
        if (this.mostradoPorPrimeraVez === false) {
            this.cargarKitsAfterInit(); // default: inventario completo
        }
    }
    protected override onTabDeactivated(): void {
        // no-op
    }


} // class

function aplicarFactor(disponible: number, factor?: FactorUnidad): number {
    if (!factor) return disponible; // aún no cargado → muestra base (se actualizará cuando llegue)
    // en_dispensacion: 1/0, cantidad_fc: >0
    if ((factor.en_dispensacion ?? 0) === 1 && toNum(factor.cantidad_fc) > 0) {
        return aplicarFactorConversion(disponible, factor);
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
    return l.replace(/[\/'']/g, '').slice(0, 20).trim();
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

