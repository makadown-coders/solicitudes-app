import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, inject, signal, computed, Component } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { LucideAngularModule } from "lucide-angular";
import { BatchItem, UIRow, UIRowX } from "../../models/cpm-row";
import { CpmEditorService } from "../../services/cpm-editor.service";
import { CapturaCluesLiteComponent } from "../../shared/captura-clues-lite/captura-clues-lite.component";
import { Unidadv2 } from "../../models";
import { firstValueFrom } from "rxjs";
import { ArticulosService } from "../../services/articulos.service";

@Component({
    selector: 'app-cpm-editor',
    standalone: true,
    imports: [CommonModule, FormsModule, LucideAngularModule, CapturaCluesLiteComponent],
    templateUrl: './cpm-editor.component.html',
    styleUrls: ['./cpm-editor.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CpmEditorComponent {
    private api = inject(CpmEditorService);
    unidadSel: Unidadv2 | null = null;

    // Modelo simple para el input; el signal se actualiza en load()
    umText = '';
    um = signal<string>('');                 // cluesimb / cluessa / alias
    byCluessa = signal<boolean>(false);      // buscar por CLUES SSA

    rows = signal<UIRowX[]>([]);
    loading = signal(false);
    saving = signal(false);
    message = signal<string>('');
    error = signal<string>('');
    saveProgress = signal(0); // 0 => indeterminada

    dirtyCount = computed(() => this.rows().filter(r => r._dirty && !r._invalid).length);

    private articulos = inject(ArticulosService);

    private artMap = new Map<string, { descripcion: string; presentacion?: string; categoria?: string | null }>();
    private artMapLoaded = false;

    // ------- Métodos llamados desde la vista (HTML limpio) -------
    onToggleByCluessa($event: any) {
        const checked = ($event.target as HTMLInputElement).checked
        this.byCluessa.set(checked);
    }

    private async loadArtMapIfNeeded() {
        if (this.artMapLoaded) return;
        const mapa = await firstValueFrom(this.articulos.getArticulosMapa());
        this.artMap = new Map<string, any>(Object.entries(mapa));
        this.artMapLoaded = true;
    }

    load() {
        const ident = this.unidadSel ? (this.unidadSel.cluesimb || this.unidadSel.cluesssa || '') : null;
        if (!ident) { this.error.set('Captura un identificador de unidad (CLUES IMB/SSA o alias).'); return; }

        this.um.set(ident);
        this.loading.set(true);

        const obs = this.byCluessa()
            ? this.api.getByUnidadAll(undefined, ident)
            : this.api.getByUnidadAll(ident);

        obs.subscribe({
            next: async (res) => {
                const base = (res.rows || []).map(r => ({
                    ...r,
                    _dirty: false,
                    _invalid: Number.isNaN(Number(r.cpm)) || Number(r.cpm) < 0,
                }));

                await this.loadArtMapIfNeeded();

                const enriched: UIRowX[] = base.map(r => {
                    const meta = this.artMap.get(r.clave_cnis);
                    return {
                        ...r,
                        descripcion: meta?.descripcion ?? '',
                        presentacion: meta?.presentacion ?? ''
                    };
                });

                this.rows.set(enriched);
                this.message.set(`${enriched.length} claves cargadas.`);
                this.error.set('');
                this.loading.set(false);
            },
            error: (err) => {
                this.error.set(err?.error?.error ?? 'Error al cargar');
                this.loading.set(false);
            },
        });
    }

    addRow() {
        const clave = window.prompt('Clave CNIS a agregar:');
        if (!clave) return;
        const v = clave.trim();
        if (!v) return;

        const existing = this.rows().some(x => x.clave_cnis === v);
        if (existing) { window.alert('Esa clave ya está en la lista.'); return; }

        this.rows.update(list => [{ clave_cnis: v, cpm: 0, fuente: 'manual', _dirty: true, _invalid: false }, ...list]);
    }

    onRowCpmChange(index: number, value: number | string) {
        const n = Number(value);
        this.rows.update(list => {
            const copy = [...list];
            const r = { ...copy[index] };
            r.cpm = n;
            r._dirty = true;
            r._invalid = Number.isNaN(n) || n < 0;
            copy[index] = r;
            return copy;
        });
    }

    onRowFuenteChange(index: number, value: string) {
        this.rows.update(list => {
            const copy = [...list];
            const r = { ...copy[index] };
            r.fuente = (value || 'manual').trim() || 'manual';
            r._dirty = true;
            copy[index] = r;
            return copy;
        });
    }

    saveRow(index: number) {
        const ident = this.um();
        if (!ident) { this.error.set('Falta unidad.'); return; }
        const r = this.rows()[index];
        if (r._invalid) { this.error.set('Corrige los valores inválidos antes de guardar.'); return; }

        this.saving.set(true);
        this.api.upsertOne(ident, r.clave_cnis, r.cpm, r.fuente).subscribe({
            next: () => {
                this.rows.update(list => {
                    const copy = [...list];
                    copy[index] = { ...r, _dirty: false };
                    return copy;
                });
                this.message.set('Fila guardada.');
                this.saving.set(false);
            },
            error: (err) => {
                this.error.set(err?.error?.error ?? 'Error al guardar fila');
                this.saving.set(false);
            }
        });
    }

    /* saveAll() {
         const ident = this.um();
         if (!ident) { this.error.set('Falta unidad.'); return; }
 
         const items: BatchItem[] = this.rows()
             .filter(r => r._dirty && !r._invalid)
             .map(r => ({ clave: r.clave_cnis, cpm: r.cpm, fuente: r.fuente }));
 
         if (items.length === 0) { this.message.set('No hay cambios por guardar.'); return; }
 
         this.saving.set(true);
         this.api.upsertBatch(ident, items).subscribe({
             next: (res) => {
                 this.rows.update(list => list.map(r => r._dirty && !r._invalid ? ({ ...r, _dirty: false }) : r));
                 this.message.set(`Cambios guardados (${res.count}).`);
                 this.saving.set(false);
             },
             error: (err) => {
                 this.error.set(err?.error?.error ?? 'Error en guardado masivo');
                 this.saving.set(false);
             }
         });
     }*/

    async saveAllChunked(batchSize = 100) {
        const ident = this.um();
        if (!ident) { this.error.set('Falta unidad.'); return; }

        const items: BatchItem[] = this.rows()
            .filter(r => r._dirty && !r._invalid)
            .map(r => ({ clave: r.clave_cnis, cpm: r.cpm, fuente: r.fuente }));

        if (items.length === 0) { this.message.set('No hay cambios por guardar.'); return; }

        this.saving.set(true);
        this.saveProgress.set(0);

        const total = items.length;
        for (let i = 0; i < total; i += batchSize) {
            const chunk = items.slice(i, i + batchSize);
            try {
                await firstValueFrom(this.api.upsertBatch(ident, chunk));
                const done = i + chunk.length;
                this.saveProgress.set(Math.round((done / total) * 100));
                // marca como guardadas las filas afectadas
                const claves = new Set(chunk.map(c => c.clave));
                this.rows.update(list => list.map(r => claves.has(r.clave_cnis) ? ({ ...r, _dirty: false }) : r));
            } catch (err: any) {
                this.error.set(err?.error?.error ?? 'Error en guardado masivo');
                this.saving.set(false);
                this.saveProgress.set(0);
                return;
            }
        }

        this.message.set(`Cambios guardados (${total}).`);
        this.saving.set(false);
        // deja la barra llena un instante y luego la ocultas
        setTimeout(() => this.saveProgress.set(0), 400);
    }

    trackByClave = (_: number, r: UIRow) => r.clave_cnis;

    // en tu componente
    openFuenteInfo() { this.showFuenteDialog = true; }
    closeFuenteInfo() { this.showFuenteDialog = false; }
    showFuenteDialog = false;

    onRowFuenteChangeConfirm(index: number, value: string) {
        const prev = this.rows()[index].fuente;
        const next = (value || 'manual').trim() || 'manual';
        if (prev === next) return;

        const msgMap: Record<string, string> = {
            'historico->manual': 'Marcar como MANUAL puede congelar este CPM ante recalculos automáticos.',
            'manual->historico': 'Volver a HISTÓRICO permite que se actualice con cálculos de consumo.',
            'import->manual': 'De IMPORT a MANUAL: pasarás a control local (criterio técnico).',
            'import->historico': 'De IMPORT a HISTÓRICO: quedará libre para recalculo automático.',
        };
        const key = `${prev}->${next}`;
        const warn = msgMap[key] || '¿Confirmas cambiar el origen (fuente)?';

        if (!confirm(warn)) return;

        this.onRowFuenteChange(index, next); // reutiliza tu método existente que marca dirty
    }

    chipClass(fuente: string) {
        const f = (fuente || '').toLowerCase();
        if (f.startsWith('manu')) return 'chip chip-manual';
        if (f.startsWith('hist')) return 'chip chip-historico';
        return 'chip chip-import';
    }

    onUnidadSeleccionada(u: Unidadv2) {
        this.unidadSel = u;
        this.um.set((u.cluesimb || u.cluesssa || '').toUpperCase());
        this.load(); // recarga CPMs para la unidad elegida
    }

    onUnidadCambiada() {
        this.unidadSel = null;
        this.um.set('');
        this.rows.set([]);
        this.message.set('');
        this.error.set('');
    }

    filterText = signal('');  // ← ahora sí es reactivo
    rowsFiltered = computed(() => {
        const q = this.filterText().trim().toLowerCase();
        if (!q) return this.rows();
        return this.rows().filter(r =>
            r.clave_cnis.toLowerCase().includes(q) ||
            (r.descripcion ?? '').toLowerCase().includes(q)
        );
    });
}