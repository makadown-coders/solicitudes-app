// src/app/features/dashboard-abasto/solicitudes/solicitudes-tab.component.ts
import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AbstractTabComponent } from '../../../shared/abstract-tab.component';
import { SolicitudesBitacoraService, BitacoraDetalle, BitacoraHeader } from '../../../services/solicitudes/solicitudes-bitacora.service';
import { UnidadesService } from '../../../services/unidades.service';
import { firstValueFrom } from 'rxjs';
import { ArticulosService } from '../../../services/articulos.service';
import { SolicitudesMovimientosService } from '../../../services/solicitudes/solicitudes-movimientos.service';
import { MovimientoRow } from '../../../models/solicitudes/MovimientoRow';
import { MovimientoResumenRow } from '../../../models/solicitudes/MovimientoResumenRow';
import { ComparativaRow } from '../../../models/solicitudes/ComparativaRow';
import { RdlsNormalizeService } from '../../../services/rdls/rdls-normalize.service';
import { RdlsAlmacenesService } from '../../../services/rdls/rdls-almacenes.service';
import { InventarioService } from '../../../services/inventario.service';
import { MiniBalanceRow } from '../../../models/solicitudes/MiniBalanceRow';
import { HomologoDTO } from '../../../models/homologos/HomologoDto';
import { MiniBalanceHomologoCand } from '../../../models/homologos/MiniBalanceHomologoCand';
import { HomologosService } from '../../../services/homologos.service';
import { CitasService } from '../../../services/citas.service';
import { Cita } from '../../../models/Cita';
import { ExcelService } from '../../../services/excel.service';
import { SolicitudesComparativaOrdenRow } from '../../../services/excel/solicitudes-comparativa-excel-exporter';
import { RadarAbastoService } from '../../../services/radar-abasto.service';
import { RadarCrearEventoPayload } from '../../../models/radar-abasto/RadarAbastoModels';

type OrdenSuministroComparativa = {
    unidadDestino: string;
    orden: string;
    tipoCompra: string;
    piezasEmitidas: number;
    fechaTipo: 'entregado' | 'fecha limite';
    fecha: string;
};

type OrdenSuministroCacheEntry = {
    ts: number;
    rows: Cita[];
};

@Component({
    selector: 'app-solicitudes-tab',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './solicitudes-tab.component.html',
})
export class SolicitudesTabComponent extends AbstractTabComponent {
    private route = inject(ActivatedRoute);
    private bitacora = inject(SolicitudesBitacoraService);
    unidadesService = inject(UnidadesService);
    private norm = inject(RdlsNormalizeService);
    private almSrv = inject(RdlsAlmacenesService);
    private inventario = inject(InventarioService);
    private homologosSrv = inject(HomologosService);
    private citasService = inject(CitasService);
    private excelService = inject(ExcelService);
    private radarAbastoService = inject(RadarAbastoService);
    private unidadesLoaded = false;

    loading = signal(false);
    errorMsg = signal<string | null>(null);
    mobileActionsOpenId = signal<string | null>(null);

    // rango por default: últimos 30 días
    desde = signal(this.isoDateDaysAgo(30));
    hasta = signal(this.isoDateDaysAgo(0));

    // ---------------- MOVIMIENTOS -----------------
    private movService = inject(SolicitudesMovimientosService);
    movVisible = signal(false);
    movLoading = signal(false);
    movError = signal<string | null>(null);
    movRows = signal<MovimientoRow[]>([]);
    selectedUnidad = signal<string>('');

    movResumenLoading = signal(false);
    movResumenError = signal<string | null>(null);
    // movResumenRows = signal<MovimientoResumenRow[]>([]);
    movResumenRows = computed<MovimientoResumenRow[]>(() => {
        const base = this.movRowsBase();
        const mp = new Map<string, MovimientoResumenRow>();

        for (const r of base) {
            const cluesimb = this.norm.normClave((r as any).cluesimb ?? this.selectedHeader()?.cluesimb ?? '');
            const clave = this.norm.normClave((r as any).clave_cnis ?? '');
            if (!clave) continue;

            const fecha = ((r as any).fecha_movimiento ?? null) as string | null;
            const cant = Number((r as any).cantidad ?? 0) || 0;

            const curr = mp.get(clave) ?? {
                cluesimb,
                clave,
                entregado_piezas: 0,
                primer_mov: null,
                ultimo_mov: null,
            };

            curr.entregado_piezas += cant;

            // primer/último por comparación string YYYY-MM-DD (date)
            if (fecha) {
                if (!curr.primer_mov || fecha < curr.primer_mov) curr.primer_mov = fecha;
                if (!curr.ultimo_mov || fecha > curr.ultimo_mov) curr.ultimo_mov = fecha;
            }

            mp.set(clave, curr);
        }

        return [...mp.values()].sort((a, b) => a.clave.localeCompare(b.clave));
    });

    // ✅ switches del modal 30d
    movMostrarResumen = signal(false);              // default: detallado
    movSoloClavesSolicitud = signal(false);         // default: no filtra por solicitud

    // ✅ set de claves de la solicitud elegida (para filtrar)
    movClavesSolicitud = signal<Set<string>>(new Set());

