import * as ExcelJS from 'exceljs';
import type { SolicitudV2AnalisisOperativo, SolicitudV2Contexto, SolicitudV2Renglon } from './solicitudes-v2.model';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const VERDE = 'FF006B5F';
const AMARILLO = 'FFFFF2CC';
const AMARILLO_CPM = 'FFFFFF99';
const ROJO_FALTANTE = 'FFFFC7CE';

type FilaAnalisis = {
  numero: string | number; clave: string; descripcion: string; presentacion: string;
  cantidad: number; cpm: number; existenciaAzm: number; existenciaAzt: number; existenciaAze: number;
  origen: string; referencia: string; contexto: string; esPropuesta: boolean;
};

export class SolicitudesV2ExcelService {
  generarExcelUsuario(contexto: SolicitudV2Contexto, articulos: SolicitudV2Renglon[]): Promise<ArrayBuffer> {
    return this.generarBuffer(contexto, articulos, null);
  }

  generarExcelOperativo(contexto: SolicitudV2Contexto, articulos: SolicitudV2Renglon[], analisis: SolicitudV2AnalisisOperativo): Promise<ArrayBuffer> {
    return this.generarBuffer(contexto, articulos, analisis);
  }

  private async generarBuffer(contexto: SolicitudV2Contexto, articulos: SolicitudV2Renglon[], analisis: SolicitudV2AnalisisOperativo | null): Promise<ArrayBuffer> {
    const exportables = articulos.filter(item => item.cantidad !== null && item.cantidad > 0);
    if (!exportables.length) throw new Error('No hay cantidades positivas para preparar.');
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
    exportables.forEach(item => {
      const row = lista.addRow([item.clave, item.descripcion ?? '', item.presentacion ?? '', item.cantidad]);
      row.getCell(1).numFmt = '@'; row.getCell(4).numFmt = '0';
      row.alignment = { vertical: 'top', wrapText: true };
    });
    this.estilizarTituloYEncabezado(lista, 10, 4);
    lista.columns = [{ width: 22 }, { width: 64 }, { width: 34 }, { width: 14 }];
    lista.views = [{ state: 'frozen', ySplit: 10 }];
    lista.autoFilter = { from: 'A10', to: 'D10' };
    if (analisis) this.agregarAnalisisOperativo(workbook, exportables, generadoEn, analisis);
    return await workbook.xlsx.writeBuffer() as ArrayBuffer;
  }

