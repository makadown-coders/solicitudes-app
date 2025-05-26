import { Injectable } from '@angular/core';
import { ArticuloSolicitud } from '../models/articulo-solicitud';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import { DatosClues } from '../models/datos-clues';
import { CitaRow } from '../models/Cita';
import { ArticuloCritico } from '../shared/inventario-critico.service';

@Injectable({ providedIn: 'root' })
export class ExcelService {

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
     */
    async exportarExcelConTemplate(
        templateUrl: string,
        nombreArchivo: string,
        articulosSolicitados: ArticuloSolicitud[],
        standalone: boolean
    ) {

        let B4 = '';
        let D4 = '';
        let E5 = '';
        let E8 = '';
        let E9 = '';

        const datosCluesStr = localStorage.getItem('datosClues');
        if (datosCluesStr && !standalone) {
            const datosClues = JSON.parse(datosCluesStr) as DatosClues;
            B4 = datosClues.nombreHospital;
            D4 = datosClues.tipoInsumo;
            E5 = datosClues.periodo;
            E8 = datosClues?.tipoPedido ?? 'Ordinario';
            E9 = datosClues?.responsableCaptura ?? '';
        }

        const workbook = new ExcelJS.Workbook();
        const response = await fetch(templateUrl);
        const arrayBuffer = await response.arrayBuffer();
        await workbook.xlsx.load(arrayBuffer);
        // console.log('workbook', workbook);
        const hojas = workbook.worksheets;
        // console.log('hojas', hojas);
        const worksheet = hojas[0];

        // Cargar la imagen SVG como buffer
        const imgBuffer = await fetch('imssb-logo.png')
            .then(res => res.arrayBuffer())
            .then(buffer => new Uint8Array(buffer));

        const imageId = workbook.addImage({
            buffer: imgBuffer,
            extension: 'png',
        });
        worksheet!.getCell('B1').value = '';
        // Posicionar en la celda B1 (col: 2, row: 1)
        worksheet.addImage(imageId, {
            tl: { col: 1, row: 0 }, // top-left (col: 1 = B)
            ext: { width: 150, height: 40 }, // tamaño en píxeles
            editAs: 'oneCell',
        });
        worksheet!.getCell('B4').value = B4;
        worksheet!.getCell('D4').value = D4;
        worksheet!.getCell('E5').value = E5;
        worksheet!.getCell('E8').value = E8;
        worksheet!.getCell('E9').value = E9;
        // A partir de B14 iterar los artículos desde B hasta F donde 
        // B = # de renglon, C = clave, D = descripción, E = unidad, F = cantidad
        for (let i = 0; i < articulosSolicitados.length; i++) {
            const renglon = i + 14;
            worksheet!.getCell(`B${renglon}`).value = i + 1;
            worksheet!.getCell(`C${renglon}`).value = articulosSolicitados[i].clave;
            worksheet!.getCell(`D${renglon}`).value = articulosSolicitados[i].descripcion;
            worksheet!.getCell(`E${renglon}`).value = articulosSolicitados[i].unidadMedida;
            worksheet!.getCell(`F${renglon}`).value = articulosSolicitados[i].cantidad;
        }
        const buffer = await workbook.xlsx.writeBuffer();
        this.descargarArchivo(buffer, nombreArchivo);
    }

    async exportarCitasConTemplate(
        templateUrl: string,
        nombreArchivo: string,
        encabezado: string,
        registros: any[]
    ) {
        const workbook = new ExcelJS.Workbook();
        const response = await fetch(templateUrl);
        const arrayBuffer = await response.arrayBuffer();
        await workbook.xlsx.load(arrayBuffer);

        const worksheet = workbook.worksheets[0];

        //  worksheet.mergeCells('A1:O1'); // Asegura que A1 esté mergeada si aún no lo está
        // Set encabezado en A1
        worksheet.getCell('A1').value = encabezado;
        /* const celdaTitulo = worksheet.getCell('A1');
           celdaTitulo.value = encabezado;
           celdaTitulo.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
           celdaTitulo.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 };
           celdaTitulo.fill = {
               type: 'pattern',
               pattern: 'solid',
               fgColor: { argb: 'FF006341' } // Verde oscuro
           };
           */

        const formatFecha = (fecha: string | Date | null): string => {
            if (!fecha) return '';
            const date = new Date(fecha);
            if (isNaN(date.getTime())) return '';
            const dia = String(date.getDate()).padStart(2, '0');
            const mes = String(date.getMonth() + 1).padStart(2, '0');
            const anio = date.getFullYear();
            return `${dia}/${mes}/${anio}`;
        };

        // Escribe a partir de A3 (row = 3)
        registros.forEach((reg, index) => {
            const rowIndex = 3 + index;
            worksheet.getCell(`A${rowIndex}`).value = 'BAJA CALIFORNIA';
            worksheet.getCell(`B${rowIndex}`).value = reg.orden_de_suministro;
            worksheet.getCell(`C${rowIndex}`).value = reg.clues_destino;
            worksheet.getCell(`D${rowIndex}`).value = reg.unidad;
            worksheet.getCell(`E${rowIndex}`).value = reg.proveedor;
            worksheet.getCell(`F${rowIndex}`).value = reg.clave_cnis;
            worksheet.getCell(`G${rowIndex}`).value = reg.descripcion;
            worksheet.getCell(`H${rowIndex}`).value = reg.tipo_de_red;
            worksheet.getCell(`I${rowIndex}`).value = +reg.cantidad || 0;
            worksheet.getCell(`J${rowIndex}`).value = reg.tarimas || '';
            worksheet.getCell(`K${rowIndex}`).value = reg.fecha || '';
            /*worksheet.getCell(`L${rowIndex}`).value = reg.hora || '';*/
            const celdaHora = worksheet.getCell(`L${rowIndex}`);
            const [hh, mm] = reg.hora.split(':');
            const isPM = +hh >= 12;
            const hora12 = (+hh % 12 || 12).toString().padStart(2, '0');
            const horaFormateada = `${hora12}:${mm}:00 ${isPM ? 'p.m.' : 'a.m.'}`;
            worksheet.getCell(`L${rowIndex}`).value = horaFormateada;

            worksheet.getCell(`M${rowIndex}`).value = reg.cita_atendida || '';
            worksheet.getCell(`N${rowIndex}`).value = reg.estatus_excel || '';
            worksheet.getCell(`O${rowIndex}`).value =
                reg.fecha_de_cita ? formatFecha(reg.fecha_de_cita) : '';

            for (let col = 1; col <= 15; col++) {
                const cell = worksheet.getCell(rowIndex, col);
                cell.font = { size: 9 };
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' },
                };
                cell.alignment = {
                    vertical: 'middle',
                    horizontal: col === 12 ? 'right' : 'center'
                };
            }
        });

        const buffer = await workbook.xlsx.writeBuffer();
        this.descargarArchivo(buffer, nombreArchivo);
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

    exportarInventarioCritico(articulos: ArticuloCritico[]) {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Inventario Crítico');

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
            const fecha = new Date().toISOString().slice(0, 10);
            const nombreArchivo = `InventarioCritico_${fecha}.xlsx`;
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = nombreArchivo;
            a.click();
            window.URL.revokeObjectURL(url);
        });
    }

}