    // filtro sobre resumen (puedes reutilizar filtroTexto si quieres, pero mejor separar)
    movFiltroClave = signal('');

    movRowsBase = computed(() => {
        const rows = this.movRows() ?? [];

        const q = (this.movFiltroClave?.() ?? '').trim().toUpperCase();
        const onlySolicitud = this.movSoloClavesSolicitud();
        const set = this.movClavesSolicitud();

        return rows.filter(r => {
            const clave = this.norm.normClave((r as any).clave_cnis ?? '');
            if (!clave) return false;

            if (q && !clave.includes(q)) return false;

            if (onlySolicitud && set.size > 0 && !set.has(clave)) return false;

            return true;
        });
    });

    // ---------------- / MOVIMIENTOS -----------------

    // rango editable
    movDesde = signal<string>('');
    movHasta = signal<string>('');

    // UX
    filtroTexto = signal('');
    // TODO: por ahora siempre sera false. Escalaremos esto luego si es necesario
    soloUltimaPorUnidad = signal(false);

    // data
    rows = signal<BitacoraHeader[]>([]);
    rowsView = signal<BitacoraHeader[]>([]);
    private articulos = inject(ArticulosService);

    private artMap = new Map<string, { descripcion: string; presentacion?: string; categoria?: string | null }>();
    private artMapLoaded = false;

    // modal detalle
    detalleVisible = signal(false);
    detalleLoading = signal(false);
    /**
     * Para mostrar solo el detalle o la comparativa en el modal detalle (el primer modal)
     */
    mostrarSoloDetalle = signal(false);
    detalleError = signal<string | null>(null);
    selectedHeader = signal<BitacoraHeader | null>(null);
    detalle = signal<BitacoraDetalle[]>([]);
    comparativaOsLoading = signal(false);
    comparativaOsError = signal<string | null>(null);
    comparativaExportando = signal(false);
    radarCrearVisible = signal(false);
    radarCrearLoading = signal(false);
    radarCrearError = signal<string | null>(null);
    radarCrearExito = signal<string | null>(null);
    radarMotivo = signal('');
    radarObservaciones = signal('');
    private ordenesComparativaByClave = signal<Map<string, OrdenSuministroComparativa[]>>(new Map());
    private readonly ordenesComparativaCacheTtlMs = 10 * 60 * 1000; // 10 min
    private ordenesComparativaCache = new Map<string, OrdenSuministroCacheEntry>();

    movResumenView = computed(() => {
        const q = (this.movFiltroClave() || '').trim().toUpperCase();
        const base = this.movResumenRows();

        if (!q) return base;

        return base.filter(r =>
            ((r.clave ?? '').toUpperCase().includes(q))
        );
    });

    comparativaView = computed<ComparativaRow[]>(() => {
        const det = this.detalle() ?? [];
        const mov = this.movResumenRows() ?? [];
        const osByClave = this.ordenesComparativaByClave();

        // index por clave (entregado)
        const entregadoByClave = new Map<string, number>();
        for (const r of mov) {
            const k = this.keyClave(r.clave ?? '');
            if (!k) continue;
            entregadoByClave.set(k, Number(r.entregado_piezas) || 0);
        }

        // armar tabla comparativa desde lo solicitado
        const rows: ComparativaRow[] = det.map(d => {
            const clave = (d.clave ?? '').toUpperCase();
            const claveKey = this.keyClave(clave);
            const solicitado = Number(d.cantidad) || 0;
            const entregado = entregadoByClave.get(claveKey) ?? 0;
            const diferencia = Math.max(0, solicitado - entregado);
            const ordenes = osByClave.get(claveKey) ?? [];
            const ordenesSuministro = ordenes.map(o =>
                `${o.unidadDestino} - ${o.orden} (${o.tipoCompra} - ${this.formatQty(o.piezasEmitidas)} piezas - ${o.fechaTipo} ${o.fecha})`
            ).join('\n');

            const pct = solicitado > 0 ? (entregado / solicitado) * 100 : 0;
            const cumplimientoPct = Math.max(0, Math.min(100, Math.round(pct)));

            return {
                clave,
                descripcion: this.getDescripcionArticulo(clave),
                solicitado,
                entregado,
                diferencia,
                cumplimientoPct,
                ordenesSuministro,
                ordenesSuministroCount: ordenes.length
            };
        });

        // orden sugerido: más “faltante” primero
        rows.sort((a, b) => (b.diferencia - a.diferencia));

        return rows;
    });

    kpiSolicitado = computed(() =>
        (() => {
            const rows = this.comparativaView();
            if (!rows.length) return 0;
            const total = rows.reduce((acc, r) => acc + (r.solicitado || 0), 0);
            return Math.round(total / rows.length);
        })()
    );

    kpiEntregado = computed(() =>
        (() => {
            const rows = this.comparativaView();
            if (!rows.length) return 0;
            const total = rows.reduce((acc, r) => acc + (r.entregado || 0), 0);
            return Math.round(total / rows.length);
        })()
    );

    kpiCoberturaPct = computed(() => {
        const rows = this.comparativaView();
        if (!rows.length) return 0;
        const totalPct = rows.reduce((acc, r) => acc + (Number(r.cumplimientoPct) || 0), 0);
        return Math.max(0, Math.min(100, Math.round(totalPct / rows.length)));
    });

