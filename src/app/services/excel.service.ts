// src/app/services/excel.service.ts 

import { inject, Injectable } from '@angular/core';
import { ArticuloSolicitud } from '../models/articulo-solicitud';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import { DatosClues } from '../models/datos-clues';
import { Cita, CitaRow } from '../models/Cita';
import { ArticuloCritico } from '../shared/inventario-critico.service';
import { clasificacionMedicamentosData } from '../models/clasificacionMedicamentosData';
import { ClasificadorVEN } from '../models/clasificador-ven';
import { Inventario, InventarioDisponibles, InventarioRow } from '../models/Inventario';
import { StorageSolicitudService } from './storage-solicitud.service';
import { ClaveGrupo, CPMS } from '../models/CPMS';
import { environment } from '../../environments/environment';
import { ResumenXGrupo } from '../models/resumen-x-grupo.model';
import { ModoCapturaSolicitud } from '../shared/modo-captura-solicitud';
import { UltimaEjecucion } from '../models/balanceo/UltimaEjecucion';
import { ResumenBalanceo } from '../models/balanceo/ResumenBalanceo';
import { DetalleBalanceo } from '../models/balanceo/DetalleBalanceo';

@Injectable({ providedIn: 'root' })
export class ExcelService {

    solicitudService = inject(StorageSolicitudService);

    exportarExcelPrecarga(nombreArchivo: string, articulosSolicitados: ArticuloSolicitud[]) {
        // primero ordenar articulos solicitados por clave en orden ascendente
        articulosSolicitados.sort((a, b) => a.clave.localeCompare(b.clave));

        const worksheet = XLSX.utils
            .json_to_sheet(
                articulosSolicitados
                    .map(a => ({
                        clave: a.clave,
                        ven: this.descripcionVEN(a.clave),
                        descripcion: a.descripcion,
                        unidadMedida: a.unidadMedida,
                        cantidad: a.cantidad
                    }))
            );

        //const worksheet = XLSX.utils.json_to_sheet(articulosSolicitados);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Solicitudes');

        const nombreFinal = nombreArchivo.endsWith('.xlsx') ? nombreArchivo : `${nombreArchivo}.xlsx`;

        XLSX.writeFile(workbook, nombreFinal);
    }

    exportarExcel(nombreArchivo: string, articulosSolicitados: ArticuloSolicitud[]) {
        const worksheet = XLSX.utils.json_to_sheet(articulosSolicitados);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Solicitudes');

        const nombreFinal = nombreArchivo.endsWith('.xlsx') ? nombreArchivo : `${nombreArchivo}.xlsx`;

        XLSX.writeFile(workbook, nombreFinal);
    }

