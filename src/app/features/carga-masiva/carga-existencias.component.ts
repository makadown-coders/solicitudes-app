import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import { ExistenciasTempService, TempRow } from '../../services/existencias-temp.service';
import { InventarioService } from '../../services/inventario.service';
import { firstValueFrom } from 'rxjs';
import { UnidadesService } from '../../services/unidades.service';

type BatchRow = {
    clave_cnis: string;
    existencia: number;
    alias_sas?: string | null;   // SAS
    cluessa?: string | null;     // SALUS
    cluesimb?: string | null;    // opcional si viene
};

@Component({
    selector: 'app-carga-existencias',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './carga-existencias.component.html'
})
export class CargaExistenciasComponent {
    isUploading = false;
    progress = 0;

    // buffers ya parseados
    sasRows: TempRow[] = [];
    salusRows: TempRow[] = [];

    // UI
    fileNameSAS = '';
    fileNameSALUS = '';
    resetTable = true;            // ⇠ “limpiar antes de subir”
    BATCH_SIZE = 2000;
    unidadesService = inject(UnidadesService);
    private unidadesLoaded = false;

    constructor(
        private svc: ExistenciasTempService,
        private inv: InventarioService
    ) { }

    get canUpload() {
        return (this.sasRows.length + this.salusRows.length) > 0;
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

    // ---------- input handlers ----------
    async onFilesSAS(ev: Event) {
        const input = ev.target as HTMLInputElement;
        if (!input.files?.length) return;

        // +++ asegura índices (byAliasSas) construidos
        await this.ensureUnidadesLoaded();

        const files = Array.from(input.files);
        const buffers = await Promise.all(files.map(f => f.arrayBuffer()));
        const rows = buffers.map(b => this.parseSAS(b)).flat();
        this.sasRows = rows;
        this.fileNameSAS = `${files.length} archivo(s)`;
    }

    async onFilesSALUS(ev: Event) {
        const input = ev.target as HTMLInputElement;
        if (!input.files?.length) return;

        await this.ensureUnidadesLoaded();

        const files = Array.from(input.files);
        const buffers = await Promise.all(files.map(f => f.arrayBuffer()));
        const rows = buffers.map(b => this.parseSALUS(b)).flat();
        this.salusRows = rows;
        this.fileNameSALUS = `${files.length} archivo(s)`;
    }

    // ---------- parsers (por índice de columna) ----------
    // SAS:
    //  disponible,  comprometido => existencia = D-G (>=0)
    //  alias_sas,  lote,  caducidad (opcional)
    private parseSAS(buf: ArrayBuffer): TempRow[] {
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as any[][];
        const out: TempRow[] = [];

        for (const r of rows) {
            const claveRaw = r[0];
            if (this.isHeaderish(claveRaw)) continue;
            const clave = this.inv.normalizarClave((claveRaw ?? '').toString().toUpperCase());
            if (!clave) continue;

            const disponible = this.toNum(r[3]);
            const comprometido = this.toNum(r[6]);
            let existencia = disponible - comprometido;
            if (existencia < 0) existencia = 0;

            const alias = (r[4] ?? '').toString().trim();
            const lote = (r[7] ?? null)?.toString().trim() || null;
            const fCad = this.formatFecha(r[8]);

            // +++ resolver cluesimb desde alias_sas
            const cluesimb = alias ? (this.unidadesService.getCluesimbFor(alias) || null) : null;

            out.push({
                fuente: 'SAS',
                alias_sas: alias || null,
                cluesimb,
                clave_cnis: clave,
                lote,
                fecha_caducidad: fCad,
                existencia
            });
        }
        return out;
    }

    // SALUS: [A] clave, [C] lote, [E] caducidad, [F] cantidad, [H] CLUES SSA
    private parseSALUS(buf: ArrayBuffer): TempRow[] {
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as any[][];
        const out: TempRow[] = [];

        for (const r of rows) {
            const claveRaw = r[0];
            if (this.isHeaderish(claveRaw)) continue;
            const clave = this.inv.normalizarClave((claveRaw ?? '').toString().toUpperCase());
            if (!clave) continue;

            const lote = (r[2] ?? null)?.toString().trim() || null;
            const fCad = this.formatFecha(r[4]);
            const cant = this.toNum(r[5]);
            const cluessa = (r[7] ?? '').toString().trim().toUpperCase() || null;

            const cluesimb = cluessa ? (this.unidadesService.getCluesimbByCluessa(cluessa) || null) : null;

            out.push({
                fuente: 'SALUS',
                cluessa,
                cluesimb,
                clave_cnis: clave,
                lote,
                fecha_caducidad: fCad,
                existencia: cant
            });
        }
        return out;
    }

    // ---------- subir ----------
    async subir() {
        if (!this.canUpload) return;

        this.isUploading = true;
        this.progress = 0;

        try {
            // 1) reset (TRUNCATE)
            await firstValueFrom(this.svc.init(this.resetTable));

            // 2) lotes SAS y SALUS (mezclamos para una sola barra)
            const total = this.sasRows.length + this.salusRows.length;
            let done = 0;
            const bump = (n: number) => {
                done += n; this.progress = Math.min(100, Math.round(done * 100 / total));
            };

            const uploadBatches = async (rows: TempRow[]) => {
                for (let i = 0; i < rows.length; i += this.BATCH_SIZE) {
                    const batch = rows.slice(i, i + this.BATCH_SIZE);
                    await firstValueFrom(this.svc.batch(batch));
                    bump(batch.length);
                }
            };

            await uploadBatches(this.sasRows);
            await uploadBatches(this.salusRows);

            alert(`✅ Existencias cargadas. Registros: ${total}`);
        } catch (e) {
            console.error(e);
            alert('❌ Error durante la carga de existencias');
        } finally {
            this.isUploading = false;
            this.progress = 0;
        }
    }

    // ---------- helpers ----------
    private toNum(v: any): number {
        if (v == null || v === '') return 0;
        if (typeof v === 'number') return v;
        const s = String(v).replace(/[, ]/g, '');
        const n = Number(s);
        return isFinite(n) ? n : 0;
    }

    private isHeaderish(x: any): boolean {
        if (x == null) return true;
        const s = String(x).toLowerCase();
        return s.includes('clave') || s.includes('código') || s.includes('codigo');
    }

    private formatFecha(value: any): string | null {
        if (!value) return null;
        if (typeof value === 'number') {
            const d = XLSX.SSF.parse_date_code(value);
            if (!d) return null;
            const js = new Date(d.y, d.m - 1, d.d);
            return js.toISOString().split('T')[0];
        }
        if (typeof value === 'string') {
            const clean = value.trim();
            const m1 = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`;
            const dt = new Date(clean);
            return isNaN(dt.getTime()) ? null : dt.toISOString().split('T')[0];
        }
        return null;
    }
}
