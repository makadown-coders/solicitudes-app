import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Nivel, UpsertFlagPayload } from '../../models/feature-flags.model';
import { EffectiveFlags, FlagKey } from '../../models/featureFlags';
import { FeatureFlagsService } from '../../services/feature-flags.service';
import { UnidadAllow } from '../../models/UnidadAllow';
import { debounceTime, distinctUntilChanged, filter, map, startWith } from 'rxjs';


@Component({
    selector: 'app-solicitudes-config',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './solicitudes-config.component.html',
    styleUrls: ['./solicitudes-config.component.css'],
})
export class SolicitudesConfigComponent implements OnInit {
    private api = inject(FeatureFlagsService);
    private fb = inject(FormBuilder);

    scopeForm = this.fb.group({
        scope: this.fb.control<'global' | 'nivel' | 'clues'>('global', { nonNullable: true }),
        nivel: this.fb.control<Nivel>('SEGUNDO_NIVEL'),
        cluesimb: this.fb.control<string>(''),
    });

    loading = signal(false);
    saving = signal(false);

    saveMsg = signal<string | null>(null);
    saveOk = signal<boolean>(true);

    units = signal<UnidadAllow[]>([]);
    unitsLoading = signal(false);
    private unitsLoadedOnce = false;

    loadedFlags = signal<Partial<EffectiveFlags>>({});
    draftFlags = signal<Partial<EffectiveFlags>>({});

    flagsLoaded = computed(() => Object.keys(this.loadedFlags()).length > 0);
    togglesDisabled = computed(() => this.loading() || !this.flagsLoaded());

    ngOnInit() {
        // Validación condicional por ámbito + precarga de lista CLUES una sola vez
        this.scopeForm.get('scope')!.valueChanges.subscribe(async scope => {
            if (scope === 'nivel') {
                this.scopeForm.get('nivel')!.addValidators([Validators.required]);
                this.scopeForm.get('cluesimb')!.clearValidators();
            } else if (scope === 'clues') {
                this.scopeForm.get('cluesimb')!.addValidators([Validators.required]);
                this.scopeForm.get('nivel')!.clearValidators();
                if (!this.unitsLoadedOnce) await this.ensureUnitsLoaded();
            } else {
                this.scopeForm.get('nivel')!.clearValidators();
                this.scopeForm.get('cluesimb')!.clearValidators();
            }
            this.scopeForm.get('nivel')!.updateValueAndValidity({ emitEvent: false });
            this.scopeForm.get('cluesimb')!.updateValueAndValidity({ emitEvent: false });

            // limpiar flags visibles al cambiar de ámbito para evitar parpadeo/confusión
            this.loadedFlags.set({});
            this.draftFlags.set({});
            this.saveMsg.set(null);
        });

        // Auto-load de flags cuando cambie cualquier selector (ámbito/nivel/CLUES)
        this.scopeForm.valueChanges.pipe(
            startWith(this.scopeForm.value),
            debounceTime(150),
            map(v => {
                const scope = v.scope!;
                if (scope === 'global') return { scope };
                if (scope === 'nivel' && v.nivel) return { scope, nivel: v.nivel as Nivel };
                if (scope === 'clues' && (v.cluesimb || '').trim()) return { scope, cluesimb: (v.cluesimb || '').trim().toUpperCase() };
                return null;
            }),
            distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
            filter(Boolean)
        ).subscribe(async (params: any) => {
            try {
                this.loading.set(true);
                this.saveMsg.set(null);
                const flags = await this.api.getEffective({ nivel: params.nivel, cluesimb: params.cluesimb });
                this.loadedFlags.set(flags);
                this.draftFlags.set({
                    SOLO_CPMS: !!flags['SOLO_CPMS'],
                    BUSCAR_EXISTENCIA_EN_CLUES: !!flags['BUSCAR_EXISTENCIA_EN_CLUES'],
                    APLICAR_ENCUESTAS: !!flags['APLICAR_ENCUESTAS'],
                    APLICAR_EQUIVALENCIAS: !!flags['APLICAR_EQUIVALENCIAS'],
                    CLUES_EXISTENCIAS_ALLOWLIST: flags['CLUES_EXISTENCIAS_ALLOWLIST'],
                    IMPORT_LIMIT_TO_KIT: !!flags['IMPORT_LIMIT_TO_KIT'],
                    EDIT_CPMS: !!flags['EDIT_CPMS'],
                });
            } catch (e) {
                console.error(e);
                this.saveOk.set(false);
                this.saveMsg.set('Error al cargar flags.');
                this.loadedFlags.set({});
                this.draftFlags.set({});
            } finally {
                this.loading.set(false);
            }
        });
    }

