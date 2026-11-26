import { inject, Injectable } from '@angular/core';
import JSZip from 'jszip';
import { RhAsistenciaCalendarService } from './rh-asistencia-calendar.service';
import { RH_ASISTENCIA_DEFAULT_PLACEHOLDERS } from './rh-asistencia-holidays.data';
import {
  RhAsistenciaDocumentPlaceholders,
  RhAsistenciaGenerateParams,
  RhAsistenciaMonthCalendarSummary,
} from './rh-asistencia.models';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const SHADED_DAY_HEX = 'A6A6A6'; // Gris institucional para sábados, domingos y descansos generales
export const RH_ASISTENCIA_TEMPLATE_PATH = '/rh/asistencia/template-membretado-2026.docx';

export interface RhAsistenciaDocxGenerateOptions {
  observacionesPorFecha?: RhAsistenciaGenerateParams['observacionesPorFecha'];
  calendar: RhAsistenciaMonthCalendarSummary;
  placeholders: RhAsistenciaDocumentPlaceholders;
}

@Injectable({
  providedIn: 'root',
})
export class RhAsistenciaDocxService {
  private readonly calendarService = inject(RhAsistenciaCalendarService);
  private templateBufferCache: ArrayBuffer | null = null;

  /**
   * Construye las opciones completas (`calendar` y `placeholders`) a partir de los
   * parámetros recibidos (`nombre`, `puesto`, `adscripcion`, `jornada`, `horario`, `mes`, `anio`).
   * Aplica valores institucionales por defecto cuando `adscripcion`, `jornada` u `horario`
   * no son especificados o vienen vacíos.
   */
  resolveGenerateOptions(params: RhAsistenciaGenerateParams): RhAsistenciaDocxGenerateOptions {
    const nombre = (params.nombre ?? '').trim();
    const puesto = (params.puesto ?? '').trim();

    if (!nombre) {
      throw new Error('El nombre completo del trabajador es obligatorio para generar la lista de asistencia.');
    }

    if (!puesto) {
      throw new Error('El puesto o área es obligatorio para generar la lista de asistencia.');
    }

    const anio = Number(params.anio);
    const mes = Number(params.mes);

    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
      throw new Error('El año seleccionado para la lista de asistencia no es válido.');
    }

    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      throw new Error('El mes seleccionado para la lista de asistencia debe estar entre 1 y 12.');
    }

    const calendar = this.calendarService.buildMonthCalendar(anio, mes);

    const jornada =
      typeof params.jornada === 'string' && params.jornada.trim().length > 0
        ? params.jornada.trim()
        : RH_ASISTENCIA_DEFAULT_PLACEHOLDERS.jornada;

    const horario =
      typeof params.horario === 'string' && params.horario.trim().length > 0
        ? params.horario.trim()
        : RH_ASISTENCIA_DEFAULT_PLACEHOLDERS.horario;

    const adscripcion =
      typeof params.adscripcion === 'string' && params.adscripcion.trim().length > 0
        ? params.adscripcion.trim()
        : RH_ASISTENCIA_DEFAULT_PLACEHOLDERS.adscripcion;

    const placeholders: RhAsistenciaDocumentPlaceholders = {
      nombre,
      puesto,
      mes: calendar.monthName,
      anio: String(calendar.year),
      jornada,
      horario,
      adscripcion,
    };

    return { calendar, placeholders, observacionesPorFecha: params.observacionesPorFecha };
  }

  /**
   * Permite inyectar o limpiar el buffer en caché (útil en pruebas unitarias o recarga).
   */
  setTemplateBufferForTesting(buffer: ArrayBuffer | null): void {
    this.templateBufferCache = buffer;
  }

  /**
   * Carga el archivo base `template-membretado-2026.docx` desde `public/rh/asistencia/`.
   */
  private async loadTemplateBuffer(): Promise<ArrayBuffer> {
    if (this.templateBufferCache) {
      return this.templateBufferCache;
    }

    const response = await fetch(RH_ASISTENCIA_TEMPLATE_PATH);
    if (!response.ok) {
      throw new Error(
        `No se encontró la plantilla institucional ${RH_ASISTENCIA_TEMPLATE_PATH} (HTTP ${response.status}). Solicita el archivo aprobado a Recursos Humanos.`
      );
    }

    this.templateBufferCache = await response.arrayBuffer();
    return this.templateBufferCache;
  }

  /**
   * Genera el archivo Word (`.docx`) recibiendo directamente los parámetros funcionales
   * (`nombre`, `puesto`, `adscripcion`, `jornada`, `horario`, `mes`, `anio`).
   */
  async generateAttendanceDocxFromParams(params: RhAsistenciaGenerateParams): Promise<Blob> {
    const options = this.resolveGenerateOptions(params);
    return await this.generateAttendanceDocx(options);
  }

  /**
   * Genera el archivo Word (`.docx`) modificado de acuerdo con el mes, año,
   * datos laborales, fines de semana y días de descanso general calculados.
   */
  async generateAttendanceDocx(options: RhAsistenciaDocxGenerateOptions): Promise<Blob> {
    const buffer = await this.loadTemplateBuffer();
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch {
      throw new Error('La plantilla institucional no es un archivo Word válido o está dañada.');
    }

    const docXmlFile = zip.file('word/document.xml');
    if (!docXmlFile) {
      throw new Error(
        'La plantilla institucional es incompatible: no contiene word/document.xml.'
      );
    }

    const docXmlStr = await docXmlFile.async('string');
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docXmlStr, 'application/xml');
    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
      throw new Error('La plantilla institucional es incompatible: document.xml no es válido.');
    }

    const tables = xmlDoc.getElementsByTagNameNS(W_NS, 'tbl');
    if (tables.length < 2) {
      throw new Error(
        'La plantilla institucional es incompatible: se esperaban las tablas de datos y calendario.'
      );
    }

    const metadataTable = tables[0];
    const daysTable = tables[1];

    // 1. Actualizar Tabla 0 (Datos de encabezado: Nombre, Puesto, Mes, Año, Jornada, Horario y Adscripción)
    this.updateMetadataTable(metadataTable, options.placeholders);

    // 2. Actualizar Tabla 1 (Filas de días 1..31, recortar meses cortos y sombrear inhábiles)
    this.updateDaysTable(xmlDoc, daysTable, options.calendar, options.observacionesPorFecha);

    const serializer = new XMLSerializer();
    const updatedDocXml = serializer.serializeToString(xmlDoc);
    zip.file('word/document.xml', updatedDocXml);

    return await zip.generateAsync({
      type: 'blob',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      compression: 'DEFLATE',
    });
  }

  /**
   * Construye el nombre de archivo normalizado para el documento `.docx`.
   */
  buildFileName(calendar: Pick<RhAsistenciaMonthCalendarSummary, 'year' | 'month'>, nombre: string): string {
    const workerName = this.normalizeFileNamePart(nombre);
    const month = String(calendar.month).padStart(2, '0');
    return `Lista_Asistencia_${calendar.year}-${month}_${workerName}.docx`;
  }

  /**
   * Descarga directamente el Blob `.docx` en el navegador del usuario a partir de parámetros.
   */
  async downloadAttendanceDocxFromParams(params: RhAsistenciaGenerateParams): Promise<string> {
    const options = this.resolveGenerateOptions(params);
    return await this.downloadAttendanceDocx(options);
  }

  /**
   * Descarga directamente el Blob `.docx` en el navegador del usuario.
   */
  async downloadAttendanceDocx(options: RhAsistenciaDocxGenerateOptions): Promise<string> {
    const blob = await this.generateAttendanceDocx(options);
    const fileName = this.buildFileName(options.calendar, options.placeholders.nombre);

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 3000);

    return fileName;
  }

  private updateMetadataTable(
    tableEl: Element,
    placeholders: RhAsistenciaDocumentPlaceholders
  ): void {
    const rows = this.getDirectChildrenByTagName(tableEl, 'tr');
    if (rows.length < 3) {
      throw new Error(
        'La plantilla institucional es incompatible: la tabla de datos no tiene las filas esperadas.'
      );
    }

    // Fila 0: [Nombre:, VALOR_NOMBRE, Mes:, VALOR_MES, Año:, VALOR_ANIO]
    const row0Cells = this.getDirectChildrenByTagName(rows[0], 'tc');
    if (row0Cells.length >= 6) {
      this.setCellText(row0Cells[1], placeholders.nombre);
      this.setCellText(row0Cells[3], placeholders.mes);
      this.setCellText(row0Cells[5], placeholders.anio);
    }

    // Fila 1: [Puesto:, VALOR_PUESTO, Jornada:/Horario:, VALOR_JORNADA / VALOR_HORARIO]
    const row1Cells = this.getDirectChildrenByTagName(rows[1], 'tc');
    if (row1Cells.length >= 2) {
      this.setCellText(row1Cells[1], placeholders.puesto);
    }
    if (row1Cells.length >= 4) {
      this.setJornadaHorarioCellText(
        row1Cells[3],
        placeholders.jornada,
        placeholders.horario
      );
    }

    // Fila 2: [Adscripción:, VALOR_ADSCRIPCION]
    const row2Cells = this.getDirectChildrenByTagName(rows[2], 'tc');
    if (row2Cells.length >= 2) {
      this.setCellText(row2Cells[1], placeholders.adscripcion);
    }
  }

  /**
   * Actualiza los valores de Jornada y Horario en la celda combinada (`row1Cells[3]`)
   * preservando intacta la estructura de párrafos (`w:p`) y propiedades (`w:pPr`/`w:rPr`)
   * de la plantilla original.
   */
  private setJornadaHorarioCellText(
    cellEl: Element,
    jornadaText: string,
    horarioText: string
  ): void {
    const paragraphsWithText = this.getDirectChildrenByTagName(cellEl, 'p').filter(
      (p) => p.getElementsByTagNameNS(W_NS, 't').length > 0
    );

    if (paragraphsWithText.length >= 2) {
      this.setCellText(paragraphsWithText[0], jornadaText);
      this.setCellText(paragraphsWithText[1], horarioText);
      for (let i = 2; i < paragraphsWithText.length; i++) {
        this.setCellText(paragraphsWithText[i], '');
      }
      return;
    }

    const textNodes = cellEl.getElementsByTagNameNS(W_NS, 't');
    if (textNodes.length >= 2) {
      textNodes[0].textContent = jornadaText;
      textNodes[1].textContent = horarioText;
      for (let i = 2; i < textNodes.length; i++) {
        textNodes[i].textContent = '';
      }
      return;
    }

    this.setCellText(cellEl, `${jornadaText} / ${horarioText}`);
  }

  private updateDaysTable(
    xmlDoc: Document,
    tableEl: Element,
    calendar: RhAsistenciaMonthCalendarSummary,
    observacionesPorFecha?: RhAsistenciaGenerateParams['observacionesPorFecha']
  ): void {
    const rows = this.getDirectChildrenByTagName(tableEl, 'tr');
    if (rows.length < 33) {
      throw new Error(
        'La plantilla institucional es incompatible: la tabla de calendario no contiene los días 1 a 31.'
      );
    }

    // La plantilla aporta dos encabezados y 31 filas de días. El segundo encabezado
    // se mueve al primer lunes a partir del día 16 para no dividir una semana.
    const secondHeaderRow = rows[16];
    const dayRows = [...rows.slice(1, 16), ...rows.slice(17, 33)];
    const secondSectionFirstRow = dayRows[calendar.secondSectionStartDay - 1];
    tableEl.insertBefore(secondHeaderRow, secondSectionFirstRow);

    const dayInfoByNumber = new Map(calendar.days.map((d) => [d.day, d]));

    for (let rowIndex = 0; rowIndex < dayRows.length; rowIndex++) {
      const dayNumber = rowIndex + 1;
      const rowEl = dayRows[rowIndex];

      // Si el día excede los días reales del mes (ej. 29, 30, 31 en febrero), eliminamos la fila
      if (dayNumber > calendar.daysInMonth) {
        tableEl.removeChild(rowEl);
        continue;
      }

      const dayInfo = dayInfoByNumber.get(dayNumber);
      if (!dayInfo) {
        continue;
      }

      const cells = this.getDirectChildrenByTagName(rowEl, 'tc');
      for (const cell of cells) {
        if (dayInfo.isShaded) {
          this.setCellShading(xmlDoc, cell, SHADED_DAY_HEX);
        } else {
          this.removeCellShading(cell);
        }
      }

      if (cells.length >= 6) {
        const fecha = `${calendar.year}-${String(calendar.month).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
        this.setCellText(cells[5], observacionesPorFecha?.[fecha] || '\u00A0');
      }
    }
  }

  private setCellShading(
    xmlDoc: Document,
    cellEl: Element,
    hexColor: string
  ): void {
    let tcPr = this.getDirectChildrenByTagName(cellEl, 'tcPr')[0];
    if (!tcPr) {
      tcPr = xmlDoc.createElementNS(W_NS, 'w:tcPr');
      cellEl.insertBefore(tcPr, cellEl.firstChild);
    }

    let shd = this.getDirectChildrenByTagName(tcPr, 'shd')[0];
    if (!shd) {
      shd = xmlDoc.createElementNS(W_NS, 'w:shd');
      // Insertar antes de w:vAlign o w:hideMark para respetar el orden del esquema OpenXML CT_TcPr
      const vAlign = this.getDirectChildrenByTagName(tcPr, 'vAlign')[0];
      const hideMark = this.getDirectChildrenByTagName(tcPr, 'hideMark')[0];
      const refNode = vAlign || hideMark || null;
      tcPr.insertBefore(shd, refNode);
    }

    shd.setAttributeNS(W_NS, 'w:val', 'clear');
    shd.setAttributeNS(W_NS, 'w:color', 'auto');
    shd.setAttributeNS(W_NS, 'w:fill', hexColor);
  }

  private removeCellShading(cellEl: Element): void {
    const tcPr = this.getDirectChildrenByTagName(cellEl, 'tcPr')[0];
    if (!tcPr) {
      return;
    }
    const shd = this.getDirectChildrenByTagName(tcPr, 'shd')[0];
    if (shd) {
      tcPr.removeChild(shd);
    }
  }

  private setCellText(cellEl: Element, newText: string): void {
    const textNodes = cellEl.getElementsByTagNameNS(W_NS, 't');
    if (textNodes.length > 0) {
      textNodes[0].textContent = newText;
      for (let i = 1; i < textNodes.length; i++) {
        textNodes[i].textContent = '';
      }
      return;
    }

    const xmlDoc = cellEl.ownerDocument;
    const paragraph = xmlDoc.createElementNS(W_NS, 'w:p');
    const run = xmlDoc.createElementNS(W_NS, 'w:r');
    const text = xmlDoc.createElementNS(W_NS, 'w:t');
    text.textContent = newText;
    run.appendChild(text);
    paragraph.appendChild(run);
    cellEl.appendChild(paragraph);
  }

  normalizeFileNamePart(value: string): string {
    return (
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[<>:\"/\\|?*\u0000-\u001F]/g, '')
        .trim()
        .replace(/[. ]+$/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 80) || 'Trabajador'
    );
  }

  private getDirectChildrenByTagName(
    parent: Element,
    localName: string
  ): Element[] {
    const result: Element[] = [];
    for (let i = 0; i < parent.childNodes.length; i++) {
      const node = parent.childNodes[i];
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        if (el.localName === localName) {
          result.push(el);
        }
      }
    }
    return result;
  }
}
