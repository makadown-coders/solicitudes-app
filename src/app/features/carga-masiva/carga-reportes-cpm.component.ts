import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { NgFastToastService } from 'ng-fast-toast';
import * as XLSX from 'xlsx';
import {
  ReporteCpmSemanalRow,
  ReporteCpmSemanalService,
} from '../../services/reporte-cpm-semanal.service';

interface ParsedFileSummary {
  name: string;
  fechaCorte: string | null;
  rowCount: number;
  valid: boolean;
}

interface ParsedFileResult {
  summary: ParsedFileSummary;
  rows: ReporteCpmSemanalRow[];
  errors: string[];
  warnings: string[];
}

@Component({
  selector: 'app-carga-reportes-cpm',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './carga-reportes-cpm.component.html',
})
export class CargaReportesCpmComponent {
  private readonly service = inject(ReporteCpmSemanalService);
  private readonly toast = inject(NgFastToastService);

  readonly expectedHeaders = [
    'entidad',
    'nombre_comercial',
    'clues_imb',
    'total_claves_en_cpm',
    'total_claves_en_cpm_reportando',
    'total_claves_reportando',
    'claves_medicamentos_010_040_ultimo',
    'claves_material_curacion_060_ultimo',
    'otros_03_070_080',
  ] as const;

  truncateTable = true;
  isParsing = false;
  isUploading = false;
  progress = 0;
  statusText = '';
  batchSize = 500;

  rows: ReporteCpmSemanalRow[] = [];
  files: ParsedFileSummary[] = [];
  errors: string[] = [];
  warnings: string[] = [];
  uploadSuccess: string | null = null;

  get canUpload(): boolean {
    return this.rows.length > 0
      && this.errors.length === 0
      && !this.isParsing
      && !this.isUploading;
  }

  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const selectedFiles = Array.from(input.files ?? []);

    this.resetSelection();

    if (selectedFiles.length === 0) {
      return;
    }

    this.isParsing = true;
    this.statusText = `Leyendo ${selectedFiles.length} archivo(s)...`;