    // --- MINI BALANCEO ---
    private jurisdiccionByClues = new Map<string, string>();
    private jurisdiccionLoaded = false;

    // buckets almacenes por clave
    almBuckets = signal<Map<string, { AZM: number; AZE: number; AZT: number }>>(new Map());

    // modal mini-balanceo
    miniVisible = signal(false);
    miniLoading = signal(false);
    miniError = signal<string | null>(null);
    miniRows = signal<MiniBalanceRow[]>([]);
    miniHeader = signal<BitacoraHeader | null>(null);

    constructor() {
        super();
        // 👇 esto ayuda a que RdlsAlmacenesService tenga inventario$ “vivo”
        this.inventario.initExistenciaAlmacenes?.();

        // buckets AZM/AZT/AZE (si llega vacío pero ya tenías algo, no lo pises)
        this.almSrv.existenciasAlmacenesByClave$.subscribe(map => {
            if (!map) return;
            if (map.size === 0 && this.almBuckets().size > 0) return;
            this.almBuckets.set(map);
        });

        this.ensureUnidadesLoaded();
        this.loadArtMapIfNeeded();

        // marcar activo si es esta ruta (mismo patrón que tu ResumenCitasComponent)
        if (this.route.snapshot.url[0]?.path === 'solicitudes') {
            this.isActive = true;
        }

        effect(() => {
            // recalcular vista cuando cambien filtros o data
            const base = this.rows();
            const q = this.filtroTexto().trim().toUpperCase();
            const ultima = this.soloUltimaPorUnidad();

            let filtered = base;
            if (q) {
                filtered = filtered.filter(r =>
                    (r.cluesimb ?? '').toUpperCase().includes(q) ||
                    (r.periodo_texto ?? '').toUpperCase().includes(q) ||
                    (r.tipos_insumo ?? []).join(' - ').toUpperCase().includes(q) ||
                    (r.tipo_pedido ?? '').toUpperCase().includes(q)
                );
            }

            if (ultima) {
                filtered = this.pickLatestPerUnidad(filtered);
            }

            // orden: más nuevo primero
            filtered = [...filtered].sort((a, b) => (b.created_day || '').localeCompare(a.created_day || ''));
            this.rowsView.set(filtered);
        });
    }

    private async loadArtMapIfNeeded() {
        if (this.artMapLoaded) return;
        const mapa = await firstValueFrom(this.articulos.getArticulosMapa());
        this.artMap = new Map<string, any>(Object.entries(mapa));
        this.artMapLoaded = true;
    }

    private async ensureUnidadesLoaded() {
        if (this.unidadesLoaded) return;
        // Dispara la carga y espera una vez
        try {
            const list = await firstValueFrom(this.unidadesService.load());
            this.unidadesLoaded = !!(list && list.length);
        } catch {
            // si falla, igual intentamos con lo que haya
            this.unidadesLoaded = true;
        }
    }

    protected override onTabActivated(): void {
        void this.cargar();
    }
    protected override onTabDeactivated(): void {
        // noop (si luego quieres: abort/limpiar)
    }

    async cargar() {
        this.loading.set(true);
        this.errorMsg.set(null);
        try {
            const data = await this.bitacora.listar(this.desde(), this.hasta());
            this.rows.set(data ?? []);
        } catch (e: any) {
            this.errorMsg.set('No se pudieron cargar las solicitudes (bitácora).');
        } finally {
            this.loading.set(false);
        }
    }

    getDescripcionUnidad(cluesimb: string): string {
        return this.unidadesService.findByCluesimb(cluesimb)?.nombre || '';
    }

    getDescripcionArticulo(clave: string): string {
        return this.artMap.get(clave)?.descripcion || '';
    }

    async abrirDetalle(row: BitacoraHeader) {
        this.selectedHeader.set(row);
        this.detalleVisible.set(true);
        this.detalleLoading.set(true);
        this.detalleError.set(null);
        this.detalle.set([]);
        this.comparativaOsError.set(null);
        this.ordenesComparativaByClave.set(new Map());
        this.calcularMovimientosClavesSolicitud(row);

        try {
            const det = await this.bitacora.detalle(row.id);
            const detalleOrdenado = (det ?? []).sort((a, b) => (a.clave || '').localeCompare(b.clave || ''));
            this.detalle.set(detalleOrdenado);

            // después de cargar det:
            const desde = row.created_day;
            const d = new Date(desde);
            d.setDate(d.getDate() + 30);
            const hasta = d.toISOString().slice(0, 10);

            // carga solo el resumen (para comparativa)
            // await this.cargarResumenMovimientos(row.cluesimb, desde, hasta);

            // opcional: setea señales para mostrar el rango que se usó
            this.movDesde.set(desde);
            this.movHasta.set(hasta);
            this.selectedUnidad.set(this.unidadesService.findByCluesimb(row.cluesimb)?.nombre ?? row.cluesimb);

            const rows = await this.movService.listar({
                cluesimb: row.cluesimb,
                desde,
                hasta
            });
            this.movRows.set(rows);
            await this.cargarOrdenesSuministroComparativa(row, detalleOrdenado, rows);
        } catch {
            this.detalleError.set('No se pudo cargar el detalle.');
        } finally {
            this.detalleLoading.set(false);
        }
    }

