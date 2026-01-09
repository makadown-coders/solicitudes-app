
import { Component, ChangeDetectionStrategy, signal, computed } from '@angular/core';
import * as XLSX from 'xlsx';

type SacRow = {
    ENTIDAD: string;
    CLUES: string;
    'ORDEN DE SUMINISTRO': string;
    RFC: string;
    CLAVE: string;
    'ESTADO DEL INSUMO': string | number;
    'INVENTARIO DISPONIBLE': number | string;
    LOTE: string;
    F_CAD: string;
    F_FAB: string;
    F_REC: string;
};

type Occurrence = {
    fileName: string;
    excelRow: number; // número de renglón en Excel (1-based)
    row: SacRow;
};

type DuplicateGroup = {
    key: string;
    count: number;
    occurrences: Occurrence[];
};

@Component({
    selector: 'app-validador-layout',
    standalone: true,
    imports: [],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './validador-layout.component.html',
})
export class ValidadorLayoutComponent {
    files = signal<File[]>([]);
    loading = signal(false);
    error = signal<string | null>(null);

    // resultados
    totalRows = signal(0);
    duplicates = signal<DuplicateGroup[]>([]);

    // Para “solo 3 archivos”
    canProcess = computed(() => this.files().length > 0 && this.files().length <= 3 && !this.loading());
    fileNames = computed(() =>
        this.files().map(f => f.name).join(' · ')
    );

    onFilesSelected(ev: Event) {
        const input = ev.target as HTMLInputElement;
        const list = Array.from(input.files ?? []);

        this.error.set(null);
        this.duplicates.set([]);
        this.totalRows.set(0);

        if (list.length === 0) {
            this.files.set([]);
            return;
        }
        if (list.length > 3) {
            this.files.set(list.slice(0, 3));
            this.error.set('Selecciona máximo 3 archivos Excel (uno por almacén).');
            return;
        }

        // opcional: filtrar por xlsx/xls
        const ok = list.filter(f => /\.(xlsx|xls)$/i.test(f.name));
        if (ok.length !== list.length) {
            this.error.set('Uno o más archivos no parecen Excel (.xlsx/.xls). Se ignoraron.');
        }
        this.files.set(ok.slice(0, 3));
    }

    invTodosDiferentes(d: { occurrences: { row: any }[] }): boolean {
        const invs = d.occurrences
            .map(o => normInv(o.row['INVENTARIO DISPONIBLE']))
            .filter(v => v !== ''); // opcional: ignora vacíos

        // Si hay 0 o 1, no tiene sentido sugerir sumatoria
        if (invs.length <= 1) return false;

        return new Set(invs).size === invs.length;
    }

    async procesar() {
        this.error.set(null);
        this.loading.set(true);
        this.duplicates.set([]);
        this.totalRows.set(0);

        try {
            const occurrences: Occurrence[] = [];

            for (const file of this.files()) {
                const occ = await this.parseExcelFile(file);
                occurrences.push(...occ);
            }

            this.totalRows.set(occurrences.length);

            // 🔑 Definición de “duplicado”
            // Opción A (recomendada para layout): llave por campos clave (más útil)
            // CLUES + CLAVE + LOTE + F_CAD + F_FAB + F_REC + ORDEN + RFC
            // (ajústala si tú quieres que sea “fila idéntica” incluyendo inventario/estado)
            const keyOf = (r: SacRow) => [
                norm(r.CLUES),
                norm(r.CLAVE),
                norm(r.LOTE),
                normDate(r.F_CAD),
                normDate(r.F_FAB),
                normDate(r.F_REC),
                norm(r['ORDEN DE SUMINISTRO']),
                norm(r.RFC),
            ].join('||');

            const mp = new Map<string, Occurrence[]>();
            for (const oc of occurrences) {
                const k = keyOf(oc.row);
                const arr = mp.get(k);
                if (arr) arr.push(oc);
                else mp.set(k, [oc]);
            }

            const dups: DuplicateGroup[] = [];
            for (const [k, arr] of mp.entries()) {
                if (arr.length > 1) {
                    dups.push({ key: k, count: arr.length, occurrences: arr });
                }
            }

            // Ordena: más repetidos primero
            dups.sort((a, b) => b.count - a.count);
            this.duplicates.set(dups);

            if (dups.length === 0) {
                this.error.set('No se detectaron duplicados con la llave actual ✅');
            }
        } catch (e: any) {
            console.error(e);
            this.error.set(e?.message ?? 'Error procesando archivos.');
        } finally {
            this.loading.set(false);
        }
    }

