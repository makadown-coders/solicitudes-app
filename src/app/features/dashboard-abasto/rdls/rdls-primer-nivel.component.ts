// src/app/features/dashboard-abasto/rdls-primer-nivel/rdls-primer-nivel.component.ts
import {
    Component, ChangeDetectionStrategy,
    inject, signal,
    computed, effect,
    OnInit, OnDestroy,
    Injector
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { catchError, firstValueFrom, of, Subscription } from 'rxjs';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import { NgSelectModule } from '@ng-select/ng-select';
import { CpmService } from '../../../services/cpm.service';
import { RdlsAlmacenesService } from '../../../services/rdls/rdls-almacenes.service';
import { RdlsNormalizeService } from '../../../services/rdls/rdls-normalize.service';
import { ActivatedRoute } from '@angular/router';
import { FactorUnidad, UnidadExistente } from '../../../models';
import { RdlsRow } from '../../../models/rdls/RdlsRow';
import { ArticulosService } from '../../../services/articulos.service';
import { BalanceoService } from '../../../services/balanceo.service';
import { GruposClavesService } from '../../../services/grupo-clases.service';
import { InventarioService } from '../../../services/inventario.service';
import { KitsService } from '../../../services/kits.service';
import { AbstractTabComponent } from '../../../shared/abstract-tab.component';
import { UnidadesService } from '../../../services/unidades.service';


@Component({
    selector: 'app-rdls-primer-nivel',
    standalone: true,
    imports: [CommonModule, FormsModule, NgSelectModule],
    templateUrl: './rdls-primer-nivel.component.html',
    styleUrls: ['./rdls-primer-nivel.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RdlsPrimerNivelComponent extends AbstractTabComponent implements OnInit, OnDestroy {
    mostradoPorPrimeraVez = false;

    private inventario = inject(InventarioService);

    private artSrv = inject(ArticulosService);
    private gruposSrv = inject(GruposClavesService);
    public norm = inject(RdlsNormalizeService);
    private almSrv = inject(RdlsAlmacenesService);
    private balanceoService = inject(BalanceoService);
    private kitsService = inject(KitsService);
    private cpmService = inject(CpmService);

    /**
     * TODO: Por eliminar! ya que se migraria a selectedUnits
     */
    unidadElegida = signal<string>(''); // cluesimb
    loadingUnidad = signal<boolean>(false);
    generandoExcel = signal<boolean>(false);
    mensajeBotonExcel = computed(() => {
        return this.generandoExcel() ? 'Generando Excel...' : 'Exportar Concentrado Excel';
    });

    // idx por clave normalizada -> existencia disponible (sum)
    existIdx = signal<Map<string, number>>(new Map());

    private unidadesSrv = inject(UnidadesService);

    unidadesPrimerNivel = signal<UnidadExistente[]>([]);
    // jurisdiccionElegida = signal<string>('TIJUANA'); // default
    qUnidad = signal<string>(''); // filtro de unidades

    // unidades visibles (las que se convierten en columnas)
    unidadesVisibles = computed(() => {
        // const j = (this.jurisdiccionElegida() || '').toUpperCase();
        const q = (this.qUnidad() || '').trim().toUpperCase();
        return this.unidadesPrimerNivel()
            // .filter(u => !j || (u.jurisdiccion || '').toUpperCase() === j)
            .filter(u => !q || `${u.cluesimb} ${u.nombre} ${u.localidad}`.toUpperCase().includes(q))
            .map(u => ({ ...u, __k: (u.cluesimb || '').trim().toUpperCase() }));
    });

    // cache CPM por unidad (para no recalcular miles de veces)
    private cpmLoaded = new Set<string>();


    // === Ruta de la Salud (kits) ===
    // ✅ Multi-select kits/unidades
    selectedKits = signal<string[]>([]); // códigos de kit
    selectedUnits = signal<UnidadExistente[]>([]); // objetos unidad

    kitsRuta = signal<string[]>([]);                     // lista de códigos de kit
    loadingKitsRuta = signal<boolean>(false);
    // union de claves (universo final)
    clavesRutasSalud = signal<Set<string>>(new Set());
    trackByClues = (_: number, u: UnidadExistente) => (u?.cluesimb || u?.key || '');

    private lastGoodKits: string[] = [];
    private lastGoodUnits: UnidadExistente[] = [];

    // agregados por clave para la selección actual
    sumExistByClave = signal<Map<string, number>>(new Map());
    sumCpmByClave = signal<Map<string, number>>(new Map());

    // 🔢 Paginación
    pageSize = signal<number>(50);
    page = signal<number>(1);

    totalItems = computed(() => this.filteredRows().length);
    totalPages = computed(() => Math.max(1, Math.ceil(this.totalItems() / this.pageSize())));

    pageSlice = computed(() => {
        const start = (this.page() - 1) * this.pageSize();
        return this.filteredRows().slice(start, start + this.pageSize());
    });

    almBuckets = signal<Map<string, { AZM: number; AZE: number; AZT: number }>>(new Map());


    canRender = computed(() =>
        (this.selectedKits()?.length ?? 0) > 0 &&
        (this.selectedUnits()?.length ?? 0) > 0
    );

    rowsToRender = computed(() => this.canRender() ? this.filteredRows() : []);
    excelDisabled = computed(() => !this.canRender() || this.loadingUnidad() /* o tu loading global */);


    term = signal<string>('');
    rows = signal<RdlsRow[]>([]);
    filteredRows = computed(() => {
        const term = this.term().trim().toLowerCase();
        const setRutas = this.clavesRutasSalud();

        // 1) Partimos SIEMPRE de todas las rows “crudas”
        let rowsList = this.rows();

        // 2) Si hay kit seleccionado (ALL o uno específico) + set de claves de RdlS,
        //    construimos el universo: (rows que pertenecen al kit) U (filas vacías faltantes)
        if (setRutas && setRutas.size > 0) {
            const mapPorClave = new Map<string, RdlsRow>();

            // 2.1 metemos todas las filas existentes cuya clave esté en el kit
            for (const r of rowsList) {
                const claveNorm = this.norm.normClave(r.clave);
                if (setRutas.has(claveNorm)) {
                    mapPorClave.set(claveNorm, r);
                }
            }

            // 2.2 para cada clave del kit que falte, añadimos fila vacía
            for (const claveRuta of setRutas) {
                if (!mapPorClave.has(claveRuta)) {
                    mapPorClave.set(claveRuta, this.crearFilaVaciaParaClave(claveRuta));
                }
            }

            rowsList = Array.from(mapPorClave.values());
        }

        // 3) Filtro por texto (clave / descripción) sobre el universo ya definido
        if (term) {
            rowsList = rowsList.filter(r =>
                (r.clave ?? '').toLowerCase().includes(term) ||
                (r.descripcion ?? '').toLowerCase().includes(term)
            );
        }

        // 4) Orden y reenumeración del NO. (sin clonar objetos)
        rowsList = [...rowsList].sort((a, b) => (a.clave ?? '').localeCompare(b.clave ?? ''));

        for (let i = 0; i < rowsList.length; i++) {
            rowsList[i].no = i + 1;
        }

        return rowsList;
    });

    // ==== caches reactivos ====
    private articulosMapa = signal<Record<string, { categoria?: string | null }>>({});
    private gruposMapa = signal<Map<string, { categoria: string; grupoInsumo: string }>>(new Map());
    private factoresMap = signal<Map<string, FactorUnidad>>(new Map());
    private injector: Injector = inject(Injector);
    private subs: Subscription[] = [];

    constructor(activatedRoute: ActivatedRoute) {
        super();
        this.constructorDeTab();
        if (activatedRoute.snapshot.url[0].path === 'rdls-primer-nivel') {
            this.isActive = true;
        }
    }

    constructorDeTab(): void {
        // 1) Artículos → índice normalizado
        this.artSrv.getArticulosMapa?.().subscribe((m: any) => {
            const idx: Record<string, { categoria?: string | null }> = {};
            for (const [k, v] of Object.entries(m ?? {})) {
                idx[this.norm.normClave(k)] = v as any;
            }
            this.articulosMapa.set(idx);
        });

        // 2) Grupos → índice normalizado
        this.gruposSrv.load().subscribe(mp => {
            const flat = new Map<string, { categoria: string; grupoInsumo: string }>();
            for (const [k, v] of mp.entries()) {
                flat.set(this.norm.normClave(k), { categoria: v.categoria, grupoInsumo: v.grupoInsumo });
            }
            this.gruposMapa.set(flat);
        });

        effect(() => {
            // si cambian los datos/filtrado y la página se sale de rango, te regresa al final válido
            const tp = this.totalPages();
            if (this.page() > tp) this.page.set(tp);
            if (this.page() < 1) this.page.set(1);
        });

        effect(() => {
            const kits = this.selectedKits();
            const units = this.selectedUnits();

            if (!kits.length || !units.length) {
                // si falta algo, limpia y NO reconstruyas nada
                this.resetDerivadosPorFaltaDeSeleccion();
                return;
            }

            (async () => {
                await this.rebuildUniverseFromSelectedKits(kits);
            })();
        });

        /* effect(() => {
             console.log('effect: selectedUnits changed');
             const units = this.selectedUnits();
             console.log('selectedUnits:', units);
             const kits = this.selectedKits();
             console.log('clavesRutasSalud:', kits);
 
             if (!units.length || !kits.length) return;
 
             // también dar return si no unidades o si no hay kits seleccionados
             if (units.length === 0) return;
 
             (async () => {
                 // cada que cambian las unidades → reconstruye aggregados
                 await this.rebuildAggregatesForSelectedUnits();
             })();
         });*/
    }

    private isHydrating = false;

    async ngOnInit() {
        this.unidadesSrv.loadPrimerNivel().subscribe(list => {
            const arr = (list ?? []).map(u => ({ ...u, __k: (u.cluesimb || '').trim().toUpperCase() })) as any;
            this.unidadesPrimerNivel.set(arr);

            // ✅ default: al menos 1 unidad
            /*if (!this.selectedUnits().length && arr.length) {
                this.selectedUnits.set([arr[0]]);
            }*/
        });

        if (this.mostradoPorPrimeraVez === false && this.isActive) {
            this.onTabActivated();
        }
    }

    private async rebuildAggregatesForSelectedUnits() {
        const units = this.selectedUnits();
        const setRutas = this.clavesRutasSalud();

        if (!units.length || !setRutas.size) return;

        const sumExist = new Map<string, number>();
        const sumCpm = new Map<string, number>();

        // batch por performance
        const batch = 6;
        for (let i = 0; i < units.length; i += batch) {
            const chunk = units.slice(i, i + batch);

            const results = await Promise.allSettled(chunk.map(async (u) => {
                const clues = (u.cluesimb || '').trim().toUpperCase();
                if (!clues) return;

                // CPM cache (tu servicio ya maneja in-flight/shareReplay)
                await firstValueFrom(this.cpmService.cpmsFor(clues));

                // Existencias
                const items = await firstValueFrom(this.inventario.getExistenciasByCluesimb(clues));

                // index existencias sólo del universo del kit
                const existMap = new Map<string, number>();
                for (const it of (items ?? [])) {
                    const clave = this.norm.normClave((it as any).clave ?? '');
                    if (!clave || !setRutas.has(clave)) continue;
                    const exist = Number((it as any).disponible ?? 0);
                    existMap.set(clave, (existMap.get(clave) || 0) + exist);
                }

                // acumula a agregados globales
                for (const clave of setRutas) {
                    const e = existMap.get(clave) || 0;
                    const c = this.cpmService.getCpmForClave(clave, clues) || 0;

                    sumExist.set(clave, (sumExist.get(clave) || 0) + e);
                    sumCpm.set(clave, (sumCpm.get(clave) || 0) + c);
                }
            }));

            // respiro
            await new Promise(r => setTimeout(r, 0));
        }

        this.sumExistByClave.set(sumExist);
        this.sumCpmByClave.set(sumCpm);

        this.applyAggregatesToRows();
    }

    private crearFilaVaciaParaClave(claveNorm: string): RdlsRow {
        const arts = this.articulosMapa();
        const grupos = this.gruposMapa();

        const artRaw = arts[claveNorm] as any | undefined;
        const g = grupos.get(claveNorm);

        const descripcion: string = artRaw?.descripcion ?? '';
        const cat: string | null = g?.categoria ?? artRaw?.categoria ?? null;

        const tipo = this.norm.normalizeCategoria(cat);
        const grupo = g?.grupoInsumo ?? '';

        return {
            no: 0, // se reenumera en el computed
            clave: claveNorm,
            descripcion,
            tipo,
            grupo_terapeutico: grupo,
            piezas: 1,

            AZM: 0, AZE: 0, AZT: 0,
            totalAlmacenes: 0,

            // campos dinámicos (no existen en interface, pero los usas en template)
            // __cpmByUnit y __totalCpmVisible se llenan en applyCpmsDinamicos()
        } as RdlsRow;
    }


    private async precargarCpmsParaUnidades(cluesList: string[], batchSize = 8) {
        const tasks = cluesList
            .map(c => (c || '').trim().toUpperCase())
            .filter(c => c && !this.cpmLoaded.has(c));

        for (let i = 0; i < tasks.length; i += batchSize) {
            const chunk = tasks.slice(i, i + batchSize);
            chunk.forEach(c => this.cpmLoaded.add(c));

            await Promise.allSettled(
                chunk.map(clues => firstValueFrom(this.cpmService.cpmsFor(clues)))
            );
        }
    }

    private cargarKitsRutaSalud(): void {
        this.loadingKitsRuta.set(true);

        this.kitsService.list().subscribe({
            next: (resp: any[]) => {
                const list = (resp ?? []).map(k => String(k.codigo || '').trim()).filter(Boolean);
                list.sort();
                this.kitsRuta.set(list);
                this.loadingKitsRuta.set(false);
            },
            error: (err) => {
                console.error('Error obteniendo kits Ruta de la Salud', err);
                this.kitsRuta.set([]);
                this.loadingKitsRuta.set(false);
            },
        });
    }

    private isRebuilding = false;

    private async rebuildUniverseFromSelectedKits(kits: string[]) {
        if (this.isRebuilding) return;
        this.isRebuilding = true;

        try {
            const union = new Set<string>();

            // ✅ traer claves por kit en paralelo (batch ligero)
            const batch = 6;
            for (let i = 0; i < kits.length; i += batch) {
                const chunk = kits.slice(i, i + batch);

                const results = await Promise.allSettled(
                    chunk.map(k => firstValueFrom(this.balanceoService.obtenerClavesRutasSalud(k)))
                );

                for (const r of results) {
                    if (r.status !== 'fulfilled') continue;
                    const claves = (r.value?.claves ?? []) as string[];
                    for (const c of claves) union.add(this.norm.normClave(c));
                }

                await new Promise(r => setTimeout(r, 0));
            }

            this.clavesRutasSalud.set(union);

            // reconstruye rows usando el universo actual
            await this.initRows();

            // actualiza tipo/grupo
            this.applyTipoYGrupo();

            // y recalcula sumatorias para unidades seleccionadas (si ya hay)
            await this.rebuildAggregatesForSelectedUnits();

        } finally {
            this.isRebuilding = false;
        }
    }

    private applyAggregatesToRows() {
        const exist = this.sumExistByClave();
        const cpm = this.sumCpmByClave();

        const base = this.rows().slice();
        for (const r of base) {
            const clave = this.norm.normClave(r.clave);
            const e = exist.get(clave) || 0;
            const c = cpm.get(clave) || 0;

            /*const reordenRaw = c - e;
            const reorden = (reordenRaw > 0) ? 0 : Math.abs(reordenRaw);*/
            const reorden = Math.max(0, c - e);

            (r as any).__existSum = e;
            (r as any).__cpmSum = c;
            (r as any).__reorden = reorden;
        }
        this.rows.set(base);
    }

    ngOnDestroy() {
        this.subs.forEach(s => s.unsubscribe());
    }

    private async initRows() {
        // 1) intenta cargar artículos mapa (ya lo haces)
        let articulosMapa: Record<string, any> = {};
        try {
            articulosMapa = await firstValueFrom(
                this.artSrv.getArticulosMapa().pipe(catchError(() => of({})))
            );
        } catch { articulosMapa = {}; }

        // 2) define universo de claves
        const setRutas = this.clavesRutasSalud(); // puede ser null al inicio
        let claves: string[] = [];

        if (setRutas && setRutas.size > 0) {
            claves = Array.from(setRutas);
        } else {
            // fallback: usa gruposMapa o articulosMapa mientras se carga el kit
            const g = this.gruposMapa();
            if (g && g.size) claves = Array.from(g.keys());
            else claves = Object.keys(articulosMapa ?? {});
        }

        // 3) construye filas
        const rows: RdlsRow[] = claves
            .map(c => this.norm.normClave(c))
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b))
            .map((claveNorm, idx) => {
                const artRaw = (articulosMapa as any)?.[claveNorm] ?? (articulosMapa as any)?.[claveNorm] ?? null;
                const descripcion = artRaw?.descripcion ?? '';

                return {
                    no: idx + 1,
                    clave: claveNorm,
                    descripcion,
                    piezas: 1,

                    // buckets almacenes
                    AZM: 0, AZE: 0, AZT: 0,
                    totalAlmacenes: 0,

                    // estos los llenas con applyTipoYGrupo
                    tipo: '',
                    grupo_terapeutico: '',

                    // (resto de props del RdlsRow si son obligatorias en tu interface)
                } as RdlsRow;
            });

        this.rows.set(rows);
        this.page.set(1);

        // 4) aplica tipo/grupo y almacenes (si ya hay map)
        this.applyTipoYGrupo();
    }

    // al final de la clase RdlSComponent (o donde gustes)
    trackClave(index: number, r: { clave?: string; no?: number }): string {
        // usa clave si existe; si hay claves duplicadas, cae al # consecutivo
        return (r?.clave && r.clave.trim()) ? r.clave.trim() : String(r?.no ?? index);
    }

    // ✅ si ya tienes applyFilter(), solo añade el reset a la página 1 al final:
    applyFilter() {
        this.page.set(1); // <-- reset
    }

    // 🔘 Controles
    goTo(p: number) { this.page.set(Math.min(Math.max(1, p), this.totalPages())); }
    nextPage() { if (this.page() < this.totalPages()) this.page.update(v => v + 1); }
    prevPage() { if (this.page() > 1) this.page.update(v => v - 1); }
    jump(delta: number) { this.goTo(this.page() + delta); }

    // === aplica TIPO/GRUPO con los servicios (sin helpers sueltos) ===
    private applyTipoYGrupo() {
        const rows = this.rows().slice();
        const grupos = this.gruposMapa();
        const arts = this.articulosMapa();

        for (const r of rows) {
            const clave = this.norm.normClave(r.clave);
            const g = grupos.get(clave);
            const art = arts[clave];

            const cat = g?.categoria ?? art?.categoria ?? null;

            r.tipo = this.norm.normalizeCategoria(cat);

            r.grupo_terapeutico = g?.grupoInsumo ?? '';
        }
        this.rows.set(rows);
    }

    // === aplica AZM/AZE/AZT desde el Map<clave, {AZM, AZE, AZT}> ===
    private applyAlmacenesBuckets(map: Map<string, { AZM: number; AZE: number; AZT: number }>) {
        const base = this.rows().slice(); // ✅ fuente real

        for (const r of base) {
            const clave = this.norm.normClave(r.clave);
            const b = map.get(clave);

            r.AZM = b?.AZM ?? 0;
            r.AZE = b?.AZE ?? 0;
            r.AZT = b?.AZT ?? 0;
            r.totalAlmacenes = (r.AZM || 0) + (r.AZE || 0) + (r.AZT || 0);
        }

        this.rows.set(base);
    }

    async exportarExcelRdlSPrimerNivel(todo = true): Promise<void> {
        this.generandoExcel.set(true);
        // 0) Debe haber kit y claves
        const setRutas = this.clavesRutasSalud();
        if (!setRutas || setRutas.size === 0) {
            console.warn('No hay claves del kit cargadas. Selecciona kits primero.');
            return;
        }

        // 1) Universo de claves = intersección (ya normalizadas)
        const clavesExportNorm = Array.from(setRutas);

        // 2) Unidades a exportar
        const unidades: UnidadExistente[] = this.unidadesVisibles(); // o this.unidadesPrimerNivel()
        if (!unidades.length) return;

        // 3) Meta por clave desde rows ya construidas
        const metaPorClave = new Map<string, RdlsRow>();
        for (const r of this.rows()) {
            const k = this.norm.normClave(r.clave ?? '');
            if (k && !metaPorClave.has(k)) metaPorClave.set(k, r);
        }

        // 4) Helpers batching + utilidades Excel
        const chunk = <T>(arr: T[], size: number): T[][] => {
            const out: T[][] = [];
            for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
            return out;
        };

        const safeSheetName = (name: string): string => {
            // Excel: max 31 chars, no []:*?/\
            return (name ?? 'SHEET')
                .replace(/[\[\]\:\*\?\/\\]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 31) || 'SHEET';
        };

        const autoFitColumns = (ws: ExcelJS.Worksheet, rows: any[], maxW = 60) => {
            if (!rows.length) return;
            const headers = Object.keys(rows[0] ?? {});
            ws.columns?.forEach((col, i) => {
                const key = headers[i];
                if (!key) return;
                let w = key.length;
                for (const r of rows) {
                    const v = r[key];
                    w = Math.max(w, String(v ?? '').length);
                }
                col.width = Math.min(Math.max(w + 2, 10), maxW);
            });
        };

        const styleHeaderRow = (row: ExcelJS.Row) => {
            row.font = { bold: true };
            row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        };

        const downloadWorkbook = async (wb: ExcelJS.Workbook, filename: string) => {
            const buf = await wb.xlsx.writeBuffer();
            const blob = new Blob([buf], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        };

        // 5) Outputs (igual que tu lógica actual)
        const concentrado: any[] = [];
        const resumenUnidad: any[] = [];

        const batches = chunk(unidades, 6);

        for (const group of batches) {
            await Promise.allSettled(group.map(async (u) => {
                let mostrarlo = false;
                const clues = (u.cluesimb || '').trim().toUpperCase();
                if (!clues) return;

                if (clues === 'BCIMB001521') {
                    // CHATGPT: AQUI SI ENTRA EL LOG!
                    console.log('invocando cpmService.cpmsFor', clues);
                    mostrarlo = true;
                }

                // CPM cache
                let popo: any = null;
                try {
                    popo = await firstValueFrom(this.cpmService.cpmsFor(clues));
                } catch (err) {
                    console.warn('[EXPORT] cpmsFor falló para', clues, err);
                    // seguimos: CPMs quedarán en 0 por getCpmForClave()
                }

                let items: any[] = [];
                try {
                    items = await firstValueFrom(this.inventario.getExistenciasByCluesimb(clues));
                } catch (err) {
                    console.warn('[EXPORT] existencias falló para', clues, err);
                    // seguimos: existencias quedarán en 0
                }

                if (mostrarlo) {
                    console.log('Items for', clues, items);
                    console.log('clavesExportNorm', clavesExportNorm);
                }

                // idx existencia por clave (solo universo del kit)
                const existMap = new Map<string, number>();
                for (const it of (items ?? [])) {
                    const clave = this.norm.normClave((it as any).clave ?? '');
                    if (!clave) continue;
                    if (!setRutas.has(clave)) continue;

                    const exist = Number((it as any).disponible ?? 0);
                    existMap.set(clave, (existMap.get(clave) || 0) + exist);
                }

                // agregados por unidad
                let sumCpm = 0, sumExist = 0, faltantes = 0;
                /*if (clues === 'BCIMB001521') {
                    console.log('ExistMap for', clues, existMap);
                }*/

                for (const clave of clavesExportNorm) {
                    const meta = metaPorClave.get(clave);
                    const cpmRaw = this.cpmService.getCpmForClave(clave, clues);
                    const cpm = Number.isFinite(Number(cpmRaw)) ? Number(cpmRaw) : 0;

                    const existRaw = existMap.get(clave) ?? 0;
                    const exist = Number.isFinite(Number(existRaw)) ? Number(existRaw) : 0;

                    const deltaSigned = exist - cpm;
                    const delta = (Number.isFinite(deltaSigned) && deltaSigned < 0) ? Math.abs(deltaSigned) : 0;

                    concentrado.push({
                        jurisdiccion: u.jurisdiccion ?? '',
                        cluesimb: clues,
                        unidad: u.nombre ?? '',
                        localidad: u.localidad ?? '',
                        clave_cnis: clave,
                        descripcion: meta?.descripcion ?? '',
                        tipo: meta?.tipo ?? '',
                        existencia: exist,
                        cpm,
                        delta,
                    });

                    sumCpm += cpm;
                    sumExist += exist;
                    if (delta > 0) faltantes++;
                }

                const deltaRU = sumExist - sumCpm;
                resumenUnidad.push({
                    jurisdiccion: u.jurisdiccion ?? '',
                    cluesimb: clues,
                    unidad: u.nombre ?? '',
                    claves_en_kit: clavesExportNorm.length,
                    sum_cpm: sumCpm,
                    sum_existencia: sumExist,
                    sum_delta: ((deltaRU >= 0) ? 0 : Math.abs(deltaRU)),
                    claves_con_faltante: faltantes
                });
            }));

            // respiro (evita congelones en UI)
            await new Promise(r => setTimeout(r, 0));
        }

        // 6) Resumen por clave (con almacenes)
        const resumenClaveMap = new Map<string, { sumCpm: number; sumExist: number; faltantes: number }>();
        for (const row of concentrado) {
            const k = row.clave_cnis;
            const acc = resumenClaveMap.get(k) ?? { sumCpm: 0, sumExist: 0, faltantes: 0 };
            acc.sumCpm += Number(row.cpm || 0);
            acc.sumExist += Number(row.existencia || 0);
            if (Number(row.delta || 0) > 0) acc.faltantes += 1; // delta ya es positivo si hay faltante
            resumenClaveMap.set(k, acc);
        }

        const deltaRC = (a: { sumCpm: number; sumExist: number }) => a.sumExist - a.sumCpm;

        // 👇 almacenes desde tu signal almBuckets()
        const alm = this.almBuckets();
        const getAlm = (claveNorm: string) => {
            const b = alm?.get(claveNorm);
            const AZM = Number((b as any)?.AZM ?? 0);
            const AZE = Number((b as any)?.AZE ?? 0);
            const AZT = Number((b as any)?.AZT ?? 0);
            const TOTAL_ALM = AZM + AZE + AZT;
            return { AZM, AZE, AZT, TOTAL_ALM };
        };

        const resumenClave = Array.from(resumenClaveMap.entries()).map(([clave, a]) => {
            const meta = metaPorClave.get(clave);
            const almVals = getAlm(clave);
            return {
                clave_cnis: clave,
                descripcion: meta?.descripcion ?? '',
                tipo: (meta as any)?.tipo ?? '',
                grupo_terapeutico: (meta as any)?.grupo_terapeutico ?? '',
                sum_cpm: a.sumCpm,
                sum_existencia: a.sumExist,
                sum_delta: ((deltaRC(a) >= 0) ? 0 : Math.abs(deltaRC(a))),
                unidades_con_faltante: a.faltantes,
                // ✅ nuevas columnas de almacenes (al final)
                azm: almVals.AZM,
                aze: almVals.AZE,
                azt: almVals.AZT,
                total_alm: almVals.TOTAL_ALM,
            };
        });

        // 7) ExcelJS workbook + sheets base
        const wb = new ExcelJS.Workbook();
        wb.creator = 'RDLS - Primer Nivel (Angular)';
        wb.created = new Date();

        const CONC_HEADERS = [
            'jurisdiccion',
            'cluesimb',
            'unidad',
            'localidad',
            'clave_cnis',
            'descripcion',
            'tipo',
            'existencia',
            'cpm',
            'delta',
        ] as const;

        const addConcentradoSheet = (name: string, data: any[]) => {
            const ws = wb.addWorksheet(name);

            ws.addRow([...CONC_HEADERS]);
            ws.getRow(1).font = { bold: true };
            ws.views = [{ state: 'frozen', ySplit: 1 }];

            for (const r of data) {
                ws.addRow(CONC_HEADERS.map(h => r[h] ?? (h === 'existencia' || h === 'cpm' || h === 'delta' ? 0 : '')));
            }

            // Formato numérico
            const colExist = CONC_HEADERS.indexOf('existencia') + 1;
            const colCpm = CONC_HEADERS.indexOf('cpm') + 1;
            const colDelta = CONC_HEADERS.indexOf('delta') + 1;
            ws.getColumn(colExist).numFmt = '#,##0';
            ws.getColumn(colCpm).numFmt = '#,##0';
            ws.getColumn(colDelta).numFmt = '#,##0';

            // ancho básico decente
            ws.getColumn(1).width = 14;
            ws.getColumn(2).width = 14;
            ws.getColumn(3).width = 40;
            ws.getColumn(4).width = 18;
            ws.getColumn(5).width = 16;
            ws.getColumn(6).width = 55;
            ws.getColumn(7).width = 18;
            ws.getColumn(8).width = 12;
            ws.getColumn(9).width = 12;
            ws.getColumn(10).width = 12;

            return ws;
        };

        const addJsonSheet = (name: string, data: any[]) => {
            const ws = wb.addWorksheet(safeSheetName(name));

            if (!data.length) {
                ws.addRow(['(sin datos)']);
                return ws;
            }

            const headers = Object.keys(data[0]);
            ws.addRow(headers);
            styleHeaderRow(ws.getRow(1));

            for (const obj of data) {
                ws.addRow(headers.map(h => obj[h]));
            }

            ws.views = [{ state: 'frozen', ySplit: 1 }];

            // define columns para autoFit
            ws.columns = headers.map(h => ({ header: h, key: h }));
            autoFitColumns(ws, data, 70);

            return ws;
        };

        addConcentradoSheet('CONCENTRADO', concentrado);
        addJsonSheet('RESUMEN_UNIDAD', resumenUnidad);
        addJsonSheet('RESUMEN_CLAVE', resumenClave);

        // 8) Sheets por jurisdicción tipo “pivote” (crosstab)
        // Base: CONCENTRADO ya trae jurisdiccion, cluesimb, unidad, clave_cnis, existencia, cpm
        const unitsInExport = unidades.map(u => ({
            jurisdiccion: (u.jurisdiccion ?? 'SIN_JURISDICCION').trim(),
            cluesimb: (u.cluesimb ?? '').trim().toUpperCase(),
            unidad: (u.nombre ?? '').trim(),
            label: `${(u.cluesimb ?? '').trim().toUpperCase()} ${(u.nombre ?? '').trim()}`.trim()
        })).filter(u => !!u.cluesimb);

        const unitsByJur = new Map<string, typeof unitsInExport>();
        for (const u of unitsInExport) {
            const arr = unitsByJur.get(u.jurisdiccion) ?? [];
            arr.push(u);
            unitsByJur.set(u.jurisdiccion, arr);
        }

        // Index concentrado por jurisdicción
        const concByJur = new Map<string, any[]>();
        for (const r of concentrado) {
            const jur = String(r.jurisdiccion ?? 'SIN_JURISDICCION').trim();
            const arr = concByJur.get(jur) ?? [];
            arr.push(r);
            concByJur.set(jur, arr);
        }

        for (const [jur, jurUnits] of unitsByJur.entries()) {
            const data = concByJur.get(jur) ?? [];
            if (!data.length) continue;

            const ws = wb.addWorksheet(safeSheetName(`JUR ${jur}`));

            const unitLabels = jurUnits.map(u => u.label);

            // Header fila 1 (multiheader con merge por unidad)
            const h1: any[] = ['CLAVE', 'DESCRIPCION'];
            for (const lbl of unitLabels) h1.push(lbl, '');
            ws.addRow(h1);

            // Header fila 2
            const h2: any[] = ['', ''];
            for (let i = 0; i < unitLabels.length; i++) h2.push('EXIST', 'CPM');
            ws.addRow(h2);

            styleHeaderRow(ws.getRow(1));
            styleHeaderRow(ws.getRow(2));

            // Merges
            // CLAVE/DESCRIPCION vertical
            ws.mergeCells(1, 1, 2, 1);
            ws.mergeCells(1, 2, 2, 2);

            // Unidades horizontal (2 cols c/u)
            let col = 3;
            for (let i = 0; i < unitLabels.length; i++) {
                ws.mergeCells(1, col, 1, col + 1);
                col += 2;
            }

            // Build index: clave -> {desc, byUnitLabel -> {exist, cpm}}
            const byClave = new Map<string, { desc: string; byUnit: Map<string, { exist: number; cpm: number }> }>();

            for (const r of data) {
                const clave = String(r.clave_cnis ?? '').trim();
                if (!clave) continue;

                const label = `${String(r.cluesimb ?? '').trim()} ${String(r.unidad ?? '').trim()}`.trim();

                // solo columnas de unidades que pertenecen a esta jurisdicción (y que estaban seleccionadas)
                if (!unitLabels.includes(label)) continue;

                const bucket = byClave.get(clave) ?? { desc: String(r.descripcion ?? ''), byUnit: new Map() };
                const prev = bucket.byUnit.get(label) ?? { exist: 0, cpm: 0 };

                bucket.byUnit.set(label, {
                    exist: prev.exist + Number(r.existencia ?? 0),
                    cpm: prev.cpm + Number(r.cpm ?? 0),
                });

                byClave.set(clave, bucket);
            }

            // Renglones por clave
            const claves = [...byClave.keys()].sort();
            for (const clave of claves) {
                const b = byClave.get(clave)!;
                const row: any[] = [clave, b.desc];

                for (const lbl of unitLabels) {
                    const v = b.byUnit.get(lbl);
                    row.push(v?.exist ?? 0, v?.cpm ?? 0);
                }
                ws.addRow(row);
            }

            // Freeze panes + widths
            ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 2 }];
            ws.getColumn(1).width = 16;
            ws.getColumn(2).width = 45;

            // Ajuste de columnas por unidad
            let start = 3;
            for (let i = 0; i < unitLabels.length; i++) {
                ws.getColumn(start).width = 10;     // EXIST
                ws.getColumn(start + 1).width = 10; // CPM
                start += 2;
            }
        }

        // 9) Hoja NOTA al final (kits concatenados)
        const kits = (this.selectedKits?.() ?? []).join(', '); // ✅ usa selectedKits() (sin ALL)
        const notaText = `RDLS Primer Nivel\nKits elegidos: ${kits || '(sin selección)'}\nClaves intersectadas: ${clavesExportNorm.length}\nUnidades exportadas: ${unidades.length}`;

        const wsNota = wb.addWorksheet('NOTA');

        // “banner” centrado
        wsNota.getCell('B2').value = notaText;
        wsNota.mergeCells('B2:H8');
        wsNota.getCell('B2').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        wsNota.getCell('B2').font = { bold: true, size: 14 };
        wsNota.getColumn(2).width = 18;
        for (let c = 3; c <= 8; c++) wsNota.getColumn(c).width = 18;
        for (let r = 2; r <= 8; r++) wsNota.getRow(r).height = 22;

        // 10) filename + download
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const filename = `RDLS_1ER_NIVEL_CONCENTRADO_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.xlsx`;
        this.generandoExcel.set(false);
        await downloadWorkbook(wb, filename);
    }

    protected override async onTabActivated(): Promise<void> {
        if (this.mostradoPorPrimeraVez === false) {

            this.cargarKitsRutaSalud();
            await this.initRows();

            this.subs.push(
                this.almSrv.existenciasAlmacenesByClave$.subscribe(map => {
                    if (!map) return;

                    // si llega vacío pero ya hay datos previos, ignóralo
                    if (map.size === 0 && this.almBuckets().size > 0) return;

                    this.almBuckets.set(map);
                })
            );
            this.mostradoPorPrimeraVez = true;
        }
    }

    onKitsChange(next: string[]) {
        const cleaned = (next ?? []).map(x => String(x).trim()).filter(Boolean);
        this.selectedKits.set(cleaned);

        if (cleaned.length === 0) {
            this.resetDerivadosPorFaltaDeSeleccion();
        }
    }

    onUnitsChange(next: UnidadExistente[]) {
        const cleaned = (next ?? []).filter(u => !!u?.cluesimb);
        this.selectedUnits.set(cleaned);

        if (cleaned.length === 0) {
            this.resetDerivadosPorFaltaDeSeleccion();
        }
    }

    protected override onTabDeactivated(): void {
        // No action needed
    }

    onBuscar($event: string) {
        this.term.set($event);
    }

    private resetDerivadosPorFaltaDeSeleccion(): void {
        this.clavesRutasSalud.set(new Set());
        this.sumExistByClave.set(new Map());
        this.sumCpmByClave.set(new Map());
        this.rows.set([]);          // tabla vacía
        this.term.set('');          // opcional (si quieres mantener búsqueda, quítalo)
        this.page.set(1);
    }

    // Borré metodo applyCpmsDinamicos() 
    // Borré metodo applyUnudadSeleccionada()
}

