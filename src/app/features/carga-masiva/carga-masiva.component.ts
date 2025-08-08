// src/app/pages/carga-masiva/carga-masiva.component.ts
import { Component } from '@angular/core';
import { ExcelService } from '../../services/excel.service';
import { CargaMasivaService } from '../../services/carga-masiva.service';
import { EntradaDTO } from '../../models/cargaMasiva/entrada.dto';
import { SalidaDTO } from '../../models/cargaMasiva/salida.dto';
import { TraspasoDTO } from '../../models/cargaMasiva/traspaso.dto';
import * as XLSX from 'xlsx';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';


interface InventarioInicialDTO {
    unidad: string | null;
    partida: string | null;
    articulo: string | null;         // clave CNIS
    lote: string | null;
    fecha_caducidad: string | null;  // yyyy-mm-dd
    tipo: string | null;
    cantidades: number | null;
    costo: number | null;
}

@Component({
    selector: 'app-carga-masiva',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './carga-masiva.component.html'
})
export class CargaMasivaComponent {
    isUploading = false;
    progress = 0;

    fileEntradas: any[] = [];
    fileTraspasos: any[] = [];
    fileSalidas: any[] = [];

    // Inventario inicial
    fileInventario: InventarioInicialDTO[] = [];
    fileNameInventario = '';
    anioInventario = new Date().getFullYear();
    resetAnio = true;

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

    async onFileSelected(event: Event, tipo: 'entradas' | 'traspasos' | 'salidas' | 'inventario') {
        const input = event.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) return;

