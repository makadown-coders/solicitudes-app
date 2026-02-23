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

    private findArticuloMetaByClave(rawClave: string): { claveCanonica: string; meta: any } | null {
        const clave = String(rawClave || '').trim();
        if (!clave) return null;

        const direct = this.artMap.get(clave);
        if (direct) return { claveCanonica: clave, meta: direct };

        const upper = clave.toUpperCase();
        const upperDirect = this.artMap.get(upper);
        if (upperDirect) return { claveCanonica: upper, meta: upperDirect };

        const lower = clave.toLowerCase();
        for (const [k, v] of this.artMap.entries()) {
            if (k.toLowerCase() === lower) {
                return { claveCanonica: k, meta: v };
            }
        }

        return null;
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
                    _isNew: false,
                    _originalCpm: Number(r.cpm),
                    _originalFuente: r.fuente,
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

    async addRow() {
        const clave = window.prompt('Clave CNIS a agregar:');
        if (!clave) return;
        const v = clave.trim();
        if (!v) return;

        const existing = this.rows().some(x => x.clave_cnis.trim().toLowerCase() === v.toLowerCase());
        if (existing) { window.alert('Esa clave ya estÃ¡ en la lista.'); return; }

        await this.loadArtMapIfNeeded();
        const found = this.findArticuloMetaByClave(v);
        if (!found) {
            this.error.set(`La clave ${v} no existe en el catalogo de articulos.`);
            return;
        }

        this.rows.update(list => [{
            clave_cnis: found.claveCanonica,
            cpm: 0,
            fuente: 'manual',
            descripcion: found.meta?.descripcion ?? '',
            presentacion: found.meta?.presentacion ?? '',
            _dirty: true,
            _invalid: true,
            _isNew: true,
            _originalCpm: 0,
            _originalFuente: 'manual',
        }, ...list]);
        this.error.set('');
        this.message.set('Clave agregada. Para insertar debes capturar un CPM mayor a 0.');
    }

    onRowCpmChange(index: number, value: number | string) {
        const n = Number(value);
        this.rows.update(list => {
            const copy = [...list];
            const r = { ...copy[index] };
            r.cpm = n;
            r._dirty = true;
            r._invalid = Number.isNaN(n) || n < 0 || (!!r._isNew && n === 0);
            copy[index] = r;
            return copy;
        });
        this.error.set('');
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
        this.error.set('');
    }

    saveRow(index: number) {
        const ident = this.um();
        if (!ident) { this.error.set('Falta unidad.'); return; }
        const r = this.rows()[index];
        if (r._invalid) { this.error.set('Corrige los valores invalidos antes de guardar.'); return; }

        this.saving.set(true);
        const isDelete = !r._isNew && Number(r.cpm) === 0;
        const op$ = r._isNew
            ? this.api.upsertOneCreate(ident, r.clave_cnis, r.cpm, r.fuente)
            : this.api.saveExistingOne(ident, r.clave_cnis, r.cpm, r.fuente);

        op$.subscribe({
            next: () => {
                if (isDelete) {
                    this.rows.update(list => list.filter((_, i) => i !== index));
                    this.error.set('');
                    this.message.set(`CPM=0 aplicado. Se elimino ${r.clave_cnis}.`);
                } else {
                    this.rows.update(list => {
                        const copy = [...list];
                        copy[index] = {
                            ...r,
                            _dirty: false,
                            _isNew: false,
                            _originalCpm: Number(r.cpm),
                            _originalFuente: r.fuente,
                        };
                        return copy;
                    });
                    this.error.set('');
                    this.message.set(r._isNew ? 'Clave insertada.' : 'Fila guardada.');
                }
                this.saving.set(false);
            },
            error: (err) => {
                this.error.set(err?.error?.error ?? err?.message ?? 'Error al guardar fila');
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

        const invalidNewZero = this.rows()
            .filter(r => r._dirty && !!r._isNew && Number(r.cpm) === 0)
            .map(r => r.clave_cnis);

        if (invalidNewZero.length) {
            this.error.set(`No se puede insertar CPM=0. Ajusta estas claves: ${invalidNewZero.slice(0, 6).join(', ')}${invalidNewZero.length > 6 ? '…' : ''}`);
            return;
        }

        const dirtyRows = this.rows().filter(r => r._dirty && !r._invalid);
        const items: BatchItem[] = dirtyRows
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
                const claves = new Set(chunk.map(c => c.clave));

                this.rows.update(list => list
                    .map(r => claves.has(r.clave_cnis)
                        ? ({
                            ...r,
                            _dirty: false,
                            _isNew: false,
                            _originalCpm: Number(r.cpm),
                            _originalFuente: r.fuente
                        })
                        : r
                    )
                    .filter(r => !(claves.has(r.clave_cnis) && Number(r.cpm) === 0))
                );
            } catch (err: any) {
                this.error.set(err?.error?.error ?? 'Error en guardado masivo');
                this.saving.set(false);
                this.saveProgress.set(0);
                return;
            }
        }

        const deletedCount = dirtyRows.filter(r => !r._isNew && Number(r.cpm) === 0).length;
        this.error.set('');
        this.message.set(deletedCount > 0
            ? `Cambios guardados (${total}). Eliminadas por CPM=0: ${deletedCount}.`
            : `Cambios guardados (${total}).`);

        this.saving.set(false);
        setTimeout(() => this.saveProgress.set(0), 400);
    }

    cancelRow(index: number) {
        const r = this.rows()[index];
        if (!r) return;

        if (r._isNew) {
            this.rows.update(list => list.filter((_, i) => i !== index));
            this.error.set('');
            this.message.set(`Alta cancelada para ${r.clave_cnis}.`);
            return;
        }

        const originalCpm = Number(r._originalCpm ?? r.cpm);
        const originalFuente = r._originalFuente ?? r.fuente ?? 'manual';

        this.rows.update(list => {
            const copy = [...list];
            copy[index] = {
                ...r,
                cpm: originalCpm,
                fuente: originalFuente,
                _dirty: false,
                _invalid: Number.isNaN(originalCpm) || originalCpm < 0,
            };
            return copy;
        });

        this.error.set('');
        this.message.set(`Edicion cancelada para ${r.clave_cnis}.`);
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
            'historico->manual': 'Marcar como MANUAL puede congelar este CPM ante recalculos automÃ¡ticos.',
            'manual->historico': 'Volver a HISTÃ“RICO permite que se actualice con cÃ¡lculos de consumo.',
            'import->manual': 'De IMPORT a MANUAL: pasarÃ¡s a control local (criterio tÃ©cnico).',
            'import->historico': 'De IMPORT a HISTÃ“RICO: quedarÃ¡ libre para recalculo automÃ¡tico.',
        };
        const key = `${prev}->${next}`;
        const warn = msgMap[key] || 'Â¿Confirmas cambiar el origen (fuente)?';

        if (!confirm(warn)) return;

        this.onRowFuenteChange(index, next); // reutiliza tu mÃ©todo existente que marca dirty
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

    filterText = signal('');  // â† ahora sÃ­ es reactivo
    rowsFiltered = computed(() => {
        const q = this.filterText().trim().toLowerCase();
        if (!q) return this.rows();
        return this.rows().filter(r =>
            r.clave_cnis.toLowerCase().includes(q) ||
            (r.descripcion ?? '').toLowerCase().includes(q)
        );
    });
}


