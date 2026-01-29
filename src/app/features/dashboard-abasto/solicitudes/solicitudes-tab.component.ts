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
    private unidadesLoaded = false;

    loading = signal(false);
    errorMsg = signal<string | null>(null);

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
    movResumenRows = signal<MovimientoResumenRow[]>([]);

    // filtro sobre resumen (puedes reutilizar filtroTexto si quieres, pero mejor separar)
    movFiltroClave = signal('');
    // ---------------- MOVIMIENTOS -----------------

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
    detalleError = signal<string | null>(null);
    selectedHeader = signal<BitacoraHeader | null>(null);
    detalle = signal<BitacoraDetalle[]>([]);

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

        // index por clave (entregado)
        const entregadoByClave = new Map<string, number>();
        for (const r of mov) {
            const k = (r.clave ?? '').toUpperCase();
            if (!k) continue;
            entregadoByClave.set(k, Number(r.entregado_piezas) || 0);
        }

        // armar tabla comparativa desde lo solicitado
        const rows: ComparativaRow[] = det.map(d => {
            const clave = (d.clave ?? '').toUpperCase();
            const solicitado = Number(d.cantidad) || 0;
            const entregado = entregadoByClave.get(clave) ?? 0;
            const diferencia = solicitado - entregado;

            const pct = solicitado > 0 ? (entregado / solicitado) * 100 : 0;
            const cumplimientoPct = Math.max(0, Math.min(100, Math.round(pct)));

            return {
                clave,
                descripcion: this.getDescripcionArticulo(clave),
                solicitado,
                entregado,
                diferencia,
                cumplimientoPct
            };
        });

        // orden sugerido: más “faltante” primero
        rows.sort((a, b) => (b.diferencia - a.diferencia));

        return rows;
    });

    kpiSolicitado = computed(() =>
        this.comparativaView().reduce((acc, r) => acc + (r.solicitado || 0), 0)
    );

    kpiEntregado = computed(() =>
        this.comparativaView().reduce((acc, r) => acc + (r.entregado || 0), 0)
    );

    kpiCoberturaPct = computed(() => {
        const sol = this.kpiSolicitado();
        const ent = this.kpiEntregado();
        if (sol <= 0) return 0;
        return Math.max(0, Math.min(100, Math.round((ent / sol) * 100)));
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

        try {
            const det = await this.bitacora.detalle(row.id);
            this.detalle.set((det ?? []).sort((a, b) => (a.clave || '').localeCompare(b.clave || '')));

            // después de cargar det:
            const desde = row.created_day;
            const d = new Date(desde);
            d.setDate(d.getDate() + 30);
            const hasta = d.toISOString().slice(0, 10);

            // carga solo el resumen (para comparativa)
            await this.cargarResumenMovimientos(row.cluesimb, desde, hasta);

            // opcional: setea señales para mostrar el rango que se usó
            this.movDesde.set(desde);
            this.movHasta.set(hasta);
            this.selectedUnidad.set(this.unidadesService.findByCluesimb(row.cluesimb)?.nombre ?? row.cluesimb);

        } catch {
            this.detalleError.set('No se pudo cargar el detalle.');
        } finally {
            this.detalleLoading.set(false);
        }
    }

    getRowsOrdenadoPorClave(): MovimientoRow[] {
        const rows = this.movRows();
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

    cerrarDetalle() {
        this.detalleVisible.set(false);
        this.selectedHeader.set(null);
        this.detalle.set([]);
    }

    totalUnidadesEnVista(): number {
        const set = new Set(this.rowsView().map(r => r.cluesimb));
        return set.size;
    }

    totalSolicitudesEnVista(): number {
        return this.rowsView().length;
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

        const desde = h.created_day;
        const d = new Date(desde);
        d.setDate(d.getDate() + days);
        const hasta = d.toISOString().slice(0, 10);

        this.movDesde.set(desde);
        this.movHasta.set(hasta);
        const unidad = this.unidadesService.findByCluesimb(h.cluesimb);
        this.selectedUnidad.set(unidad ? unidad.nombre : h.cluesimb);

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
            await this.cargarResumenMovimientos(h.cluesimb, desde, hasta);
        } catch {
            this.movError.set('No se pudieron cargar los movimientos.');
        } finally {
            this.movLoading.set(false);
        }
    }

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

    cerrarMovimientos() {
        this.movVisible.set(false);
        this.movRows.set([]);
        this.movError.set(null);

        this.movResumenRows.set([]);
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
                    existencia_unidad,
                    AZM, AZT, AZE, faltante,
                    sugerencia
                };
            });

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

    cerrarMiniBalanceo() {
        this.miniVisible.set(false);
        this.miniHeader.set(null);
        this.miniRows.set([]);
        this.miniError.set(null);
        this.selectedHeader.set(null);
    }
}
