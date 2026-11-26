import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import {
  RhAsistenciaEstadoControl,
  RhPersonaAdminDto,
} from '../../../services/rh.service';

export type RhConciliacionIdentidadEstado =
  | 'COINCIDENCIA_SUGERIDA'
  | 'COINCIDENCIA_AMBIGUA'
  | 'SIN_COINCIDENCIA'
  | 'EXCLUIDA_RH'
  | 'CONFIRMADA_MANUAL';

export type RhConciliacionCeldaTipo = 'MARCA_X' | 'VACIO' | 'ANOTACION';

export interface RhConciliacionMesCelda {
  mes: number;
  mesNombre: string;
  colLetter: string;
  rawValue: string;
  tipo: RhConciliacionCeldaTipo;
  aprobado: boolean;
  estadoExistenteBd: RhAsistenciaEstadoControl | null;
  tieneConflictoBd: boolean;
  esDuplicadoExcel: boolean;
}

export interface RhConciliacionFilaExcel {
  rowKey: string;
  sheetName: string;
  rowNumber: number;
  bloque: 'ACTIVOS' | 'BAJAS';
  puesto: string;
  nombreOriginal: string;
  nombreNormalizado: string;
  esVacante: boolean;
  observacionBloqueBaja: string | null;
  meses: RhConciliacionMesCelda[];
  estadoIdentidad: RhConciliacionIdentidadEstado;
  candidatosSugeridos: RhPersonaAdminDto[];
  personaConfirmada: RhPersonaAdminDto | null;
  unidadMedicaId: number | null;
  notasRevision: string;
}

export interface RhConciliacionPreviewResumen {
  totalFilasLeidas: number;
  filasVacantesOmitidas: number;
  personasConciliadas: number;
  personasSugeridasSinConfirmar: number;
  personasAmbiguas: number;
  personasSinCoincidencia: number;
  personasExcluidas: number;
  candidatosRecepcionHistorica: number;
  registrosExcluidos: number;
  duplicadosDetectados: number;
  conflictosConBd: number;
  casosAclaracion: number;
}

export interface RhConciliacionExportPayload {
  version: 'RH-ASIS-05A-v1';
  anio: 2026;
  archivo_nombre: string;
  archivo_hash: string;
  exportado_en: string;
  filas: Array<{
    rowKey: string;
    sheetName: string;
    rowNumber: number;
    nombreOriginal: string;
    estadoIdentidad: RhConciliacionIdentidadEstado;
    personaIdConfirmado: number | null;
    unidadMedicaId: number | null;
    mesesAprobados: number[];
    notasRevision: string;
  }>;
}

const MESES_HEADERS: ReadonlyArray<{ mes: number; nombre: string }> = [
  { mes: 1, nombre: 'ENERO' },
  { mes: 2, nombre: 'FEBRERO' },
  { mes: 3, nombre: 'MARZO' },
  { mes: 4, nombre: 'ABRIL' },
  { mes: 5, nombre: 'MAYO' },
  { mes: 6, nombre: 'JUNIO' },
  { mes: 7, nombre: 'JULIO' },
  { mes: 8, nombre: 'AGOSTO' },
  { mes: 9, nombre: 'SEPTIEMBRE' },
  { mes: 10, nombre: 'OCTUBRE' },
  { mes: 11, nombre: 'NOVIEMBRE' },
  { mes: 12, nombre: 'DICIEMBRE' },
];

