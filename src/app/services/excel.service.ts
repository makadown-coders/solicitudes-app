import { Injectable } from '@angular/core';
import { ArticuloSolicitud } from '../models/articulo-solicitud';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import { DatosClues } from '../models/datos-clues';

@Injectable({ providedIn: 'root' })
export class ExcelService {

    exportarExcel(nombreArchivo: string, articulosSolicitados: ArticuloSolicitud[]) {
        const worksheet = XLSX.utils.json_to_sheet(articulosSolicitados);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Solicitudes');

        const nombreFinal = nombreArchivo.endsWith('.xlsx') ? nombreArchivo : `${nombreArchivo}.xlsx`;

        XLSX.writeFile(workbook, nombreFinal);
    }

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
        console.log('workbook', workbook);
        const hojas = workbook.worksheets;
        console.log('hojas', hojas);
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
}