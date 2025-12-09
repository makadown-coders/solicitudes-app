import * as ExcelJS from 'exceljs';
import { descargarArchivo, ensureExcelExtension } from './excel-utils';
import { DetalleBalanceo } from '../../models/balanceo/DetalleBalanceo';
import { ResumenBalanceo } from '../../models/balanceo/ResumenBalanceo';
import { UltimaEjecucion } from '../../models/balanceo/UltimaEjecucion';

export class BalanceoExcelExporter {
    async exportarBalanceoSugerencias(
        nombreArchivo: string,
        ejecucion: UltimaEjecucion | null,
        resumen: ResumenBalanceo[],
        detalle: DetalleBalanceo[]
    ) {
        const workbook = new ExcelJS.Workbook();

        const VERDE_OSCURO = '006341';
        const BLANCO = 'FFFFFF';
        const DORADO = 'CBA135';
        const VERDE_CLARO = '2E8B57';

        const hojaResumen = workbook.addWorksheet('Resumen');

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

        const last = hojaResumen.lastRow!.number;
        hojaResumen.getRow(last + 2).getCell(1).value =
            'Nota: Este archivo es de carácter informativo y de apoyo para la toma de decisiones.';

        hojaResumen.getRow(last + 2).getCell(1).font = {
            size: 9,
            color: { argb: DORADO }
        };
        hojaResumen.mergeCells(`A${last + 2}:B${last + 2}`);

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

        hojaPorClave.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: 1, column: hojaPorClave.columns.length }
        };

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

        const buffer = await workbook.xlsx.writeBuffer();
        descargarArchivo(buffer, ensureExcelExtension(nombreArchivo));
    }
}