export function normalizeNameForMatch(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function colIndexToLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export const RH_COORDINACION_ESTATAL_UNIDAD_ID = 177;

export function buildPersonaNormalizedKeys(p: RhPersonaAdminDto): string[] {
  const keys: string[] = [];
  const apellidos = normalizeNameForMatch(p.apellidos);
  const nombres = normalizeNameForMatch(p.nombres);
  if (apellidos && nombres) {
    keys.push(`${apellidos} ${nombres}`);
  }
  const full = normalizeNameForMatch(p.nombre_completo);
  if (full && !keys.includes(full)) {
    keys.push(full);
  }
  return keys;
}

@Injectable({
  providedIn: 'root',
})
export class RhAsistenciaConciliacion2026Service {
  async computeFileHash(buffer: ArrayBuffer): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
    // Fallback determinístico ligero para entornos de prueba sin subtle
    const bytes = new Uint8Array(buffer);
    let h = 2166136261;
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 16777619);
    }
    return `fnv1a-${(h >>> 0).toString(16).padStart(8, '0')}`;
  }

  async parseXlsxFile(file: File): Promise<{
    sheetName: string;
    archivoHash: string;
    filas: RhConciliacionFilaExcel[];
  }> {
    const buffer = await file.arrayBuffer();
    const archivoHash = await this.computeFileHash(buffer);
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('El archivo Excel no contiene hojas legibles.');
    }
    const sheet = workbook.Sheets[firstSheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      blankrows: true,
    });
    const filas = this.parseExcelMatrix(matrix, firstSheetName);
    return { sheetName: firstSheetName, archivoHash, filas };
  }

  parseExcelMatrix(matrix: unknown[][], sheetName: string): RhConciliacionFilaExcel[] {
    if (!Array.isArray(matrix) || matrix.length < 2) {
      throw new Error('El archivo no tiene el formato esperado de CONTROL LISTA DE ASISTENCIA - 2026.');
    }

    let headerRowIdx = -1;
    let colPuesto = -1;
    let colNombre = -1;
    const mesColMap = new Map<number, number>();

    for (let r = 0; r < Math.min(matrix.length, 15); r++) {
      const row = matrix[r] ?? [];
      const normalizedCells = row.map((c) => normalizeNameForMatch(String(c ?? '')));
      const pIdx = normalizedCells.findIndex((c) => c === 'PUESTO');
      const nIdx = normalizedCells.findIndex((c) => c === 'NOMBRE');
      const eneIdx = normalizedCells.findIndex((c) => c === 'ENERO');
      if (pIdx >= 0 && nIdx >= 0 && eneIdx >= 0) {
        headerRowIdx = r;
        colPuesto = pIdx;
        colNombre = nIdx;
        for (const m of MESES_HEADERS) {
          const idx = normalizedCells.findIndex((c) => c === m.nombre);
          if (idx >= 0) {
            mesColMap.set(m.mes, idx);
          }
        }
        break;
      }
    }

    if (headerRowIdx < 0 || mesColMap.size < 6) {
      throw new Error(
        'Archivo incompatible: no se encontraron las columnas esperadas (PUESTO, NOMBRE y meses ENERO–DICIEMBRE).'
      );
    }

    const filas: RhConciliacionFilaExcel[] = [];
    let enBloqueBajas = false;

    for (let r = headerRowIdx + 1; r < matrix.length; r++) {
      const row = matrix[r] ?? [];
      const rawPuesto = String(row[colPuesto] ?? '').trim();
      const rawNombre = String(row[colNombre] ?? '').trim();
      const normPuesto = normalizeNameForMatch(rawPuesto);
      const normNombre = normalizeNameForMatch(rawNombre);

      if (normPuesto === 'BAJAS' && normNombre === 'NOMBRE') {
        enBloqueBajas = true;
        continue;
      }

      const hasAnyMonthValue = MESES_HEADERS.some((m) => {
        const cIdx = mesColMap.get(m.mes);
        return cIdx !== undefined && String(row[cIdx] ?? '').trim().length > 0;
      });

      if (!rawPuesto && !rawNombre && !hasAnyMonthValue) {
        continue; // Fila completamente vacía
      }

      const esVacante = normNombre === '' || normNombre === 'VACANTE';
      const rowNumber = r + 1;
      const meses: RhConciliacionMesCelda[] = MESES_HEADERS.map((m) => {
        const cIdx = mesColMap.get(m.mes);
        const rawVal = cIdx !== undefined ? String(row[cIdx] ?? '').trim() : '';
        const normVal = normalizeNameForMatch(rawVal);
        let tipo: RhConciliacionCeldaTipo = 'VACIO';
        if (normVal === 'X') {
          tipo = 'MARCA_X';
        } else if (rawVal.length > 0) {
          tipo = 'ANOTACION';
        }
        return {
          mes: m.mes,
          mesNombre: m.nombre,
          colLetter: cIdx !== undefined ? colIndexToLetter(cIdx) : '',
          rawValue: rawVal,
          tipo,
          aprobado: tipo === 'MARCA_X' && !esVacante && !enBloqueBajas,
          estadoExistenteBd: null,
          tieneConflictoBd: false,
          esDuplicadoExcel: false,
        };
      });

      const obsBaja = enBloqueBajas
        ? String(row[mesColMap.get(1) ?? colNombre + 1] ?? '').trim() || null
        : null;

      filas.push({
        rowKey: `${sheetName}!R${rowNumber}`,
        sheetName,
        rowNumber,
        bloque: enBloqueBajas ? 'BAJAS' : 'ACTIVOS',
        puesto: rawPuesto,
        nombreOriginal: rawNombre || '(Sin nombre)',
        nombreNormalizado: normNombre,
        esVacante,
        observacionBloqueBaja: obsBaja,
        meses,
        estadoIdentidad: esVacante ? 'EXCLUIDA_RH' : 'SIN_COINCIDENCIA',
        candidatosSugeridos: [],
        personaConfirmada: null,
        // Coordinación Estatal (177) como unidad inicial editable del lote histórico 2026 (nunca para vacantes/excluidas)
        unidadMedicaId: esVacante ? null : RH_COORDINACION_ESTATAL_UNIDAD_ID,
        notasRevision: esVacante ? 'Fila vacante o sin trabajador; omitida automáticamente.' : '',
      });
    }

    return filas;
  }

  matchRowAgainstPersonas(
    fila: RhConciliacionFilaExcel,
    personasCatalogo: RhPersonaAdminDto[]
  ): RhConciliacionFilaExcel {
    if (fila.esVacante || fila.estadoIdentidad === 'EXCLUIDA_RH' || fila.estadoIdentidad === 'CONFIRMADA_MANUAL') {
      return fila;
    }

    const target = fila.nombreNormalizado;
    if (!target) {
      return { ...fila, estadoIdentidad: 'SIN_COINCIDENCIA', candidatosSugeridos: [] };
    }

    // Priorizar coincidencia exacta por apellidos + nombres cuando el padrón los proporciona
    const exactMatches = personasCatalogo.filter((p) =>
      buildPersonaNormalizedKeys(p).includes(target)
    );

    if (exactMatches.length === 1) {
      return {
        ...fila,
        estadoIdentidad: 'COINCIDENCIA_SUGERIDA',
        candidatosSugeridos: exactMatches,
      };
    }

    if (exactMatches.length > 1) {
      return {
        ...fila,
        estadoIdentidad: 'COINCIDENCIA_AMBIGUA',
        candidatosSugeridos: exactMatches,
      };
    }

    // Búsqueda de candidatos por tokens (apellidos/nombres parciales) -> siempre ambigua, nunca autoseleccionada
    const tokens = target.split(' ').filter((t) => t.length >= 3);
    const partialMatches = personasCatalogo.filter((p) => {
      const pNorm = normalizeNameForMatch(p.nombre_completo);
      const matchedTokens = tokens.filter((t) => pNorm.includes(t));
      return matchedTokens.length >= Math.min(2, tokens.length);
    });

    if (partialMatches.length > 0) {
      return {
        ...fila,
        estadoIdentidad: 'COINCIDENCIA_AMBIGUA',
        candidatosSugeridos: partialMatches.slice(0, 10),
      };
    }

    return {
      ...fila,
      estadoIdentidad: 'SIN_COINCIDENCIA',
      candidatosSugeridos: [],
    };
  }

  recalculateConflictsAndDuplicates(
    filas: RhConciliacionFilaExcel[],
    existingByPersonaMes: Map<string, RhAsistenciaEstadoControl>
  ): RhConciliacionFilaExcel[] {
    const seenPersonaMes = new Map<string, number>();

    for (const f of filas) {
      if (f.estadoIdentidad !== 'CONFIRMADA_MANUAL' || !f.personaConfirmada) continue;
      for (const m of f.meses) {
        if (m.aprobado) {
          const key = `${f.personaConfirmada.persona_id}:${m.mes}`;
          seenPersonaMes.set(key, (seenPersonaMes.get(key) ?? 0) + 1);
        }
      }
    }

    return filas.map((f) => {
      const pid = f.personaConfirmada?.persona_id ?? null;
      const updatedMeses = f.meses.map((m) => {
        if (!pid) {
          return { ...m, estadoExistenteBd: null, tieneConflictoBd: false, esDuplicadoExcel: false };
        }
        const key = `${pid}:${m.mes}`;
        const existingEstado = existingByPersonaMes.get(key) ?? null;
        const tieneConflictoBd = existingEstado !== null && m.aprobado;
        const esDuplicadoExcel = m.aprobado && (seenPersonaMes.get(key) ?? 0) > 1;
        return {
          ...m,
          estadoExistenteBd: existingEstado,
          tieneConflictoBd,
          esDuplicadoExcel,
        };
      });
      return { ...f, meses: updatedMeses };
    });
  }

  buildPreviewSummary(filas: RhConciliacionFilaExcel[]): RhConciliacionPreviewResumen {
    let filasVacantesOmitidas = 0;
    let personasConciliadas = 0;
    let personasSugeridasSinConfirmar = 0;
    let personasAmbiguas = 0;
    let personasSinCoincidencia = 0;
    let personasExcluidas = 0;
    let candidatosRecepcionHistorica = 0;
    let registrosExcluidos = 0;
    let duplicadosDetectados = 0;
    let conflictosConBd = 0;
    let casosAclaracion = 0;

    for (const f of filas) {
      if (f.esVacante) {
        filasVacantesOmitidas++;
        continue;
      }

      if (f.estadoIdentidad === 'CONFIRMADA_MANUAL') personasConciliadas++;
      else if (f.estadoIdentidad === 'COINCIDENCIA_SUGERIDA') personasSugeridasSinConfirmar++;
      else if (f.estadoIdentidad === 'COINCIDENCIA_AMBIGUA') personasAmbiguas++;
      else if (f.estadoIdentidad === 'SIN_COINCIDENCIA') personasSinCoincidencia++;
      else if (f.estadoIdentidad === 'EXCLUIDA_RH') personasExcluidas++;

      const hasAnotacion = f.meses.some((m) => m.tipo === 'ANOTACION') || f.bloque === 'BAJAS';
      if (hasAnotacion) casosAclaracion++;

      for (const m of f.meses) {
        if (m.tipo === 'MARCA_X') {
          if (f.estadoIdentidad === 'CONFIRMADA_MANUAL' && m.aprobado) {
            candidatosRecepcionHistorica++;
            if (m.esDuplicadoExcel) duplicadosDetectados++;
            if (m.tieneConflictoBd) conflictosConBd++;
          } else {
            registrosExcluidos++;
          }
        }
      }
    }

    return {
      totalFilasLeidas: filas.length,
      filasVacantesOmitidas,
      personasConciliadas,
      personasSugeridasSinConfirmar,
      personasAmbiguas,
      personasSinCoincidencia,
      personasExcluidas,
      candidatosRecepcionHistorica,
      registrosExcluidos,
      duplicadosDetectados,
      conflictosConBd,
      casosAclaracion,
    };
  }

  buildExportPayload(
    archivoNombre: string,
    archivoHash: string,
    filas: RhConciliacionFilaExcel[]
  ): RhConciliacionExportPayload {
    return {
      version: 'RH-ASIS-05A-v1',
      anio: 2026,
      archivo_nombre: archivoNombre,
      archivo_hash: archivoHash,
      exportado_en: new Date().toISOString(),
      filas: filas.map((f) => ({
        rowKey: f.rowKey,
        sheetName: f.sheetName,
        rowNumber: f.rowNumber,
        nombreOriginal: f.nombreOriginal,
        estadoIdentidad: f.estadoIdentidad,
        personaIdConfirmado: f.personaConfirmada?.persona_id ?? null,
        unidadMedicaId: f.unidadMedicaId,
        mesesAprobados: f.meses.filter((m) => m.aprobado).map((m) => m.mes),
        notasRevision: f.notasRevision,
      })),
    };
  }

  applyImportedJson(
    filasActuales: RhConciliacionFilaExcel[],
    archivoHashActual: string,
    rawJson: string,
    personasCatalogo: RhPersonaAdminDto[]
  ): { filas: RhConciliacionFilaExcel[]; hashCoincide: boolean; filasAplicadas: number } {
    const parsed = JSON.parse(rawJson) as RhConciliacionExportPayload;
    if (!parsed || parsed.version !== 'RH-ASIS-05A-v1' || !Array.isArray(parsed.filas)) {
      throw new Error('El archivo JSON de conciliación no tiene un formato válido (RH-ASIS-05A-v1).');
    }

    const byKey = new Map(parsed.filas.map((item) => [item.rowKey, item]));
    const personasById = new Map(personasCatalogo.map((p) => [p.persona_id, p]));
    let filasAplicadas = 0;

    const updated = filasActuales.map((f) => {
      const saved = byKey.get(f.rowKey);
      if (!saved) return f;
      // Validar que la fila restaurada corresponda al mismo nombre original del Excel
      if (normalizeNameForMatch(saved.nombreOriginal) !== f.nombreNormalizado) {
        return {
          ...f,
          estadoIdentidad: 'COINCIDENCIA_AMBIGUA' as const,
          personaConfirmada: null,
          notasRevision: `JSON alterado o desalineado: esperaba "${f.nombreOriginal}" y recibió "${saved.nombreOriginal}". Requiere revisión manual.`,
        };
      }
      filasAplicadas++;
      const persona = saved.personaIdConfirmado ? personasById.get(saved.personaIdConfirmado) ?? null : null;
      const aprobadosSet = new Set(saved.mesesAprobados ?? []);
      return {
        ...f,
        estadoIdentidad: persona ? saved.estadoIdentidad : (saved.estadoIdentidad === 'CONFIRMADA_MANUAL' ? 'SIN_COINCIDENCIA' : saved.estadoIdentidad),
        personaConfirmada: persona,
        unidadMedicaId: saved.unidadMedicaId ?? null,
        notasRevision: saved.notasRevision ?? '',
        meses: f.meses.map((m) => ({
          ...m,
          aprobado: m.tipo === 'MARCA_X' && aprobadosSet.has(m.mes),
        })),
      };
    });

    return {
      filas: updated,
      hashCoincide: parsed.archivo_hash === archivoHashActual,
      filasAplicadas,
    };
  }
}