    try {
      const results: ParsedFileResult[] = [];

      for (const file of selectedFiles) {
        results.push(await this.parseFile(file));
      }

      this.files = results.map(result => result.summary);
      this.rows = results
        .flatMap(result => result.rows)
        .sort((a, b) => {
          const byDate = a.fecha_corte.localeCompare(b.fecha_corte);
          return byDate !== 0 ? byDate : a.clues_imb.localeCompare(b.clues_imb);
        });
      this.errors = results.flatMap(result => result.errors);
      this.warnings = results.flatMap(result => result.warnings);

      this.validateGlobalSelection();

      this.statusText = this.errors.length > 0
        ? 'La selección contiene errores y todavía no puede cargarse.'
        : `${this.files.length} archivo(s) y ${this.rows.length} filas listos para cargar.`;
    } catch (error: unknown) {
      console.error(error);
      this.errors = [`No fue posible leer los archivos: ${this.errorMessage(error)}`];
      this.statusText = 'Falló la lectura de los archivos.';
    } finally {
      this.isParsing = false;
    }
  }

  async upload(): Promise<void> {
    if (!this.canUpload) {
      return;
    }

    this.isUploading = true;
    this.progress = 0;
    this.uploadSuccess = null;
    this.statusText = 'Preparando tabla...';

    try {
      await firstValueFrom(this.service.init(this.truncateTable));

      const totalBatches = Math.ceil(this.rows.length / this.batchSize);
      let processed = 0;

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const start = batchIndex * this.batchSize;
        const chunk = this.rows.slice(start, start + this.batchSize);

        this.statusText = `Enviando lote ${batchIndex + 1} de ${totalBatches}...`;
        const response = await firstValueFrom(this.service.batch(chunk));
        processed += response.processed;
        this.progress = Math.round(((batchIndex + 1) / totalBatches) * 100);
      }

      if (processed !== this.rows.length) {
        throw new Error(
          `El servidor reportó ${processed} de ${this.rows.length} filas procesadas.`,
        );
      }

      this.uploadSuccess = `Carga completada satisfactoriamente: ${processed} filas procesadas.`;
      this.statusText = this.uploadSuccess;
      this.toast.success({
        title: 'Carga completada',
        content: `Se procesaron correctamente ${processed} filas.`,
        duration: 8,
      });
    } catch (error: unknown) {
      console.error(error);
      const message = this.backendErrorMessage(error);
      this.uploadSuccess = null;
      this.errors = [...this.errors, message];
      this.statusText = 'La carga falló.';
      this.toast.error({
        title: 'No se completó la carga',
        content: message,
        duration: 10,
      });
    } finally {
      this.isUploading = false;
    }
  }

  private async parseFile(file: File): Promise<ParsedFileResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const rows: ReporteCpmSemanalRow[] = [];
    const filenameMatch = file.name.match(
      /^Reporte_cpm_(\d{4}-\d{2}-\d{2})\.(xls|xlsx)$/i,
    );

    if (!filenameMatch) {
      errors.push(
        `${file.name}: el nombre debe seguir el formato Reporte_cpm_YYYY-MM-DD.xls o .xlsx.`,
      );
      return {
        summary: { name: file.name, fechaCorte: null, rowCount: 0, valid: false },
        rows,
        errors,
        warnings,
      };
    }

    const fechaCorte = filenameMatch[1];
    if (!this.isValidIsoDate(fechaCorte)) {
      errors.push(`${file.name}: la fecha incluida en el nombre no es válida.`);
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];

      if (!sheetName) {
        errors.push(`${file.name}: el libro no contiene hojas.`);
        return {
          summary: { name: file.name, fechaCorte, rowCount: 0, valid: false },
          rows,
          errors,
          warnings,
        };
      }

      const worksheet = workbook.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
        header: 1,
        raw: true,
        defval: null,
        blankrows: false,
      }) as unknown[][];

      if (matrix.length === 0) {
        errors.push(`${file.name}: la primera hoja está vacía.`);
        return {
          summary: { name: file.name, fechaCorte, rowCount: 0, valid: false },
          rows,
          errors,
          warnings,
        };
      }

      const headers = (matrix[0] ?? []).map(value => this.normalizeHeader(value));
      const indexes = new Map<string, number>();
      headers.forEach((header, index) => {
        if (header) {
          indexes.set(header, index);
        }
      });

      const missingHeaders = this.expectedHeaders.filter(header => !indexes.has(header));
      if (missingHeaders.length > 0) {
        errors.push(
          `${file.name}: faltan columnas: ${missingHeaders.join(', ')}.`,
        );
        return {
          summary: { name: file.name, fechaCorte, rowCount: 0, valid: false },
          rows,
          errors,
          warnings,
        };
      }

      for (let index = 1; index < matrix.length; index++) {
        const rawRow = matrix[index] ?? [];
        if (rawRow.every(value => value === null || String(value).trim() === '')) {
          continue;
        }

        const excelRowNumber = index + 1;
        const mapped = this.mapRow(
          rawRow,
          indexes,
          fechaCorte,
          file.name,
          excelRowNumber,
          errors,
        );

        if (mapped) {
          rows.push(mapped);
        }
      }

      if (rows.length !== 9) {
        errors.push(
          `${file.name}: se esperaban 9 hospitales y se obtuvieron ${rows.length} filas válidas.`,
        );
      }

      const duplicateClues = this.findDuplicates(rows.map(row => row.clues_imb));
      if (duplicateClues.length > 0) {
        errors.push(`${file.name}: CLUES repetidas: ${duplicateClues.join(', ')}.`);
      }
    } catch (error: unknown) {
      errors.push(`${file.name}: ${this.errorMessage(error)}`);
    }

    return {
      summary: {
        name: file.name,
        fechaCorte,
        rowCount: rows.length,
        valid: errors.length === 0,
      },
      rows,
      errors,
      warnings,
    };
  }

  private mapRow(
    rawRow: unknown[],
    indexes: ReadonlyMap<string, number>,
    fechaCorte: string,
    fileName: string,
    excelRowNumber: number,
    errors: string[],
  ): ReporteCpmSemanalRow | null {
    const prefix = `${fileName}, fila ${excelRowNumber}`;
    const entidad = this.requiredText(rawRow, indexes, 'entidad');
    const nombreComercial = this.requiredText(rawRow, indexes, 'nombre_comercial');
    const cluesImb = this.requiredText(rawRow, indexes, 'clues_imb').toUpperCase();

    const totalCpm = this.integerValue(
      rawRow,
      indexes,
      'total_claves_en_cpm',
      prefix,
      errors,
    );
    const totalCpmReportando = this.integerValue(
      rawRow,
      indexes,
      'total_claves_en_cpm_reportando',
      prefix,
      errors,
    );
    const totalReportando = this.integerValue(
      rawRow,
      indexes,
      'total_claves_reportando',
      prefix,
      errors,
    );
    const medicamentos = this.integerValue(
      rawRow,
      indexes,
      'claves_medicamentos_010_040_ultimo',
      prefix,
      errors,
    );
    const materialCuracion = this.integerValue(
      rawRow,
      indexes,
      'claves_material_curacion_060_ultimo',
      prefix,
      errors,
    );
    const otros = this.integerValue(
      rawRow,
      indexes,
      'otros_03_070_080',
      prefix,
      errors,
    );

    if (!entidad || !nombreComercial || !cluesImb) {
      errors.push(`${prefix}: faltan entidad, nombre_comercial o clues_imb.`);
      return null;
    }

    if (
      totalCpm === null
      || totalCpmReportando === null
      || totalReportando === null
      || medicamentos === null
      || materialCuracion === null
      || otros === null
    ) {
      return null;
    }

    if (entidad.toUpperCase() !== 'BAJA CALIFORNIA') {
      errors.push(`${prefix}: la entidad debe ser BAJA CALIFORNIA.`);
    }

    if (totalCpmReportando > totalCpm) {
      errors.push(`${prefix}: las claves CPM reportando superan el total de claves CPM.`);
    }

    if (totalCpmReportando > totalReportando) {
      errors.push(`${prefix}: las claves CPM reportando superan el total general reportando.`);
    }

    if (totalReportando !== medicamentos + materialCuracion + otros) {
      errors.push(
        `${prefix}: total_claves_reportando (${totalReportando}) no coincide con G + H + I (${medicamentos + materialCuracion + otros}).`,
      );
    }

    return {
      fecha_corte: fechaCorte,
      entidad: entidad.toUpperCase(),
      nombre_comercial: nombreComercial,
      clues_imb: cluesImb,
      total_claves_en_cpm: totalCpm,
      total_claves_en_cpm_reportando: totalCpmReportando,
      total_claves_reportando: totalReportando,
      claves_medicamentos_010_040_ultimo: medicamentos,
      claves_material_curacion_060_ultimo: materialCuracion,
      otros_03_070_080: otros,
      archivo_origen: fileName,
    };
  }

  private validateGlobalSelection(): void {
    const duplicateKeys = this.findDuplicates(
      this.rows.map(row => `${row.fecha_corte}||${row.clues_imb}`),
    );

    if (duplicateKeys.length > 0) {
      this.errors.push(
        `La selección contiene registros repetidos para la misma fecha y CLUES: ${duplicateKeys.join(', ')}.`,
      );
    }

    const byClues = new Map<string, ReporteCpmSemanalRow[]>();
    for (const row of this.rows) {
      const current = byClues.get(row.clues_imb) ?? [];
      current.push(row);
      byClues.set(row.clues_imb, current);
    }

    for (const [clues, cluesRows] of byClues.entries()) {
      const totals = new Set(cluesRows.map(row => row.total_claves_en_cpm));
      if (totals.size <= 1) {
        continue;
      }

      const history = [...cluesRows]
        .sort((a, b) => a.fecha_corte.localeCompare(b.fecha_corte))
        .map(row => `${row.fecha_corte}: ${row.total_claves_en_cpm}`)
        .join(', ');

      this.warnings.push(
        `${clues}: el total de claves en CPM cambia entre archivos (${history}).`,
      );
    }
  }

  private requiredText(
    row: unknown[],
    indexes: ReadonlyMap<string, number>,
    field: string,
  ): string {
    const index = indexes.get(field);
    return index === undefined ? '' : String(row[index] ?? '').trim();
  }

  private integerValue(
    row: unknown[],
    indexes: ReadonlyMap<string, number>,
    field: string,
    prefix: string,
    errors: string[],
  ): number | null {
    const index = indexes.get(field);
    const rawValue = index === undefined ? null : row[index];
    const numericValue = typeof rawValue === 'number'
      ? rawValue
      : Number(String(rawValue ?? '').replace(/,/g, '').trim());

    if (!Number.isInteger(numericValue) || numericValue < 0) {
      errors.push(`${prefix}: ${field} debe ser un entero mayor o igual a cero.`);
      return null;
    }

    return numericValue;
  }

  private normalizeHeader(value: unknown): string {
    return String(value ?? '')
      .replace(/^\uFEFF/, '')
      .trim()
      .toLowerCase();
  }

  private findDuplicates(values: string[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    for (const value of values) {
      if (seen.has(value)) {
        duplicates.add(value);
      }
      seen.add(value);
    }

    return [...duplicates];
  }

  private isValidIsoDate(value: string): boolean {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return false;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    return date.getUTCFullYear() === year
      && date.getUTCMonth() === month - 1
      && date.getUTCDate() === day;
  }

  private resetSelection(): void {
    this.rows = [];
    this.files = [];
    this.errors = [];
    this.warnings = [];
    this.uploadSuccess = null;
    this.progress = 0;
    this.statusText = '';
  }

  private backendErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const details = error.error?.details;
      if (Array.isArray(details) && details.length > 0) {
        return `Backend: ${details.join(' | ')}`;
      }

      const detail = error.error?.detail ?? error.error?.error ?? error.message;
      return `Backend: ${String(detail)}`;
    }

    return this.errorMessage(error);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
