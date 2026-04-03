// src/app/features/cpms-dif/cpms-dif-page.component.ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Download, ShieldCheck } from 'lucide-angular';
import { DetalleComponent } from './detalle/detalle.component';
import { KpisComponent } from './kpis/kpis.component';
import { ResumenComponent } from './resumen/resumen.component';
import { CpmsDifIndicadoresResponse, CpmsDifRow, CpmsDifResumenRow } from './models';
import { CpmsDifService } from './cpms-dif.service';
import { ArticulosService } from '../../services/articulos.service';
import { firstValueFrom } from 'rxjs';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-cpms-dif-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DetalleComponent, ResumenComponent, KpisComponent, LucideAngularModule],
  templateUrl: './cpms-dif-page.component.html'
})
export class CpmsDifPageComponent {
  private cpmsDifService = inject(CpmsDifService);
  private articulosService = inject(ArticulosService);

  tab: 'detalle' | 'resumen' | 'indicadores' = 'detalle';
  readonly ShieldCheckIcon = ShieldCheck;
  readonly DownloadIcon = Download;
  exportando = signal(false);

  async exportarTodoExcel() {
    if (this.exportando()) return;

    this.exportando.set(true);
    try {
      const [resumenRows, detalleRows, articulosMapa] = await Promise.all([
        this.fetchAllResumen(),
        this.fetchAllDetalle(),
        firstValueFrom(this.articulosService.getArticulosMapa()),
      ]);
      const indicadores = await firstValueFrom(this.cpmsDifService.getIndicadores());
      const modifiedSplit = this.buildModifiedSplit(
        detalleRows.filter((row) => row.observacion === 'MODIFICADO')
      );

      const unidadesPorClues = new Map(
        resumenRows.map((row) => [row.cluesimb, row.nombre_de_unidad])
      );

      const detalleExport = detalleRows.map((row) => ({
        cluesimb: row.cluesimb,
        nombre_de_unidad: row.nombre_de_unidad?.trim() || unidadesPorClues.get(row.cluesimb) || '',
        clave_cnis: row.clave_cnis,
        descripcion: row.descripcion?.trim() || this.getDescripcionClave(row.clave_cnis, articulosMapa ?? {}),
        cpm_cdmx: row.cpm_cdmx,
        cpm_propuesto: row.cpm_propuesto,
        diferencia: row.diferencia,
        accion: this.formatAccionExport(row),
      }));

      const resumenExport = resumenRows.map((row) => ({
        cluesimb: row.cluesimb,
        nombre_de_unidad: row.nombre_de_unidad,
        total_diferencias: row.total_diferencias,
        agregados: row.agregados,
        eliminados: row.eliminados,
        'modificados_positivos': modifiedSplit[row.cluesimb]?.positivos ?? 0,
        'modificados_negativos': modifiedSplit[row.cluesimb]?.negativos ?? 0,
        impacto_absoluto_total: row.impacto_absoluto_total,
      }));

      const wb = XLSX.utils.book_new();
      const wsDetalle = XLSX.utils.json_to_sheet(detalleExport, { skipHeader: false });
      const wsResumen = XLSX.utils.json_to_sheet(resumenExport, { skipHeader: false });

      XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle');
      XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
      XLSX.utils.book_append_sheet(wb, this.buildIndicadoresSheet(indicadores), 'Indicadores');

      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      XLSX.writeFile(wb, `CPMs_DIF_${stamp}.xlsx`, { bookType: 'xlsx' });
    } catch (err) {
      console.error('Error al exportar CPMS DIF:', err);
    } finally {
      this.exportando.set(false);
    }
  }

  private async fetchAllDetalle(limit = 1000): Promise<CpmsDifRow[]> {
    const first = await firstValueFrom(this.cpmsDifService.getDetalle({ page: 1, limit }));
    const rows = [...(first.rows ?? [])];

    for (let page = 2; page <= (first.totalPages || 1); page++) {
      const next = await firstValueFrom(this.cpmsDifService.getDetalle({ page, limit }));
      rows.push(...(next.rows ?? []));
    }

    return rows;
  }

  private async fetchAllResumen(limit = 1000): Promise<CpmsDifResumenRow[]> {
    const first = await firstValueFrom(this.cpmsDifService.getResumen({ page: 1, limit }));
    const rows = [...(first.rows ?? [])];

    for (let page = 2; page <= (first.totalPages || 1); page++) {
      const next = await firstValueFrom(this.cpmsDifService.getResumen({ page, limit }));
      rows.push(...(next.rows ?? []));
    }

    return rows;
  }

