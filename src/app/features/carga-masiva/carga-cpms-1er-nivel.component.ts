
import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { NgFastToastService } from "ng-fast-toast";
import * as XLSX from 'xlsx';
import { first, firstValueFrom } from "rxjs";
import { ExcelService } from "../../services/excel.service";
import { CPMS } from "../../models";
import { CpmService } from "../../services/cpm.service";
import { CpmEditorService } from "../../services/cpm-editor.service";
import { BatchItem } from "../../models/cpm-row";

@Component({
    standalone: true,
    imports: [CommonModule],
    selector: 'app-carga-cpms-1er-nivel',
    templateUrl: 'carga-cpms-1er-nivel.component.html'
})

export class CargaCpms1erNivelComponent {
    private excelService = inject(ExcelService);
    private cpmEditorService = inject(CpmEditorService);
    private toast = inject(NgFastToastService);

    // Estado de archivos
    fileName = signal<string>('');
    isParsing = signal(false);

    // CPMs existentes en BD
    existingCPMs = signal<CPMS[]>([]);

    // Resultado del parseo
    parsedCPMs = signal<CPMS[]>([]);

    // Upload
    isUploading = signal(false);
    progress = signal(0); // 0–100

    totalCPMs = computed(() => this.parsedCPMs().length);
    totalClaves = computed(() =>
        this.parsedCPMs().reduce((acc, k) => acc + k.clave.length, 0)
    );

    canUpload = computed(() =>
        this.parsedCPMs().length > 0 && !this.isUploading()
    );

    constructor() {

    }

    // ---------- Helpers ----------

    /** Criterio flexible: SI / SÍ / X / 1 / TRUE / VERDADERO */
    private isTruthyCell(raw: any): boolean {
        if (raw === null || raw === undefined) return false;
        const val = raw.toString().trim().toUpperCase();
        if (!val) return false;

        const truthy = ['SI', 'SÍ', 'X', '1', 'TRUE', 'VERDADERO'];
        return truthy.includes(val);
    }

    private normalizeCodigo(codigo: string): string {
        return (codigo ?? '').trim();
    }

    // ---------- Input file ----------

    async onFileChange(ev: Event) {
        const input = ev.target as HTMLInputElement;
        if (!input.files?.length) return;

        const file = input.files[0];
        this.fileName.set(file.name);
        this.parsedCPMs.set([]);
        this.progress.set(0);

        try {
            this.isParsing.set(true);
            const buf = await file.arrayBuffer();
            this.parseExcel(buf);
            this.toast.success({
                title: 'Archivo leído',
                content: 'Se generó el resumen de CPMs y claves.',
                duration: 5,
            });
        } catch (e) {
            console.error(e);
            this.toast.error({
                title: 'Error al leer archivo',
                content: 'Revisa que el formato del Excel sea correcto.',
                duration: 7,
            });
        } finally {
            this.isParsing.set(false);
        }
    }

    // ---------- Parse Excel y construir preview ----------

    private parseExcel(buf: ArrayBuffer) {

        this.parsedCPMs.set(this.excelService.procesarArchivoCPMS1erNivel(buf));

        if (!this.parsedCPMs().length) {
            this.toast.warn({
                title: 'Archivo vacío',
                content: 'La hoja de Excel no contiene datos.',
                duration: 5,
            });
            return;
        }
    }

    // ---------- Subir a backend (batch por cpm) ----------

    async subir() {
        if (!this.canUpload()) return;

        const cpms = this.parsedCPMs();
        if (!cpms.length) return;

        if (!confirm(`¿Subir ${cpms.length} cpms(s) con ${this.totalClaves()} valores en total?`)) {
            return;
        }

        this.isUploading.set(true);
        this.progress.set(0);

        try {
            let processedClaves = 0;
            // crear batches por clues, no importa el tamaño del batch
            const batches: CPMS[][] = [];
            const cluesSet = new Set<string>();
            // El Set asegura clues únicas
            cpms.forEach(k => cluesSet.add(k.cluesimb));
            cluesSet.forEach(clue => {
                batches.push(cpms.filter(k => k.cluesimb === clue));
            });

            for (const batch of batches) {
                console.log(`Subiendo clues ${batch[0].cluesimb}...`);
                const batchItems: BatchItem[] = [];
                for (const k of batch) {                    
                    batchItems.push({ clave: k.clave, cpm: k.cantidad });
                }
                // limpio cpms de clues antes de subir
                await firstValueFrom(this.cpmEditorService.initClues(batch[0].cluesimb));
                await firstValueFrom(this.cpmEditorService.upsertBatch(batch[0].cluesimb, batchItems));
                processedClaves += batch.length;

                this.progress.set(Math.round((processedClaves / cpms.length) * 100));
            }

            this.toast.success({
                title: 'CPMs subidos y procesados',
                content: `Se procesaron ${processedClaves} registros.`,
                duration: 7,
            });
            this.parsedCPMs.set([]);
            this.fileName.set('');
        } catch (e) {
            console.error('Error subiendo cpms:', e);
            this.toast.error({
                title: 'Error al subir',
                content: 'Ocurrió un error al procesar los cpms. Revisa la consola.',
                duration: 8,
            });
        } finally {
            this.isUploading.set(false);
            this.progress.set(0);
        }
    }
}