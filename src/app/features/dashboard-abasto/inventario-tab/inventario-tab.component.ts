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
        this.invSrv.inventario$.subscribe(rows => this.almacenes.set(rows ?? []));

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

            const prov = this.provSrv.findByNombreStrict(citaInfo.proveedor ?? '');
            const rfcProveedor = prov?.rfc ?? null;

            return {
                entidadFederativa: 'BAJA CALIFORNIA',
                clues,
                ordenDeSuministro: citaInfo.orden ?? null,
                rfcProveedor: rfcProveedor,
                fuenteFinanciamiento: citaInfo.fte ?? (inv as any).fuente ?? null,
                partidaPresupuestal: slicePartida(inv.partida),
                clave,
                categoria: art.categoria ?? null,
                grupoInsumo,
                descripcion: safeStr(inv.descripcion) || art.descripcion || null,
                precioUnitario: (citaInfo.precio ?? null) as number | null,
                valorTotal: (citaInfo.precio != null ? citaInfo.precio * dispAjustado : null) as number | null,
                insumoEnCPM: cpms.has(clave) ? 'SI' : 'NO',
                estadoInsumo: 1,
                inventarioDisponible: dispAjustado,
                unidadMedida: art.presentacion ?? null,
                lote: cleanLote(inv.lote),
                fechaCaducidad: formatOrDefault(inv.caducidad, '31/12/2025 00:00:00'),
                fechaFabricacion: '01/01/2025 00:00:00',
                fechaRecepcion: formatOrDefault(inv.fecha_entrada, '01/01/2025 00:00:00'),
                unidadOrigenTexto: safeStr((inv as any).almacen) ?? safeStr((inv as any).unidad) ?? null,
                tipoFuente: tipo,
            };
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
            // resolver nombre de unidad por clues; fallback a texto de origen
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
                'FECHA DE CADUCIDAD': r.fechaCaducidad ?? '31/12/2025 00:00:00',
                'FECHA DE FABRICACIÓN': r.fechaFabricacion ?? '01/01/2025 00:00:00',
                'FECHA DE RECEPCIÓN': r.fechaRecepcion ?? '01/01/2025 00:00:00',
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
    if (!d) return fallback;
    const dt = new Date(d);
    if (isNaN(+dt)) return fallback;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
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