    getRowsOrdenadoPorClave(): MovimientoRow[] {
        const rows = this.movRowsBase();
        const copia = [...rows];
        copia.sort((a, b) => (a.clave_cnis || '').localeCompare(b.clave_cnis || ''));
        return copia;
    }

    getMovsResumenViewOrdenadoPorClave(): MovimientoResumenRow[] {
        const rows = this.movResumenView();
        const copia = [...rows];
        copia.sort((a, b) => (a.clave || '').localeCompare(b.clave || ''));
        return copia;
    }

    getComparativaViewOrdenadoPorClave(): ComparativaRow[] {
        const rows = this.comparativaView();
        const copia = [...rows];
        copia.sort((a, b) => (a.clave || '').localeCompare(b.clave || ''));
        return copia;
    }

    comparativaRiesgoRows = computed<ComparativaRow[]>(() => {
        return (this.comparativaView() ?? []).filter(r => (Number(r.cumplimientoPct) || 0) < 100);
    });

    getComparativaRiesgoRowsOrdenadoPorClave(): ComparativaRow[] {
        const rows = this.comparativaRiesgoRows();
        const copia = [...rows];
        copia.sort((a, b) => (a.clave || '').localeCompare(b.clave || ''));
        return copia;
    }

    abrirCrearEventoRadar() {
        const h = this.selectedHeader();
        if (!h) return;

        this.radarCrearError.set(null);
        this.radarCrearExito.set(null);
        this.radarMotivo.set(`Cobertura parcial detectada en solicitud ${h.created_day}`);
        this.radarObservaciones.set(`Detectado desde comparativa Solicitudes vs Entregado para ${h.cluesimb}.`);
        this.radarCrearVisible.set(true);
    }

    cerrarCrearEventoRadar() {
        this.radarCrearVisible.set(false);
        this.radarCrearLoading.set(false);
        this.radarCrearError.set(null);
    }

    async crearEventoRadarDesdeComparativa() {
        const h = this.selectedHeader();
        if (!h) return;

        const clavesRiesgo = this.getComparativaRiesgoRowsOrdenadoPorClave();
        if (!clavesRiesgo.length) {
            this.radarCrearError.set('No hay claves con cobertura menor a 100% para crear evento.');
            return;
        }

        const motivo = (this.radarMotivo() || '').trim();
        if (!motivo) {
            this.radarCrearError.set('El motivo es obligatorio para registrar el evento.');
            return;
        }

        this.radarCrearLoading.set(true);
        this.radarCrearError.set(null);
        this.radarCrearExito.set(null);

        try {
            const payload: RadarCrearEventoPayload = {
                fecha_evento: new Date().toISOString().slice(0, 10),
                clues: (h.cluesimb ?? '').trim().toUpperCase(),
                unidad_nombre: this.getDescripcionUnidad(h.cluesimb) || null,
                tipo_insumo: (h.tipos_insumo ?? []).join(' - ') || null,
                fecha_referencia: h.created_day,
                motivo,
                observaciones: (this.radarObservaciones() || '').trim() || null,
                estado: 'abierto',
                creado_por: 'dashboard-abasto',
                claves: clavesRiesgo.map(r => ({
                    clave_cnis: this.keyClave(r.clave),
                    descripcion: (r.descripcion ?? '').trim() || null
                }))
            };

            const resp = await this.radarAbastoService.crearEvento(payload);
            this.radarCrearVisible.set(false);
            this.radarCrearExito.set(`Evento de vigilancia creado correctamente (ID ${resp.id}).`);
        } catch (e: any) {
            this.radarCrearError.set('No se pudo crear el evento en Radar de Desabasto.');
        } finally {
            this.radarCrearLoading.set(false);
        }
    }

    cerrarDetalle() {
        this.detalleVisible.set(false);
        this.selectedHeader.set(null);
        this.detalle.set([]);
        this.ordenesComparativaByClave.set(new Map());
        this.comparativaOsError.set(null);
        this.comparativaOsLoading.set(false);
        this.radarCrearVisible.set(false);
        this.radarCrearLoading.set(false);
        this.radarCrearError.set(null);
        this.radarCrearExito.set(null);
    }

    totalUnidadesEnVista(): number {
        const set = new Set(this.rowsView().map(r => r.cluesimb));
        return set.size;
    }

    totalSolicitudesEnVista(): number {
        return this.rowsView().length;
    }

    toggleMobileActions(rowId: string): void {
        this.mobileActionsOpenId.update(curr => curr === rowId ? null : rowId);
    }

    closeMobileActions(): void {
        this.mobileActionsOpenId.set(null);
    }

    private pickLatestPerUnidad(rows: BitacoraHeader[]): BitacoraHeader[] {
        const best = new Map<string, BitacoraHeader>();
        for (const r of rows) {
            const k = (r.cluesimb ?? '').toUpperCase();
            if (!k) continue;
            const prev = best.get(k);
            if (!prev) {
                best.set(k, r);
                continue;
            }
            // comparar por created_day (YYYY-MM-DD)
            if ((r.created_day || '') > (prev.created_day || '')) best.set(k, r);
        }
        return Array.from(best.values());
    }

