import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RadarGlobalV2EstadoOperativo, RadarGlobalV2OrdenRow, RadarGlobalV2Row, RadarGlobalV2SalidaRow, RadarGlobalV2Segmento } from '../../../models/radar-abasto/RadarAbastoModels';
import { RadarAbastoService } from '../../../services/radar-abasto.service';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-radar-global-v2',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './radar-global-v2.component.html',
  styleUrl: './radar-global-v2.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RadarGlobalV2Component implements OnInit {
  private radar = inject(RadarAbastoService);
  loading = signal(false);
  exporting = signal(false);
  error = signal('');
  rows = signal<RadarGlobalV2Row[]>([]);
  total = signal(0);
  page = signal(1);
  pageSize = signal(25);
  search = signal('');
  clues = signal('');
  months = signal(3);
  segmento = signal<RadarGlobalV2Segmento | ''>('');
  estadoOperativo = signal<RadarGlobalV2EstadoOperativo | ''>('');
  summary = signal({ criticas_cpm: 0, atencion_cpm: 0, demanda_sin_cpm: 0, cpm_sin_solicitud: 0, cubiertas: 0 });
  ordenesDetalle = signal<Record<string, RadarGlobalV2OrdenRow[]>>({});
  ordenesAbiertas = signal<Set<string>>(new Set());
  ordenesCargando = signal<Set<string>>(new Set());
  salidasDetalle = signal<Record<string, RadarGlobalV2SalidaRow[]>>({});
  salidasAbiertas = signal<Set<string>>(new Set());
  salidasCargando = signal<Set<string>>(new Set());
  descripcionesAbiertas = signal<Set<string>>(new Set());
  ayudaSegmentoAbierta = signal<string | null>(null);
  ayudaEstadoAbierta = signal<string | null>(null);

  readonly segmentos: Array<{ value: RadarGlobalV2Segmento | ''; label: string }> = [
    { value: '', label: 'Todos los segmentos' },
    { value: 'CRITICA_CPM', label: 'Críticas con CPM' },
    { value: 'ATENCION_CPM', label: 'Atención con CPM' },
    { value: 'DEMANDA_SIN_CPM', label: 'Demanda sin CPM' },
    { value: 'CPM_SIN_SOLICITUD', label: 'CPM sin solicitud observada' },
    { value: 'CUBIERTA', label: 'Cubiertas' },
    { value: 'OBSERVAR', label: 'Por observar' }
  ];
  readonly estadosOperativos: Array<{ value: RadarGlobalV2EstadoOperativo | ''; label: string }> = [
    { value: '', label: 'Cualquier estado operativo' },
    { value: 'VIGENTE_EN_PROCESO', label: 'Vigente · en proceso' },
    { value: 'VIGENTE_CON_SALIDA', label: 'Vigente · con salida' },
    { value: 'FUERA_UMBRAL_SIN_SALIDA', label: 'Fuera del umbral · sin salida' },
    { value: 'HISTORICA_CON_SALIDA', label: 'Histórica · con salida' },
    { value: 'SIN_SOLICITUD_OBSERVADA', label: 'Sin solicitud observada' }
  ];
  readonly definicionesEstado: Record<RadarGlobalV2EstadoOperativo, { descripcion: string; alcance: string; accion: string }> = {
    VIGENTE_EN_PROCESO: {
      descripcion: 'La última solicitud fue registrada dentro de los últimos 14 días y aún no se observa una salida posterior hacia la unidad.',
      alcance: 'El almacén continúa dentro de la ventana operativa habitual. No significa que la solicitud esté desatendida.',
      accion: 'Dar seguimiento sin escalar automáticamente y revisar nuevamente al acercarse el fin del umbral.'
    },
    VIGENTE_CON_SALIDA: {
      descripcion: 'La solicitud continúa dentro del umbral de 14 días y existe al menos una salida posterior registrada hacia la unidad.',
      alcance: 'Una salida registrada no confirma por sí sola la recepción, disponibilidad física ni cobertura total de la solicitud.',
      accion: 'Confirmar recepción y cantidad entregada antes de considerar atendida la necesidad.'
    },
    FUERA_UMBRAL_SIN_SALIDA: {
      descripcion: 'Han transcurrido más de 14 días desde la última solicitud y no se observa una salida posterior hacia la unidad.',
      alcance: 'Es una señal para seguimiento; no demuestra por sí sola incumplimiento, pues pueden existir movimientos aún no cargados.',
      accion: 'Validar con almacén y unidad, revisar fuentes oficiales y documentar el seguimiento.'
    },
    HISTORICA_CON_SALIDA: {
      descripcion: 'La última solicitud ya está fuera del umbral vigente, pero se encontró una salida posterior hacia la unidad.',
      alcance: 'La salida aporta evidencia de atención, aunque no confirma recepción ni que la cantidad haya sido suficiente.',
      accion: 'Verificar recepción, cobertura resultante y si persiste la necesidad.'
    },
    SIN_SOLICITUD_OBSERVADA: {
      descripcion: 'La clave no apareció en las solicitudes registradas durante el periodo histórico seleccionado.',
      alcance: 'No significa que la unidad no la necesite ni que su CPM sea incorrecto.',
      accion: 'Revisar ciclos de solicitud, vigencia del CPM, existencias y posibles alternativas.'
    }
  };

  readonly definicionesSegmento: Record<RadarGlobalV2Segmento, { descripcion: string; criterio: string }> = {
    CRITICA_CPM: {
      descripcion: 'Demanda observada con existencia menor a un CPM y señales de atención inmediata.',
      criterio: 'Sin existencia o solicitada en al menos la mitad de los ciclos; una orden pendiente no se considera existencia disponible.'
    },
    ATENCION_CPM: {
      descripcion: 'Demanda observada con existencia menor a un CPM, pero sin alcanzar el criterio de criticidad.',
      criterio: 'Requiere seguimiento de cobertura, alternativas y órdenes antes de escalarla.'
    },
    DEMANDA_SIN_CPM: {
      descripcion: 'La unidad ha solicitado la clave, no tiene CPM registrado y el snapshot no muestra existencia.',
      criterio: 'Señala una posible necesidad no representada en el universo CPM; debe validarse con la unidad.'
    },
    CPM_SIN_SOLICITUD: {
      descripcion: 'La clave pertenece al universo CPM de la unidad, pero no apareció en las solicitudes del periodo.',
      criterio: 'No significa que la unidad no la necesite; es una señal para revisar ciclos, inventario, alternativas y vigencia del CPM.'
    },
    CUBIERTA: {
      descripcion: 'La existencia actual alcanza al menos un CPM o la brecha puede cubrirse con alternativas locales observadas.',
      criterio: 'La cobertura por alternativas es analítica y debe validarse antes de sustituir una clave.'
    },
    OBSERVAR: {
      descripcion: 'La combinación unidad-clave no coincide con los criterios prioritarios actuales.',
      criterio: 'Permanece visible para análisis; no equivale automáticamente a una condición favorable o desfavorable.'
    }
  };

  ngOnInit(): void { void this.cargar(); }
  get totalPages(): number { return Math.max(1, Math.ceil(this.total() / this.pageSize())); }

  async cargar(reset = false): Promise<void> {
    if (reset) {
      this.page.set(1);
      this.ordenesDetalle.set({});
      this.ordenesAbiertas.set(new Set());
      this.salidasDetalle.set({});
      this.salidasAbiertas.set(new Set());
      this.descripcionesAbiertas.set(new Set());
      this.ayudaSegmentoAbierta.set(null);
      this.ayudaEstadoAbierta.set(null);
    }
    this.loading.set(true); this.error.set('');
    try {
      const out = await this.radar.listarGlobalV2({
        search: this.search().trim(), clues: this.clues().trim(), segmento: this.segmento(),
        estado_operativo: this.estadoOperativo(),
        months: this.months(), page: this.page(), pageSize: this.pageSize()
      });
      this.rows.set(out.data ?? []); this.total.set(Number(out.total ?? 0));
      this.summary.set(out.summary ?? this.summary());
    } catch {
      this.rows.set([]); this.total.set(0);
      this.error.set('No fue posible cargar el radar. Verifica que el backend V2 esté disponible.');
    } finally { this.loading.set(false); }
  }

  filtrar(segmento: RadarGlobalV2Segmento | ''): void { this.segmento.set(segmento); void this.cargar(true); }
  anterior(): void { if (this.page() > 1) { this.page.update(v => v - 1); void this.cargar(); } }
  siguiente(): void { if (this.page() < this.totalPages) { this.page.update(v => v + 1); void this.cargar(); } }
  porcentaje(row: RadarGlobalV2Row): number { return Math.round((row.frecuencia_solicitud || 0) * 100); }
  etiqueta(segmento: RadarGlobalV2Segmento): string {
    return this.segmentos.find(x => x.value === segmento)?.label ?? segmento;
  }
  etiquetaEstado(estado: RadarGlobalV2EstadoOperativo): string {
    return this.estadosOperativos.find(x => x.value === estado)?.label ?? estado;
  }

  claveFila(row: RadarGlobalV2Row): string { return `${row.cluesimb}|${row.clave}`; }
  descripcionAbierta(row: RadarGlobalV2Row): boolean { return this.descripcionesAbiertas().has(this.claveFila(row)); }
  toggleDescripcion(row: RadarGlobalV2Row): void {
    const key = this.claveFila(row);
    this.descripcionesAbiertas.update(current => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  toggleAyudaSegmento(row: RadarGlobalV2Row): void {
    const key = this.claveFila(row);
    this.ayudaSegmentoAbierta.update(current => current === key ? null : key);
  }
  toggleAyudaEstado(row: RadarGlobalV2Row): void {
    const key = this.claveFila(row);
    this.ayudaEstadoAbierta.update(current => current === key ? null : key);
  }
  ordenesDe(row: RadarGlobalV2Row): RadarGlobalV2OrdenRow[] { return this.ordenesDetalle()[this.claveFila(row)] ?? []; }
  salidasDe(row: RadarGlobalV2Row): RadarGlobalV2SalidaRow[] { return this.salidasDetalle()[this.claveFila(row)] ?? []; }

  async toggleSalidas(row: RadarGlobalV2Row): Promise<void> {
    const key = this.claveFila(row);
    if (this.salidasAbiertas().has(key)) {
      this.salidasAbiertas.update(current => { const next = new Set(current); next.delete(key); return next; });
      return;
    }
    this.salidasAbiertas.update(current => new Set(current).add(key));
    if (this.salidasDetalle()[key] || this.salidasCargando().has(key)) return;
    this.salidasCargando.update(current => new Set(current).add(key));
    try {
      const out = await this.radar.listarGlobalV2Salidas(row.cluesimb, row.clave, this.months());
      this.salidasDetalle.update(current => ({ ...current, [key]: out.data ?? [] }));
    } catch {
      this.salidasDetalle.update(current => ({ ...current, [key]: [] }));
    } finally {
      this.salidasCargando.update(current => { const next = new Set(current); next.delete(key); return next; });
    }
  }

  async toggleOrdenes(row: RadarGlobalV2Row): Promise<void> {
    const key = this.claveFila(row);
    if (this.ordenesAbiertas().has(key)) {
      this.ordenesAbiertas.update(current => { const next = new Set(current); next.delete(key); return next; });
      return;
    }
    this.ordenesAbiertas.update(current => new Set(current).add(key));
    if (this.ordenesDetalle()[key] || this.ordenesCargando().has(key)) return;
    this.ordenesCargando.update(current => new Set(current).add(key));
    try {
      const out = await this.radar.listarGlobalV2Ordenes(row.cluesimb, row.clave, this.months());
      this.ordenesDetalle.update(current => ({ ...current, [key]: out.data ?? [] }));
    } catch {
      this.ordenesDetalle.update(current => ({ ...current, [key]: [] }));
    } finally {
      this.ordenesCargando.update(current => { const next = new Set(current); next.delete(key); return next; });
    }
  }

  async exportarExcel(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true); this.error.set('');
    try {
      const out = await this.radar.exportarGlobalV2({
        search: this.search().trim(), clues: this.clues().trim(),
        segmento: this.segmento(), estado_operativo: this.estadoOperativo(), months: this.months()
      });
      const rows = out.data ?? [];
      const paresConEvidencia = rows
        .filter(row => row.salida_posterior || row.ordenes_pendientes > 0 || row.recepciones_recientes > 0)
        .map(row => ({ cluesimb: row.cluesimb, clave: row.clave }));
      const evidencia = paresConEvidencia.length
        ? await this.radar.exportarGlobalV2Detalles(paresConEvidencia, this.months())
        : { salidas: [], ordenes: [] };
      const indice = new Map(rows.map(row => [this.claveFila(row), row]));
      const radar = rows.map(row => ({
        'Requiere seguimiento': this.requiereSeguimiento(row) ? 'Sí' : 'No',
        'Motivos de seguimiento': this.motivosSeguimiento(row),
        'Estado operativo': this.etiquetaEstado(row.estado_operativo), Segmento: this.etiqueta(row.segmento),
        Prioridad: row.prioridad, CLUES: row.cluesimb, Unidad: row.nombre_de_unidad ?? '', Clave: row.clave,
        Descripción: row.descripcion ?? '', CPM: row.cpm, 'En universo CPM': row.en_cpm ? 'Sí' : 'No',
        'Existencia disponible': row.existencia_actual, 'Fecha del snapshot': this.fechaCorta(row.snapshot_existencias),
        'Cobertura en CPM': row.cobertura_cpm ?? '', 'Cobertura estimada en días': row.cobertura_dias ?? '',
        'Solicitado en periodo': row.solicitado_periodo, 'Ciclos con clave': row.ciclos_con_clave,
        'Ciclos de la unidad': row.ciclos_unidad, 'Frecuencia de solicitud': row.frecuencia_solicitud,
        'Primera solicitud': this.fechaCorta(row.primera_solicitud), 'Última solicitud': this.fechaCorta(row.ultima_solicitud),
        'Solicitud vigente (14 días)': row.solicitud_vigente ? 'Sí' : 'No', 'Solicitado vigente': row.solicitado_vigente,
        'Ciclos vigentes': row.ciclos_vigentes, 'Días desde última solicitud': row.dias_desde_ultima_solicitud ?? '',
        'Fin del umbral': this.fechaCorta(row.fecha_fin_umbral), 'Días restantes del umbral': row.dias_restantes_umbral ?? '',
        'Salida posterior observada': row.salida_posterior ? 'Sí' : 'No', 'Piezas en salidas posteriores': row.piezas_salida_posterior,
        'Última salida posterior': this.fechaCorta(row.ultima_salida_posterior),
        'Alternativas con existencia': row.homologos_disponibles,
        'Existencia alternativa equivalente': row.existencia_homologos_equivalente,
        'Mejor alternativa': row.mejor_homologo ?? '', 'Órdenes pendientes (contexto)': row.ordenes_pendientes,
        'Piezas pendientes (contexto)': row.piezas_pendientes, 'Órdenes por vencer': row.ordenes_por_vencer,
        'Órdenes vencidas': row.ordenes_vencidas, 'Recepciones últimos 30 días': row.recepciones_recientes,
        'Piezas recibidas últimos 30 días': row.piezas_recibidas_recientes,
        'Próxima entrega': this.fechaCorta(row.proxima_entrega), 'Cobertura proyectada en piezas': row.cobertura_proyectada,
        'Cobertura proyectada en CPM': row.cobertura_proyectada_cpm ?? '', Razones: row.razones.join(' | ')
      }));
      const salidas = evidencia.salidas.map(salida => {
        const row = indice.get(`${salida.cluesimb}|${salida.clave}`);
        return { CLUES: salida.cluesimb, Unidad: row?.nombre_de_unidad ?? salida.unidad_destino ?? '',
          Clave: salida.clave, Descripción: row?.descripcion ?? '',
          'Última solicitud': this.fechaCorta(salida.ultima_solicitud), 'Fecha de salida': this.fechaCorta(salida.fecha_entregado),
          Cantidad: Number(salida.cantidad), Folio: salida.folio ?? '', 'Folio extra': salida.folio_extra ?? '',
          Origen: salida.unidad_origen ?? '', Destino: salida.unidad_destino ?? '', Tipo: salida.tipo ?? '', Programa: salida.programa ?? '' };
      });
      const ordenes = evidencia.ordenes.map(orden => {
        const row = indice.get(`${orden.cluesimb}|${orden.clave}`);
        return { CLUES: orden.cluesimb, Unidad: row?.nombre_de_unidad ?? '', Clave: orden.clave,
          Descripción: row?.descripcion ?? '', 'Orden de suministro': orden.orden_de_suministro ?? '',
          Estado: this.etiquetaOrden(orden.estado_radar), Proveedor: orden.proveedor ?? '',
          'Fecha de emisión': this.fechaCorta(orden.fecha_emision), 'Fecha límite': this.fechaCorta(orden.fecha_limite_de_entrega),
          'Fecha de recepción': this.fechaCorta(orden.fecha_recepcion), 'Piezas emitidas': Number(orden.piezas_emitidas),
          'Piezas recibidas': Number(orden.piezas_recibidas), 'Piezas pendientes': Number(orden.piezas_pendientes) };
      });
      const workbook = XLSX.utils.book_new();
      const guia = XLSX.utils.aoa_to_sheet([
        ['Radar de demanda y cobertura — guía y alcance'], ['Fecha de exportación', new Date().toLocaleString('es-MX')],
        ['Periodo analizado', `${this.months()} meses`], ['Búsqueda', this.search().trim() || 'Sin filtro'],
        ['CLUES', this.clues().trim() || 'Todas'], ['Segmento', this.etiqueta(this.segmento() || 'OBSERVAR').replace('Por observar', this.segmento() ? 'Por observar' : 'Todos')],
        ['Estado operativo', this.estadoOperativo() ? this.etiquetaEstado(this.estadoOperativo() as RadarGlobalV2EstadoOperativo) : 'Todos'],
        ['Resultados encontrados', out.total], ['Resultados exportados', radar.length], [],
        ['Regla operativa', 'Una solicitud se considera vigente durante 14 días naturales a partir de su última fecha registrada.'],
        ['Evidencia principal', 'Las salidas se vinculan por unidad destino. Una salida no confirma por sí sola la recepción ni la cobertura total.'],
        ['Órdenes', 'Se muestran únicamente como contexto. Las piezas pendientes no equivalen a existencia disponible.'],
        ['Alcance', 'Información analítica de apoyo; debe validarse contra sistemas institucionales, documentos oficiales y registros de las áreas responsables.'],
        ['Precaución', 'Sin solicitud observada no significa que la unidad no necesite la clave.'], [],
        ['Segmento', 'Significado'],
        ...this.segmentos.filter(x => x.value).map(x => [x.label, this.definicionesSegmento[x.value as RadarGlobalV2Segmento].descripcion]), [],
        ['Estado operativo', 'Significado'],
        ...this.estadosOperativos.filter(x => x.value).map(x => [x.label, this.definicionesEstado[x.value as RadarGlobalV2EstadoOperativo].descripcion])
      ]);
      guia['!cols'] = [{ wch: 28 }, { wch: 100 }];
      const resumen = this.crearResumenExcel(out, rows);
      const radarSheet = this.crearHojaTabla(radar, 'Sin resultados para los filtros seleccionados');
      this.formatearColumna(radarSheet, 'Frecuencia de solicitud', '0.00%');
      XLSX.utils.book_append_sheet(workbook, guia, 'Guía y alcance');
      XLSX.utils.book_append_sheet(workbook, resumen, 'Resumen');
      XLSX.utils.book_append_sheet(workbook, radarSheet, 'Radar');
      XLSX.utils.book_append_sheet(workbook, this.crearHojaTabla(salidas, 'Sin salidas posteriores observadas'), 'Detalle salidas');
      XLSX.utils.book_append_sheet(workbook, this.crearHojaTabla(ordenes, 'Sin órdenes relacionadas'), 'Órdenes contexto');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
      XLSX.writeFile(workbook, `radar_demanda_cobertura_${stamp}.xlsx`, { bookType: 'xlsx' });
      if (out.truncated) this.error.set('La exportación alcanzó el límite de 50,000 filas. Aplica filtros para obtener el universo restante.');
    } catch {
      this.error.set('No fue posible generar el Excel del radar. Intenta aplicar filtros más específicos.');
    } finally { this.exporting.set(false); }
  }

  private crearResumenExcel(out: any, rows: RadarGlobalV2Row[]): XLSX.WorkSheet {
    const porEstado = this.estadosOperativos.filter(x => x.value).map(x => [x.label,
      rows.filter(row => row.estado_operativo === x.value).length]);
    return XLSX.utils.aoa_to_sheet([
      ['Resumen del universo exportado'], [], ['Segmentos', 'Total'],
      ['Críticas con CPM', out.summary.criticas_cpm], ['Atención con CPM', out.summary.atencion_cpm],
      ['Demanda sin CPM', out.summary.demanda_sin_cpm], ['CPM sin solicitud observada', out.summary.cpm_sin_solicitud],
      ['Cubiertas', out.summary.cubiertas], [], ['Estados operativos', 'Total'], ...porEstado, [],
      ['Indicadores para seguimiento', 'Total'],
      ['Fuera del umbral sin salida', rows.filter(x => x.estado_operativo === 'FUERA_UMBRAL_SIN_SALIDA').length],
      ['Con órdenes vencidas', rows.filter(x => x.ordenes_vencidas > 0).length],
      ['Críticas con CPM', rows.filter(x => x.segmento === 'CRITICA_CPM').length],
      ['Con salida posterior observada', rows.filter(x => x.salida_posterior).length]
    ]);
  }

  private crearHojaTabla(data: Record<string, unknown>[], mensaje: string): XLSX.WorkSheet {
    const rows = data.length ? data : [{ Mensaje: mensaje }];
    const sheet = XLSX.utils.json_to_sheet(rows);
    if (sheet['!ref']) sheet['!autofilter'] = { ref: sheet['!ref'] };
    const headers = Object.keys(rows[0]);
    sheet['!cols'] = headers.map(header => ({
      wch: Math.min(48, Math.max(12, header.length + 2, ...rows.slice(0, 200).map(row => String(row[header] ?? '').length + 2)))
    }));
    (sheet as any)['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
    return sheet;
  }

  private formatearColumna(sheet: XLSX.WorkSheet, encabezado: string, formato: string): void {
    if (!sheet['!ref']) return;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    for (let col = range.s.c; col <= range.e.c; col++) {
      if (sheet[XLSX.utils.encode_cell({ r: 0, c: col })]?.v !== encabezado) continue;
      for (let row = 1; row <= range.e.r; row++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
        if (cell) cell.z = formato;
      }
    }
  }

  private requiereSeguimiento(row: RadarGlobalV2Row): boolean {
    return row.segmento === 'CRITICA_CPM' || row.estado_operativo === 'FUERA_UMBRAL_SIN_SALIDA' || row.ordenes_vencidas > 0;
  }

  private motivosSeguimiento(row: RadarGlobalV2Row): string {
    return [row.segmento === 'CRITICA_CPM' ? 'Crítica con CPM' : '',
      row.estado_operativo === 'FUERA_UMBRAL_SIN_SALIDA' ? 'Fuera del umbral sin salida' : '',
      row.ordenes_vencidas > 0 ? 'Orden con saldo vencido' : ''].filter(Boolean).join(' | ');
  }

  private fechaCorta(value: string | null | undefined): string {
    if (!value) return '';
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value);
  }

  private etiquetaOrden(estado: RadarGlobalV2OrdenRow['estado_radar']): string {
    return ({ PENDIENTE: 'Pendiente', POR_VENCER: 'Por vencer', VENCIDA: 'Vencida',
      CUMPLIDA_RECIENTE: 'Cumplida recientemente' } as const)[estado] ?? estado;
  }
}
