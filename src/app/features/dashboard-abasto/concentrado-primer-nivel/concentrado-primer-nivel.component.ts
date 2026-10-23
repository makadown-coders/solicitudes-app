import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import {
  ConcentradoPrimerNivelResponse,
  OrigenCapturaPrimerNivel,
} from '../../../models/ConcentradoPrimerNivelModels';
import { ConcentradoPrimerNivelService } from '../../../services/concentrado-primer-nivel.service';

const VACIO: ConcentradoPrimerNivelResponse = {
  mode: 'concentrado-primer-nivel', window: { months: 3 }, page: 1, pageSize: 25, total: 0,
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
  readonly error = signal('');
  readonly months = signal(3);
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

  private filtros(paginar: boolean) {
    return {
      months: this.months(), jurisdiccion: this.jurisdiccion().trim(), clues: this.clues().trim(),
      origen: this.origen(), referencia: this.referencia().trim(), search: this.search().trim(),
      page: paginar ? this.page() : 1, pageSize: paginar ? this.pageSize : undefined,
    };
  }
}