    private isoDateDaysAgo(days: number): string {
        const d = new Date();
        d.setDate(d.getDate() - days);
        return d.toISOString().slice(0, 10);
    }

    async abrirMovimientosDesdeSolicitud(days = 30, row?: BitacoraHeader) {
        const h = row; // this.selectedHeader();
        if (!h) return;

        this.selectedHeader.set(h);
        this.resetMovUI();

        const desde = h.created_day;
        const d = new Date(desde);
        d.setDate(d.getDate() + days);
        const hasta = d.toISOString().slice(0, 10);

        this.movDesde.set(desde);
        this.movHasta.set(hasta);

        const unidad = this.unidadesService.findByCluesimb(h.cluesimb);
        this.selectedUnidad.set(unidad ? unidad.nombre : h.cluesimb);

        // ✅ trae claves de la solicitud para el switch "solo claves"
        await this.calcularMovimientosClavesSolicitud(h);

        // abrir modal + cargar movimientos

        this.movVisible.set(true);
        this.movLoading.set(true);
        this.movError.set(null);
        this.movRows.set([]);

        try {
            const rows = await this.movService.listar({
                cluesimb: h.cluesimb,
                desde,
                hasta
            });
            this.movRows.set(rows);
            // await this.cargarResumenMovimientos(h.cluesimb, desde, hasta);
        } catch {
            this.movError.set('No se pudieron cargar los movimientos.');
        } finally {
            this.movLoading.set(false);
        }
    }

    private async calcularMovimientosClavesSolicitud(h: BitacoraHeader) {
        try {
            const det = await this.bitacora.detalle(h.id);
            const set = new Set((det ?? []).map(x => this.norm.normClave(x.clave ?? '')));
            this.movClavesSolicitud.set(set);
        } catch {
            this.movClavesSolicitud.set(new Set());
        }
    }

    /*
    async cargarResumenMovimientos(cluesimb: string, desde: string, hasta: string) {
        this.movResumenLoading.set(true);
        this.movResumenError.set(null);
        this.movResumenRows.set([]);

        try {
            const rows = await this.movService.resumen({
                cluesimb,
                desde,
                hasta
            });
            this.movResumenRows.set(rows ?? []);
        } catch {
            this.movResumenError.set('No se pudo cargar el resumen por clave.');
        } finally {
            this.movResumenLoading.set(false);
        }
    }
    */

    cerrarMovimientos() {
        this.movVisible.set(false);
        this.movRows.set([]);
        this.movError.set(null);

        //this.movResumenRows.set([]);
        this.movResumenError.set(null);
        this.movFiltroClave.set('');
    }

    private async ensureJurisdiccionesLoaded() {
        if (this.jurisdiccionLoaded) return;

        try {
            const list = await firstValueFrom(this.unidadesService.loadTodosLosNiveles());
            for (const u of (list ?? [])) {
                const k = (u.cluesimb || '').trim().toUpperCase();
                const j = (u.jurisdiccion || '').trim().toUpperCase();
                if (k) this.jurisdiccionByClues.set(k, j);
            }
        } catch {
            // si falla, no bloqueamos
        } finally {
            this.jurisdiccionLoaded = true;
        }
    }

    private getJurisdiccion(cluesimb: string): string {
        const k = (cluesimb || '').trim().toUpperCase();
        return this.jurisdiccionByClues.get(k) || '';
    }

