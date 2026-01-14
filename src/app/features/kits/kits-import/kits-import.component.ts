import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { NgFastToastService } from "ng-fast-toast";
import * as XLSX from 'xlsx';
import { KitsService } from "../../../services/kits.service";
import { ImportLog, Kit, ParsedKitPreview } from "../../../models";
import { first, firstValueFrom } from "rxjs";

/**
 * En proceso de eliminación. Usar CargaCpmKitsComponent en su lugar
 * ¿Porqué? porque las tablas [kit_clave] ni [unidad_medica_kit] están en proceso de eliminación.
 * Probablemente este componente se eliminará en el futuro.
 */
@Component({
  selector: 'app-kits-import',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './kits-import.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KitsImportComponent {
  private kitsSrv = inject(KitsService);
  private toast = inject(NgFastToastService);

  // Estado de archivos
  fileName = signal<string>('');
  isParsing = signal(false);

  // Kits existentes en BD
  existingKits = signal<Kit[]>([]);

  // Resultado del parseo
  parsedKits = signal<ParsedKitPreview[]>([]);

  // Upload
  isUploading = signal(false);
  progress = signal(0); // 0–100

  // === Computeds ===
  kitsNuevos = computed(() => this.parsedKits().filter(k => !k.exists));
  kitsActualizar = computed(() => this.parsedKits().filter(k => k.exists));

  totalKits = computed(() => this.parsedKits().length);
  totalClaves = computed(() =>
    this.parsedKits().reduce((acc, k) => acc + k.claves.length, 0)
  );

  canUpload = computed(() =>
    this.parsedKits().length > 0 && !this.isUploading()
  );

  constructor() {
    this.loadExistingKits();
  }

  private loadExistingKits() {
    this.kitsSrv.list().subscribe({
      next: rows => this.existingKits.set(rows),
      error: err => {
        console.error('Error cargando kits existentes:', err);
        this.toast.error({
          title: 'Error',
          content: 'No se pudieron cargar los kits existentes.',
          duration: 7,
        });
      }
    });
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
    this.parsedKits.set([]);
    this.progress.set(0);

    try {
      this.isParsing.set(true);
      const buf = await file.arrayBuffer();
      this.parseExcel(buf);
      this.toast.success({
        title: 'Archivo leído',
        content: 'Se generó el resumen de kits y claves.',
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
    const workbook = XLSX.read(buf, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (!rows.length) {
      this.toast.warn({
        title: 'Archivo vacío',
        content: 'La hoja de Excel no contiene datos.',
        duration: 5,
      });
      return;
    }

    const header = rows[0];
    if (!header || header.length < 3) {
      this.toast.error({
        title: 'Encabezado inválido',
        content: 'No se encontraron columnas de kits a partir de la columna C.',
        duration: 7,
      });
      return;
    }

    // Col A = clave; Col B opcional; Col C en adelante = códigos de kit
    const codigoColumns: { colIndex: number; codigo: string }[] = [];
    for (let c = 2; c < header.length; c++) {
      const raw = header[c];
      if (!raw) continue;
      const codigo = this.normalizeCodigo(raw.toString());
      if (!codigo) continue;
      codigoColumns.push({ colIndex: c, codigo });
    }

    if (!codigoColumns.length) {
      this.toast.error({
        title: 'Sin columnas de kit',
        content: 'A partir de la columna C no se detectaron códigos de kit.',
        duration: 7,
      });
      return;
    }

    // Map<códigoKit, string[] claves>
    const map = new Map<string, string[]>();

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const clave = (row[0] ?? '').toString().trim();
      if (!clave) continue;

      for (const col of codigoColumns) {
        const rawCell = row[col.colIndex];

        // SOLO si la celda es "verdadera"
        if (!this.isTruthyCell(rawCell)) continue;

        const codigoKit = this.normalizeCodigo(col.codigo);
        if (!codigoKit) continue;

        if (!map.has(codigoKit)) {
          map.set(codigoKit, []);
        }
        const arr = map.get(codigoKit)!;
        if (!arr.includes(clave)) {
          arr.push(clave);
        }
      }
    }

    // Construir preview: cruzar con kits existentes
    const existingByCodigo = new Map(
      this.existingKits().map(k => [this.normalizeCodigo(k.codigo), k])
    );

    const parsed: ParsedKitPreview[] = [];
    for (const [codigo, claves] of map.entries()) {
      const normCodigo = this.normalizeCodigo(codigo);
      const exists = existingByCodigo.has(normCodigo);
      parsed.push({
        codigo: normCodigo,
        claves: [...claves].sort(),
        exists,
      });
    }

    // Ordenar por código
    parsed.sort((a, b) => a.codigo.localeCompare(b.codigo));

    this.parsedKits.set(parsed);
  }

  // ---------- Subir a backend (batch por kit) ----------

  async subir() {
    if (!this.canUpload()) return;

    const kits = this.parsedKits();
    if (!kits.length) return;

    if (!confirm(`¿Subir ${kits.length} kit(s) con ${this.totalClaves()} claves en total?`)) {
      return;
    }

    this.isUploading.set(true);
    this.progress.set(0);

    try {
      const totalClaves = this.totalClaves();
      let processedClaves = 0;

      for (const k of kits) {
        console.log(`Subiendo kit ${k.codigo} con ${k.claves.length} claves...`);

        await firstValueFrom(
          this.kitsSrv.syncKitFromExcel({
            codigo: k.codigo,
            claves: k.claves,
          })
        );

        // avanzar progreso por número de claves del kit
        processedClaves += k.claves.length;
        const pct = Math.min(100, Math.round((processedClaves * 100) / (totalClaves || 1)));
        this.progress.set(pct);
      }

      this.toast.success({
        title: 'Kits actualizados',
        content: `Se procesaron ${kits.length} kit(s) y ${this.totalClaves()} claves.`,
        duration: 7,
      });

      // refrescar catálogo y limpiar UI
      this.loadExistingKits();
      this.parsedKits.set([]);
      this.fileName.set('');
    } catch (e) {
      console.error('Error subiendo kits:', e);
      this.toast.error({
        title: 'Error al subir',
        content: 'Ocurrió un error al procesar los kits. Revisa la consola.',
        duration: 8,
      });
    } finally {
      this.isUploading.set(false);
      this.progress.set(0);
    }
  }
}