    private async parseExcelFile(file: File): Promise<Occurrence[]> {
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab, { type: 'array', cellDates: true });

        const sheetName = wb.SheetNames[0];
        if (!sheetName) return [];

        const ws = wb.Sheets[sheetName];

        // Leemos como “array de arrays” para saber el número de renglón real
        const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

        if (aoa.length < 2) return [];

        const headers = aoa[0].map(h => String(h).trim());

        // Validación ligera de columnas mínimas
        const required = [
            'ENTIDAD', 'CLUES', 'ORDEN DE SUMINISTRO', 'RFC', 'CLAVE', 'ESTADO DEL INSUMO',
            'INVENTARIO DISPONIBLE', 'LOTE', 'F_CAD', 'F_FAB', 'F_REC'
        ];
        const missing = required.filter(r => !headers.includes(r));
        if (missing.length) {
            throw new Error(`Archivo "${file.name}" no trae columnas esperadas: ${missing.join(', ')}`);
        }

        const idx = (name: string) => headers.indexOf(name);

        const out: Occurrence[] = [];
        for (let i = 1; i < aoa.length; i++) {
            const row = aoa[i];
            // Número de renglón en Excel: +1 por header y +1 por índice base 0 => i+1
            const excelRow = i + 1;

            const r: SacRow = {
                ENTIDAD: String(row[idx('ENTIDAD')] ?? ''),
                CLUES: String(row[idx('CLUES')] ?? ''),
                'ORDEN DE SUMINISTRO': String(row[idx('ORDEN DE SUMINISTRO')] ?? ''),
                RFC: String(row[idx('RFC')] ?? ''),
                CLAVE: String(row[idx('CLAVE')] ?? ''),
                'ESTADO DEL INSUMO': row[idx('ESTADO DEL INSUMO')] ?? '',
                'INVENTARIO DISPONIBLE': row[idx('INVENTARIO DISPONIBLE')] ?? '',
                LOTE: String(row[idx('LOTE')] ?? ''),
                F_CAD: toDateString(row[idx('F_CAD')]),
                F_FAB: toDateString(row[idx('F_FAB')]),
                F_REC: toDateString(row[idx('F_REC')]),
            };

            // Ignorar filas vacías
            if (!norm(r.CLUES) && !norm(r.CLAVE) && !norm(r.LOTE)) continue;

            out.push({ fileName: file.name, excelRow, row: r });
        }

        return out;
    }
}

// helpers
function norm(v: any): string {
    return String(v ?? '').trim().toUpperCase();
}

function normDate(v: any): string {
    return String(v ?? '').trim();
}

function toDateString(v: any): string {
    if (!v) return '';
    if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);

    // SheetJS a veces da número Excel serial
    if (typeof v === 'number') {
        const d = XLSX.SSF.parse_date_code(v);
        if (d) {
            const mm = String(d.m).padStart(2, '0');
            const dd = String(d.d).padStart(2, '0');
            return `${d.y}-${mm}-${dd}`;
        }
    }

    // string
    return String(v).trim();
}

function normInv(v: any): string {
  // Normaliza inventario numérico para comparar:
  // "10", "10.0", 10 => "10"
  if (v == null) return '';
  const s = String(v).trim();
  const n = Number(s);
  if (!Number.isNaN(n) && Number.isFinite(n)) return String(n);
  return s.toUpperCase();
}