    async abrirMiniBalanceo(row: BitacoraHeader) {
        this.selectedHeader.set(row);
        this.miniHeader.set(row);
        this.miniVisible.set(true);
        this.miniLoading.set(true);
        this.miniError.set(null);
        this.miniRows.set([]);

        try {
            await this.ensureJurisdiccionesLoaded();

            // 1) detalle de la solicitud (claves + cantidad solicitada)
            const det = await this.bitacora.detalle(row.id);
            const detalle = (det ?? []).filter(x => !!x?.clave);

            // 2) existencia en unidad (tmp_existencias via tu endpoint)
            const invUnidad = await firstValueFrom(this.inventario.getExistenciasByCluesimb(row.cluesimb));
            const existUnidadByClave = new Map<string, number>();
            for (const it of (invUnidad ?? [])) {
                const clave = String((it as any).clave ?? '').trim();
                if (!clave) continue;
                const disp = Number((it as any).disponible ?? 0);
                existUnidadByClave.set(clave, (existUnidadByClave.get(clave) || 0) + Math.max(0, disp));
            }

            // 3) almacenes (AZM/AZT/AZE)
            const alm = this.almBuckets();
            const getAlm = (clave: string) => {
                const b = alm.get(clave) ?? { AZM: 0, AZE: 0, AZT: 0 };
                return {
                    AZM: Number(b.AZM ?? 0),
                    AZE: Number(b.AZE ?? 0),
                    AZT: Number(b.AZT ?? 0),
                };
            };

            // 4) construir rows del modal
            const j = this.getJurisdiccion(row.cluesimb); // TIJUANA/MEXICALI/ENSENADA
            const out: MiniBalanceRow[] = detalle.map(d => {
                const clave = String(d.clave ?? '').trim();
                const solicitado = Number(d.cantidad ?? 0);

                const existencia_unidad = existUnidadByClave.get(clave) || 0;
                const { AZM, AZE, AZT } = getAlm(clave);
                const faltante = Math.max(0, (solicitado || 0) - (existencia_unidad || 0));

                const sugerencia = this.buildSugerencia({
                    jurisdiccion: j,
                    solicitado,
                    existencia_unidad,
                    AZM, AZE, AZT
                });

                return {
                    clave,
                    descripcion: this.getDescripcionArticulo(clave),
                    solicitado,
                    existencia_unidad, cpm: d.cpm || 0,
                    AZM, AZT, AZE, faltante,
                    sugerencia
                };
            });

            // 4.1) Homologación (solo cuando la clave original NO puede cubrir el faltante con almacenes)
            const clavesParaHomologar = Array.from(new Set(
                out
                    .filter(r => r.faltante > 0 && ((r.AZM + r.AZT + r.AZE) < r.faltante))
                    .map(r => r.clave)
            ));

            const homByClave = clavesParaHomologar.length
                ? await firstValueFrom(this.homologosSrv.batch(clavesParaHomologar))
                : new Map<string, HomologoDTO[]>();

            const bucketPreferido = this.bucketPreferidoFromJurisdiccion(j);

            for (const r of out) {
                if (!(r.faltante > 0 && ((r.AZM + r.AZT + r.AZE) < r.faltante))) continue;

                const homs = homByClave.get(r.clave) ?? [];
                if (!homs.length) {
                    r.homologacion = { total: 0, mejores: [] };
                    r.sugerencia += ' Homologación: sin registros en catálogo.';
                    continue;
                }

                const mejores = this.rankHomologos(homs, r.faltante, bucketPreferido, getAlm);
                r.homologacion = { total: homs.length, mejores };

                if (!mejores.length) {
                    r.sugerencia += ` Homologación: ${homs.length} candidato(s), pero sin stock reportado en AZM/AZT/AZE.`;
                    continue;
                }

                // Mantén el modal limpio: deja el detalle en `homologacion` y sólo una nota breve aquí.
                r.sugerencia += ` Homologación: ver opciones (top ${mejores.length}).`;
            }

            // orden por clave
            out.sort((a, b) => (a.clave || '').localeCompare(b.clave || ''));
            this.miniRows.set(out);
            this.selectedUnidad.set(this.unidadesService.findByCluesimb(row.cluesimb)?.nombre ?? row.cluesimb);

        } catch (e) {
            this.miniError.set('No se pudo construir el mini-balanceo.');
        } finally {
            this.miniLoading.set(false);
        }
    }

    private buildSugerencia(x: {
        jurisdiccion: string;
        solicitado: number;
        existencia_unidad: number;
        AZM: number; AZE: number; AZT: number;
    }): string {
        const faltante = Math.max(0, (x.solicitado || 0) - (x.existencia_unidad || 0));
        if (faltante <= 0) return 'Unidad con existencia suficiente (según datos internos).';

        // preferencia por jurisdicción
        const jur = (x.jurisdiccion || '').toUpperCase();
        const pref = jur === 'TIJUANA' ? 'AZT' : jur === 'MEXICALI' ? 'AZM' : jur === 'ENSENADA' ? 'AZE' : '';

        const prefStock =
            pref === 'AZT' ? x.AZT :
                pref === 'AZM' ? x.AZM :
                    pref === 'AZE' ? x.AZE : 0;

        if (!pref) {
            return `Faltante aprox: ${faltante}. Sugerencia: consultar almacén correspondiente y validar compromisos.`;
        }

        if (prefStock > 0) {
            return `Faltante aprox: ${faltante}. Sugerencia: preguntar a ${pref} por ~${faltante} (jurisdicción ${jur}). Validar si está comprometido.`;
        }

        // preferente sin stock reportado: solo texto consultivo
        const otros = (pref === 'AZT') ? 'AZM/AZE' : (pref === 'AZM') ? 'AZT/AZE' : 'AZT/AZM';
        return `Faltante aprox: ${faltante}. ${pref} sin existencia reportada; sugerencia: consultar ${pref} y, si aplica, preguntar también a ${otros}.`;
    }

    private bucketPreferidoFromJurisdiccion(j: string): 'AZM' | 'AZT' | 'AZE' | '' {
        const jur = (j || '').trim().toUpperCase();
        return jur === 'TIJUANA' ? 'AZT' : jur === 'MEXICALI' ? 'AZM' : jur === 'ENSENADA' ? 'AZE' : '';
    }