        const files = Array.from(input.files);
        const buffers = await Promise.all(files.map(f => f.arrayBuffer()));
        const allRows = buffers.map(buf => this.parseExcelByTipo(buf, tipo)).flat();

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
        if (tipo === 'inventario') {
            this.fileInventario = allRows as InventarioInicialDTO[];
            this.fileNameInventario = `${files.length} archivo(s)`;
        }
    }

    private parseExcelByTipo(buffer: ArrayBuffer, tipo: 'entradas' | 'traspasos' | 'salidas' | 'inventario') {
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        const dataRows = rows.slice(1).filter(r => r.length > 0);

        if (tipo === 'entradas') {
            return dataRows.map(r => ({
                unidad_destino_texto: r[0] ?? null,   // A
                clave_cnis: r[1] ?? '',               // B
                descripcion: r[2] ?? '',              // C
                num_factura: r[3] ?? null,            // D
                folio: r[4] ?? null,                  // E
                proveedor: r[5] ?? null,              // F
                cantidad: Number(r[6]) || 0,          // G
                costo: Number(r[7]) || null,          // H
                fecha: this.formatFecha(r[8]),        // I
                tipo_documento: r[12] ?? null,        // M
                num_remision: r[13] ?? null,          // N
                observaciones: r[14] ?? null,         // O
                anio: r[15] ?? null,                  // P
                lote: r[16] ?? null,                  // Q
                fecha_caducidad: this.formatFecha(r[17]), // R
                cantidad_existencia: Number(r[18]) || 0,  // S
                descripcion_extra: r[19] ?? null      // T
            }));
        }

        if (tipo === 'traspasos') {
            return dataRows.map(r => ({
                fecha_recepcion: this.formatFecha(r[0]), // A
                folio: r[1] ?? null,                    // B
                unidad_origen_texto: r[2] ?? null,      // C
                clave_cnis: r[3] ?? '',                 // D
                descripcion: r[4] ?? '',                // E
                cantidad: Number(r[6]) || 0,            // G
                total: Number(r[7]) || null,            // H
                unidad_destino_texto: r[8] ?? null,     // I
                lote: r[10] ?? null,                    // K
                fecha_caducidad: this.formatFecha(r[11]), // L
                partida: r[12] ?? null                  // M
            }));
        }

        if (tipo === 'salidas') {
            return dataRows.map(r => ({
                unidad_origen_texto: r[0] ?? null,     // A
                unidad_destino_texto: r[1] ?? null,    // B
                folio: r[2] ?? null,                   // C
                clave_cnis: r[3] ?? '',                // D
                cantidad: Number(r[4]) || 0,           // E
                total: Number(r[5]) || null,           // F
                programa: r[6] ?? null,                // G
                fecha_entregado: this.formatFecha(r[7]), // H
                tipo: r[8] ?? null,                    // I
                folio_extra: r[11] ?? null,            // L
                movto: r[12] ?? null,                  // M
                descripcion: r[13] ?? '',              // N
                programa_extra: r[14] ?? null,         // O
                lote: r[15] ?? null,                   // P
                fecha_caducidad: this.formatFecha(r[16]) // Q
            }));
        }

        if (tipo === 'inventario') {

            // A: unidad, B: partida, C: articulo, D: lote, E: fecha caducidad,
            // F: tipo, G: cantidades, H: costo
            return dataRows.map(r => {
                const articuloRaw = r[2] ?? ''; // Col C
                const [clave_cnis, ...descParts] = articuloRaw.toString().trim().split(/\s+/);                
                return {
                    unidad: r[0] ?? null,
                    partida: r[1] ?? null,
                    articulo: clave_cnis,
                    descripcion: this.truncate(descParts.join(' '), 255),
                    lote: r[3] ?? null,
                    fecha_caducidad: this.formatFecha(r[4]),
                    tipo: r[5] ?? null,
                    cantidades: (r[6] != null && r[6] !== '') ? Number(r[6]) : null,
                    costo: (r[7] != null && r[7] !== '') ? Number(r[7]) : null
                } as InventarioInicialDTO;
            });
        }

        return [];
    }

    async subirTodo() {
        this.isUploading = true;
        this.progress = 0;

        const totalRegistros = this.fileEntradas.length + this.fileTraspasos.length + this.fileSalidas.length;
        let procesados = 0;

        await this.cargaMasivaService.init('entradas');
        await this.cargaMasivaService.init('traspasos');
        await this.cargaMasivaService.init('salidas');

        procesados = await this.uploadInBatches('entradas', this.fileEntradas, totalRegistros, procesados);
        procesados = await this.uploadInBatches('traspasos', this.fileTraspasos, totalRegistros, procesados);
        procesados = await this.uploadInBatches('salidas', this.fileSalidas, totalRegistros, procesados);

        this.isUploading = false;
        alert('✅ Carga masiva completada');
    }

    async subirInventarioInicial() {
        if (!this.fileInventario.length || !this.anioInventario) return;

        this.isUploading = true;
        this.progress = 0;

        try {
            const batchSize = 500;
            const total = this.fileInventario.length;
            let procesados = 0;

            for (let i = 0; i < total; i += batchSize) {
                const batch = this.fileInventario.slice(i, i + batchSize);
                const isFirstBatch = i === 0;

                // resetAnio SOLO en el primer batch
                await this.cargaMasivaService.batchInventarioInicial(
                    batch,
                    this.anioInventario,
                    this.resetAnio && isFirstBatch
                );

                procesados += batch.length;
                this.progress = Math.min(100, Math.round((procesados / total) * 100));
            }

            alert(`✅ Inventario Inicial ${this.anioInventario} cargado (${this.fileInventario.length} registros)`);
        } catch (e) {
            console.error(e);
            alert('❌ Error al subir Inventario Inicial');
        } finally {
            this.isUploading = false;
        }
    }

    private formatFecha(value: any): string | null {
        if (!value) return null;

        if (typeof value === 'number') {
            const fecha = XLSX.SSF.parse_date_code(value);
            if (fecha) {
                const jsDate = new Date(fecha.y, fecha.m - 1, fecha.d);
                return jsDate.toISOString().split('T')[0];
            }
            return null;
        }

        if (typeof value === 'string') {
            const clean = value.trim();

            const matchSimple = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            if (matchSimple) {
                const [, dd, mm, yyyy] = matchSimple;
                return `${yyyy}-${mm}-${dd}`;
            }

            const matchWithTime = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/);
            if (matchWithTime) {
                const [, dd, mm, yyyy] = matchWithTime;
                return `${yyyy}-${mm}-${dd}`;
            }

            const parsed = new Date(clean);
            return isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
        }

        return null;
    }

    private async uploadInBatches(tipo: 'entradas' | 'traspasos' | 'salidas', datos: any[], total: number, procesados: number) {
        const batchSize = 500;
        for (let i = 0; i < datos.length; i += batchSize) {
            const batch = datos.slice(i, i + batchSize);
            await this.cargaMasivaService.batch(tipo, batch);

            procesados += batch.length;
            this.progress = Math.min(100, Math.round((procesados / total) * 100));
        }
        return procesados;
    }


    // Helper para truncar
    private truncate(value: any, max: number): string | null {
        if (value == null) return null;
        const str = value.toString().trim();
        return str.length > max ? str.substring(0, max) : str;
    }
}
