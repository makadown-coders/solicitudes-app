import * as ExcelJS from 'exceljs';
import { descargarArchivo, ensureExcelExtension } from './excel-utils';
import { ArticuloInfo } from "../../models/ArticuloInfo";
import { KitCatalogoRow } from '../../models/KitCatalogoRow';

export class KitsExcelExporter {

    async exportarCatalogoKits(nombreArchivo: string,
            kits: string[],
            filas: KitCatalogoRow[],
            articulosMapa?: Record<string, ArticuloInfo>) {

        const workbook = new ExcelJS.Workbook();
        const ws = workbook.addWorksheet('CatalogoKits');

        // Config general
        ws.properties.defaultRowHeight = 16;

        // Anchos
        ws.getColumn(1).width = 15;  // CLAVE
        ws.getColumn(2).width = 60;  // DESCRIPCIÓN
        for (let i = 0; i < kits.length; i++) {
            ws.getColumn(3 + i).width = 10; // cada kit
        }

        // 🎯 R1: título
        ws.mergeCells(1, 1, 1, 2 + kits.length);
        const titleCell = ws.getCell(1, 1);
        titleCell.value = 'CATÁLOGO DE CLAVES POR KIT';
        titleCell.font = { bold: true, size: 14 };
        titleCell.alignment = { horizontal: 'center' };

        // Fila 2 en blanco
        // R3: Totales arriba
        const headerTopRow = 3;
        ws.getCell(headerTopRow, 1).value = '';
        ws.getCell(headerTopRow, 1).font = { bold: true };
        ws.getCell(headerTopRow, 2).value = ''; // vacío

        // R4: encabezado de tabla principal
        const headerRow = 4;
        ws.getRow(headerRow).font = { bold: true };
        ws.getRow(headerRow).alignment = { horizontal: 'center' };

        ws.getCell(headerRow, 1).value = 'CLAVE';
        ws.getCell(headerRow, 2).value = 'DESCRIPCIÓN';

        kits.forEach((codigoKit, idx) => {
            const colIndex = 3 + idx;
            ws.getCell(headerRow, colIndex).value = codigoKit;
            ws.getColumn(colIndex).width = 5 + codigoKit.length;
            ws.getCell(headerRow, colIndex).alignment = { wrapText: true, horizontal: 'center' };            
        });

        // Datos
        const dataStartRow = headerRow + 1; // 5
        let currentRow = dataStartRow;

        for (const fila of filas) {
            const row = ws.getRow(currentRow);
            row.getCell(1).value = fila.clave;

            let desc = articulosMapa?.[fila.clave]?.descripcion ?? '';
            if (desc.length > 250) {
                desc = desc.slice(0, 250) + '…';
            }
            row.getCell(2).value = desc;

            // Matriz SI / NO
            kits.forEach((codigoKit, idx) => {
                const colIndex = 3 + idx;
                const aplica = fila.kitsAplica.includes(codigoKit);
                row.getCell(colIndex).value = aplica ? 'SI' : 'NO';
                row.getCell(colIndex).alignment = { horizontal: 'center' };
            });

            currentRow++;
        }

        const dataEndRow = currentRow - 1;

        // Bordes ligeros para la tabla
        for (let r = headerRow; r <= dataEndRow; r++) {
            const row = ws.getRow(r);
            for (let c = 1; c <= 2 + kits.length; c++) {
                const cell = row.getCell(c);
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' },
                };
            }
        }

        // 🧮 Totales arriba (fila 3) y abajo
        kits.forEach((_, idx) => {
            const colIndex = 3 + idx;
            const colLetter = ws.getColumn(colIndex).letter;

            // Arriba: total de "SI"
            ws.getCell(headerTopRow, colIndex).value = {
                formula: `COUNTIF(${colLetter}${dataStartRow}:${colLetter}${dataEndRow},"SI")`,
            };
            ws.getCell(headerTopRow, colIndex).alignment = { horizontal: 'center' };
            ws.getCell(headerTopRow, colIndex).font = { bold: true };
        });

        // Abajo
        const totalesRow = dataEndRow + 1;
        // const bottomSiRow = dataEndRow + 3;
        // const bottomNoRow = dataEndRow + 4;

        ws.getCell(totalesRow, 1).value = 'TOTALES POR KIT';
        ws.getCell(totalesRow, 1).font = { bold: true };

        /*ws.getCell(bottomSiRow, 1).value = 'Total SI';
        ws.getCell(bottomNoRow, 1).value = 'Total NO';
        ws.getRow(bottomSiRow).font = { bold: true };
        ws.getRow(bottomNoRow).font = { bold: true };*/

        kits.forEach((_, idx) => {
            const colIndex = 3 + idx;
            const colLetter = ws.getColumn(colIndex).letter;

            ws.getCell(totalesRow, colIndex).value = {
                formula: `COUNTIF(${colLetter}${dataStartRow}:${colLetter}${dataEndRow},"SI")`,
            };

            ws.getCell(totalesRow, colIndex).alignment = { horizontal: 'center' };

        /*    ws.getCell(bottomSiRow, colIndex).value = {
                formula: `COUNTIF(${colLetter}${dataStartRow}:${colLetter}${dataEndRow},"SI")`,
            };
            ws.getCell(bottomNoRow, colIndex).value = {
                formula: `COUNTIF(${colLetter}${dataStartRow}:${colLetter}${dataEndRow},"NO")`,
            };

            ws.getCell(bottomSiRow, colIndex).alignment = { horizontal: 'center' };
            ws.getCell(bottomNoRow, colIndex).alignment = { horizontal: 'center' };*/
        });

        // Descargar
        const buffer = await workbook.xlsx.writeBuffer();
        descargarArchivo(buffer, ensureExcelExtension(nombreArchivo));
    }
}
