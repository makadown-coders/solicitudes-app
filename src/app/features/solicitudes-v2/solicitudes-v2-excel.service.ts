import * as ExcelJS from 'exceljs';
import type { SolicitudV2Contexto, SolicitudV2Renglon } from './solicitudes-v2.model';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const VERDE_INSTITUCIONAL = 'FF006B5F';
const AMARILLO_AVISO = 'FFFFF2CC';
const AMARILLO_CPM = 'FFFFFF99';

export class SolicitudesV2ExcelService {
  generarExcelUsuario(contexto: SolicitudV2Contexto, articulos: SolicitudV2Renglon[]): Promise<ArrayBuffer> {
    return this.generarBuffer(contexto, articulos, false);
  }

  generarExcelOperativo(contexto: SolicitudV2Contexto, articulos: SolicitudV2Renglon[]): Promise<ArrayBuffer> {
    return this.generarBuffer(contexto, articulos, true);
  }

  private async generarBuffer(
    contexto: SolicitudV2Contexto,
    articulos: SolicitudV2Renglon[],
    incluirAnalisisOperativo: boolean,
  ): Promise<ArrayBuffer> {
    const exportables = articulos.filter(articulo => articulo.cantidad !== null && articulo.cantidad > 0);
    if (exportables.length === 0) throw new Error('No hay cantidades positivas para preparar.');
    const workbook = new ExcelJS.Workbook();
    const generadoEn = new Date();
    const clues = contexto.unidad?.cluesimb || contexto.unidad?.cluessa || 'No disponible';
    workbook.creator = 'Solicitudes V2 Sandbox';
    workbook.created = generadoEn;

    const lista = workbook.addWorksheet('Lista de necesidades');
    lista.addRow(['LISTA DE NECESIDADES · SANDBOX SOLICITUDES V2']);
    lista.addRow(['Documento', 'Vista de trabajo local; no enviada ni autorizada']);
    lista.addRow(['Unidad', contexto.unidad?.nombre || 'No especificada']);
    lista.addRow(['CLUES', clues]);
    lista.addRow(['Periodo', this.formatearPeriodo(contexto.periodo)]);
    lista.addRow(['Responsable', contexto.responsableCaptura || 'No especificado']);
    lista.addRow(['Generado', generadoEn.toLocaleString('es-MX')]);
    lista.addRow(['Aclaración', 'Este archivo fue generado localmente desde el sandbox Solicitudes V2.']);
    lista.addRow([]);
    lista.addRow(['Clave', 'Descripción', 'Presentación', 'Cantidad']);

    for (const articulo of exportables) {
      const row = lista.addRow([
        articulo.clave,
        articulo.descripcion ?? '',
        articulo.presentacion ?? '',
        articulo.cantidad,
      ]);
      row.getCell(1).numFmt = '@';
      row.getCell(4).numFmt = '0';
      row.alignment = { vertical: 'top', wrapText: true };
    }
    this.estilizarTituloYEncabezado(lista, 10, 4);
    lista.columns = [{ width: 22 }, { width: 64 }, { width: 34 }, { width: 14 }];
    lista.views = [{ state: 'frozen', ySplit: 10 }];
    lista.autoFilter = { from: 'A10', to: 'D10' };

    if (incluirAnalisisOperativo) {
      this.agregarAnalisisOperativo(workbook, contexto, exportables, generadoEn, clues);
    }

    const contenido = await workbook.xlsx.writeBuffer();
    return contenido as ArrayBuffer;
  }

