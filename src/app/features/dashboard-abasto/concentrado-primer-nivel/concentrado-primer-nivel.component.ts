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
    const porClave = new Map<string, { descripcion: string; piezas: Map<string, number> }>();
    const existenciasPorClave = new Map(out.existenciasAlmacenes.map(item => [item.clave, item]));

    for (const item of out.data) {
      if (item.jurisdiccion !== jurisdiccion || item.piezas <= 0) continue;
      const actual = porClave.get(item.clave) ?? {
        descripcion: item.descripcion?.trim() || 'Descripción no disponible',
        piezas: new Map<string, number>(),
      };
      actual.piezas.set(item.cluesimb, (actual.piezas.get(item.cluesimb) ?? 0) + item.piezas);
      porClave.set(item.clave, actual);
    }

    const filaRutas: Array<string | number> = [`Periodo: últimos ${out.window.months} meses`, 'PROVISIONAL', 'RUTA'];
    const filaClues: Array<string | number> = ['', '', 'CLUES'];
    const filaEncabezados: Array<string | number> = ['No.', 'CLAVE', 'DESCRIPCION'];
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

    const claves = [...porClave.entries()].sort(([a], [b]) => a.localeCompare(b));
    const sheet = workbook.addWorksheet(nombre);
    sheet.addRow(filaRutas);
    sheet.addRow(filaClues);
    sheet.addRow(filaEncabezados);
    const ultimaColumnaUnidad = 3 + unidades.length;
    const columnaTotal = 4 + unidades.length;
    const columnaAzm = columnaTotal + 1;
    const columnaAzt = columnaTotal + 2;
    const columnaAze = columnaTotal + 3;
    const columnaObservaciones = columnaTotal + 4;
    claves.forEach(([clave, item], index) => {
      const numeroFila = index + 4;
      const fila: any[] = [index + 1, clave, item.descripcion];
      let total = 0;
      for (const unidad of unidades) {
        const piezas = item.piezas.get(unidad.cluesimb) ?? 0;
        fila.push(piezas || null);
        total += piezas;
      }
      fila.push({ formula: `SUM(D${numeroFila}:${sheet.getColumn(ultimaColumnaUnidad).letter}${numeroFila})`, result: total });
      const existencias = existenciasPorClave.get(clave);
      fila.push(existencias?.existenciaAzm ?? 0, existencias?.existenciaAzt ?? 0, existencias?.existenciaAze ?? 0);
      fila.push(this.observacionAlternativa(existencias));
      sheet.addRow(fila);
    });

    const ultimaFilaDetalle = 3 + claves.length;
    const filaTotales: any[] = ['', '', 'TOTAL GENERAL'];
    let totalJurisdiccion = 0;
    unidades.forEach((unidad, index) => {
      const totalUnidad = claves.reduce((total, [, item]) => total + (item.piezas.get(unidad.cluesimb) ?? 0), 0);
      totalJurisdiccion += totalUnidad;
      const letraColumna = sheet.getColumn(index + 4).letter;
      filaTotales.push(claves.length
        ? { formula: `SUBTOTAL(9,${letraColumna}4:${letraColumna}${ultimaFilaDetalle})`, result: totalUnidad }
        : 0);
    });
    const letraTotal = sheet.getColumn(columnaTotal).letter;
    filaTotales.push(claves.length
      ? { formula: `SUBTOTAL(9,${letraTotal}4:${letraTotal}${ultimaFilaDetalle})`, result: totalJurisdiccion }
      : 0);
    for (const columna of [columnaAzm, columnaAzt, columnaAze]) {
      const letraColumna = sheet.getColumn(columna).letter;
      const totalAlmacen = claves.reduce((total, [clave]) => {
        const existencias = existenciasPorClave.get(clave);
        if (columna === columnaAzm) return total + (existencias?.existenciaAzm ?? 0);
        if (columna === columnaAzt) return total + (existencias?.existenciaAzt ?? 0);
        return total + (existencias?.existenciaAze ?? 0);
      }, 0);
      filaTotales.push(claves.length
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
    for (let columna = 4; columna < columnaTotal; columna++) sheet.getColumn(columna).width = 22;
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
      if (fin > inicio) sheet.mergeCells(1, inicio + 4, 1, fin + 4);
      inicio = fin + 1;
    }
    sheet.mergeCells(1, columnaAzm, 1, columnaAze);
    sheet.mergeCells(2, columnaAzm, 2, columnaAze);
    return sheet;
  }

  private observacionAlternativa(
    existencias: MatrizDistribucionPrimerNivelResponse['existenciasAlmacenes'][number] | undefined
  ): string {
    const existenciaDirecta = (existencias?.existenciaAzm ?? 0)
      + (existencias?.existenciaAzt ?? 0)
      + (existencias?.existenciaAze ?? 0);
    if (existenciaDirecta > 0) return '';
    const alternativa = existencias?.alternativa;
    if (!alternativa) return 'Sin existencia directa ni alternativa con existencia.';
    return `Sin existencia directa. Alternativa ${alternativa.clave} · AZM ${alternativa.existenciaAzm.toLocaleString('es-MX')}`
      + ` · AZT ${alternativa.existenciaAzt.toLocaleString('es-MX')} · AZE ${alternativa.existenciaAze.toLocaleString('es-MX')}`
      + ` · factor ${alternativa.factor.toLocaleString('es-MX', { maximumFractionDigits: 4 })}`
      + ` · cobertura equivalente ${alternativa.coberturaEquivalente.toLocaleString('es-MX', { maximumFractionDigits: 2 })}`;
  }

  private filtros(paginar: boolean) {
    return {
      months: this.months(), jurisdiccion: this.jurisdiccion().trim(), clues: this.clues().trim(),
      origen: this.origen(), referencia: this.referencia().trim(), search: this.search().trim(),
      page: paginar ? this.page() : 1, pageSize: paginar ? this.pageSize : undefined,
    };
  }
}