    /**
     * Exporta un archivo de Excel con un template institucional
     * Usado solamente para solicitud de artículos
     * @param templateUrl 
     * @param nombreArchivo 
     * @param articulosSolicitados 
     * @param standalone 
     * @param existencias 
     * @param cpmsDeCluesActual
     */
    async exportarExcelConTemplate(
        templateUrl: string,
        nombreArchivo: string,
        articulosSolicitados: ArticuloSolicitud[],
        standalone: boolean,
        existencias: InventarioDisponibles[],
        cpmsDeCluesActual: CPMS[],
        kitHas?: (clave: string) => boolean
    ) {
        // primero ordenar articulos solicitados por clave en orden ascendente
        articulosSolicitados.sort((a, b) => a.clave.localeCompare(b.clave));

        let B4 = '';
        let E4 = '';
        let F5 = '';
        let F7 = '';
        let F8 = '';

        const datosCluesStr = this.solicitudService.getDatosCluesFromLocalStorage();
        let datosClues: DatosClues | null = null;
        if (datosCluesStr && !standalone) {
            datosClues = JSON.parse(datosCluesStr) as DatosClues;
            B4 = datosClues.nombreHospital;
            E4 = datosClues.tipoInsumo;
            F5 = datosClues.periodo;
            F7 = datosClues?.tipoPedido ?? 'Ordinario';
            F8 = datosClues?.responsableCaptura ?? '';
        }

        // 👇 Solo en Primer Nivel, agrega (Municipio) a B4 si lo tenemos
        const esPrimerNivel =
            this.solicitudService.getModoCapturaSolicitud() === ModoCapturaSolicitud.PRIMER_NIVEL;

        const municipio = datosClues?.hospital?.municipio?.trim();
        if (!standalone && esPrimerNivel && municipio) {
            B4 = `${B4} (${municipio})`;
        }

        const workbook = new ExcelJS.Workbook();
        const response = await fetch(templateUrl);
        const arrayBuffer = await response.arrayBuffer();
        await workbook.xlsx.load(arrayBuffer);
        const hojas = workbook.worksheets;
        const worksheet = hojas[0];

        // Cargar la imagen SVG como buffer
        const imgBuffer = await fetch('imssb-logo.png')
            .then(res => res.arrayBuffer())
            .then(buffer => new Uint8Array(buffer));

        const imageId = workbook.addImage({
            buffer: imgBuffer,
            extension: 'png',
        });
        worksheet!.getCell('C1').value = '';
        // Posicionar en la celda C1 (col: 3, row: 1)
        worksheet.addImage(imageId, {
            tl: { col: 2, row: 0 }, // top-left (col: 2 = C)
            ext: { width: 150, height: 40 }, // tamaño en píxeles
            editAs: 'oneCell',
        });
        worksheet!.getCell('B4').value = B4;
        worksheet!.getCell('E4').value = E4;
        worksheet!.getCell('F5').value = F5;
        worksheet!.getCell('F7').value = F7;
        worksheet!.getCell('F8').value = F8;
        // A partir de B12 iterar los artículos desde B hasta F donde 
        // B = # de renglon, C = Clasificacion VEN , D = clave, 
        // E = descripción, F = unidad, G = cantidad
        // H = CPM, I = AZM, J = AZT, K = AZE
        for (let i = 0; i < articulosSolicitados.length; i++) {
            const renglon = i + 12;
            worksheet!.getCell(`B${renglon}`).value = i + 1;
            worksheet!.getCell(`C${renglon}`).value = this.descripcionVEN(articulosSolicitados[i].clave);
            worksheet!.getCell(`D${renglon}`).value = articulosSolicitados[i].clave;
            worksheet!.getCell(`E${renglon}`).value = articulosSolicitados[i].descripcion;
            worksheet!.getCell(`F${renglon}`).value = articulosSolicitados[i].unidadMedida;
            const existencia = existencias.find(e => e.clave === articulosSolicitados[i].clave)
            const existenciaAZT = existencia ? existencia.existenciasAZT : 0;
            const existenciaAZE = existencia ? existencia.existenciasAZE : 0;
            const existenciaAZM = existencia ? existencia.existenciasAZM : 0;
            const cpm = articulosSolicitados[i].cpm === 0 ? (cpmsDeCluesActual
                .find(cpm => cpm.clave === articulosSolicitados[i].clave)?.cantidad ?? 0) : articulosSolicitados[i].cpm;
            const cantidad = articulosSolicitados[i].cantidad;

            const celdaCantidad = worksheet!.getCell(`G${renglon}`);
            celdaCantidad.value = cantidad;

            if (cpm > 0) {
                if (cantidad > cpm) {
                    celdaCantidad.font = { color: { argb: 'FFFF0000' } }; // texto rojo
                    /*celdaCantidad.border = {
                        top: { style: 'thin', color: { argb: 'FFFF0000' } },
                        bottom: { style: 'thin', color: { argb: 'FFFF0000' } },
                        left: { style: 'thin', color: { argb: 'FFFF0000' } },
                        right: { style: 'thin', color: { argb: 'FFFF0000' } },
                    };*/
                } else if (cantidad < cpm) {
                    // en texto azul
                    celdaCantidad.font = { color: { argb: '3933ff' } };
                    /*celdaCantidad.border = {
                        top: { style: 'thin', color: { argb: '3933ff' } },
                        bottom: { style: 'thin', color: { argb: '3933ff' } },
                        left: { style: 'thin', color: { argb: '3933ff' } },
                        right: { style: 'thin', color: { argb: '3933ff' } },
                    };*/
                }
            }

            const celdaCpm = worksheet!.getCell(`H${renglon}`);
            celdaCpm.value = cpm;
            // poner background de la celda de cpm en f3ff33 si cpm === 0
            if (cpm === 0) {
                // FONDO EN AMARILLO!
                celdaCpm.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f3ff33' } };
            }

            worksheet!.getCell(`I${renglon}`).value = existenciaAZM;
            worksheet!.getCell(`J${renglon}`).value = existenciaAZT;
            worksheet!.getCell(`K${renglon}`).value = existenciaAZE;
            // 👇 NUEVO: Columna L = Observaciones (en KIT)
            const enKit = kitHas?.(articulosSolicitados[i].clave) === true;
            const celdaObs = worksheet!.getCell(`L${renglon}`);
            celdaObs.value = enKit ? 'En KIT de Rutas de la Salud' : '';

            // (Opcional) un estilito cuando sí está en KIT
            if (enKit) {
                celdaObs.font = { italic: true, color: { argb: '22543D' } }; // verde oscuro
                celdaObs.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D1FAE5' } }; // verdoso claro
                worksheet.getColumn('L').width = 42;               // ancho “grande” (en caracteres)
                worksheet.getCell('L11').value = 'OBSERVACIONES';  // opcional: encabezado
            }
        }
        const buffer = await workbook.xlsx.writeBuffer();
        // 1. Convertir el buffer a base64
        const base64 = await this.convertirBufferABase64(buffer);

        // crear una variable que detecte si estoy en desarrollo o en produccion para nomas si
        // estoy en produccion, enviar la informacion al backend
        const enProduccion = environment.production;

        if (enProduccion) {
            // 2. Enviar al backend (ajusta URL si es necesario)        
            await fetch(environment.apiUrl + '/historial', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nombreArchivo,
                    contenidoBase64: base64,
                    nombre: datosClues?.responsableCaptura ?? 'Desconocido',
                    unidad: datosClues?.nombreHospital ?? '',
                    clues: datosClues?.hospital?.cluesimb ?? '',
                    periodo: datosClues?.periodo ?? '',
                    tipoMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                })
            });
        }

        this.descargarArchivo(buffer, nombreArchivo);
    }

    public descripcionVEN(clave: string): string {
        const clasificacion = clasificacionMedicamentosData
            .find(c => c.clave === clave);
        return clasificacion ?
            ClasificadorVEN[clasificacion.ven] :
            '';
    }

    private async convertirBufferABase64(buffer: ArrayBuffer): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onloadend = () => {
                const result = reader.result as string;

                // Asegurarse de extraer solo la parte Base64 tras la coma
                if (result && result.includes('base64,')) {
                    const base64String = result.split('base64,')[1];
                    resolve(base64String);
                } else {
                    // Si no tiene 'base64,', devolver todo como fallback
                    resolve(result);
                }
            };

            reader.onerror = () => {
                reject(new Error('Error al leer el buffer'));
            };

            // Usar el tipo MIME correcto para archivos Excel .xlsx
            const blob = new Blob([buffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });

            reader.readAsDataURL(blob);
        });
    }


    // Función auxiliar para descargar
    descargarArchivo(buffer: ArrayBuffer, nombreArchivo: string) {
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nombreArchivo;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    obtenerCitasDeExcel(buffer: ArrayBuffer) {
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: CitaRow[] = XLSX.utils.sheet_to_json<CitaRow>(sheet, { header: 1 });
        return rows;
    }

    obtenerInventarioDeExcel(buffer: ArrayBuffer) {
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: InventarioRow[] = XLSX.utils.sheet_to_json<InventarioRow>(sheet, { header: 1 });
        return rows;
    }

    exportarInventarioCritico(articulos: ArticuloCritico[]) {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Cumplimiento Claves');

        worksheet.columns = [
            { header: 'Clave CNIS', key: 'clave', width: 15 },
            { header: 'Descripción', key: 'descripcion', width: 40 },
            { header: 'Emitidas', key: 'emitidas', width: 12 },
            { header: 'Recibidas', key: 'recibidas', width: 12 },
            { header: '% Cumplido', key: 'porcentaje', width: 15 },
            { header: 'Nivel', key: 'nivel', width: 12 }
        ];

        articulos.forEach(a => {
            worksheet.addRow({
                ...a,
                porcentaje: `${a.porcentaje.toFixed(1)}%`
            });
        });

        worksheet.getRow(1).font = { bold: true };

        workbook.xlsx.writeBuffer().then(buffer => {
            const blob = new Blob([buffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const fecha = new Date().toISOString().slice(0, 20);
            const nombreArchivo = `ClavesCumplimiento_${fecha}.xlsx`;
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = nombreArchivo;
            a.click();
            window.URL.revokeObjectURL(url);
        });
    }

    async exportarDetalleCitasPorInsumo(nombreArchivo: string, registros: Cita[]) {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Citas por insumo');

        worksheet.columns = [
            { header: 'Orden de suministro', key: 'orden_de_suministro', width: 50 },
            { header: 'Contrato', key: 'contrato', width: 30 },
            { header: 'Procedimiento', key: 'procedimiento', width: 30 },
            { header: 'Tipo de Entrega', key: 'tipo_de_entrega', width: 30 },
            { header: 'CLUES', key: 'clues_destino', width: 15 },
            { header: 'Unidad', key: 'unidad', width: 30 },
            { header: 'Fte. Fmto', key: 'fte_fmto', width: 30 },
            { header: 'Proveedor', key: 'proveedor', width: 25 },
            { header: 'Clave CNIS', key: 'clave_cnis', width: 15 },
            { header: 'Descripción', key: 'descripcion', width: 30 },
            { header: 'Compra', key: 'compra', width: 15 },
            { header: 'Tipo de Red', key: 'tipo_de_red', width: 30 },
            { header: 'Tipo de Insumo', key: 'tipo_de_insumo', width: 15 },
            { header: 'Grupo Terapéutico', key: 'grupo_terapeutico', width: 15 },
            { header: 'Precio Unitario', key: 'precio_unitario', width: 15 },
            { header: 'Piezas emitidas', key: 'no_de_piezas_emitidas', width: 15 },
            { header: 'Piezas recibidas', key: 'pzas_recibidas_por_la_entidad', width: 15 },
            { header: 'Fecha de cita', key: 'fecha_de_cita', width: 18 },
            { header: 'Fecha recepción almacén', key: 'fecha_recepcion_almacen', width: 22 },
            { header: 'Fecha límite de entrega', key: 'fecha_limite_de_entrega', width: 22 },
            { header: 'Observación', key: 'observacion', width: 30 },
            { header: 'Estatus', key: 'estatus', width: 15 }
        ];

        const formatFecha = (fecha: string | Date | null): string => {
            if (!fecha) return '';
            const date = new Date(fecha);
            return isNaN(date.getTime()) ? '' :
                `${date.getDate().toString().padStart(2, '0')}/` +
                `${(date.getMonth() + 1).toString().padStart(2, '0')}/` +
                `${date.getFullYear()}`;
        };

        registros.forEach((r) => {
            worksheet.addRow({
                orden_de_suministro: r.orden_de_suministro,
                contrato: r.contrato,
                procedimiento: r.procedimiento,
                tipo_de_entrega: r.tipo_de_entrega,
                clues_destino: r.clues_destino,
                unidad: r.unidad,
                fte_fmto: r.fte_fmto,
                proveedor: r.proveedor,
                clave_cnis: r.clave_cnis,
                descripcion: r.descripcion,
                compra: r.compra,
                tipo_de_red: r.tipo_de_red,
                tipo_de_insumo: r.tipo_de_insumo,
                grupo_terapeutico: r.grupo_terapeutico,
                precio_unitario: r.precio_unitario ?? 0,
                no_de_piezas_emitidas: r.no_de_piezas_emitidas ?? 0,
                pzas_recibidas_por_la_entidad: r.pzas_recibidas_por_la_entidad ?? 0,
                fecha_de_cita: formatFecha(r.fecha_de_cita),
                fecha_recepcion_almacen: r.fecha_recepcion_almacen ?? '',
                fecha_limite_de_entrega: formatFecha(r.fecha_limite_de_entrega),
                // observacion: r.observacion,
                estatus: r.estatus
            });
        });

        worksheet.getRow(1).font = { bold: true };

        const buffer = await workbook.xlsx.writeBuffer();
        this.descargarArchivo(buffer, nombreArchivo);
    }

    /**
     * Usado en 
     * - precarga de solicitud de articulos
     * - carga masiva (herramienta escondida)
     * @param file 
     * @returns 
     */
    leerArchivoPrecarga(file: File): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array((e.target as any).result);
                const workbook = XLSX.read(data, { type: 'array' });
                const primeraHoja = workbook.SheetNames[0];
                const datos = XLSX.utils.sheet_to_json(workbook.Sheets[primeraHoja], { defval: '' });
                resolve(datos);
            };
            reader.onerror = (e) => reject(e);
            reader.readAsArrayBuffer(file);
        });
    }

    public base64ToArrayBuffer(base64: string): ArrayBuffer {
        // Decodificar el string Base64
        const binaryString = atob(base64);

        // Convertir a ArrayBuffer
        const length = binaryString.length;
        const bytes = new Uint8Array(length);

        for (let i = 0; i < length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        return bytes.buffer;
    }


    /**
     * Lee un archivo CPMS y devuelve un array de objetos con las claves, cluesimb y cantidad.
     * El archivo es de acuerdo es al formato oficial proporcionado por unidad medica
     * @param buffer 
     */
    public procesarArchivoCPMS(buffer: ArrayBuffer): [CPMS[], ClaveGrupo[]] {
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        const CPMs: CPMS[] = [];
        // aqui se guarda relacion unica de claves y grupos (no mas de 2000 registros)
        const clavesGrupos: ClaveGrupo[] = [];

        // 1. Obtener claves desde A5 hacia abajo hasta encontrar celda vacía
        const claves: string[] = [];
        let row = 5;
        while (true) {
            const celda = sheet[`A${row}`];
            if (!celda || !celda.v) break;
            claves.push(celda.v.toString());
            clavesGrupos.push({ clave: celda.v.toString(), gpo: '', grupoTerapeutico: '' });
            row++;
        }

        // 2. Obtener encabezados cluesimb de I2 a GB2
        const cluesimb: string[] = [];
        const startCol = XLSX.utils.decode_col("I");
        const endCol = XLSX.utils.decode_col("GB");
        for (let col = startCol; col <= endCol; col++) {
            const colLetter = XLSX.utils.encode_col(col);
            const celda = sheet[`${colLetter}2`];
            cluesimb.push(celda?.v?.toString() ?? '');
        }

        // 3. Recorrer la matriz: por cada fila (clave) y columna (cluesimb)
        claves.forEach((clave, idxFila) => {
            const fila = 5 + idxFila;

            cluesimb.forEach((clue, idxCol) => {
                const colLetter = XLSX.utils.encode_col(startCol + idxCol);
                const celda = sheet[`${colLetter}${fila}`];
                const cantidad = celda?.v ? Number(celda.v) : 0;
                const gpo = sheet[`C${fila}`]?.v?.toString() ?? '';
                const grupoTerapeutico = sheet[`D${fila}`]?.v?.toString() ?? '';

                // buscar y actualizar en clavesGrupos
                const claveGrupo = clavesGrupos.find(cg => cg.clave === clave);
                if (claveGrupo) {
                    claveGrupo.gpo = gpo;
                    claveGrupo.grupoTerapeutico = grupoTerapeutico;
                }

                CPMs.push({
                    clave,
                    cluesimb: clue,
                    cantidad: isNaN(cantidad) ? 0 : cantidad
                });
            });
        });

        // 4. Guardar en localStorage
        // const STORAGE_KEY = 'SOLICITUD_CPMS'; // o usa StorageVariables.SOLICITUD_CPMS
        // localStorage.setItem(STORAGE_KEY, JSON.stringify(CPMs));
        return [CPMs, clavesGrupos];
    }

    /**
     * Metodo para exportar el listado de existencias por unidad
     * Usado en dashboard abasto > Existencias > Existencias X Clave
     */
    async exportarExcelExistenciasUnidadConTemplate(
        templateUrl: string,
        nombreArchivo: string,
        existencias: {
            clave: string;
            clasificacionVEN: string;
            descripcion: string;
            unidadMedida: string;
            gpo: string;
            grupoTerapeutico: string;
            cpm: number;
            existenciaTotal: number;
            existenciaAZM: number;
            existenciaAZT: number;
            existenciaAZE: number;
            puntoReorden: number;
        }[],
        disponibles: number,
        faltantes: number,
        totalPiezasDisponibles: number
    ) {
        const workbook = new ExcelJS.Workbook();
        const response = await fetch(templateUrl);
        const arrayBuffer = await response.arrayBuffer();
        await workbook.xlsx.load(arrayBuffer);

        /** Hoja 1: Existencias **/
        const hojaExistencias = workbook.getWorksheet(1); // primera hoja
        const hoy = new Date();
        const hace40dias = new Date(hoy);
        hace40dias.setDate(hoy.getDate() - 40);


        existencias.forEach((item, index) => {
            const row = hojaExistencias!.getRow(index + 2); // desde la fila 2
            row.getCell(1).value = index + 1; // #
            row.getCell(2).value = item.clave;
            row.getCell(3).value = item.clasificacionVEN;
            row.getCell(4).value = item.descripcion;
            row.getCell(5).value = item.unidadMedida;
            row.getCell(6).value = item.gpo;
            row.getCell(7).value = item.grupoTerapeutico;
            row.getCell(8).value = item.cpm;
            row.getCell(9).value = item.existenciaTotal;
            row.getCell(10).value = item.existenciaAZM;
            row.getCell(11).value = item.existenciaAZT;
            row.getCell(12).value = item.existenciaAZE;
            row.getCell(13).value = item.puntoReorden;
        });

        /** Hoja 2: Resumen Abasto **/
        const hojaResumen = workbook.getWorksheet(2); // segunda hoja
        hojaResumen!.getCell('B1').value = disponibles;
        hojaResumen!.getCell('B2').value = faltantes;
        hojaResumen!.getCell('B4').value = disponibles;
        hojaResumen!.getCell('D4').value = faltantes + disponibles;
        hojaResumen!.getCell('B5').value = totalPiezasDisponibles;

        /** Guardar archivo **/
        const buffer = await workbook.xlsx.writeBuffer();
        this.descargarArchivo(buffer, nombreArchivo.endsWith('.xlsx') ? nombreArchivo : `${nombreArchivo}.xlsx`);
    }

    public async exportarResumenXGrupo(
        nombreArchivo: string,
        resumenData: ResumenXGrupo[],
        cpms: CPMS[],
        existenciaUnidades: Map<string, Inventario[]>,
        obtenerDescripcion: (clave: string) => string,
        obtenerUnidad: (clave: string) => string,
        obtenerExistenciaAlmacenes: (clave: string) => InventarioDisponibles,
        claveGrupos: ClaveGrupo[],
        grupoSeleccionado: string
    ) {
        const workbook = new ExcelJS.Workbook();

        // ===== Hoja principal =====
        const hojaResumen = workbook.addWorksheet('Resumen X Grupo');
        hojaResumen.columns = [
            { header: 'Municipio', key: 'municipio', width: 20 },
            { header: 'CLUES', key: 'clues', width: 15 },
            { header: 'Nombre de Unidad', key: 'nombreUnidad', width: 35 },
            { header: 'Nivel Atención', key: 'nivelAtencion', width: 15 },
            { header: 'Tipología', key: 'tipologia', width: 20 },
            { header: 'Categoría', key: 'categoria', width: 15 },
            { header: 'Claves Manejadas', key: 'clavesManejadas', width: 18 },
            { header: 'Claves Desabasto', key: 'clavesDesabasto', width: 18 },
            { header: '% Desabasto', key: 'porcentajeDesabasto', width: 15 }
        ];
        hojaResumen.getRow(1).font = { bold: true };

        resumenData.forEach(row => {
            hojaResumen.addRow({
                ...row,
                porcentajeDesabasto: `${row.porcentajeDesabasto.toFixed(1)}%`
            });
        });

        resumenData.forEach(row => {
            const hojaUnidad = workbook.addWorksheet(row.clues);

            // Fila 1: nombre de la unidad
            hojaUnidad.addRow([row.nombreUnidad]);
            hojaUnidad.addRow([]); // Fila 2 vacía

            // Encabezados (fila 3)
            hojaUnidad.addRow([
                '#',
                'Clave',
                'Descripción',
                'Unidad',
                'CPM',
                'Existencia',
                'AZM',
                'AZT',
                'AZE',
                'Desabasto'
            ]);
            hojaUnidad.getRow(3).font = { bold: true };

            const clavesUnidad = cpms
                .filter(c => c.cluesimb.toLowerCase() === row.clues.toLowerCase())
                .filter(c => claveGrupos.some(
                    cg => cg.clave === c.clave && cg.grupoTerapeutico === grupoSeleccionado
                ))
                .sort((a, b) => a.clave.localeCompare(b.clave));

            clavesUnidad.forEach((cpm, index) => {
                const descripcion = obtenerDescripcion(cpm.clave);
                const unidadMedida = obtenerUnidad(cpm.clave);

                const existenciaTotal = (existenciaUnidades.get(row.key) || [])
                    .filter(item => item.clave === cpm.clave)
                    .reduce((sum, item) => sum + item.disponible, 0);

                const existenciaAlmacenes = obtenerExistenciaAlmacenes(cpm.clave);
                const totalAlmacenes = existenciaAlmacenes.existenciasAZM +
                    existenciaAlmacenes.existenciasAZT +
                    existenciaAlmacenes.existenciasAZE;

                const totalExistencias = existenciaTotal + totalAlmacenes;

                // const desabasto = cpm.cantidad > totalExistencias; // puede variar 
                const desabasto = totalExistencias === 0;

                hojaUnidad.addRow([
                    index + 1,
                    cpm.clave,
                    descripcion,
                    unidadMedida,
                    cpm.cantidad,
                    existenciaTotal,
                    existenciaAlmacenes.existenciasAZM,
                    existenciaAlmacenes.existenciasAZT,
                    existenciaAlmacenes.existenciasAZE,
                    desabasto ? 'Sí' : 'No'
                ]);
            });

            hojaUnidad.columns.forEach(col => col.width = 15);
            hojaUnidad.getColumn(3).width = 40; // Descripción más ancha

            const lastRowIndex = hojaUnidad.lastRow!.number;
            const totalRowIndex = lastRowIndex + 2;

            hojaUnidad.getCell(`A${totalRowIndex}`).value = 'TOTAL';
            hojaUnidad.getCell(`A${totalRowIndex}`).font = { bold: true };
            hojaUnidad.getCell(`B${totalRowIndex}`).value = {
                formula: `SUBTOTAL(103, B4:B${lastRowIndex})`
            };
            hojaUnidad.getCell(`B${totalRowIndex}`).font = { bold: true };
            hojaUnidad.getCell(`C${totalRowIndex}`).value = 'DE';
            hojaUnidad.getCell(`C${totalRowIndex}`).font = { bold: true };
            hojaUnidad.getCell(`D${totalRowIndex}`).value = {
                formula: `COUNTA(B4:B${lastRowIndex})`
            };
            hojaUnidad.getCell(`D${totalRowIndex}`).font = { bold: true };
        });

        // Descargar archivo
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nombreArchivo.endsWith('.xlsx') ? nombreArchivo : `${nombreArchivo}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    // ================== BALANCEO INTER-ALMACENES ==================

    /**
     * Exporta un Excel con resumen y detalle de balanceo inter-almacenes.
     *
     * @param nombreArchivo       Nombre del .xlsx
     * @param ejecucion           Última ejecución del balanceo (para encabezado)
     * @param resumen             Filas de resumen_almacenes_final (DTO ResumenBalanceo[])
     * @param detalle             Filas de balanceo_detallado_final (DTO DetalleBalanceo[])
     */
    public async exportarBalanceoSugerencias(
        nombreArchivo: string,
        ejecucion: UltimaEjecucion | null,
        resumen: ResumenBalanceo[],
        detalle: DetalleBalanceo[]
    ) {
        const workbook = new ExcelJS.Workbook();

        // 🎨 Colores institucionales
        const VERDE_OSCURO = '006341';
        const BLANCO = 'FFFFFF';
        const DORADO = 'CBA135';
        const VERDE_CLARO = '2E8B57';

        // =========== HOJA 1: RESUMEN EJECUTIVO ===========
        const hojaResumen = workbook.addWorksheet('Resumen');

        // Métricas básicas
        const clavesUnicas = new Set(resumen.map(r => r.clave_cnis)).size;
        const totalPiezasSugeridas = resumen
            .filter(r => r.jurisdiccion_destino !== '-')
            .reduce((sum, r) => sum + (r.total_piezas ?? 0), 0);

        const totalExcedentes = resumen
            .filter(r => r.jurisdiccion_destino === '-')
            .reduce((sum, r) => sum + (r.total_piezas ?? 0), 0);

        const unidadesBeneficiadas = new Set(
            detalle.map(d => d.clues_destino?.toUpperCase() ?? '')
                .filter(x => !!x)
        ).size;

        hojaResumen.columns = [
            { header: 'Indicador', key: 'indicador', width: 35 },
            { header: 'Valor', key: 'valor', width: 30 }
        ];

        // Encabezado con branding
        const tituloRow = hojaResumen.getRow(1);
        tituloRow.getCell(1).value = 'Balanceo inter-almacenes (CPM - Existencias)';
        tituloRow.getCell(1).font = { bold: true, size: 14, color: { argb: VERDE_OSCURO } };
        hojaResumen.mergeCells('A1:B1');

        const ejecRow = hojaResumen.getRow(3);
        ejecRow.getCell(1).value = 'Última ejecución';
        ejecRow.getCell(2).value = ejecucion
            ? `${ejecucion.fecha_inicio} · Estado: ${ejecucion.estado} · ID: ${ejecucion.id}`
            : 'N/D';
        ejecRow.getCell(1).font = { bold: true, color: { argb: VERDE_OSCURO } };

        hojaResumen.addRow([]);
        const headerRow = hojaResumen.addRow(['Indicador', 'Valor']);
        headerRow.font = { bold: true, color: { argb: BLANCO } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: VERDE_OSCURO }
        };

        const dataRows: [string, string | number][] = [
            ['Claves con sugerencias', clavesUnicas],
            ['Unidades destino beneficiadas', unidadesBeneficiadas],
            ['Piezas sugeridas a transferir', totalPiezasSugeridas],
            ['Piezas excedentes detectadas', totalExcedentes],
        ];

        dataRows.forEach(r => {
            const row = hojaResumen.addRow(r);
            row.getCell(1).font = { bold: true };
        });

        // Línea dorada abajo
        const last = hojaResumen.lastRow!.number;
        hojaResumen.getRow(last + 2).getCell(1).value =
            'Nota: Este archivo es de carácter informativo y de apoyo para la toma de decisiones.';

        hojaResumen.getRow(last + 2).getCell(1).font = {
            size: 9,
            color: { argb: DORADO }
        };
        hojaResumen.mergeCells(`A${last + 2}:B${last + 2}`);

        // =========== HOJA 2: RESUMEN POR CLAVE / ALMACÉN ===========
        const hojaPorClave = workbook.addWorksheet('Por clave - almacén');
        hojaPorClave.columns = [
            { header: 'Clave CNIS', key: 'clave_cnis', width: 16 },
            { header: 'Almacén origen', key: 'jurisdiccion_almacen', width: 16 },
            { header: 'Jurisdicción destino', key: 'jurisdiccion_destino', width: 16 },
            { header: 'Unidades destino', key: 'total_unidades', width: 16 },
            { header: 'Piezas sugeridas / excedentes', key: 'total_piezas', width: 26 },
            { header: 'Instrucciones', key: 'instrucciones_detalladas', width: 60 },
        ];

        const header2 = hojaPorClave.getRow(1);
        header2.font = { bold: true, color: { argb: BLANCO } };
        header2.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: VERDE_OSCURO }
        };

        resumen.forEach(r => {
            hojaPorClave.addRow({
                clave_cnis: r.clave_cnis,
                jurisdiccion_almacen: r.jurisdiccion_almacen,
                jurisdiccion_destino: r.jurisdiccion_destino === '-' ? 'EXCEDENTE' : r.jurisdiccion_destino,
                total_unidades: r.total_unidades,
                total_piezas: r.total_piezas,
                instrucciones_detalladas: r.instrucciones_detalladas
            });
        });

        // Auto-filtros
        hojaPorClave.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: 1, column: hojaPorClave.columns.length }
        };

        // =========== HOJA 3: DETALLE DE SUGERENCIAS ===========
        const hojaDetalle = workbook.addWorksheet('Detalle sugerencias');
        hojaDetalle.columns = [
            { header: 'Clave CNIS', key: 'clave_cnis', width: 16 },
            { header: 'Almacén origen', key: 'jurisdiccion_almacen', width: 18 },
            { header: 'Jurisdicción destino', key: 'jurisdiccion_destino', width: 18 },
            { header: 'CLUES destino', key: 'clues_destino', width: 16 },
            { header: 'Unidad destino', key: 'nombre_unidad_destino', width: 40 },
            { header: 'Necesidad original', key: 'necesidad_original', width: 18 },
            { header: 'Cantidad sugerida', key: 'cantidad_sugerida', width: 18 },
            { header: 'Prioridad', key: 'prioridad', width: 16 },
        ];

        const header3 = hojaDetalle.getRow(1);
        header3.font = { bold: true, color: { argb: BLANCO } };
        header3.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: VERDE_CLARO }
        };

        detalle.forEach(d => {
            hojaDetalle.addRow({
                clave_cnis: d.clave_cnis,
                jurisdiccion_almacen: d.jurisdiccion_almacen,
                jurisdiccion_destino: d.jurisdiccion_destino,
                clues_destino: d.clues_destino,
                nombre_unidad_destino: d.nombre_unidad_destino,
                necesidad_original: d.necesidad_original,
                cantidad_sugerida: d.cantidad_sugerida,
                prioridad: d.prioridad === 1
                    ? 'Misma jurisdicción'
                    : d.prioridad === 2
                        ? 'Otras jurisdicciones'
                        : `Prioridad ${d.prioridad}`
            });
        });

        hojaDetalle.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: 1, column: hojaDetalle.columns.length }
        };

        // =========== GUARDAR ===========
        const buffer = await workbook.xlsx.writeBuffer();
        this.descargarArchivo(
            buffer,
            nombreArchivo.endsWith('.xlsx') ? nombreArchivo : `${nombreArchivo}.xlsx`
        );
    }

}