    private rankHomologos(
        homs: HomologoDTO[],
        faltante: number,
        bucketPreferido: 'AZM' | 'AZT' | 'AZE' | '',
        getAlm: (clave: string) => { AZM: number; AZT: number; AZE: number }
    ): MiniBalanceHomologoCand[] {
        const candidates: MiniBalanceHomologoCand[] = [];

        for (const h of (homs ?? [])) {
            const sustituto = (h.candidato || '').trim().toUpperCase();
            if (!sustituto) continue;

            // factor como número (para cálculo aproximado de UI)
            const f = Number(h.factor);
            if (!isFinite(f) || f <= 0) continue;

            const buckets = getAlm(sustituto);
            const total = (buckets.AZM || 0) + (buckets.AZT || 0) + (buckets.AZE || 0);
            if (total <= 0) continue;

            const existenciaPreferida = bucketPreferido === 'AZM'
                ? buckets.AZM
                : bucketPreferido === 'AZT'
                    ? buckets.AZT
                    : bucketPreferido === 'AZE'
                        ? buckets.AZE
                        : 0;

            // bucket sugerido: primero preferido si hay stock; si no, el de mayor stock
            let bucketSugerido: 'AZM' | 'AZT' | 'AZE' | '' = '';
            if (bucketPreferido && existenciaPreferida > 0) {
                bucketSugerido = bucketPreferido;
            } else {
                const pairs: Array<['AZM' | 'AZT' | 'AZE', number]> = [
                    ['AZT', buckets.AZT],
                    ['AZM', buckets.AZM],
                    ['AZE', buckets.AZE],
                ];
                pairs.sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
                bucketSugerido = pairs[0]?.[0] ?? '';
            }

            candidates.push({
                sustituto,
                factor: h.factor,
                qtySugerida: (faltante || 0) * f,
                buckets,
                bucketPreferido,
                bucketSugerido,
                existenciaPreferida: bucketSugerido === 'AZM'
                    ? buckets.AZM
                    : bucketSugerido === 'AZT'
                        ? buckets.AZT
                        : bucketSugerido === 'AZE'
                            ? buckets.AZE
                            : 0,
            });
        }

        // orden: 1) que tenga stock en preferido, 2) mayor stock en bucket sugerido, 3) factor más conveniente (menor qty sugerida)
        candidates.sort((a, b) => {
            const aPref = (a.bucketPreferido && a.bucketPreferido === a.bucketSugerido) ? 1 : 0;
            const bPref = (b.bucketPreferido && b.bucketPreferido === b.bucketSugerido) ? 1 : 0;
            if (bPref !== aPref) return bPref - aPref;

            const aDisp = a.existenciaPreferida || 0;
            const bDisp = b.existenciaPreferida || 0;
            if (bDisp !== aDisp) return bDisp - aDisp;

            return (a.qtySugerida || 0) - (b.qtySugerida || 0);
        });

        return candidates.slice(0, 3);
    }

    private formatQty(n: number): string {
        const x = Number(n ?? 0);
        if (!isFinite(x)) return '0';
        // si es entero, sin decimales; si no, 2 decimales
        if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
        return x.toFixed(2);
    }

    private keyClave(clave: string): string {
        const raw = (clave ?? '').trim().toUpperCase();
        const normalized = this.norm.normClave(raw);
        return (normalized || raw).trim().toUpperCase();
    }

