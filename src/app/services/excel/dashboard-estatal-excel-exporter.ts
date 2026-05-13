import * as ExcelJS from 'exceljs';

import { DashboardEstatalOrdenPendiente, DashboardEstatalResumenClave } from '../../models/dashboard-estatal';
import { descargarArchivo, ensureExcelExtension } from './excel-utils';

export interface DashboardEstatalExcelPayload {
  windowDays: number;
  topFaltantes: DashboardEstatalResumenClave[];
  topSobreabasto: DashboardEstatalResumenClave[];
  ordenesFaltantes: DashboardEstatalOrdenPendiente[];
  ordenesSobreabasto: DashboardEstatalOrdenPendiente[];
  notas?: string[];
}

export class DashboardEstatalExcelExporter {
  private readonly verdeOscuro = '006341';
  private readonly verdeClaro = '2E8B57';
  private readonly blanco = 'FFFFFF';

  async exportar(nombreArchivo: string, payload: DashboardEstatalExcelPayload): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Solicitudes App';
    workbook.created = new Date();

    this.addResumen(workbook, payload);
    this.addTopSheet(workbook, 'Top Faltantes', payload.topFaltantes, 'faltante');
    this.addTopSheet(workbook, 'Top Sobreabasto', payload.topSobreabasto, 'sobreabasto');
    this.addDetalleClaves(workbook, payload);
    this.addOrdenesSheet(workbook, 'Ordenes Faltantes', payload.ordenesFaltantes);
    this.addOrdenesSheet(workbook, 'Ordenes Sobreabasto', payload.ordenesSobreabasto);
    this.addDiccionario(workbook);

