import { TestBed } from '@angular/core/testing';
import JSZip from 'jszip';
import { RhAsistenciaCalendarService } from './rh-asistencia-calendar.service';
import {
  RH_ASISTENCIA_TEMPLATE_PATH,
  RhAsistenciaDocxService,
} from './rh-asistencia-docx.service';
import { RH_ASISTENCIA_DEFAULT_PLACEHOLDERS } from './rh-asistencia-holidays.data';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function getDirectChildrenByTagName(parent: Element, localName: string): Element[] {
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

function readCellConcatenatedText(cellEl: Element): string {
  const nodes = cellEl.getElementsByTagNameNS(W_NS, 't');
  const parts: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    parts.push(nodes[i].textContent ?? '');
  }
  return parts.join('');
}

describe('RhAsistenciaCalendarService & RhAsistenciaDocxService (Microintervención RH-3A.1 · Mi lista de asistencia)', () => {
  let calendarService: RhAsistenciaCalendarService;
  let docxService: RhAsistenciaDocxService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [RhAsistenciaCalendarService, RhAsistenciaDocxService],
    });
    calendarService = TestBed.inject(RhAsistenciaCalendarService);
    docxService = TestBed.inject(RhAsistenciaDocxService);
    docxService.setTemplateBufferForTesting(null);
  });

  // =========================================================================
  // 1. REGLAS DE CALENDARIO, BISIESTOS, INHÁBILES Y CIRCULAR 2026 / PROYECCIÓN 2027
  // =========================================================================

  it('1. Calcula meses de 28, 29, 30 y 31 días y detecta años bisiestos correctamente', () => {
    expect(calendarService.isLeapYear(2024)).toBeTrue();
    expect(calendarService.isLeapYear(2026)).toBeFalse();
    expect(calendarService.isLeapYear(2028)).toBeTrue();

    const feb2026 = calendarService.buildMonthCalendar(2026, 2);
    expect(feb2026.daysInMonth).toBe(28);
    expect(feb2026.isLeapYear).toBeFalse();
    expect(feb2026.monthName).toBe('FEBRERO');

    const feb2028 = calendarService.buildMonthCalendar(2028, 2);
    expect(feb2028.daysInMonth).toBe(29);
    expect(feb2028.isLeapYear).toBeTrue();

    const abr2026 = calendarService.buildMonthCalendar(2026, 4);
    expect(abr2026.daysInMonth).toBe(30);
    expect(abr2026.monthName).toBe('ABRIL');

    const mar2026 = calendarService.buildMonthCalendar(2026, 3);
    expect(mar2026.daysInMonth).toBe(31);
    expect(mar2026.monthName).toBe('MARZO');
  });

  it('2. Aplica las reglas de la Circular IB-UAF-CRH-0003-2026 (festivos fijos, lunes ordinales y exclusión del 5 de mayo del sombreado general)', () => {
    // Enero 2026: 1 de enero (Año Nuevo)
    const ene2026 = calendarService.buildMonthCalendar(2026, 1);
    expect(ene2026.hasConfirmedInstitutionalCalendar).toBeTrue();
    expect(ene2026.days.find((d) => d.day === 1)?.isHoliday).toBeTrue();
    expect(ene2026.days.find((d) => d.day === 1)?.isShaded).toBeTrue();

    // Febrero 2026: primer lunes (2 de febrero)
    const feb2026 = calendarService.buildMonthCalendar(2026, 2);
    expect(feb2026.days.find((d) => d.day === 2)?.isHoliday).toBeTrue();
    expect(feb2026.days.find((d) => d.day === 2)?.holidayName).toContain('Constitución');

    // Marzo 2026: tercer lunes (16 de marzo)
    const mar2026 = calendarService.buildMonthCalendar(2026, 3);
    expect(mar2026.days.find((d) => d.day === 16)?.isHoliday).toBeTrue();
    expect(mar2026.days.find((d) => d.day === 16)?.holidayName).toContain('Benito Juárez');

    // Mayo 2026: 1 de mayo se sombrea; 5 de mayo (additional) NO se sombrea de forma general
    const may2026 = calendarService.buildMonthCalendar(2026, 5);
    expect(may2026.days.find((d) => d.day === 1)?.isHoliday).toBeTrue();
    expect(may2026.days.find((d) => d.day === 1)?.isShaded).toBeTrue();
    expect(may2026.days.find((d) => d.day === 5)?.isHoliday).toBeFalse();
    expect(may2026.days.find((d) => d.day === 5)?.isShaded).toBeFalse();

    // Septiembre 2026: 16 de septiembre
    const sep2026 = calendarService.buildMonthCalendar(2026, 9);
    expect(sep2026.days.find((d) => d.day === 16)?.isHoliday).toBeTrue();

    // Noviembre 2026: tercer lunes (16 de noviembre)
    const nov2026 = calendarService.buildMonthCalendar(2026, 11);
    expect(nov2026.days.find((d) => d.day === 16)?.isHoliday).toBeTrue();

    // Diciembre 2026: 25 de diciembre
    const dic2026 = calendarService.buildMonthCalendar(2026, 12);
    expect(dic2026.days.find((d) => d.day === 25)?.isHoliday).toBeTrue();
  });

  it('3. Marca el calendario 2027 como no confirmado (proyección del criterio 2026) y calcula correctamente el inicio de la segunda sección', () => {
    const feb2027 = calendarService.buildMonthCalendar(2027, 2);
    expect(feb2027.hasConfirmedInstitutionalCalendar).toBeFalse();
    // Primer lunes de febrero 2027 es el día 1
    expect(feb2027.days.find((d) => d.day === 1)?.isHoliday).toBeTrue();

    // En enero 2026 el día 16 cae en viernes -> la segunda sección inicia el lunes 19
    expect(calendarService.buildMonthCalendar(2026, 1).secondSectionStartDay).toBe(19);
    // En marzo 2026 el día 16 cae en lunes -> la segunda sección inicia el mismo día 16
    expect(calendarService.buildMonthCalendar(2026, 3).secondSectionStartDay).toBe(16);
  });

  // =========================================================================
  // 2. GENERACIÓN DOCUMENTAL WORD (.docx), SUSTITUCIÓN DE PARÁMETROS Y CONSERVACIÓN DE MEMBRETE
  // =========================================================================

  it('4. Normaliza nombres de archivo y valida parámetros obligatorios en resolveGenerateOptions', () => {
    const normalized = docxService.normalizeFileNamePart(
      '  Trabajadora Institucional: Área / Consulta? * '.repeat(4)
    );
    expect(normalized.length).toBeLessThanOrEqual(80);
    expect(normalized).not.toMatch(/[<>:\"/\\|?*]/);
    expect(normalized).toContain('Trabajadora_Institucional');

    expect(() =>
      docxService.resolveGenerateOptions({
        nombre: '   ',
        puesto: 'Puesto Demo Institucional',
        mes: 3,
        anio: 2026,
      })
    ).toThrowError(/nombre completo/i);

    expect(() =>
      docxService.resolveGenerateOptions({
        nombre: 'Persona Trabajadora Ejemplo',
        puesto: '   ',
        mes: 3,
        anio: 2026,
      })
    ).toThrowError(/puesto o área/i);

    // Cuando adscripcion, jornada y horario se omiten, aplica los valores institucionales por defecto
    const resolvedDefaults = docxService.resolveGenerateOptions({
      nombre: 'Persona Trabajadora Ejemplo',
      puesto: 'Analista de Recursos Humanos',
      mes: 3,
      anio: 2026,
    });
    expect(resolvedDefaults.placeholders.jornada).toBe(
      RH_ASISTENCIA_DEFAULT_PLACEHOLDERS.jornada
    );
    expect(resolvedDefaults.placeholders.horario).toBe(
      RH_ASISTENCIA_DEFAULT_PLACEHOLDERS.horario
    );
    expect(resolvedDefaults.placeholders.adscripcion).toBe(
      RH_ASISTENCIA_DEFAULT_PLACEHOLDERS.adscripcion
    );
  });

  for (const [anio, mes, dias, vacaciones] of [
    [2026, 2, 28, [1, 28]],
    [2028, 2, 29, [1, 29]],
    [2026, 4, 30, [1, 30]],
    [2026, 7, 31, [7, 8, 9, 11, 31]],
  ] as const) {
    it(`escribe vacaciones solo en Observaciones de ${anio}-${mes} y preserva el XML restante`, async () => {
      const params = { nombre: 'PERSONA SINTÉTICA', puesto: 'Puesto sintético', anio, mes };
      const formato = (dia: number) => `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      const leerXml = async (blob: Blob) => {
        const zip = await JSZip.loadAsync(await blob.arrayBuffer());
        return new DOMParser().parseFromString(await zip.file('word/document.xml')!.async('string'), 'application/xml');
      };
      const base = await leerXml(await docxService.generateAttendanceDocxFromParams(params));
      const conVacaciones = await leerXml(await docxService.generateAttendanceDocxFromParams({
        ...params,
        observacionesPorFecha: {
          ...Object.fromEntries(vacaciones.map((dia) => [formato(dia), 'Vacaciones'])),
          [formato(dias + 1)]: 'Fuera de rango',
          '2025-12-01': 'Otro mes',
        },
      }));
      const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const tabla = conVacaciones.getElementsByTagNameNS(ns, 'tbl')[1];
      const filas = Array.from(tabla.children).filter((el) => el.localName === 'tr');
      expect(filas.length).toBe(dias + 2);
      const marcados: number[] = [];
      for (const fila of filas) {
        const celdas = Array.from(fila.children).filter((el) => el.localName === 'tc');
        const texto = celdas[5].getElementsByTagNameNS(ns, 't')[0];
        if (texto?.textContent === 'Vacaciones') {
          marcados.push(Number(celdas[0].textContent?.trim()));
          texto.textContent = '\u00A0';
        }
      }
      expect(marcados).toEqual([...vacaciones]);
      const serializador = new XMLSerializer();
      expect(serializador.serializeToString(conVacaciones)).toBe(serializador.serializeToString(base));
    });
  }

  it('5. Carga la plantilla institucional real (.docx), sustituye nombre, puesto, adscripción, jornada, horario, mes y año, recorta días en febrero, aplica sombreado y conserva los membretes oficiales', async () => {
    expect(RH_ASISTENCIA_TEMPLATE_PATH).toBe('/rh/asistencia/template-membretado-2026.docx');

    const datos = {
      nombre: 'maría josé muñoz peña',
      puesto: 'médico especialista',
      adscripcion: 'coordinación de atención',
      jornada: 'jornada acumulada',
      horario: '07:00 – 19:00 hrs',
      mes: 2,
      anio: 2026,
      observacionesPorFecha: Object.freeze({ '2026-02-03': 'Vacaciones' }),
    };
    const opciones = docxService.resolveGenerateOptions(Object.freeze(datos));
    const encabezadoOriginal = { ...opciones.placeholders };
    const blob = await docxService.generateAttendanceDocx(opciones);
    expect(opciones.placeholders).toEqual(encabezadoOriginal);
    expect(datos.nombre).toBe('maría josé muñoz peña');

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    expect(blob.size).toBeGreaterThan(100000);

    // Abrir el DOCX generado con JSZip para comprobar su validez OpenXML, membretes y tablas
    const generatedBuffer = await blob.arrayBuffer();
    const generatedZip = await JSZip.loadAsync(generatedBuffer);

    // Verificar conservación de encabezado, pie y medios del membrete oficial
    expect(generatedZip.file('[Content_Types].xml')).not.toBeNull();
    expect(generatedZip.file('word/document.xml')).not.toBeNull();
    const mediaFiles = Object.keys(generatedZip.files).filter((k) =>
      k.startsWith('word/media/')
    );
    expect(mediaFiles.length).toBeGreaterThan(0);

    const xmlStr = await generatedZip.file('word/document.xml')!.async('string');
    const xmlDoc = new DOMParser().parseFromString(xmlStr, 'application/xml');
    expect(xmlDoc.getElementsByTagName('parsererror').length).toBe(0);

    const tables = xmlDoc.getElementsByTagNameNS(W_NS, 'tbl');
    expect(tables.length).toBeGreaterThanOrEqual(2);

    // Tabla 0: Metadatos (Nombre, Mes, Año, Puesto, Jornada, Horario, Adscripción)
    const metaRows = getDirectChildrenByTagName(tables[0], 'tr');
    const row0Cells = getDirectChildrenByTagName(metaRows[0], 'tc');
    expect(readCellConcatenatedText(row0Cells[1])).toBe(
      'MARÍA JOSÉ MUÑOZ PEÑA'
    );
    expect(readCellConcatenatedText(row0Cells[3])).toBe('FEBRERO');
    expect(readCellConcatenatedText(row0Cells[5])).toBe('2026');

    const row1Cells = getDirectChildrenByTagName(metaRows[1], 'tc');
    expect(readCellConcatenatedText(row1Cells[1])).toBe('MÉDICO ESPECIALISTA');

    // Verificar que los dos párrafos con texto de row1Cells[3] contienen Jornada y Horario separados sin perder la estructura
    const row1Cell3Paragraphs = getDirectChildrenByTagName(row1Cells[3], 'p').filter(
      (p) => p.getElementsByTagNameNS(W_NS, 't').length > 0
    );
    expect(row1Cell3Paragraphs.length).toBe(2);
    expect(readCellConcatenatedText(row1Cell3Paragraphs[0])).toBe('JORNADA ACUMULADA');
    expect(readCellConcatenatedText(row1Cell3Paragraphs[1])).toBe('07:00 – 19:00 HRS');

    const row2Cells = getDirectChildrenByTagName(metaRows[2], 'tc');
    expect(readCellConcatenatedText(row2Cells[1])).toBe(
      'COORDINACIÓN DE ATENCIÓN'
    );

    // Tabla 1: Días del mes (Febrero 2026 = 28 días + 2 filas de encabezado = 30 filas totales)
    const daysRows = getDirectChildrenByTagName(tables[1], 'tr');
    expect(daysRows.length).toBe(30);

    // Día 1 de febrero de 2026 es domingo (inhábil -> sombreado A6A6A6)
    // Día 2 de febrero de 2026 es primer lunes (Constitución -> sombreado A6A6A6)
    // Día 3 de febrero de 2026 es martes hábil (sin sombreado)
    const day1Row = daysRows[1];
    const day2Row = daysRows[2];
    const day3Row = daysRows[3];
    expect(readCellConcatenatedText(getDirectChildrenByTagName(day3Row, 'tc')[5])).toBe('Vacaciones');

    const day1Shd = getDirectChildrenByTagName(day1Row, 'tc')[0].getElementsByTagNameNS(
      W_NS,
      'shd'
    )[0];
    expect(day1Shd?.getAttributeNS(W_NS, 'fill')).toBe('A6A6A6');

    const day2Shd = getDirectChildrenByTagName(day2Row, 'tc')[0].getElementsByTagNameNS(
      W_NS,
      'shd'
    )[0];
    expect(day2Shd?.getAttributeNS(W_NS, 'fill')).toBe('A6A6A6');

    const day3Shd = getDirectChildrenByTagName(day3Row, 'tc')[0].getElementsByTagNameNS(
      W_NS,
      'shd'
    )[0];
    expect(day3Shd).toBeUndefined();
  });
});
