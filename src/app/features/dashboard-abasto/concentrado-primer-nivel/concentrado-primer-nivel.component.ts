import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import {
  ConcentradoPrimerNivelResponse,
  JurisdiccionDistribucionPrimerNivel,
  MatrizDistribucionPrimerNivelResponse,
  OrigenCapturaPrimerNivel,
} from '../../../models/ConcentradoPrimerNivelModels';
import { ConcentradoPrimerNivelService } from '../../../services/concentrado-primer-nivel.service';

const VACIO: ConcentradoPrimerNivelResponse = {
  mode: 'concentrado-primer-nivel', window: { months: 1 }, page: 1, pageSize: 25, total: 0,
  resumen: { solicitudes: 0, unidadesParticipantes: 0, unidadesUniverso: 0, unidadesSinSolicitud: 0, clavesDistintas: 0, piezas: 0 },
  origenes: [], referencias: [], unidadesSinSolicitud: [], data: [],
};

@Component({
  selector: 'app-concentrado-primer-nivel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './concentrado-primer-nivel.component.html',
  styleUrl: './concentrado-primer-nivel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConcentradoPrimerNivelComponent implements OnInit {
  private readonly service = inject(ConcentradoPrimerNivelService);
  readonly resultado = signal<ConcentradoPrimerNivelResponse>(VACIO);
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly exportingDistribucion = signal(false);
  readonly error = signal('');
  readonly months = signal(1);
  readonly jurisdiccion = signal('');
  readonly clues = signal('');
  readonly origen = signal<OrigenCapturaPrimerNivel | ''>('');
  readonly referencia = signal('');
  readonly search = signal('');
  readonly page = signal(1);
  readonly pageSize = 25;

  ngOnInit(): void { void this.cargar(true); }

  async cargar(reiniciar = false): Promise<void> {
    if (reiniciar) this.page.set(1);
    this.loading.set(true); this.error.set('');
    try {
      this.resultado.set(await this.service.consultar(this.filtros(true)));
    } catch {
      this.error.set('No fue posible consultar el concentrado de Primer Nivel.');
    } finally { this.loading.set(false); }
  }

  filtrarOrigen(origen: OrigenCapturaPrimerNivel | ''): void {
    this.origen.set(this.origen() === origen ? '' : origen);
    this.referencia.set('');
    void this.cargar(true);
  }

  irPagina(delta: number): void {
    const next = this.page() + delta;
    if (next < 1 || (delta > 0 && this.page() * this.pageSize >= this.resultado().total)) return;
    this.page.set(next); void this.cargar();
  }

  etiquetaOrigen(origen: OrigenCapturaPrimerNivel): string {
    return ({ APS: 'Por APS', PROGRAMA_PREVENTIVO: 'Programa Preventivo', CLAVE: 'Clave CNIS' })[origen];
  }

  async exportarExcel(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true); this.error.set('');
    try {
      const out = await this.service.exportar(this.filtros(false));
      const workbook = XLSX.utils.book_new();
      const resumen = XLSX.utils.aoa_to_sheet([
        ['Concentrado de necesidades de Primer Nivel'],
        ['Periodo', `Últimos ${out.window.months} meses`],
        ['Solicitudes elaboradas', out.resumen.solicitudes],
        ['Centros participantes', out.resumen.unidadesParticipantes],
        ['Centros en el universo', out.resumen.unidadesUniverso],
        ['Centros sin solicitud', out.resumen.unidadesSinSolicitud],
        ['Claves distintas', out.resumen.clavesDistintas],
        ['Piezas capturadas', out.resumen.piezas],
        [],
        ['Alcance', 'Las solicitudes corresponden a registros asociados a archivos generados por la herramienta; no acreditan recepción, autorización o surtimiento.'],
      ]);
      resumen['!cols'] = [{ wch: 30 }, { wch: 105 }];
      XLSX.utils.book_append_sheet(workbook, resumen, 'Resumen');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(out.origenes.map(item => ({
        Origen: this.etiquetaOrigen(item.origen), Solicitudes: item.solicitudes,
        Unidades: item.unidades, Claves: item.claves, Piezas: item.piezas,
      }))), 'Por origen');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(out.referencias.map(item => ({
        Origen: this.etiquetaOrigen(item.origen), Código: item.referencia,
        Referencia: item.etiquetaReferencia, Solicitudes: item.solicitudes,
        Unidades: item.unidades, Claves: item.claves, Piezas: item.piezas,
      }))), 'APS y programas');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(out.unidadesSinSolicitud.map(item => ({
        CLUES: item.cluesimb, Unidad: item.unidad, Jurisdicción: item.jurisdiccion ?? '',
        'Última solicitud': item.ultimaSolicitud ?? 'Sin solicitud en el historial disponible',
      }))), 'Unidades sin solicitud');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(out.data.map(item => ({
        Jurisdicción: item.jurisdiccion ?? '', CLUES: item.cluesimb, Unidad: item.unidad,
        Clave: item.clave, Nombre: item.nombre ?? '', Descripción: item.descripcion ?? '',
        Origen: this.etiquetaOrigen(item.origen), Código: item.referencia ?? '',
        Referencia: item.etiquetaReferencia, Solicitudes: item.solicitudes, Piezas: item.piezas,
        'Primera solicitud': item.primeraSolicitud, 'Última solicitud': item.ultimaSolicitud,
      }))), 'Detalle');
      const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
      XLSX.writeFile(workbook, `concentrado_primer_nivel_${stamp}.xlsx`);
      if (out.truncated) this.error.set('El Excel alcanzó el límite de 50,000 renglones. Aplica filtros para exportar el universo restante.');
    } catch {
      this.error.set('No fue posible generar el Excel del concentrado.');
    } finally { this.exporting.set(false); }
  }

  async exportarMatrizDistribucion(): Promise<void> {
    if (this.exportingDistribucion()) return;
    this.exportingDistribucion.set(true); this.error.set('');
    try {
      const out = await this.service.matrizDistribucion(this.months());
      const workbook = new ExcelJS.Workbook();
      const hojas: Array<{ jurisdiccion: JurisdiccionDistribucionPrimerNivel; nombre: string }> = [
        { jurisdiccion: 'ENSENADA', nombre: 'Ensenada' },
        { jurisdiccion: 'MEXICALI', nombre: 'Mexicali' },
        { jurisdiccion: 'TIJUANA', nombre: 'Tijuana' },
      ];

      for (const hoja of hojas) {
        this.crearHojaDistribucion(workbook, out, hoja.jurisdiccion, hoja.nombre);
      }

      workbook.creator = 'Concentrado de Primer Nivel';
      workbook.created = new Date(out.generadoEn);
      workbook.title = `Matriz provisional de distribución de Primer Nivel - últimos ${out.window.months} meses`;
      workbook.subject = 'Necesidades registradas; no acredita autorización, surtimiento o entrega.';
      const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `matriz_distribucion_primer_nivel_${out.window.months}m_${stamp}.xlsx`;
      enlace.click();
      URL.revokeObjectURL(url);
    } catch {
      this.error.set('No fue posible generar la matriz de distribución.');
    } finally { this.exportingDistribucion.set(false); }
  }

  private crearHojaDistribucion(
    workbook: ExcelJS.Workbook,
    out: MatrizDistribucionPrimerNivelResponse,
    jurisdiccion: JurisdiccionDistribucionPrimerNivel,
    nombre: string
  ): ExcelJS.Worksheet {
    const unidades = out.unidades.filter(item => item.jurisdiccion === jurisdiccion);
    const porClave = new Map<string, { descripcion: string; tipoInsumo: 'MED' | 'MC' | null; piezas: Map<string, number> }>();
    const existenciasPorClave = new Map(out.existenciasAlmacenes.map(item => [item.clave, item]));

    for (const item of out.data) {
      if (item.jurisdiccion !== jurisdiccion || item.piezas <= 0) continue;
      const actual = porClave.get(item.clave) ?? {
        descripcion: item.descripcion?.trim() || 'Descripción no disponible',
        tipoInsumo: item.tipoInsumo,
        piezas: new Map<string, number>(),
      };
      actual.piezas.set(item.cluesimb, (actual.piezas.get(item.cluesimb) ?? 0) + item.piezas);
      porClave.set(item.clave, actual);
    }

    const filaRutas: Array<string | number> = [`Periodo: últimos ${out.window.months} meses`, 'PROVISIONAL', '', 'RUTA'];
    const filaClues: Array<string | number> = ['', '', '', 'CLUES'];
    const filaEncabezados: Array<string | number> = ['No.', 'CLAVE', 'DESCRIPCION', 'TIPO'];
    for (const unidad of unidades) {
      filaRutas.push(unidad.ruta);
      filaClues.push(unidad.cluesimb);
      filaEncabezados.push(unidad.unidad);
    }
    const snapshot = out.snapshotExistencias
      ? `Snapshot: ${new Date(`${out.snapshotExistencias}T12:00:00`).toLocaleDateString('es-MX')}`
      : 'Snapshot: fecha no disponible';
    filaRutas.push('', 'EXISTENCIAS EN ALMACENES', '', '', '');
    filaClues.push('', snapshot, '', '', '');
    filaEncabezados.push(
      'Total general',
      'Existencia AZM (Mexicali)',
      'Existencia AZT (Tijuana)',
      'Existencia AZE (Ensenada)',
      'OBSERVACIONES'
    );

    const clavesOriginales = [...porClave.entries()].sort(([a], [b]) => a.localeCompare(b));
    type FilaOperativa = {
      numero: number | string;
      clave: string;
      descripcion: string;
      tipoInsumo: 'MED' | 'MC' | null;
      piezas: Map<string, number>;
      piezasDirectas: number;
      existenciaAzm: number;
      existenciaAzt: number;
      existenciaAze: number;
      observacion: string;
      esSustituta: boolean;
      insertarDespuesDe: string | null;
      fuentesSustitucion: Array<{
        clave: string;
        factor: number;
        demanda: number;
        existenciaLocalAplicada: number;
        faltante: number;
      }>;
    };
    const filasPorClave = new Map<string, FilaOperativa>();

    clavesOriginales.forEach(([clave, item], index) => {
      const existencias = existenciasPorClave.get(clave);
      filasPorClave.set(clave, {
        numero: index + 1,
        clave,
        descripcion: item.descripcion,
        tipoInsumo: item.tipoInsumo,
        piezas: new Map(item.piezas),
        piezasDirectas: [...item.piezas.values()].reduce((total, piezas) => total + piezas, 0),
        existenciaAzm: existencias?.existenciaAzm ?? 0,
        existenciaAzt: existencias?.existenciaAzt ?? 0,
        existenciaAze: existencias?.existenciaAze ?? 0,
        observacion: '',
        esSustituta: false,
        insertarDespuesDe: null,
        fuentesSustitucion: [],
      });
    });

    clavesOriginales.forEach(([clave, item], index) => {
      const existencias = existenciasPorClave.get(clave);
      const demanda = [...item.piezas.values()].reduce((total, piezas) => total + piezas, 0);
      const existenciaLocal = this.existenciaLocal(existencias, jurisdiccion);
      const existenciaLocalAplicada = Math.min(demanda, existenciaLocal);
      const faltantesPorUnidad = this.distribuirFaltanteProporcional(item.piezas, unidades, existenciaLocalAplicada);
      const faltante = [...faltantesPorUnidad.values()].reduce((total, piezas) => total + piezas, 0);
      const alternativa = existencias?.alternativa;
      const filaOriginal = filasPorClave.get(clave)!;
      filaOriginal.observacion = this.observacionAlternativa(
        alternativa?.clave,
        demanda,
        existenciaLocalAplicada,
        faltante,
        jurisdiccion
      );
      if (faltante <= 0 || !alternativa) return;

      let filaSustituta = filasPorClave.get(alternativa.clave);
      if (!filaSustituta) {
        filaSustituta = {
          numero: `${index + 1}.1`,
          clave: alternativa.clave,
          descripcion: alternativa.descripcion?.trim() || 'Descripción no disponible',
          tipoInsumo: alternativa.tipoInsumo,
          piezas: new Map<string, number>(),
          piezasDirectas: 0,
          existenciaAzm: alternativa.existenciaAzm,
          existenciaAzt: alternativa.existenciaAzt,
          existenciaAze: alternativa.existenciaAze,
          observacion: '',
          esSustituta: true,
          insertarDespuesDe: clave,
          fuentesSustitucion: [],
        };
        filasPorClave.set(alternativa.clave, filaSustituta);
      }
      filaSustituta.esSustituta = true;
      filaSustituta.insertarDespuesDe ??= clave;
      if (!filaSustituta.fuentesSustitucion.some(fuente => fuente.clave === clave)) {
        filaSustituta.fuentesSustitucion.push({
          clave,
          factor: alternativa.factor,
          demanda,
          existenciaLocalAplicada,
          faltante,
        });
      }
      for (const unidad of unidades) {
        const piezasFaltantes = faltantesPorUnidad.get(unidad.cluesimb) ?? 0;
        const piezasSustitutas = piezasFaltantes > 0
          ? Math.max(1, Math.ceil((piezasFaltantes * alternativa.factor) - 1e-9))
          : 0;
        filaSustituta.piezas.set(
          unidad.cluesimb,
          (filaSustituta.piezas.get(unidad.cluesimb) ?? 0) + piezasSustitutas
        );
      }
    });

    for (const fila of filasPorClave.values()) {
      if (!fila.esSustituta) continue;
      fila.observacion = this.observacionFilaSustituta(fila.fuentesSustitucion, fila.piezasDirectas > 0);
    }

    const sustitutasPorOrigen = new Map<string, FilaOperativa[]>();
    for (const fila of filasPorClave.values()) {
      if (!fila.insertarDespuesDe) continue;
      const relacionadas = sustitutasPorOrigen.get(fila.insertarDespuesDe) ?? [];
      relacionadas.push(fila);
      sustitutasPorOrigen.set(fila.insertarDespuesDe, relacionadas);
    }
    for (const relacionadas of sustitutasPorOrigen.values()) {
      relacionadas.sort((a, b) => a.clave.localeCompare(b.clave));
    }

    const filas: FilaOperativa[] = [];
    const clavesEmitidas = new Set<string>();
    const agregarFila = (fila: FilaOperativa): void => {
      if (clavesEmitidas.has(fila.clave)) return;
      filas.push(fila);
      clavesEmitidas.add(fila.clave);
      for (const sustituta of sustitutasPorOrigen.get(fila.clave) ?? []) agregarFila(sustituta);
    };
    for (const [clave] of clavesOriginales) {
      const fila = filasPorClave.get(clave)!;
      if (fila.insertarDespuesDe && fila.insertarDespuesDe !== clave) continue;
      agregarFila(fila);
    }
    for (const fila of filasPorClave.values()) agregarFila(fila);
    const sheet = workbook.addWorksheet(nombre);
    sheet.addRow(filaRutas);
    sheet.addRow(filaClues);
    sheet.addRow(filaEncabezados);
    const ultimaColumnaUnidad = 4 + unidades.length;
    const columnaTotal = 5 + unidades.length;
    const columnaAzm = columnaTotal + 1;
    const columnaAzt = columnaTotal + 2;
    const columnaAze = columnaTotal + 3;
    const columnaObservaciones = columnaTotal + 4;
    filas.forEach((item, index) => {
      const numeroFila = index + 4;
      const fila: any[] = [item.numero, item.clave, item.descripcion, item.tipoInsumo ?? 'SIN CLASIFICAR'];
      let total = 0;
      for (const unidad of unidades) {
        const piezas = item.piezas.get(unidad.cluesimb) ?? 0;
        fila.push(piezas || null);
        total += piezas;
      }
      fila.push({ formula: `SUM(E${numeroFila}:${sheet.getColumn(ultimaColumnaUnidad).letter}${numeroFila})`, result: total });
      fila.push(item.existenciaAzm, item.existenciaAzt, item.existenciaAze, item.observacion);
      const renglon = sheet.addRow(fila);
      if (item.esSustituta) {
        renglon.eachCell({ includeEmpty: true }, cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
          cell.alignment = { ...cell.alignment, vertical: 'top', wrapText: true };
        });
        renglon.getCell(2).font = { bold: true, color: { argb: 'FF7A4E00' } };
      }
    });

    const ultimaFilaDetalle = 3 + filas.length;
    const filaTotales: any[] = ['', '', 'TOTAL GENERAL', ''];
    let totalJurisdiccion = 0;
    unidades.forEach((unidad, index) => {
      const totalUnidad = filas.reduce((total, item) => total + (item.piezas.get(unidad.cluesimb) ?? 0), 0);
      totalJurisdiccion += totalUnidad;
      const letraColumna = sheet.getColumn(index + 5).letter;
      filaTotales.push(filas.length
        ? { formula: `SUBTOTAL(9,${letraColumna}4:${letraColumna}${ultimaFilaDetalle})`, result: totalUnidad }
        : 0);
    });
    const letraTotal = sheet.getColumn(columnaTotal).letter;
    filaTotales.push(filas.length
      ? { formula: `SUBTOTAL(9,${letraTotal}4:${letraTotal}${ultimaFilaDetalle})`, result: totalJurisdiccion }
      : 0);
    for (const columna of [columnaAzm, columnaAzt, columnaAze]) {
      const letraColumna = sheet.getColumn(columna).letter;
      const totalAlmacen = filas.reduce((total, item) => {
        if (columna === columnaAzm) return total + item.existenciaAzm;
        if (columna === columnaAzt) return total + item.existenciaAzt;
        return total + item.existenciaAze;
      }, 0);
      filaTotales.push(filas.length
        ? { formula: `SUBTOTAL(9,${letraColumna}4:${letraColumna}${ultimaFilaDetalle})`, result: totalAlmacen }
        : 0);
    }
    filaTotales.push('');
    const renglonTotales = sheet.addRow(filaTotales);
    renglonTotales.font = { bold: true };
    renglonTotales.eachCell({ includeEmpty: false }, cell => {
      cell.alignment = { ...cell.alignment, vertical: 'middle', wrapText: true };
    });

    sheet.getColumn(1).width = 7;
    sheet.getColumn(2).width = 20;
    sheet.getColumn(3).width = 70;
    sheet.getColumn(3).alignment = { wrapText: true, vertical: 'top' };
    sheet.getColumn(4).width = 10;
    for (let columna = 5; columna < columnaTotal; columna++) sheet.getColumn(columna).width = 22;
    sheet.getColumn(columnaTotal).width = 16;
    for (let columna = columnaTotal; columna <= columnaAze; columna++) {
      sheet.getColumn(columna).width = columna === columnaTotal ? 16 : 22;
      sheet.getColumn(columna).numFmt = '#,##0';
    }
    sheet.getColumn(columnaObservaciones).width = 68;
    sheet.getColumn(columnaObservaciones).alignment = { wrapText: true, vertical: 'top' };
    sheet.getRow(3).font = { bold: true };
    sheet.getRow(3).alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
    sheet.autoFilter = {
      from: { row: 3, column: 1 },
      to: { row: Math.max(3, ultimaFilaDetalle), column: columnaObservaciones },
    };
    for (let inicio = 0; inicio < unidades.length;) {
      let fin = inicio;
      while (fin + 1 < unidades.length && unidades[fin + 1].ruta === unidades[inicio].ruta) fin++;
      if (fin > inicio) sheet.mergeCells(1, inicio + 5, 1, fin + 5);
      inicio = fin + 1;
    }
    sheet.mergeCells(1, columnaAzm, 1, columnaAze);
    sheet.mergeCells(2, columnaAzm, 2, columnaAze);
    return sheet;
  }

  private existenciaLocal(
    existencias: MatrizDistribucionPrimerNivelResponse['existenciasAlmacenes'][number] | undefined,
    jurisdiccion: JurisdiccionDistribucionPrimerNivel
  ): number {
    if (jurisdiccion === 'MEXICALI') return Math.max(0, existencias?.existenciaAzm ?? 0);
    if (jurisdiccion === 'TIJUANA') return Math.max(0, existencias?.existenciaAzt ?? 0);
    return Math.max(0, existencias?.existenciaAze ?? 0);
  }

  private distribuirFaltanteProporcional(
    piezasPorUnidad: Map<string, number>,
    unidades: MatrizDistribucionPrimerNivelResponse['unidades'],
    existenciaAplicada: number
  ): Map<string, number> {
    const demanda = unidades.reduce(
      (total, unidad) => total + (piezasPorUnidad.get(unidad.cluesimb) ?? 0),
      0
    );
    const cobertura = Math.min(Math.max(0, Math.floor(existenciaAplicada)), demanda);
    if (demanda <= 0 || cobertura <= 0) return new Map(piezasPorUnidad);

    const asignaciones = unidades.map((unidad, orden) => {
      const solicitadas = piezasPorUnidad.get(unidad.cluesimb) ?? 0;
      const cuotaExacta = (cobertura * solicitadas) / demanda;
      const asignada = Math.min(solicitadas, Math.floor(cuotaExacta));
      return {
        cluesimb: unidad.cluesimb,
        solicitadas,
        asignada,
        residuo: cuotaExacta - asignada,
        orden,
      };
    });
    let porAsignar = cobertura - asignaciones.reduce((total, item) => total + item.asignada, 0);
    const prioridad = [...asignaciones].sort((a, b) =>
      (b.residuo - a.residuo) || (a.orden - b.orden)
    );
    while (porAsignar > 0) {
      let huboAsignacion = false;
      for (const item of prioridad) {
        if (porAsignar <= 0) break;
        if (item.asignada >= item.solicitadas) continue;
        item.asignada++;
        porAsignar--;
        huboAsignacion = true;
      }
      if (!huboAsignacion) break;
    }
    return new Map(asignaciones.map(item => [
      item.cluesimb,
      Math.max(0, item.solicitadas - item.asignada),
    ]));
  }

  private observacionAlternativa(
    claveAlternativa: string | undefined,
    demanda: number,
    existenciaLocalAplicada: number,
    faltante: number,
    jurisdiccion: JurisdiccionDistribucionPrimerNivel
  ): string {
    if (faltante <= 0) {
      return `La existencia local de ${jurisdiccion} cubre la demanda registrada de ${demanda.toLocaleString('es-MX')} piezas.`;
    }
    const cobertura = existenciaLocalAplicada > 0
      ? `La existencia local de ${jurisdiccion} permite cubrir ${existenciaLocalAplicada.toLocaleString('es-MX')} de ${demanda.toLocaleString('es-MX')} piezas; quedan ${faltante.toLocaleString('es-MX')} sin cobertura directa.`
      : `Sin existencia local disponible en ${jurisdiccion} para cubrir la demanda registrada de ${demanda.toLocaleString('es-MX')} piezas.`;
    if (!claveAlternativa) return `${cobertura} No se encontró una alternativa con existencia configurada.`;
    return `${cobertura} El faltante se incorporó proporcionalmente en la fila consolidada de la clave sustituta ${claveAlternativa}. Validar la alternativa antes del surtimiento.`;
  }

  private observacionFilaSustituta(
    fuentes: Array<{
      clave: string;
      factor: number;
      demanda: number;
      existenciaLocalAplicada: number;
      faltante: number;
    }>,
    incluyeSolicitudDirecta: boolean
  ): string {
    const relaciones = fuentes
      .map(fuente => `${fuente.clave}: faltante ${fuente.faltante.toLocaleString('es-MX')} de ${fuente.demanda.toLocaleString('es-MX')} piezas, cobertura local ${fuente.existenciaLocalAplicada.toLocaleString('es-MX')}, factor ${fuente.factor.toLocaleString('es-MX', { maximumFractionDigits: 4 })}`)
      .join(', ');
    const inicio = incluyeSolicitudDirecta
      ? 'Demanda consolidada. Esta clave fue solicitada directamente y también se agregó como sustituta de '
      : 'Esta clave se agregó como sustituta de ';
    return `${inicio}${relaciones} porque no existe disponibilidad directa para esa(s) clave(s).`
      + ' Las cantidades sustitutas fueron traducidas con los factores configurados y sumadas por unidad.'
      + ' Todo se incluye en los totales operativos. Validar la sustitución y disponibilidad antes del surtimiento.';
  }

  private filtros(paginar: boolean) {
    return {
      months: this.months(), jurisdiccion: this.jurisdiccion().trim(), clues: this.clues().trim(),
      origen: this.origen(), referencia: this.referencia().trim(), search: this.search().trim(),
      page: paginar ? this.page() : 1, pageSize: paginar ? this.pageSize : undefined,
    };
  }
}
