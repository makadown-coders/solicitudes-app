// src/app/pages/carga-masiva/carga-masiva.component.ts
import { Component } from '@angular/core';
import { ExcelService } from '../../services/excel.service';
import { CargaMasivaService } from '../../services/carga-masiva.service';
import { EntradaDTO } from '../../models/cargaMasiva/entrada.dto';
import { SalidaDTO } from '../../models/cargaMasiva/salida.dto';
import { TraspasoDTO } from '../../models/cargaMasiva/traspaso.dto';
import * as XLSX from 'xlsx';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-carga-masiva',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './carga-masiva.component.html'
})
export class CargaMasivaComponent {
    isUploading = false;
    progress = 0;

    fileEntradas: any[] = [];
    fileTraspasos: any[] = [];
    fileSalidas: any[] = [];

    fileNameEntradas = '';
    fileNameTraspasos = '';
    fileNameSalidas = '';

    constructor(
        private excelService: ExcelService,
        private cargaMasivaService: CargaMasivaService
    ) { }



    get canUploadAll() {
        return this.fileEntradas.length && this.fileTraspasos.length && this.fileSalidas.length;
    }

    async onFileSelected(event: Event, tipo: 'entradas' | 'traspasos' | 'salidas') {
        const input = event.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) return;

        const files = Array.from(input.files);
        const buffers = await Promise.all(files.map(f => f.arrayBuffer()));

        const allRows = buffers
            .map(buf => this.parseExcelByTipo(buf, tipo))
            .flat();

        if (tipo === 'entradas') {
            this.fileEntradas = allRows;
            this.fileNameEntradas = `${files.length} archivo(s)`;
        }
        if (tipo === 'traspasos') {
            this.fileTraspasos = allRows;
            this.fileNameTraspasos = `${files.length} archivo(s)`;
        }
        if (tipo === 'salidas') {
            this.fileSalidas = allRows;
            this.fileNameSalidas = `${files.length} archivo(s)`;
        }
    }

    private parseExcelByTipo(buffer: ArrayBuffer, tipo: 'entradas' | 'traspasos' | 'salidas') {
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        // quitar encabezado si existe
        const dataRows = rows.slice(1).filter(r => r.length > 0);

        if (tipo === 'entradas') {
            return dataRows.map(r => ({
                unidad_destino_texto: r[0] ?? null,           // Col A
                clave_cnis: r[1] ?? '',                      // Col B
                descripcion: r[2] ?? '',                     // Col C
                num_factura: r[3] ?? null,                    // Col D
                folio: r[4] ?? null,                          // Col E
                proveedor: r[5] ?? null,                      // Col F
                cantidad: Number(r[6]) || 0,                  // Col G
                costo: Number(r[7]) || null,                  // Col H
                fecha: this.formatFecha(r[8]),                // Col I
                tipo_documento: r[12] ?? null,                // Col M
                num_remision: r[13] ?? null,                  // Col N
                observaciones: r[14] ?? null,                 // Col O
                anio: r[15] ?? null,                          // Col P
                lote: r[16] ?? null,                          // Col Q
                fecha_caducidad: this.formatFecha(r[17]),     // Col R
                cantidad_existencia: Number(r[18]) || 0,      // Col S
                descripcion_extra: r[19] ?? null              // Col T
            } as EntradaDTO));
        }

        if (tipo === 'traspasos') {
            return dataRows.map(r => ({
                fecha_recepcion: this.formatFecha(r[0]),      // Col A
                folio: r[1] ?? null,                          // Col B
                unidad_origen_texto: r[2] ?? null,            // Col C
                clave_cnis: r[3] ?? '',                       // Col D
                descripcion: r[4] ?? '',                      // Col E
                cantidad: Number(r[6]) || 0,                  // Col G
                total: Number(r[7]) || null,                  // Col H
                unidad_destino_texto: r[8] ?? null,           // Col I
                lote: r[10] ?? null,                          // Col K
                fecha_caducidad: this.formatFecha(r[11]),     // Col L
                partida: r[12] ?? null                        // Col M
            } as TraspasoDTO));
        }

        if (tipo === 'salidas') {
            return dataRows.map(r => ({
                unidad_origen_texto: r[0] ?? null,            // Col A
                unidad_destino_texto: r[1] ?? null,           // Col B
                folio: r[2] ?? null,                          // Col C
                clave_cnis: r[3] ?? '',                       // Col D
                cantidad: Number(r[4]) || 0,                  // Col E
                total: Number(r[5]) || null,                  // Col F
                programa: r[6] ?? null,                       // Col G
                fecha_entregado: this.formatFecha(r[7]),      // Col H
                tipo: r[8] ?? null,                           // Col I
                folio_extra: r[11] ?? null,                   // Col L
                movto: r[12] ?? null,                         // Col M
                descripcion: r[13] ?? '',                     // Col N
                programa_extra: r[14] ?? null,                // Col O
                lote: r[15] ?? null,                          // Col P
                fecha_caducidad: this.formatFecha(r[16])      // Col Q
            } as SalidaDTO));
        }

        return [];
    }

    async subirTodo() {
        this.isUploading = true;
        this.progress = 0;

        // Total de registros (entradas + traspasos + salidas)
        const totalRegistros = this.fileEntradas.length + this.fileTraspasos.length + this.fileSalidas.length;
        let procesados = 0;

        // 1. Inicializar tablas
        await this.cargaMasivaService.init('entradas');
        await this.cargaMasivaService.init('traspasos');
        await this.cargaMasivaService.init('salidas');

        // 2. Subir lotes
        procesados = await this.uploadInBatches('entradas', this.fileEntradas, totalRegistros, procesados);
        procesados = await this.uploadInBatches('traspasos', this.fileTraspasos, totalRegistros, procesados);
        procesados = await this.uploadInBatches('salidas', this.fileSalidas, totalRegistros, procesados);

        this.isUploading = false;
        alert('✅ Carga masiva completada');
    }

    private formatFecha(value: any): string | null {
        if (!value) return null;

        // 1️⃣ Si es número (serial de Excel)
        if (typeof value === 'number') {
            const fecha = XLSX.SSF.parse_date_code(value);
            if (fecha) {
                const jsDate = new Date(fecha.y, fecha.m - 1, fecha.d);
                return jsDate.toISOString().split('T')[0];
            }
            return null;
        }

        // 2️⃣ Si es string
        if (typeof value === 'string') {
            // Quitar espacios extra
            const clean = value.trim();

            // Intentar formato "dd/MM/yyyy"
            const matchSimple = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            if (matchSimple) {
                const [, dd, mm, yyyy] = matchSimple;
                return `${yyyy}-${mm}-${dd}`;
            }

            // Intentar formato "dd/MM/yyyy hh:mm:ss"
            const matchWithTime = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/);
            if (matchWithTime) {
                const [, dd, mm, yyyy, hh, min, sec] = matchWithTime;
                return `${yyyy}-${mm}-${dd}`;
            }

            // Último recurso: que el Date de JS lo intente
            const parsed = new Date(clean);
            return isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
        }

        return null;
    }


    private async uploadInBatches(tipo: string, datos: any[], total: number, procesados: number) {
        const batchSize = 500;
        for (let i = 0; i < datos.length; i += batchSize) {
            const batch = datos.slice(i, i + batchSize);
            await this.cargaMasivaService.batch(tipo, batch);

            // Actualizar progreso
            procesados += batch.length;
            this.progress = Math.min(100, Math.round((procesados / total) * 100));
        }
        return procesados;
    }
}
