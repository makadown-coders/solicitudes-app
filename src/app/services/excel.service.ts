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
        articulosSolicitados: ArticuloSolicitud[]) {

        let B1 = '';
        let D4 = '';
        let E5 = '';

        const datosCluesStr = localStorage.getItem('datosClues');
        if (datosCluesStr) {
            const datosClues = JSON.parse(datosCluesStr) as DatosClues;
            B1 = datosClues.nombreHospital;
            D4 = datosClues.tipoInsumo;
            E5 = datosClues.periodo;
        }

        const workbook = new ExcelJS.Workbook();
        const response = await fetch(templateUrl);
        const arrayBuffer = await response.arrayBuffer();
        await workbook.xlsx.load(arrayBuffer);
        console.log('workbook', workbook);
        const hojas = workbook.worksheets;
        console.log('hojas', hojas);
        const worksheet = hojas[0];
        worksheet!.getCell('B1').value = B1;
        worksheet!.getCell('D4').value = D4;
        worksheet!.getCell('E5').value = E5;
        // A partir de B13 iterar los artículos desde B hasta F donde 
        // B = # de renglon, C = clave, D = descripción, E = unidad, F = cantidad
        for (let i = 0; i < articulosSolicitados.length; i++) {
            const renglon = i + 13;
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