  private agregarAnalisisOperativo(
    workbook: ExcelJS.Workbook,
    contexto: SolicitudV2Contexto,
    exportables: SolicitudV2Renglon[],
    generadoEn: Date,
    clues: string,
  ): void {
    const analisis = workbook.addWorksheet('Análisis operativo');
    analisis.addRow(['ANÁLISIS OPERATIVO · CPM INFORMATIVO']);
    analisis.addRow(['Generado', this.formatearFechaPacifico(generadoEn)]);
    analisis.addRow(['Unidad', contexto.unidad?.nombre || 'No especificada']);
    analisis.addRow(['CLUES', clues]);
    analisis.addRow(['Periodo', this.formatearPeriodo(contexto.periodo)]);
    analisis.addRow(['Nota', 'El CPM es informativo. Las existencias, sustitutos y factores de conversión no se incluyen porque el sandbox no dispone de un contrato GET que reproduzca de forma inequívoca el análisis operativo institucional.']);
    analisis.addRow([]);
    analisis.addRow(['No.', 'Clave', 'Descripción', 'Presentación', 'Necesidad', 'CPM unidad', 'Meses solicitados']);

    exportables.forEach((articulo, index) => {
      const row = analisis.addRow([
        index + 1,
        articulo.clave,
        articulo.descripcion ?? '',
        articulo.presentacion ?? '',
        articulo.cantidad,
        articulo.cpm,
        articulo.cpm > 0 && articulo.cantidad !== null ? articulo.cantidad / articulo.cpm : null,
      ]);
      row.getCell(2).numFmt = '@';
      row.getCell(5).numFmt = '0';
      row.getCell(6).numFmt = '0.00';
      row.getCell(7).numFmt = '0.00';
      row.alignment = { vertical: 'top', wrapText: true };
      row.getCell(1).alignment = { horizontal: 'right', vertical: 'top' };
      for (const columna of [5, 6, 7]) {
        row.getCell(columna).alignment = { horizontal: 'right', vertical: 'top' };
      }
      if (articulo.cpm <= 0) {
        row.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMARILLO_CPM } };
      }
    });
    this.estilizarTituloYEncabezado(analisis, 8, 7);
    analisis.mergeCells('B6:G6');
    analisis.getRow(6).height = 48;
    analisis.getRow(6).alignment = { vertical: 'middle', wrapText: true };
    analisis.getCell('A6').font = { bold: true, color: { argb: 'FF7A4E00' } };
    for (const celda of ['A6', 'B6']) {
      analisis.getCell(celda).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMARILLO_AVISO } };
    }
    analisis.getRow(8).height = 22;
    analisis.getRow(8).alignment = { vertical: 'middle' };
    analisis.columns = [
      { width: 8 }, { width: 22 }, { width: 60 },
      { width: 34 }, { width: 14 }, { width: 14 }, { width: 18 },
    ];
    analisis.views = [{ state: 'frozen', ySplit: 8 }];
    analisis.autoFilter = { from: 'A8', to: 'G8' };
    analisis.properties.defaultRowHeight = 18;
    analisis.getColumn(3).alignment = { wrapText: true, vertical: 'top' };
    analisis.getColumn(4).alignment = { wrapText: true, vertical: 'top' };
    analisis.eachRow({ includeEmpty: false }, row => {
      if (row.number < 8) return;
      row.eachCell({ includeEmpty: true }, cell => {
        cell.border = {
          bottom: { style: 'hair', color: { argb: 'FFD9E2DE' } },
          right: { style: 'hair', color: { argb: 'FFD9E2DE' } },
        };
      });
    });

  }

  descargar(buffer: ArrayBuffer, contexto: SolicitudV2Contexto, tipo: 'USUARIO' | 'INTERNO'): void {
    const clues = contexto.unidad?.cluesimb || contexto.unidad?.cluessa || 'SIN-CLUES';
    const identificador = `${clues}-${contexto.periodo}`.replace(/[^A-Z0-9_-]/gi, '_');
    const blob = new Blob([buffer], { type: XLSX_MIME });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = tipo === 'USUARIO'
      ? `Necesidades-SANDBOX-V2-${identificador}.xlsx`
      : `Necesidades-INTERNO-SANDBOX-V2-${identificador}.xlsx`;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  private estilizarTituloYEncabezado(
    hoja: ExcelJS.Worksheet,
    filaEncabezado: number,
    columnas: number,
  ): void {
    hoja.mergeCells(1, 1, 1, columnas);
    hoja.getRow(1).font = { bold: true, size: 14, color: { argb: VERDE_INSTITUCIONAL } };
    hoja.getRow(filaEncabezado).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hoja.getRow(filaEncabezado).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: VERDE_INSTITUCIONAL },
    };
  }

  private formatearPeriodo(periodo: string): string {
    const [anio, mes] = periodo.split('-');
    const indice = Number(mes) - 1;
    if (!anio || indice < 0 || indice > 11) return periodo || 'No especificado';
    const nombreMes = new Intl.DateTimeFormat('es-MX', { month: 'long', timeZone: 'UTC' })
      .format(new Date(Date.UTC(Number(anio), indice, 1)));
    return `${nombreMes.charAt(0).toUpperCase()}${nombreMes.slice(1)} ${anio}`;
  }

  private formatearFechaPacifico(fecha: Date): string {
    return `${new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Tijuana',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).format(fecha)} (hora del Pacífico)`;
  }
}
