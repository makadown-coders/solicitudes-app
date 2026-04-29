// src/app/features/solicitudes/kit-modal/kit-modal.component.ts
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, OnInit, Output, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { ArticulosService } from '../../../services/articulos.service';
import { CpmService } from '../../../services/cpm.service';
import { ExistenciasTempService, ExistUnidadRow } from '../../../services/existencias-temp.service';
import { InventarioService } from '../../../services/inventario.service';
import { NgFastToastService } from 'ng-fast-toast';

import { ArticuloSolicitud } from '../../../models/articulo-solicitud';
import { InventarioDisponibles } from '../../../models/Inventario';
import { CpmRowLite } from '../../../models/CpmExpectedRow';
import { KitRow } from '../../../models/KitRow';
import { ColKey } from '../../../models/ColKey';
import { TrazabilidadService } from '../../../services/trazabilidad.service';

type VistaKit = 'todos' | 'sugeridos' | 'existenciaCero';

@Component({
    selector: 'app-kit-modal',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './kit-modal.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class KitModalComponent implements OnInit {
    private static readonly UI_PREFS_KEY = 'solicitudes.kitModal.uiPrefs';
    @ViewChild('modalDialog') modalDialogRef?: ElementRef<HTMLDivElement>;

    // ===== Inputs =====
    /** CLUES IMB de la unidad (para existencias temporales y asegurar CPMs) */
    @Input() cluesimb: string = '';
    /** Nombre ya formateado que muestras en el encabezado (opcional) */
    @Input() tituloUnidad: string = '';
    /** ¿Renderiza el “para X”? (igual que tu modoStandalone) */
    @Input() mostrarUnidadEnTitulo: boolean = true;
    /** Inventario estatal por almacén (AZM/AZE/AZT) para enriquecer filas */
    @Input() inventarioDisponible: InventarioDisponibles[] = [];
    /** Claves ya presentes en la solicitud, para omitir duplicados */
    @Input() existingClaves: string[] = [];
    /** Cantidad por defecto si CPM/reorden = 0 */
    @Input() defaultQtyNoCpm = 1;

    // ===== Outputs =====
    /** Cerrar modal (señal al padre) */
    @Output() close = new EventEmitter<void>();
    /** Entrega al padre los artículos listos para agregarse a la solicitud */
    @Output() addToSolicitud = new EventEmitter<ArticuloSolicitud[]>();

    // ===== Servicios / utilidades =====
    private cpmService = inject(CpmService);
    private artSvc = inject(ArticulosService);
    private existSvc = inject(ExistenciasTempService);
    private invSvc = inject(InventarioService);
    private toast = inject(NgFastToastService);
    private cdRef = inject(ChangeDetectorRef);
    private trazabilidadService = inject(TrazabilidadService);

    // ===== Estado interno =====
    // UI switches
    verPorAlmacen = true;
    mostrarMasOpciones = false;
    showUnidadExist = true;
    vista: VistaKit = 'todos';

    // existencias por unidad (staging)
    hasUnidadExistencias = false;
    mesesCobertura = 1;

    // datos y stats
    kitRows: KitRow[] = [];
    kitStats = { total: 0, conCpm: 0, sinCpm: 0, conExist: 0, sinExist: 0, existTotal: 0 };

    // ===== Filtro por KIT (nuevo) =====
    kitOptions: string[] = [];
    kitSeleccionado: string = ''; // '' = Todos
    filterText: string = '';

    // selección
    private selectedSet = new Set<string>(); // claves normalizadas
    get selectionCount() { return this.selectedSet.size; }
    get filteredCount() { return this.kitRowsFiltrados.length; }
    get suggestedCount() { return this.kitRows.filter(r => this.isSugerido(r)).length; }
    get zeroExistCount() { return this.kitRows.filter(r => this.isExistenciaCero(r)).length; }

    // índice inventario estatal por clave (AZM/AZE/AZT)
    private invIndex = new Map<string, InventarioDisponibles>();
    // índice de existencias por unidad (tmp_existencias)
    private existUnidadIndex = new Map<string, number>();
    // índice de descripciones para tooltip
    private descIndex = new Map<string, string>();
    // índice de unidad medida (presentacion de insumo) para tooltip
    private presentacionIndex = new Map<string, string>();
    // estado
    loading = true;   // ← muestra skeleton al abrir
    busy = false;     // ← barrita cuando haces recálculos o fetch parciales
    skeletonRows = Array.from({ length: 8 }); // 8 renglones fake

    // ===== Ciclo de vida =====
    async ngOnInit() {
        this.loadUiPrefs();
        // invIndex local desde inventarioDisponible
        this.invIndex.clear();
        this.descIndex.clear();
        this.presentacionIndex.clear();
        for (const it of this.inventarioDisponible || []) {
            const k = this.normClave(it.clave);
            if (k) this.invIndex.set(k, it);
        }

        // Asegurar CPMs de la unidad (por si el padre no lo hizo)
        const clues = (this.cluesimb || '').trim().toUpperCase();
        if (clues) {
            try { await firstValueFrom(this.cpmService.ensureForCluesimb(clues)); } catch { /* noop */ }
            // Cargar lista de kits disponibles para esta unidad (para dropdown)
            this.kitOptions = this.cpmService.getKitCodigosFor(clues) ?? [];
        }

        await this.ensureDescripcionIndex();
        await this.loadKit();             // construye filas CPM + AZM/AZE/AZT
        this.loadExistenciasForUnit();    // mezcla existencias por unidad + reorden
    }

    @HostListener('document:keydown.escape')
    onEscapeKey() {
        this.cerrar();
    }

    // ===== Construcción de filas del KIT =====
    private async loadKit() {
        try {
            const clues = (this.cluesimb || '').trim().toUpperCase();
            const rows = await firstValueFrom(this.cpmService.cpmsFor(clues));

            const kit = rows
                .filter(r => r.en_kit)
                .filter(r => {
                    if (!this.kitSeleccionado) return true;
                    const kits = (r.kit_codigos ?? []).map(x => (x || '').trim().toUpperCase());
                    return kits.includes(this.kitSeleccionado.trim().toUpperCase());
                })
                .map(r => {
                    const clave = String(r.clave_cnis || '').toUpperCase();
                    const cpm = Number(r.cpm || 0);

                    const inv = this.invIndex.get(clave);
                    const azm = inv?.existenciasAZM ?? 0;
                    const aze = inv?.existenciasAZE ?? 0;
                    const azt = inv?.existenciasAZT ?? 0;
                    const total = azm + aze + azt;

                    return {
                        clave,
                        cpm,
                        azm,
                        aze,
                        azt,
                        total,
                        descripcion: this.getDescFor(clave) ?? '',
                        presentacion: this.getPresentacionFor(clave) ?? ''
                    };
                })
                .sort((a, b) => a.clave.localeCompare(b.clave));

            this.kitRows = kit;
            // Si ya tengo existencias por unidad, reinyéctalas sin re-fetch
            //if (this.hasUnidadExistencias && this.existUnidadIndex.size > 0) {
                // reset stats antes de recomputar
                this.kitStats.total = this.kitRows.length;
                this.kitStats.conCpm = 0;
                this.kitStats.sinCpm = 0;
                this.kitStats.conExist = 0;
                this.kitStats.sinExist = 0;
                this.kitStats.existTotal = 0;
                this.mergeExistenciasIntoKit();
            //}
            this.cdRef.markForCheck();
        } catch {
            this.toast.warn({ title: 'Sin datos', content: 'No fue posible cargar el KIT de la unidad.', duration: 5 });
        }
    }

    // ===== Existencias por unidad (staging) + reorden =====
    private loadExistenciasForUnit() {
        const clues = (this.cluesimb || '').trim().toUpperCase();
        if (!clues) {
            console.log('loadExistenciasForUnit NO HAY CLUES!!!!');
            this.existUnidadIndex.clear();
            this.hasUnidadExistencias = false;
            for (const r of this.kitRows) { delete r.existUnidad; delete r.reordenSug; }
            this.loading = false;
            this.focusDialog();
            this.cdRef.markForCheck();
            return;
        }
        this.loading = true;
        console.log('loadExistenciasForUnit', clues);
        this.kitStats.conCpm = 0;
        this.kitStats.sinCpm = 0;
        this.kitStats.conExist = 0;
        this.kitStats.sinExist = 0;
        this.kitStats.existTotal = 0;
        this.existSvc.byUnidad(clues).subscribe({
            next: async (rows: ExistUnidadRow[]) => {
                this.existUnidadIndex.clear();
                for (const r of rows) {
                    const k = this.normClave(r.clave_cnis);
                    // obteniendo factor de conversion
                    const factor = await this.trazabilidadService
                        .getFactorConversionPorUnidad(r.clave_cnis, this.cluesimb);
                    if (factor && factor.cantidad_fc > 0 && r.existencia_total > 0) {
                        const existenciaConvertida = (r.existencia_total) / factor.cantidad_fc;
                        this.existUnidadIndex.set(k, Math.floor(existenciaConvertida));
                    } else {
                        this.existUnidadIndex.set(k, Number(r.existencia_total) || 0);
                    }
                }
                this.hasUnidadExistencias = this.existUnidadIndex.size > 0;
                this.mergeExistenciasIntoKit();
                this.loading = false;
                this.focusDialog();
            },
            error: () => {
                this.existUnidadIndex.clear();
                this.hasUnidadExistencias = false;
                for (const r of this.kitRows) { delete r.existUnidad; delete r.reordenSug; }
                this.loading = false;
                this.focusDialog();
                this.cdRef.markForCheck();
            }
        });
    }

    private computeReorden(cpm: number, exist: number): number {
        const meses = Math.max(1, Math.floor(this.mesesCobertura || 1));
        const objetivo = Math.max(0, Math.ceil((cpm || 0) * meses));
        return Math.max(0, objetivo - (exist || 0));
    }


    private mergeExistenciasIntoKit() {
        this.kitStats.conCpm = 0;
        this.kitStats.sinCpm = 0;
        this.kitStats.conExist = 0;
        this.kitStats.sinExist = 0;
        this.kitStats.existTotal = 0;
        for (const r of this.kitRows) {
            const clave = this.normClave(r.clave);
            const exist = this.existUnidadIndex.get(clave) || 0;
            r.existUnidad = exist;
            const cpmEff = this.getCpmEfectivo(r);
            r.reordenSug = this.computeReorden(cpmEff, exist);
            // Estadísticas
            if ((Number(r.cpm) || 0) > 0) this.kitStats.conCpm++;
            else this.kitStats.sinCpm++;
            this.kitStats.existTotal += Number(r.existUnidad) || 0;
            if ((Number(r.existUnidad) || 0) > 0) this.kitStats.conExist++;
            else this.kitStats.sinExist++;
        }
        this.pruneSelectionToVisibleRows();
        this.cdRef.markForCheck();
    }

    // ===== Selección =====
    toggleRowSelection(clave: string) {
        const k = this.normClave(clave);
        if (this.selectedSet.has(k)) this.selectedSet.delete(k);
        else this.selectedSet.add(k);
    }

    isRowSelected(clave: string) { return this.selectedSet.has(this.normClave(clave)); }

    clearSelection() { this.selectedSet.clear(); }

    selectOnlyWithCpm() {
        this.selectedSet.clear();
        for (const r of this.kitRows) if ((r.cpm ?? 0) > 0) this.selectedSet.add(this.normClave(r.clave));
    }

    get allFilteredSelected() {
        return this.kitRowsFiltrados.length > 0 &&
            this.kitRowsFiltrados.every(r => this.selectedSet.has(this.normClave(r.clave)));
    }
    get anyFilteredSelected() {
        return this.kitRowsFiltrados.some(r => this.selectedSet.has(this.normClave(r.clave)));
    }
    get someFilteredSelected() {
        return this.anyFilteredSelected && !this.allFilteredSelected;
    }
    toggleMasterSelection(checked: boolean) {
        if (checked) {
            for (const r of this.kitRowsFiltrados) this.selectedSet.add(this.normClave(r.clave));
            return;
        }

        for (const r of this.kitRowsFiltrados) this.selectedSet.delete(this.normClave(r.clave));
    }

    // ===== Acciones =====
    cerrar() { this.close.emit(); }

    /**
 * Si TRUE: r.reordenSug YA VIENE como total para X meses (no se vuelve a multiplicar).
 * Si FALSE: r.reordenSug es mensual y SÍ se multiplica por mesesCobertura.
 */
    reordenEsTotal = false;

    async agregarSeleccionAKit() {
        if (this.selectedSet.size === 0) {
            this.toast.warn({ title: 'Sin selección', content: 'Elige al menos una clave.', duration: 5 });
            return;
        }

        const mesesCobertura = Math.max(1, Math.floor(this.mesesCobertura || 1));
            /*(this.showUnidadExist && this.hasUnidadExistencias) ?
                Math.max(1, Math.floor(this.mesesCobertura || 1))
                :
                1;*/

        const existentes = new Set((this.existingClaves || []).map(c => this.normClave(c)));
        const nuevos: ArticuloSolicitud[] = [];
        let omitidasPorDup = 0, omitidasPorQty = 0;

        for (const r of this.kitRows) {
            const clave = this.normClave(r.clave);
            if (!this.selectedSet.has(clave)) continue;
            if (existentes.has(clave)) { omitidasPorDup++; continue; }

            let qty: number | null = null;

            // 1) Si hay CPM > 0, usarlo
            if ((r.cpm ?? 0) > 0) {
                qty = mesesCobertura > 1 ? Number(r.reordenSug) : Number(r.cpm);
            }
            // 2) Si no, usar reordenSug si existe
            if (qty == null || qty <= 0) {
                const reo = Number(r.reordenSug ?? 0);
                if (!isNaN(reo)) qty = reo;
            }
            // 3) Si sigue 0, usar defaultQtyNoCpm
            if (qty == null || qty <= 0) {
                qty = (Number(this.defaultQtyNoCpm || 0)) * mesesCobertura;
            }
            // 4) Nunca dejar 0
            qty = Math.max(1, Number(qty) || 0);
            if (!qty || qty <= 0) { omitidasPorQty++; continue; }

            nuevos.push({
                clave,
                descripcion: this.getDescFor(clave) ?? '',
                unidadMedida: this.getPresentacionFor(clave) ?? '',
                cantidad: qty,
                cpm: r.cpm ?? 0,
                observaciones: '',
                presentacion: this.getPresentacionFor(clave) ?? ''
            });
        }

        if (!nuevos.length) {
            this.toast.warn({
                title: 'Nada para agregar',
                content: 'Las claves seleccionadas ya están en la lista o su cantidad resultó 0.',
                duration: 5
            });
            return;
        }

        let mensaje = `Se agregaron ${nuevos.length} claves.`;
        if (omitidasPorDup > 0) mensaje += ` Se omitieron ${omitidasPorDup} claves que ya estan en la lista.`;
        if (omitidasPorQty > 0) mensaje += ` Se omitieron ${omitidasPorQty} claves con cantidad 0.`;
        this.addToSolicitud.emit(nuevos);
        this.toast.success({
            title: 'Agregado',
            content: mensaje,
            duration: 7
        });
        this.cerrar();
    }



    private getVisibleColumns(): Array<{ key: ColKey; header: string }> {
        const cols: Array<{ key: ColKey; header: string }> = [];

        // Clave siempre va
        cols.push({ key: 'clave', header: 'Clave' });

        // Si está activo el toggle y hay staging, muestra "Exist." justo después de Clave (tal como en la tabla)
        if (this.showUnidadExist && this.hasUnidadExistencias) {
            cols.push({ key: 'existUnidad', header: 'Exist.' });
        }

        // Luego CPM
        cols.push({ key: 'cpm', header: 'CPM' });

        // AZM/AZE/AZT si se está mostrando por almacén
        if (this.verPorAlmacen) {
            cols.push({ key: 'azm', header: 'AZM' });
            cols.push({ key: 'aze', header: 'AZE' });
            cols.push({ key: 'azt', header: 'AZT' });
        }

        // Al final, si aplica, el reorden sugerido
        if (this.showUnidadExist && this.hasUnidadExistencias) {
            cols.push({ key: 'reordenSug', header: 'Cant. sugerida a solicitar' });
        }

        return cols;
    }

    private buildExportMatrix() {
        const cols = this.getVisibleColumns();
        const headers = cols.map(c => c.header);
        const rows = this.kitRowsFiltrados.map(r => cols.map(c => {
            const v = (r as any)[c.key];
            return v == null ? '' : String(v);
        }));
        return { headers, rows };
    }
    async copiarKitAlPortapapeles() {
        const texto = this.kitRows.map(r => r.clave).join('\n');
        try { await navigator.clipboard.writeText(texto); this.toast.success({ title: 'Copiado', content: 'Claves del KIT copiadas.', duration: 5 }); }
        catch { this.toast.error({ title: 'Error', content: 'No se pudieron copiar las claves.', duration: 5 }); }
    }
    private async copyText(text: string) {
        try {
            if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
        } catch { /* fallback abajo */ }
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
    }
    async copiarTablaKitAlPortapapeles() {
        const { headers, rows } = this.buildExportMatrix();
        const tsv = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
        try { await this.copyText(tsv); this.toast.success({ title: 'Copiado', content: `Se copiaron ${rows.length} renglones (tabla visible).`, duration: 5 }); }
        catch { this.toast.error({ title: 'Error', content: 'No se pudo copiar la tabla al portapapeles.', duration: 5 }); }
    }
    exportarKitCsv() {
        const { headers, rows } = this.buildExportMatrix();
        const esc = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `KIT-${(this.cluesimb || 'UNIDAD')}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ===== Tooltips de descripción =====
    private async ensureDescripcionIndex() {
        if (this.descIndex.size > 0) return;
        try {
            const mapa = await firstValueFrom(this.artSvc.getArticulosMapa());
            for (const [clave, meta] of Object.entries(mapa ?? {})) {
                const k = this.normClave(clave);
                if (k) {
                    this.descIndex.set(k, (meta?.descripcion ?? '').toString());
                    this.presentacionIndex.set(k, (meta?.presentacion ?? '').toString());
                }
            }
        } catch { /* noop */ }
    }
    getDescFor(clave: string): string | null {
        const k = this.normClave(clave);
        const full = this.descIndex.get(k) || '';
        if (!full) return null;
        return (full.length > 130 ? full.slice(0, 130) + '…' : full);
    }

    getPresentacionFor(clave: string): string | null {
        const k = this.normClave(clave);
        const presentacion = this.presentacionIndex.get(k) || '';
        if (!presentacion) return null;
        return presentacion.length > 70 ? presentacion.slice(0, 70) + '...' : presentacion;
    }

    // ===== Helpers =====
    normClave(v: string | null | undefined) {
        return this.invSvc.normalizarClave((v ?? '').toString().toUpperCase());
    }
    setVerPorAlmacen(v: boolean) {
        this.verPorAlmacen = !!v;
        this.saveUiPrefs();
        this.cdRef.markForCheck();
    }
    toggleMasOpciones() { this.mostrarMasOpciones = !this.mostrarMasOpciones; this.cdRef.markForCheck(); }
    setShowUnidadExist(v: boolean) {
        this.showUnidadExist = !!v;
        this.saveUiPrefs();
        this.busy = true;
        this.cdRef.markForCheck();
        this.busy = false;
    }
    setMesesCobertura(n: number) {
        this.mesesCobertura = Math.max(1, Math.floor(n || 1));
        this.saveUiPrefs();
        // if (this.hasUnidadExistencias)
        this.mergeExistenciasIntoKit();
        this.pruneSelectionToVisibleRows();
    }

    // === Filtro “virtual” (por ahora no hay filtros visibles) ===
    // Si en el futuro reactivas filtros/búsqueda, aquí es donde los aplicarías.
    setFilterText(v: string) {
        this.filterText = v ?? '';
        this.pruneSelectionToVisibleRows();
        this.cdRef.markForCheck();
    }

    setVista(vista: VistaKit) {
        this.vista = vista;
        this.pruneSelectionToVisibleRows();
        this.cdRef.markForCheck();
    }

    private isSugerido(r: KitRow): boolean {
        return (Number(r.reordenSug ?? 0) || 0) > 0;
    }

    private isExistenciaCero(r: KitRow): boolean {
        return r.existUnidad !== undefined && (Number(r.existUnidad) || 0) === 0;
    }

    private pruneSelectionToVisibleRows() {
        const visibles = new Set(this.kitRowsFiltrados.map(r => this.normClave(r.clave)));
        this.selectedSet = new Set([...this.selectedSet].filter(clave => visibles.has(clave)));
    }

    get kitRowsFiltrados(): KitRow[] {
        const q = (this.filterText || '').trim().toLowerCase();
        const byText = !q
            ? this.kitRows
            : this.kitRows.filter(r =>
                (r.clave || '').toLowerCase().includes(q) ||
                (r.descripcion || '').toLowerCase().includes(q) ||
                (r.presentacion || '').toLowerCase().includes(q)
            );

        switch (this.vista) {
            case 'sugeridos':
                return byText.filter(r => this.isSugerido(r));
            case 'existenciaCero':
                return byText.filter(r => this.isExistenciaCero(r));
            default:
                return byText;
        }
    }

    // === Botón inteligente de selección ===
    get selectionButtonLabel(): string {
        return (this.showUnidadExist && this.hasUnidadExistencias)
            ? 'Selec. cant. sug. > 0'
            : 'Seleccionar con CPM';
    }

    /** Selecciona según el contexto:
     * - Si se ven existencias de la unidad => reordenSug > 0
     * - Si no => CPM > 0
     */
    selectByContext(): void {
        this.selectedSet.clear();
        const usarReorden = this.showUnidadExist && this.hasUnidadExistencias;

        for (const r of this.kitRowsFiltrados) {
            const ok = usarReorden
                ? ((r.reordenSug || 0) > 0)
                : ((r.cpm ?? 0) > 0);

            if (ok) this.selectedSet.add(this.normClave(r.clave));
        }
    }

    async onKitSeleccionadoChange(v: string) {
        this.kitSeleccionado = v;
        this.clearSelection();
        this.busy = true;
        this.cdRef.markForCheck();

        await this.loadKit();

        this.busy = false;
        this.cdRef.markForCheck();
    }

    setDefaultQtyNoCpm(v: any) {
        const n = Math.floor(Number(v) || 0);
        this.defaultQtyNoCpm = Math.max(0, n);

        // Recalcula sugerencias si ya hay existencias cargadas
        //if (this.showUnidadExist && this.hasUnidadExistencias) {
            this.recomputeReordenSug();
        //}

        this.pruneSelectionToVisibleRows();
        this.cdRef.markForCheck();
    }

    private getCpmEfectivo(r: any): number {
        const cpmReal = Number(r.cpm || 0);
        if (cpmReal > 0) return cpmReal;

        const postizo = Number(this.defaultQtyNoCpm || 0);
        return postizo > 0 ? postizo : 0;
    }

    private recomputeReordenSug() {
        // OJO: NO toques existUnidad aquí, solo reordenSug
        for (const r of this.kitRows) {
            const exist = Number(r.existUnidad || 0);
            const cpmEff = this.getCpmEfectivo(r);
            r.reordenSug = this.computeReorden(cpmEff, exist);
        }
    }

    private loadUiPrefs() {
        try {
            const raw = localStorage.getItem(KitModalComponent.UI_PREFS_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as Partial<{
                verPorAlmacen: boolean;
                showUnidadExist: boolean;
                mesesCobertura: number;
            }>;

            if (typeof parsed.verPorAlmacen === 'boolean') this.verPorAlmacen = parsed.verPorAlmacen;
            this.showUnidadExist = true;
            if (typeof parsed.mesesCobertura === 'number' && Number.isFinite(parsed.mesesCobertura)) {
                this.mesesCobertura = Math.max(1, Math.floor(parsed.mesesCobertura));
            }
        } catch {
            // noop: si el JSON está dañado, usar defaults
        }
    }

    private saveUiPrefs() {
        try {
            const payload = {
                verPorAlmacen: this.verPorAlmacen,
                showUnidadExist: this.showUnidadExist,
                mesesCobertura: this.mesesCobertura
            };
            localStorage.setItem(KitModalComponent.UI_PREFS_KEY, JSON.stringify(payload));
        } catch {
            // noop: no bloquear UI por fallos de localStorage
        }
    }

    private focusDialog() {
        setTimeout(() => this.modalDialogRef?.nativeElement.focus(), 0);
    }

}