  private agregarAnalisisOperativo(workbook: ExcelJS.Workbook, exportables: SolicitudV2Renglon[], generadoEn: Date, datos: SolicitudV2AnalisisOperativo): void {
    const hoja = workbook.addWorksheet('Análisis operativo');
    const filas = this.construirFilasAnalisis(exportables, datos);
    hoja.addRow(['ANÁLISIS OPERATIVO · CPM Y EXISTENCIAS EN ALMACENES']);
    hoja.addRow(['Generado', this.formatearFechaPacifico(generadoEn)]);
    hoja.addRow(['Jurisdicción', datos.jurisdiccion ?? 'No identificada']);
    hoja.addRow(['Snapshot', datos.snapshotExistencias ? this.formatearFechaPacifico(new Date(datos.snapshotExistencias)) : 'Sin snapshot disponible']);
    hoja.addRow(['Nota', 'La información de existencias, consumo y propuestas de sustitución es de apoyo para análisis operativo y corresponde a las fuentes, factores y fechas disponibles. Las propuestas no forman parte de la captura original, no confirman disponibilidad para surtimiento ni constituyen autorización de entrega o traslado.']);
    hoja.addRow([]);
    hoja.addRow(['No.', 'Clave', 'Descripción', 'Presentación', 'Necesidad', 'CPM unidad', 'Meses solicitados', 'AZM', 'AZT', 'AZE', 'Total almacenes', 'Faltante local referencial', 'Origen de captura', 'Referencia', 'Contexto']);

    filas.forEach(fila => {
      const total = fila.existenciaAzm + fila.existenciaAzt + fila.existenciaAze;
      const faltante = Math.max(fila.cantidad - this.existenciaLocal(fila, datos.jurisdiccion), 0);
      const row = hoja.addRow([fila.numero, fila.clave, fila.descripcion, fila.presentacion, fila.cantidad, fila.cpm,
        fila.cpm > 0 ? fila.cantidad / fila.cpm : null, fila.existenciaAzm, fila.existenciaAzt,
        fila.existenciaAze, total, faltante, fila.origen, fila.referencia, fila.contexto]);
      row.getCell(2).numFmt = '@';
      for (const columna of [5, 8, 9, 10, 11, 12]) row.getCell(columna).numFmt = '0';
      row.getCell(6).numFmt = '0.00'; row.getCell(7).numFmt = '0.00';
      row.alignment = { vertical: 'top', wrapText: true };
      for (const columna of [1, 5, 6, 7, 8, 9, 10, 11, 12]) row.getCell(columna).alignment = { horizontal: 'right', vertical: 'top' };
      if (fila.cpm <= 0) row.getCell(6).fill = this.relleno(AMARILLO_CPM);
      if (faltante > 0) row.getCell(12).fill = this.relleno(ROJO_FALTANTE);
      if (fila.esPropuesta) row.eachCell({ includeEmpty: true }, cell => { cell.fill = this.relleno(AMARILLO); });
    });

    this.estilizarTituloYEncabezado(hoja, 7, 15);
    hoja.mergeCells('B5:O5'); hoja.getRow(5).height = 48;
    hoja.getRow(5).alignment = { vertical: 'middle', wrapText: true };
    hoja.getCell('A5').font = { bold: true, color: { argb: 'FF7A4E00' } };
    hoja.getCell('A5').fill = this.relleno(AMARILLO); hoja.getCell('B5').fill = this.relleno(AMARILLO);
    hoja.getRow(7).height = 22;
    hoja.columns = [{ width: 8 }, { width: 22 }, { width: 60 }, { width: 34 }, { width: 14 }, { width: 14 },
      { width: 18 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 18 }, { width: 24 },
      { width: 24 }, { width: 28 }, { width: 42 }];
    hoja.views = [{ state: 'frozen', ySplit: 7 }];
    hoja.autoFilter = { from: 'A7', to: 'O7' };
    hoja.properties.defaultRowHeight = 18;
    hoja.eachRow({ includeEmpty: false }, row => {
      if (row.number < 7) return;
      row.eachCell({ includeEmpty: true }, cell => { cell.border = {
        bottom: { style: 'hair', color: { argb: 'FFD9E2DE' } },
        right: { style: 'hair', color: { argb: 'FFD9E2DE' } },
      }; });
    });
  }

