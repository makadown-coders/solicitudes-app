import * as ExcelJS from 'exceljs';
import { descargarArchivo, ensureExcelExtension } from './excel-utils';
import { ComparativaRow } from '../../models/solicitudes/ComparativaRow';

export type SolicitudesComparativaExcelContext = {
  cluesimb: string;
  unidad: string;
  fechaSolicitud: string;
  tipoPedido: string;
  tiposInsumo: string;
  rangoDesde: string;
  rangoHasta: string;
};

export type SolicitudesComparativaOrdenRow = {
  clave: string;
  descripcion: string;
  unidadDestino: string;
  orden: string;
  tipoCompra: string;
  piezasEmitidas: number;
  fechaTipo: string;
  fecha: string;
};

export class SolicitudesComparativaExcelExporter {
  async exportarComparativa(
    nombreArchivo: string,
    contexto: SolicitudesComparativaExcelContext,
    comparativa: ComparativaRow[],
    ordenes: SolicitudesComparativaOrdenRow[]
  ) {
    const workbook = new ExcelJS.Workbook();

    const wsComp = workbook.addWorksheet('Comparativa');
    wsComp.columns = [
      { key: 'clave', width: 16 },
      { key: 'descripcion', width: 45 },
      { key: 'solicitado', width: 14 },
      { key: 'entregado', width: 14 },
      { key: 'faltante', width: 14 },
      { key: 'pct', width: 16 },
      { key: 'ord_count', width: 14 },
      { key: 'ord_text', width: 90 },
    ];

    wsComp.getCell('A1').value = 'Comparativa (Solicitado vs Entregado)';
    wsComp.mergeCells('A1:H1');
    wsComp.getCell('A1').font = { bold: true, size: 14, color: { argb: '006341' } };

    wsComp.addRow([]);
    wsComp.addRow(['Unidad', contexto.unidad || contexto.cluesimb]);
    wsComp.addRow(['CLUES', contexto.cluesimb || '']);
    wsComp.addRow(['Fecha solicitud', contexto.fechaSolicitud || '']);
    wsComp.addRow(['Tipo pedido', contexto.tipoPedido || '']);
    wsComp.addRow(['Tipo(s) insumo', contexto.tiposInsumo || '']);
    wsComp.addRow(['Rango entregas', `${contexto.rangoDesde || ''} -> ${contexto.rangoHasta || ''}`]);

    const headerRow = wsComp.addRow([
      'Clave',
      'Descripcion',
      'Solicitado',
      'Entregado',
      'Faltante',
      'Cumplimiento (%)',
      '# Ordenes',
      'Ordenes suministro (texto)',
    ]);
    headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '006341' } };

    for (const r of (comparativa ?? [])) {
      wsComp.addRow([
        r.clave ?? '',
        r.descripcion ?? '',
        Number(r.solicitado ?? 0),
        Number(r.entregado ?? 0),
        Number(r.diferencia ?? 0),
        Number(r.cumplimientoPct ?? 0),
        Number(r.ordenesSuministroCount ?? 0),
        r.ordenesSuministro ?? '',
      ]);
    }

    const compHeaderN = headerRow.number;
    wsComp.autoFilter = { from: { row: compHeaderN, column: 1 }, to: { row: compHeaderN, column: 8 } };

    wsComp.eachRow((row, rowNumber) => {
      if (rowNumber <= compHeaderN) return;
      row.getCell(8).alignment = { wrapText: true, vertical: 'top' };
      row.getCell(2).alignment = { vertical: 'top' };
      row.getCell(3).alignment = { horizontal: 'right' };
      row.getCell(4).alignment = { horizontal: 'right' };
      row.getCell(5).alignment = { horizontal: 'right' };
      row.getCell(6).alignment = { horizontal: 'right' };
      row.getCell(7).alignment = { horizontal: 'right' };
    });

    const wsOrd = workbook.addWorksheet('Ordenes');
    wsOrd.columns = [
      { header: 'Clave', key: 'clave', width: 16 },
      { header: 'Descripcion', key: 'descripcion', width: 45 },
      { header: 'Unidad destino', key: 'unidadDestino', width: 30 },
      { header: 'Orden suministro', key: 'orden', width: 34 },
      { header: 'Tipo compra', key: 'tipoCompra', width: 20 },
      { header: 'Piezas emitidas', key: 'piezasEmitidas', width: 16 },
      { header: 'Tipo fecha', key: 'fechaTipo', width: 16 },
      { header: 'Fecha', key: 'fecha', width: 14 },
    ];

    wsOrd.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    wsOrd.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2E8B57' } };

    for (const o of (ordenes ?? [])) {
      wsOrd.addRow({
        clave: o.clave ?? '',
        descripcion: o.descripcion ?? '',
        unidadDestino: o.unidadDestino ?? '',
        orden: o.orden ?? '',
        tipoCompra: o.tipoCompra ?? '',
        piezasEmitidas: Number(o.piezasEmitidas ?? 0),
        fechaTipo: o.fechaTipo ?? '',
        fecha: o.fecha ?? '',
      });
    }

    wsOrd.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 8 } };
    wsOrd.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.getCell(6).alignment = { horizontal: 'right' };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    descargarArchivo(buffer, ensureExcelExtension(nombreArchivo));
  }
}