  private getDescripcionClave(rawClave: string, mapa: Record<string, { descripcion?: string }>): string {
    const clave = String(rawClave || '').trim();
    if (!clave) return '';

    return mapa[clave]?.descripcion
      || mapa[clave.toUpperCase()]?.descripcion
      || Object.entries(mapa).find(([k]) => k.toLowerCase() === clave.toLowerCase())?.[1]?.descripcion
      || '';
  }

  private formatAccionExport(row: CpmsDifRow): string {
    if (row.observacion !== 'MODIFICADO') return row.observacion;
    if (row.diferencia > 0) return 'MODIFICADO (+)';
    if (row.diferencia < 0) return 'MODIFICADO (-)';
    return 'MODIFICADO';
  }

  private buildModifiedSplit(rows: CpmsDifRow[]): Record<string, { positivos: number; negativos: number }> {
    const split: Record<string, { positivos: number; negativos: number }> = {};

    for (const row of rows) {
      const key = row.cluesimb;
      if (!split[key]) {
        split[key] = { positivos: 0, negativos: 0 };
      }

      if (row.diferencia > 0) {
        split[key].positivos++;
      } else if (row.diferencia < 0) {
        split[key].negativos++;
      }
    }

    return split;
  }

  private buildIndicadoresSheet(indicadores: CpmsDifIndicadoresResponse) {
    const rows: (string | number)[][] = [
      ['Lectura ejecutiva'],
      [indicadores.lectura_ejecutiva],
      [],
      ['Indicador', 'Valor'],
      ['Total unidades universo', indicadores.kpis.total_unidades_universo],
      ['Total unidades con cambios', indicadores.kpis.total_unidades_con_cambios],
      ['Total unidades sin cambios', indicadores.kpis.total_unidades_sin_cambios],
      ['Porcentaje unidades sin cambios', indicadores.kpis.porcentaje_unidades_sin_cambios],
      ['Total claves evaluadas', indicadores.kpis.total_claves_evaluadas],
      ['Total diferencias', indicadores.kpis.total_diferencias],
      ['Total agregados', indicadores.kpis.total_agregados],
      ['Total eliminados', indicadores.kpis.total_eliminados],
      ['Total modificados', indicadores.kpis.total_modificados],
      ['Modificados (+)', indicadores.kpis.modificados_mas],
      ['Modificados (-)', indicadores.kpis.modificados_menos],
      ['Impacto absoluto total', indicadores.kpis.impacto_absoluto_total],
      ['Porcentaje modificados', indicadores.kpis.porcentaje_modificados],
      ['Porcentaje agregados', indicadores.kpis.porcentaje_agregados],
      ['Porcentaje eliminados', indicadores.kpis.porcentaje_eliminados],
      ['Nivel de variación', indicadores.kpis.riesgo_global],
      [],
      ['Distribucion de acciones'],
      ['Accion', 'Valor'],
      ...indicadores.charts.distribucion_acciones.map((item) => [item.label, item.value]),
      [],
      ['Top unidades por diferencias'],
      ['CLUESIMB', 'Nombre de unidad', 'Total diferencias'],
      ...indicadores.charts.top_unidades_por_diferencias.map((item) => [item.cluesimb, item.nombre_de_unidad, item.total_diferencias]),
      [],
      ['Top unidades por impacto'],
      ['CLUESIMB', 'Nombre de unidad', 'Impacto absoluto total'],
      ...indicadores.charts.top_unidades_por_impacto.map((item) => [item.cluesimb, item.nombre_de_unidad, item.impacto_absoluto_total]),
      [],
      ['Composicion por unidad'],
      ['CLUESIMB', 'Nombre de unidad', 'Agregados', 'Eliminados', 'Modificados (+)', 'Modificados (-)', 'Total diferencias'],
      ...indicadores.charts.composicion_por_unidad.map((item) => [
        item.cluesimb,
        item.nombre_de_unidad,
        item.agregados,
        item.eliminados,
        item.modificados_mas,
        item.modificados_menos,
        item.total_diferencias,
      ]),
    ];

    if (indicadores.tutorial_excel) {
      rows.push(
        [],
        [indicadores.tutorial_excel.titulo],
        ['Paso', 'Descripción'],
        ...indicadores.tutorial_excel.pasos.map((paso, index) => [`Paso ${index + 1}`, paso]),
        [],
        ['Recomendación'],
        [indicadores.tutorial_excel.recomendacion],
      );
    }

    return XLSX.utils.aoa_to_sheet(rows);
  }
}