  private construirFilasAnalisis(exportables: SolicitudV2Renglon[], datos: SolicitudV2AnalisisOperativo): FilaAnalisis[] {
    const detalle = new Map(datos.data.map(item => [this.normalizarClave(item.clave), item]));
    if (detalle.size !== exportables.length) throw new Error('El análisis operativo está incompleto.');
    const filas: FilaAnalisis[] = exportables.map((item, index) => {
      const info = detalle.get(this.normalizarClave(item.clave));
      if (!info) throw new Error(`No se obtuvo análisis para ${item.clave}.`);
      return { numero: index + 1, clave: item.clave, descripcion: item.descripcion ?? '', presentacion: item.presentacion ?? '',
        cantidad: item.cantidad ?? 0, cpm: info.cpm, existenciaAzm: info.existenciaAzm,
        existenciaAzt: info.existenciaAzt, existenciaAze: info.existenciaAze,
        origen: 'Universo hospitalario', referencia: '', contexto: 'Seleccionada en Solicitudes V2', esPropuesta: false };
    });
    const directas = new Map(filas.map(fila => [this.normalizarClave(fila.clave), fila]));
    const propuestas: Array<{ despuesDe: FilaAnalisis; fila: FilaAnalisis }> = [];
    exportables.forEach((item, index) => {
      const info = detalle.get(this.normalizarClave(item.clave));
      const alternativa = info?.alternativa;
      const directa = filas[index];
      if (!info || !alternativa) return;
      const faltante = Math.max(directa.cantidad - this.existenciaLocal(directa, datos.jurisdiccion), 0);
      if (faltante <= 0) return;
      const cantidadSustituta = Math.ceil((faltante * alternativa.factor) - Number.EPSILON);
      const referencia = `Sustituta de ${item.clave} · factor ${alternativa.factor}`;
      const existente = directas.get(this.normalizarClave(alternativa.clave));
      if (existente) {
        existente.cantidad += cantidadSustituta; existente.origen += ' / Propuesta de sustitución';
        existente.referencia = [existente.referencia, referencia].filter(Boolean).join(' / ');
        existente.contexto += `. Faltante directo ${faltante} piezas de ${item.clave}.`;
        return;
      }
      const propuesta: FilaAnalisis = { numero: `${index + 1}.1`, clave: alternativa.clave,
        descripcion: alternativa.descripcion ?? '', presentacion: alternativa.presentacion ?? '', cantidad: cantidadSustituta,
        cpm: alternativa.cpm, existenciaAzm: alternativa.existenciaAzm, existenciaAzt: alternativa.existenciaAzt,
        existenciaAze: alternativa.existenciaAze, origen: 'Propuesta de sustitución', referencia,
        contexto: `Faltante directo ${faltante} piezas de ${item.clave}.`, esPropuesta: true };
      directas.set(this.normalizarClave(propuesta.clave), propuesta);
      propuestas.push({ despuesDe: directa, fila: propuesta });
    });
    propuestas.forEach(({ despuesDe, fila }) => filas.splice(filas.indexOf(despuesDe) + 1, 0, fila));
    return filas;
  }

  private existenciaLocal(fila: Pick<FilaAnalisis, 'existenciaAzm' | 'existenciaAzt' | 'existenciaAze'>, jurisdiccion: SolicitudV2AnalisisOperativo['jurisdiccion']): number {
    if (jurisdiccion === 'MEXICALI') return fila.existenciaAzm;
    if (jurisdiccion === 'TIJUANA') return fila.existenciaAzt;
    if (jurisdiccion === 'ENSENADA') return fila.existenciaAze;
    return fila.existenciaAzm + fila.existenciaAzt + fila.existenciaAze;
  }

  descargar(buffer: ArrayBuffer, contexto: SolicitudV2Contexto, tipo: 'USUARIO' | 'INTERNO'): void {
    const clues = contexto.unidad?.cluesimb || contexto.unidad?.cluessa || 'SIN-CLUES';
    const identificador = `${clues}-${contexto.periodo}`.replace(/[^A-Z0-9_-]/gi, '_');
    const url = URL.createObjectURL(new Blob([buffer], { type: XLSX_MIME }));
    const enlace = document.createElement('a'); enlace.href = url;
    enlace.download = tipo === 'USUARIO' ? `Necesidades-SANDBOX-V2-${identificador}.xlsx` : `Necesidades-INTERNO-SANDBOX-V2-${identificador}.xlsx`;
    enlace.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  private estilizarTituloYEncabezado(hoja: ExcelJS.Worksheet, fila: number, columnas: number): void {
    hoja.mergeCells(1, 1, 1, columnas); hoja.getRow(1).font = { bold: true, size: 14, color: { argb: VERDE } };
    hoja.getRow(fila).font = { bold: true, color: { argb: 'FFFFFFFF' } }; hoja.getRow(fila).fill = this.relleno(VERDE);
  }

  private relleno(argb: string): ExcelJS.Fill { return { type: 'pattern', pattern: 'solid', fgColor: { argb } }; }
  private normalizarClave(clave: string): string { return clave.trim().toUpperCase(); }

  private formatearPeriodo(periodo: string): string {
    const [anio, mes] = periodo.split('-'); const indice = Number(mes) - 1;
    if (!anio || indice < 0 || indice > 11) return periodo || 'No especificado';
    const nombre = new Intl.DateTimeFormat('es-MX', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(anio), indice, 1)));
    return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${anio}`;
  }

  private formatearFechaPacifico(fecha: Date): string {
    return `${new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Tijuana', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(fecha)} (hora del Pacífico)`;
  }
}
