import * as ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { descargarArchivo, ensureExcelExtension, formatearFecha } from './excel-utils';
import { CitaRow, InventarioRow, Cita, CPMS, Inventario, InventarioDisponibles, ClaveGrupo } from '../../models';
import { ResumenXGrupo } from '../../models/resumen-x-grupo.model';
import { ArticuloCritico } from '../../shared/inventario-critico.service';

export class InventarioExcelExporter {
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
            descargarArchivo(buffer, `ClavesCumplimiento_${new Date().toISOString().slice(0, 20)}.xlsx`);
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

        registros.forEach((r: any) => {
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
                fecha_de_cita: formatearFecha(r.fecha_de_cita),
                fecha_recepcion_almacen: r.fecha_recepcion_almacen ?? '',
                fecha_limite_de_entrega: formatearFecha(r.fecha_limite_de_entrega),
                estatus: r.estatus
            });
        });

        worksheet.getRow(1).font = { bold: true };

        const buffer = await workbook.xlsx.writeBuffer();
        descargarArchivo(buffer, nombreArchivo);
    }

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

        const hojaExistencias = workbook.getWorksheet(1);
        existencias.forEach((item, index) => {
            const row = hojaExistencias!.getRow(index + 2);
            row.getCell(1).value = index + 1;
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

        const hojaResumen = workbook.getWorksheet(2);
        hojaResumen!.getCell('B1').value = disponibles;
        hojaResumen!.getCell('B2').value = faltantes;
        hojaResumen!.getCell('B4').value = disponibles;
        hojaResumen!.getCell('D4').value = faltantes + disponibles;
        hojaResumen!.getCell('B5').value = totalPiezasDisponibles;

        const buffer = await workbook.xlsx.writeBuffer();
        descargarArchivo(buffer, nombreArchivo);
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
        descargarArchivo(buffer, ensureExcelExtension(nombreArchivo));
    }
}