    private parseDateOrNull(value: unknown): Date | null {
        if (!value) return null;
        const d = new Date(value as any);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    private formatDateYmd(value: unknown): string {
        if (!value) return '';
        if (typeof value === 'string') {
            const m = value.match(/^\d{4}-\d{2}-\d{2}/);
            if (m?.[0]) return m[0];
        }
        const d = this.parseDateOrNull(value);
        return d ? d.toISOString().slice(0, 10) : '';
    }

    private cacheKeyOrdenesComparativa(clave: string, cluesimb: string): string {
        return `${this.keyClave(clave)}|${(cluesimb ?? '').trim().toUpperCase()}|15d|incPend`;
    }

    private async getOrdenesComparativaCached(clave: string, cluesimb: string, forceRefresh = false): Promise<Cita[]> {
        const key = this.cacheKeyOrdenesComparativa(clave, cluesimb);
        const now = Date.now();
        const cached = this.ordenesComparativaCache.get(key);
        if (!forceRefresh && cached && (now - cached.ts) < this.ordenesComparativaCacheTtlMs) {
            return cached.rows;
        }

        const resp = await firstValueFrom(this.citasService.getCitasPorClaveXClave({
            clave,
            windowDays: 15,
            incluyeNoRecibidas: true,
            limit: 300
        }));
        const rows = (resp?.rows ?? []) as Cita[];
        this.ordenesComparativaCache.set(key, { ts: now, rows });
        return rows;
    }

    private async cargarOrdenesSuministroComparativa(
        row: BitacoraHeader,
        det: BitacoraDetalle[],
        movRows: MovimientoRow[],
        forceRefresh = false
    ) {
        this.comparativaOsLoading.set(true);
        this.comparativaOsError.set(null);

        const entregadoByClave = new Map<string, number>();
        for (const r of (movRows ?? [])) {
            const clave = this.keyClave((r as any).clave_cnis ?? '');
            if (!clave) continue;
            const cant = Number((r as any).cantidad ?? 0) || 0;
            entregadoByClave.set(clave, (entregadoByClave.get(clave) ?? 0) + cant);
        }

        const claves = Array.from(new Set(
            (det ?? [])
                .filter(d => {
                    const clave = this.keyClave(d.clave ?? '');
                    const solicitado = Number(d.cantidad ?? 0) || 0;
                    const entregado = Number(entregadoByClave.get(clave) ?? 0);
                    return clave && solicitado !== entregado;
                })
                .map(x => this.keyClave(x.clave ?? ''))
                .filter(Boolean)
        ));

        if (!claves.length) {
            this.ordenesComparativaByClave.set(new Map());
            this.comparativaOsLoading.set(false);
            return;
        }

        const hoy = new Date();
        hoy.setHours(23, 59, 59, 999);

        const limiteAtras = new Date();
        limiteAtras.setDate(limiteAtras.getDate() - 15);
        limiteAtras.setHours(0, 0, 0, 0);

        const resultado = new Map<string, OrdenSuministroComparativa[]>();
        let errores = 0;

        const settled = await Promise.allSettled(
            claves.map(async clave => {
                const rows = await this.getOrdenesComparativaCached(clave, row.cluesimb, forceRefresh);
                return { clave, rows };
            })
        );

        for (const item of settled) {
            if (item.status !== 'fulfilled') {
                errores++;
                continue;
            }

            const clave = item.value.clave;
            const rows = item.value.rows ?? [];
            const acumulado: OrdenSuministroComparativa[] = [];
            const seen = new Set<string>();

            for (const cita of rows) {
                const clueDestino = (cita.clues_destino ?? '').trim().toUpperCase();
                if (clueDestino && clueDestino !== (row.cluesimb ?? '').trim().toUpperCase()) continue;

                const fechaEntregado = this.parseDateOrNull((cita.fecha_recepcion_lista && cita.fecha_recepcion_lista[0]) ?? null);
                const fechaLimite = this.parseDateOrNull(cita.fecha_limite_de_entrega);

                const esEntregadaReciente = !!fechaEntregado && fechaEntregado >= limiteAtras && fechaEntregado <= hoy;
                const esPendiente = !fechaEntregado && !!fechaLimite && fechaLimite >= limiteAtras;

                if (!esEntregadaReciente && !esPendiente) continue;

                const orden = (cita.orden_de_suministro ?? '').trim();
                if (!orden) continue;

                const fechaTipo: 'entregado' | 'fecha limite' = esEntregadaReciente ? 'entregado' : 'fecha limite';
                const fecha = esEntregadaReciente
                    ? this.formatDateYmd(fechaEntregado)
                    : this.formatDateYmd(fechaLimite);

                const dedupeKey = `${orden}|${fechaTipo}|${fecha}`;
                if (seen.has(dedupeKey)) continue;
                seen.add(dedupeKey);

                acumulado.push({
                    unidadDestino: (cita.unidad ?? 'SIN UNIDAD').trim().toUpperCase(),
                    orden,
                    tipoCompra: (cita.compra ?? 'Sin tipo').trim(),
                    piezasEmitidas: Number(cita.no_de_piezas_emitidas ?? 0) || 0,
                    fechaTipo,
                    fecha
                });
            }

            acumulado.sort((a, b) => a.orden.localeCompare(b.orden));
            resultado.set(clave, acumulado);
        }

        this.ordenesComparativaByClave.set(resultado);
        if (errores > 0) {
            this.comparativaOsError.set('No se pudieron cargar todas las órdenes de suministro para la comparativa.');
        }
        this.comparativaOsLoading.set(false);
    }

    async refrescarOrdenesComparativa() {
        const header = this.selectedHeader();
        if (!header) return;
        await this.cargarOrdenesSuministroComparativa(header, this.detalle(), this.movRows(), true);
    }

    async exportarComparativaExcel() {
        const h = this.selectedHeader();
        if (!h) return;

        this.comparativaExportando.set(true);
        try {
            const comparativa = this.getComparativaViewOrdenadoPorClave();
            const descripcionByClave = new Map<string, string>(
                comparativa.map(r => [this.keyClave(r.clave), r.descripcion ?? ''])
            );

            const ordenes: SolicitudesComparativaOrdenRow[] = [];
            for (const [clave, list] of this.ordenesComparativaByClave().entries()) {
                const descripcion = descripcionByClave.get(this.keyClave(clave)) ?? '';
                for (const o of (list ?? [])) {
                    ordenes.push({
                        clave,
                        descripcion,
                        unidadDestino: o.unidadDestino,
                        orden: o.orden,
                        tipoCompra: o.tipoCompra,
                        piezasEmitidas: Number(o.piezasEmitidas ?? 0),
                        fechaTipo: o.fechaTipo,
                        fecha: o.fecha
                    });
                }
            }

            const nombre = `Comparativa_Solicitudes_${h.cluesimb}_${h.created_day}`;
            await this.excelService.exportarSolicitudesComparativa(
                nombre,
                {
                    cluesimb: h.cluesimb,
                    unidad: this.selectedUnidad(),
                    fechaSolicitud: h.created_day,
                    tipoPedido: h.tipo_pedido,
                    tiposInsumo: (h.tipos_insumo ?? []).join(' - '),
                    rangoDesde: this.movDesde(),
                    rangoHasta: this.movHasta()
                },
                comparativa,
                ordenes
            );
        } finally {
            this.comparativaExportando.set(false);
        }
    }

    cerrarMiniBalanceo() {
        this.miniVisible.set(false);
        this.miniHeader.set(null);
        this.miniRows.set([]);
        this.miniError.set(null);
        this.selectedHeader.set(null);
    }

    private resetMovUI() {
        this.movMostrarResumen.set(false);
        this.movSoloClavesSolicitud.set(false);
        this.movFiltroClave?.set?.('');
        this.movClavesSolicitud.set(new Set());
    }
}
