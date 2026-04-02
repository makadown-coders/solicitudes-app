// src/app/features/cpms-dif/cpms-dif-page.component.ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Download, ShieldCheck } from 'lucide-angular';
import { DetalleComponent } from './detalle/detalle.component';
import { ResumenComponent } from './resumen/resumen.component';
import { CpmsDifRow, CpmsDifResumenRow } from './models';
import { CpmsDifService } from './cpms-dif.service';
import { ArticulosService } from '../../services/articulos.service';
import { firstValueFrom } from 'rxjs';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-cpms-dif-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DetalleComponent, ResumenComponent, LucideAngularModule],
  templateUrl: './cpms-dif-page.component.html'
})
export class CpmsDifPageComponent {
  private cpmsDifService = inject(CpmsDifService);
  private articulosService = inject(ArticulosService);

  tab: 'detalle' | 'resumen' = 'detalle';
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
        modificados: row.modificados,
        impacto_absoluto_total: row.impacto_absoluto_total,
      }));

      const wb = XLSX.utils.book_new();
      const wsDetalle = XLSX.utils.json_to_sheet(detalleExport, { skipHeader: false });
      const wsResumen = XLSX.utils.json_to_sheet(resumenExport, { skipHeader: false });

      XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle');
      XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

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
}