    async ensureUnitsLoaded() {
        try {
            this.unitsLoading.set(true);
            const list = await this.api.getAllowlistUnidadesAll();
            this.units.set(list);
            this.unitsLoadedOnce = true;
        } catch (e) {
            console.error('Error cargando allowlist', e);
            this.units.set([]);
        } finally {
            this.unitsLoading.set(false);
        }
    }

    flagValue(key: FlagKey): boolean {
        return !!this.draftFlags()[key];
    }

    onToggle(key: FlagKey, ev: Event) {
        if (this.togglesDisabled()) return;
        const checked = (ev.target as HTMLInputElement).checked;
        this.draftFlags.set({ ...this.draftFlags(), [key]: checked });
    }

    pendingChanges = computed(() => {
        const loaded = this.loadedFlags();
        const draft = this.draftFlags();
        const keys: FlagKey[] = ['SOLO_CPMS',
                          'BUSCAR_EXISTENCIA_EN_CLUES',
                          'APLICAR_ENCUESTAS',
                          'APLICAR_EQUIVALENCIAS',
                          'IMPORT_LIMIT_TO_KIT',
                          'EDIT_CPMS'];
        return keys.filter(k => (!!draft[k]) !== (!!loaded[k]));
    });

    resetToLoaded() {
        const f = this.loadedFlags();
        this.draftFlags.set({
            SOLO_CPMS: !!f['SOLO_CPMS'],
            BUSCAR_EXISTENCIA_EN_CLUES: !!f['BUSCAR_EXISTENCIA_EN_CLUES'],
            APLICAR_ENCUESTAS: !!f['APLICAR_ENCUESTAS'],
            APLICAR_EQUIVALENCIAS: !!f['APLICAR_EQUIVALENCIAS'],
            IMPORT_LIMIT_TO_KIT: !!f['IMPORT_LIMIT_TO_KIT'],
            EDIT_CPMS: !!f['EDIT_CPMS'],
        });
        this.saveMsg.set(null);
    }

    async save() {
        try {
            if (this.togglesDisabled() || this.pendingChanges().length === 0) return;
            this.saving.set(true);
            this.saveMsg.set(null);

            const scope = this.scopeForm.value.scope!;
            const scopeId =
                scope === 'nivel' ? this.scopeForm.value.nivel :
                    scope === 'clues' ? (this.scopeForm.value.cluesimb || '').toString().trim().toUpperCase() :
                        null;

            const payloads: UpsertFlagPayload[] = this.pendingChanges().map(k => ({
                flag_key: k,
                scope,
                scope_id: scope === 'global' ? 'global' : (scopeId as string),
                value: !!this.draftFlags()[k],
            }));

            await this.api.patchFlags(payloads);

            // aplicar en loadedFlags para reflejar guardado
            const merged = { ...this.loadedFlags() };
            for (const p of payloads) merged[p.flag_key] = p.value;
            this.loadedFlags.set(merged);

            this.saveOk.set(true);
            this.saveMsg.set('Cambios guardados.');
        } catch (e) {
            console.error(e);
            this.saveOk.set(false);
            this.saveMsg.set('Error al guardar cambios.');
        } finally {
            this.saving.set(false);
        }
    }
}
