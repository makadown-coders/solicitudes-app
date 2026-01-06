import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

// Usa SheetJS (xlsx). Si ya lo tienes instalado, perfecto.
// npm i xlsx
import * as XLSX from 'xlsx';
import { environment } from '../../../environments/environment';
import { firstValueFrom } from 'rxjs';

type CpmKitsBatchRow = {
    // Nota: backend espera cluesimb/clave_cnis/cpm/kitsOnes como en tu batchUpsert
    cluesimb: string;
    clave_cnis: string;
    cpm: number | null;
    kitsOnes: string[];
};

type InitPayload = {
    confirm: boolean;
    kitCodes: string[];
    sourceTag?: string;
    truncateCpm?: boolean;
    resetKits?: boolean;
};

type BatchPayload = {
    sourceTag?: string;
    rows: CpmKitsBatchRow[];
};

@Component({
    selector: 'app-carga-cpm-kits',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './carga-cpm-kits.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CargaCpmKitsComponent {
    private http = inject(HttpClient);
    private baseUrl = `${environment.apiUrl}/carga-masiva/cpm-kits`;

    // ===== UI state =====
    file = signal<File | null>(null);
    sourceTag = signal<string>('CPMS_BC');
    confirmInit = signal<boolean>(false);

    parsing = signal(false);
    uploading = signal(false);

    progress = signal<number>(0); // 0..100
    statusText = signal<string>('');

    errors = signal<string[]>([]);
    warnings = signal<string[]>([]);

    // ===== Parsed data =====
    headers = signal<string[]>([]);
    kitCodes = signal<string[]>([]); // UPPER
    rowsAll = signal<CpmKitsBatchRow[]>([]);

    batchSize = 500;

    // ===== Derived =====
    totalRows = computed(() => this.rowsAll().length);
    totalBatches = computed(() => Math.ceil(this.totalRows() / this.batchSize));
    canUpload = computed(() => !!this.file() && this.totalRows() > 0 && !this.uploading() && !this.parsing());

    onFileSelected(ev: Event) {
        const input = ev.target as HTMLInputElement;
        const f = input.files?.[0] ?? null;
        this.file.set(f);

        // reset state
        this.headers.set([]);
        this.kitCodes.set([]);
        this.rowsAll.set([]);
        this.errors.set([]);
        this.warnings.set([]);
        this.progress.set(0);
        this.statusText.set('');

        if (f) {
            this.parseExcel(f).catch(err => {
                console.error(err);
                this.errors.set([`Error al leer Excel: ${err?.message ?? err}`]);
            });
        }
    }

    private async parseExcel(file: File) {
        this.parsing.set(true);
        this.statusText.set('Leyendo Excel…');

        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });

        const sheetName = wb.SheetNames?.[0];
        if (!sheetName) {
            this.errors.set(['El Excel no trae hojas.']);
            this.parsing.set(false);
            return;
        }

        const ws = wb.Sheets[sheetName];
        const rows2d: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

        if (!rows2d.length) {
            this.errors.set(['La hoja viene vacía.']);
            this.parsing.set(false);
            return;
        }

        const headerRow = (rows2d[0] || []).map(x => (x ?? '').toString().trim());
        this.headers.set(headerRow);

        // Detecta columnas por nombre (tolerante a mayúsculas)
        const headerLower = headerRow.map(h => h.toLowerCase());

        const idxClues = headerLower.indexOf('clues');
        const idxClave = headerLower.indexOf('clave_cnis');
        const idxCpm = headerLower.indexOf('cpm');

        if (idxClues < 0 || idxClave < 0 || idxCpm < 0) {
            this.errors.set([
                `No encontré columnas obligatorias. Se requiere: clues, clave_cnis, cpm.`,
                `Detecté headers: ${headerRow.slice(0, 12).join(' | ')}…`,
            ]);
            this.parsing.set(false);
            return;
        }

        // Kits: por especificación son columnas 7..19 (1-based) => indices 6..18 (0-based)
        // Si el Excel cambia orden en el futuro, aquí lo ajustamos, pero por ahora seguimos tu regla.
        const kitHeaderSlice = headerRow.slice(6, 19).map(h => h.trim()).filter(Boolean);
        if (kitHeaderSlice.length === 0) {
            this.warnings.set(['No detecté headers de kits en el rango esperado (7..19).']);
        }

        const kitCodesUpper = kitHeaderSlice.map(h => h.toUpperCase());
        this.kitCodes.set(kitCodesUpper);

        // Parse filas
        const out: CpmKitsBatchRow[] = [];
        const errs: string[] = [];
        const warns: string[] = [];

        for (let i = 1; i < rows2d.length; i++) {
            const r = rows2d[i] || [];
            const cluesimb = (r[idxClues] ?? '').toString().trim().toUpperCase();
            const clave_cnis = (r[idxClave] ?? '').toString().trim().toUpperCase();

            // CPM puede venir como number o string
            const cpmRaw = r[idxCpm];
            const cpm =
                cpmRaw === null || cpmRaw === undefined || cpmRaw === ''
                    ? null
                    : (typeof cpmRaw === 'number' ? cpmRaw : Number(cpmRaw));

            if (!cluesimb && !clave_cnis && (cpmRaw === null || cpmRaw === undefined || cpmRaw === '')) {
                continue; // línea vacía
            }

            if (!cluesimb || !clave_cnis) {
                // No reventamos, pero avisamos: probablemente el backend la filtrará por join
                warns.push(`Fila Excel #${i + 1}: faltan datos (clues/clave).`);
                continue;
            }

            if (cpm !== null && Number.isNaN(cpm)) {
                warns.push(`Fila Excel #${i + 1}: CPM no numérico (${String(cpmRaw)}). Se enviará como null.`);
            }

            const kitsOnes: string[] = [];
            // recorrer mismo rango de columnas 6..18 (0-based)
            for (let k = 0; k < kitHeaderSlice.length; k++) {
                const colIndex = 6 + k;
                const v = r[colIndex];

                // Excel puede traer 1, "1", true
                const isOne = v === 1 || v === '1' || v === true || v === 'TRUE';
                if (isOne) {
                    kitsOnes.push(kitCodesUpper[k]);
                }
            }

            out.push({
                cluesimb,
                clave_cnis,
                cpm: cpm === null || Number.isNaN(cpm) ? null : cpm,
                kitsOnes,
            });
        }

        if (!out.length) errs.push('No se generaron filas válidas para enviar.');

        this.rowsAll.set(out);
        this.errors.set(errs);
        this.warnings.set(warns);

        this.statusText.set(`Excel leído: ${out.length} filas listas.`);
        this.parsing.set(false);
    }

    async startUpload() {
        if (!this.canUpload()) return;

        this.uploading.set(true);
        this.progress.set(0);
        this.errors.set([]);
        this.statusText.set('Iniciando…');

        const kitCodes = this.kitCodes();
        const rows = this.rowsAll();
        const totalBatches = this.totalBatches();

        try {
            // 1) INIT (solo si confirmInit true)
            const initPayload: InitPayload = {
                confirm: this.confirmInit(),
                kitCodes,
                sourceTag: this.sourceTag().trim() || undefined,
                truncateCpm: true,
                resetKits: true,
            };

            // Si no confirmó, no hacemos init. (Así no borra nada por accidente)
            if (initPayload.confirm) {
                this.statusText.set('Aplicando INIT (truncate CPM + reset kits del Excel)…');
                await firstValueFrom(this.http
                    .post<any>(`${this.baseUrl}/init`, initPayload, { headers: { 'X-Skip-Loader': '1' } })
                );
            } else {
                this.warnings.set([
                    ...this.warnings(),
                    'INIT no ejecutado (checkbox apagado). Se cargarán datos SIN reset previo.',
                ]);
            }

            // 2) Batches
            for (let b = 0; b < totalBatches; b++) {
                const start = b * this.batchSize;
                const end = Math.min(start + this.batchSize, rows.length);
                const chunk = rows.slice(start, end);

                const batchPayload: BatchPayload = {
                    sourceTag: this.sourceTag().trim() || undefined,
                    rows: chunk,
                };

                this.statusText.set(`Enviando batch ${b + 1}/${totalBatches} (filas ${start + 1}-${end})…`);

                const resp = await firstValueFrom(this.http
                    .post<any>(`${this.baseUrl}/batch`, batchPayload, { headers: { 'X-Skip-Loader': '1' } }));

                // Si quieres, aquí acumulas resp.warnings del backend (si luego las agregas)
                // Por ahora: solo stats
                // if (resp?.stats) {
                // puedes guardar stats por batch si lo deseas
                // }

                const pct = Math.round(((b + 1) / totalBatches) * 100);
                this.progress.set(pct);
            }

            this.statusText.set('✅ Importación completada.');
        } catch (err: any) {
            console.error(err);
            this.errors.set([`Error en importación: ${err?.message ?? err}`]);
            this.statusText.set('❌ Falló la importación.');
        } finally {
            this.uploading.set(false);
        }
    }
}