    const buffer = await workbook.xlsx.writeBuffer();
    descargarArchivo(buffer, ensureExcelExtension(nombreArchivo));
  }

  private addResumen(workbook: ExcelJS.Workbook, payload: DashboardEstatalExcelPayload): void {
    const sheet = workbook.addWorksheet('Resumen');
    sheet.columns = [
      { header: 'Indicador', key: 'indicador', width: 38 },
      { header: 'Valor', key: 'valor', width: 34 },
    ];

    sheet.getCell('A1').value = 'Dashboard Estatal';
    sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: this.verdeOscuro } };
    sheet.mergeCells('A1:B1');

    const rows: [string, string | number][] = [
      ['Fecha de generación', new Date().toLocaleString()],
      ['Ventana operativa', `${payload.windowDays} días`],
      ['Claves en top faltantes', payload.topFaltantes.length],
      ['Claves en top sobreabasto', payload.topSobreabasto.length],
      ['Piezas faltantes estimadas', this.sum(payload.topFaltantes, 'faltante_estimado')],
      ['Piezas sobreabasto estimadas', this.sum(payload.topSobreabasto, 'sobreabasto_estimado')],
      ['Órdenes detalle faltantes', payload.ordenesFaltantes.length],
      ['Órdenes detalle sobreabasto', payload.ordenesSobreabasto.length],
    ];

    sheet.addRow([]);
    const header = sheet.addRow(['Indicador', 'Valor']);
    this.styleHeader(header);
    rows.forEach(row => sheet.addRow(row));

    if (payload.notas?.length) {
      sheet.addRow([]);
      const noteHeader = sheet.addRow(['Notas', '']);
      noteHeader.getCell(1).font = { bold: true, color: { argb: this.verdeOscuro } };
      payload.notas.forEach(note => sheet.addRow([note, '']));
    }
  }

  private addTopSheet(
    workbook: ExcelJS.Workbook,
    name: string,
    rows: DashboardEstatalResumenClave[],
    mode: 'faltante' | 'sobreabasto'
  ): void {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = this.topColumns(mode);
    this.styleHeader(sheet.getRow(1));

    rows.forEach(row => sheet.addRow({
      clave_cnis: row.clave_cnis,
      descripcion: row.descripcion,
      existencia_estatal: row.existencia_estatal,
      cpm_estatal: row.cpm_estatal,
      cpm_x_3_estatal: row.cpm_x_3_estatal,
      cpms_equivalentes: row.cpms_equivalentes,
      ordenes_pendientes: row.ordenes_pendientes,
      piezas_pendientes: row.piezas_pendientes,
      faltante_estimado: row.faltante_estimado,
      sobreabasto_estimado: row.sobreabasto_estimado,
      riesgo_faltante: row.riesgo_faltante,
      riesgo_sobreabasto: row.riesgo_sobreabasto,
      lectura: row.lectura,
    }));

    this.finishTable(sheet);
  }

  private addDetalleClaves(workbook: ExcelJS.Workbook, payload: DashboardEstatalExcelPayload): void {
    const sheet = workbook.addWorksheet('Detalle Claves');
    sheet.columns = [
      { header: 'Origen top', key: 'origen', width: 18 },
      ...this.topColumns('faltante'),
      { header: 'Cobertura días', key: 'cobertura_dias', width: 16 },
      { header: 'Cobertura meses', key: 'cobertura_meses', width: 18 },
      { header: 'Brecha neta CPM x3', key: 'brecha_neta_cpm_x3', width: 20 },
      { header: '% cobertura CPM x3', key: 'porcentaje_cobertura_cpm_x3', width: 20 },
    ];
    this.styleHeader(sheet.getRow(1));

    const seen = new Set<string>();
    const addRows = (origen: string, rows: DashboardEstatalResumenClave[]) => {
      rows.forEach(row => {
        const key = `${origen}-${row.clave_cnis}`;
        if (seen.has(key)) return;
        seen.add(key);
        sheet.addRow({
          origen,
          clave_cnis: row.clave_cnis,
          descripcion: row.descripcion,
          existencia_estatal: row.existencia_estatal,
          cpm_estatal: row.cpm_estatal,
          cpm_x_3_estatal: row.cpm_x_3_estatal,
          cpms_equivalentes: row.cpms_equivalentes,
          ordenes_pendientes: row.ordenes_pendientes,
          piezas_pendientes: row.piezas_pendientes,
          faltante_estimado: row.faltante_estimado,
          sobreabasto_estimado: row.sobreabasto_estimado,
          riesgo_faltante: row.riesgo_faltante,
          riesgo_sobreabasto: row.riesgo_sobreabasto,
          lectura: row.lectura,
          cobertura_dias: row.cpm_estatal > 0 ? (row.existencia_estatal / row.cpm_estatal) * 30 : null,
          cobertura_meses: row.cpm_estatal > 0 ? row.existencia_estatal / row.cpm_estatal : null,
          brecha_neta_cpm_x3: row.existencia_estatal + row.piezas_pendientes - row.cpm_x_3_estatal,
          porcentaje_cobertura_cpm_x3: row.cpm_x_3_estatal > 0 ? row.existencia_estatal / row.cpm_x_3_estatal : null,
        });
      });
    };

    addRows('Faltantes', payload.topFaltantes);
    addRows('Sobreabasto', payload.topSobreabasto);
    this.finishTable(sheet);
  }

  private addOrdenesSheet(workbook: ExcelJS.Workbook, name: string, rows: DashboardEstatalOrdenPendiente[]): void {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = [
      { header: 'Clave CNIS', key: 'clave_cnis', width: 18 },
      { header: 'Descripción', key: 'descripcion', width: 42 },
      { header: 'Orden compra', key: 'orden_compra', width: 18 },
      { header: 'Folio', key: 'folio', width: 18 },
      { header: 'Proveedor', key: 'proveedor', width: 34 },
      { header: 'Fecha emisión', key: 'fecha_emision', width: 16 },
      { header: 'Fecha entrega', key: 'fecha_entrega', width: 16 },
      { header: 'Días pendiente', key: 'dias_pendiente', width: 16 },
      { header: 'Piezas pendientes', key: 'piezas_pendientes', width: 18 },
      { header: 'Precio unitario', key: 'precio_unitario', width: 16 },
      { header: 'Importe pendiente', key: 'importe_pendiente', width: 18 },
      { header: 'Jurisdicción', key: 'jurisdiccion', width: 18 },
      { header: 'Almacén', key: 'almacen', width: 18 },
      { header: 'Unidad', key: 'unidad', width: 34 },
      { header: 'Estatus', key: 'estatus', width: 18 },
      { header: 'Contrato', key: 'contrato', width: 20 },
    ];
    this.styleHeader(sheet.getRow(1));
    rows.forEach(row => sheet.addRow(row));
    this.finishTable(sheet);
  }

  private addDiccionario(workbook: ExcelJS.Workbook): void {
    const sheet = workbook.addWorksheet('Diccionario');
    sheet.columns = [
      { header: 'Campo', key: 'campo', width: 30 },
      { header: 'Definición', key: 'definicion', width: 90 },
    ];
    this.styleHeader(sheet.getRow(1));
    [
      ['Cobertura días', 'Existencia estatal / CPM estatal * 30.'],
      ['Brecha neta CPM x3', 'Existencia estatal + piezas pendientes - CPM x3 estatal.'],
      ['% cobertura CPM x3', 'Existencia estatal / CPM x3 estatal.'],
      ['Faltante estimado', 'Piezas faltantes calculadas por el backend para la ventana operativa.'],
      ['Sobreabasto estimado', 'Piezas con posible sobreabasto calculadas por el backend.'],
    ].forEach(([campo, definicion]) => sheet.addRow({ campo, definicion }));
    this.finishTable(sheet);
  }

  private topColumns(mode: 'faltante' | 'sobreabasto'): Partial<ExcelJS.Column>[] {
    return [
      { header: 'Clave CNIS', key: 'clave_cnis', width: 18 },
      { header: 'Descripción', key: 'descripcion', width: 42 },
      { header: 'Existencia estatal', key: 'existencia_estatal', width: 18 },
      { header: 'CPM estatal', key: 'cpm_estatal', width: 14 },
      { header: 'CPM x3 estatal', key: 'cpm_x_3_estatal', width: 16 },
      { header: 'CPMs equivalentes', key: 'cpms_equivalentes', width: 18 },
      { header: 'Órdenes pendientes', key: 'ordenes_pendientes', width: 18 },
      { header: 'Piezas pendientes', key: 'piezas_pendientes', width: 18 },
      { header: mode === 'faltante' ? 'Faltante estimado' : 'Sobreabasto estimado', key: mode === 'faltante' ? 'faltante_estimado' : 'sobreabasto_estimado', width: 20 },
      { header: 'Riesgo faltante', key: 'riesgo_faltante', width: 16 },
      { header: 'Riesgo sobreabasto', key: 'riesgo_sobreabasto', width: 18 },
      { header: 'Lectura', key: 'lectura', width: 80 },
    ];
  }

  private styleHeader(row: ExcelJS.Row): void {
    row.font = { bold: true, color: { argb: this.blanco } };
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: this.verdeOscuro },
    };
  }

  private finishTable(sheet: ExcelJS.Worksheet): void {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columns.length },
    };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.eachRow(row => {
      row.eachCell(cell => {
        cell.alignment = { vertical: 'top', wrapText: true };
      });
    });
  }

  private sum(rows: DashboardEstatalResumenClave[], field: 'faltante_estimado' | 'sobreabasto_estimado'): number {
    return rows.reduce((acc, row) => acc + (Number(row[field]) || 0), 0);
  }
}
