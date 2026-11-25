import type { Workbook } from 'exceljs';
import type { InformeSegundoNivel, ModalidadNecesidades, UnidadSegundoNivel } from '../../../services/concentrado-segundo-nivel.service';

type Fila = InformeSegundoNivel['filas'][number];
export const fechaSalida = (iso: string | null) => iso ? iso.split('-').reverse().join('/') : 'Sin salida';
const estado = (f: Fila) => f.cantidad <= 0 ? 'Sin solicitud positiva'
  : f.surtido >= f.cantidad ? 'Completa' : f.surtido > 0 ? 'Parcial' : 'Sin surtimiento positivo';
const conSalidaSinSolicitud = (f: Fila) => f.cantidad <= 0 && !!f.ultimaSalida;

export function coberturaPorUnidad(unidades: UnidadSegundoNivel[], filas: Fila[]) {
  const grupos = new Map(unidades.map(u => [u.clues, {
    ...u, evaluables: 0, completas: 0, parciales: 0, sinPositivo: 0, claves: new Set<string>(),
  }]));
  for (const f of filas) {
    const u = grupos.get(f.clues);
    if (!u || f.cantidad <= 0 || u.claves.has(f.clave)) continue;
    u.claves.add(f.clave);
    u.evaluables++;
    if (f.surtido >= f.cantidad) u.completas++;
    else if (f.surtido > 0) u.parciales++;
    else u.sinPositivo++;
  }
  return [...grupos.values()].map(({ claves, ...u }) => ({
    ...u, porcentaje: u.evaluables ? 100 * u.completas / u.evaluables : null,
  })).sort((a, b) => (b.porcentaje ?? -1) - (a.porcentaje ?? -1)
    || a.nombre.localeCompare(b.nombre, 'es') || a.clues.localeCompare(b.clues));
}

const aviso = 'Análisis operativo referencial basado en solicitudes registradas y salidas SAS. Las salidas registradas no acreditan recepción física confirmada ni constituyen certificación oficial de abasto. Su utilización en comunicaciones institucionales requiere validación de las áreas competentes.';
const momentoTijuana = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Tijuana', dateStyle: 'medium', timeStyle: 'medium',
});
const porcentaje = (n: number | null) => n === null ? 'N/D' : n / 100;
type Celdas = (string | number)[];
const idFila = (clues: string, clave: string) => JSON.stringify([clues, clave]);

export function etiquetasInsumos(informe: InformeSegundoNivel | null) {
  const catalogo = new Map((informe?.enriquecimientoExcel?.clasificacion ?? []).map(c => [c.clave, c]));
  return (clave: string): [string, string] => {
    const c = catalogo.get(clave);
    if (!c) return ['Sin clasificar', '—'];
    if (c.ambigua) return [c.tipo, 'Clasificación por revisar'];
    if (c.tipo === 'Sin clasificar') return [c.tipo, '—'];
    if (!c.medicamento) return [c.tipo, 'No aplica'];
    return [c.tipo, c.grupos.map(g => 'Grupo ' + String(g.numero).padStart(2, '0') + ': ' + g.nombre)
      .join('; ') || 'Sin grupo registrado'];
  };
}

export function coberturaPorGrupo(filas: Fila[], clasificacion: NonNullable<InformeSegundoNivel['enriquecimientoExcel']>['grupos']) {
  const porClave = new Map(clasificacion.map(c => [c.clave, c]));
  const grupos = new Map<number | string, { numero: number | string; nombre: string; filas: Map<string, Fila> }>();
  for (const f of filas) {
    const c = porClave.get(f.clave);
    if (!c) continue;
    const pertenencias = c.ambigua ? [{ numero: 'N/D', nombre: 'Correspondencia ambigua' }]
      : c.grupos.length ? c.grupos : [{ numero: '—', nombre: 'Medicamentos sin grupo' }];
    for (const g of pertenencias) {
      const grupo = grupos.get(g.numero) ?? { ...g, filas: new Map<string, Fila>() };
      grupo.filas.set(idFila(f.clues, f.clave), f);
      grupos.set(g.numero, grupo);
    }
  }
  return [...grupos.values()].map(g => {
    const evaluables = [...g.filas.values()].filter(f => f.cantidad > 0);
    const completas = evaluables.filter(f => f.surtido >= f.cantidad).length;
    const parciales = evaluables.filter(f => f.surtido > 0 && f.surtido < f.cantidad).length;
    return {
      numero: g.numero, nombre: g.nombre, unidades: new Set(evaluables.map(f => f.clues)).size,
      evaluables: evaluables.length, completas, parciales, sinPositivo: evaluables.length - completas - parciales,
      porcentaje: evaluables.length && g.numero !== 'N/D' ? 100 * completas / evaluables.length : null,
    };
  }).sort((a, b) => (b.porcentaje ?? -1) - (a.porcentaje ?? -1) || a.nombre.localeCompare(b.nombre, 'es'));
}

export function llenarExcelSegundoNivel(
  libro: Workbook, informe: InformeSegundoNivel, modalidad: ModalidadNecesidades,
  filas: Fila[], cobertura: ReturnType<typeof coberturaPorUnidad>,
  filtros: { jurisdiccion: string; unidad: string }, generado = new Date(),
) {
  const enriquecimiento = informe.enriquecimientoExcel;
  if (!enriquecimiento) throw new Error('Enriquecimiento de Excel sin verificar');
  const documento = (nombre: string, encabezados: string[], filas: Celdas[], anchos: number[], porcentajes: number[] = []) => {
    const hoja = libro.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
    hoja.columns = anchos.map(width => ({ width }));
    const cabecera = hoja.addRow(encabezados);
    cabecera.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cabecera.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } };
    cabecera.alignment = { wrapText: true, vertical: 'middle' };
    cabecera.height = 32;
    hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: encabezados.length } };
    hoja.addRows(filas);
    hoja.eachRow((fila, i) => {
      if (i === 1) return;
      fila.eachCell((celda, columna) => {
        // Las cadenas se escriben como texto, incluso con prefijos interpretables como fórmulas.
        if (typeof celda.value === 'string') celda.numFmt = '@';
        if (typeof celda.value === 'number') celda.numFmt = porcentajes.includes(columna) ? '0.00%' : '#,##0.##';
      });
    });
    return hoja;
  };
  const evaluables = cobertura.reduce((n, u) => n + u.evaluables, 0);
  const completas = cobertura.reduce((n, u) => n + u.completas, 0);
  const sinSolicitud = filas.filter(conSalidaSinSolicitud);
  const ventana = informe.ventanas[0];
  const resumen = documento('RESUMEN_EJECUTIVO', ['Concentrado de Segundo Nivel', 'Valor'], [
    ['Generación (America/Tijuana)', momentoTijuana.format(generado)],
    ['Modalidad de solicitudes', modalidad === 'MES_CALENDARIO' ? 'Mes calendario' : 'Ventana móvil'],
    ['Periodo de solicitudes', fechaSalida(informe.desde) + ' a ' + fechaSalida(informe.hasta)],
    ['Periodo de surtimiento', ventana && ventana.desde <= ventana.hasta ? fechaSalida(ventana.desde) + ' a ' + fechaSalida(ventana.hasta) : 'Sin días en el corte'],
    ['Corte', fechaSalida(informe.corte)],
    ['Jurisdicción', filtros.jurisdiccion || 'Todas'],
    ['Unidad', filtros.unidad || 'Todas'],
    ['Unidades solicitantes', new Set(filas.filter(f => f.solicitudIds.length).map(f => f.clues)).size],
    ['Claves evaluables distintas por unidad', evaluables],
    ['Claves completamente abastecidas', completas],
    ['Parciales', cobertura.reduce((n, u) => n + u.parciales, 0)],
    ['Sin surtimiento positivo', cobertura.reduce((n, u) => n + u.sinPositivo, 0)],
    ['Claves con salida pero sin solicitud positiva', sinSolicitud.length],
    ['Porcentaje general de claves completamente abastecidas', evaluables ? completas / evaluables : 'N/D'],
    ['Aviso institucional', aviso],
    ['Surtido en', 'Fecha del movimiento SAS más reciente hacia la unidad dentro del periodo de surtimiento.'],
    ['Fuentes del surtimiento', 'Este corte incluye salidas SAS de AZM, AZT y AZE. Las entregas directas documentadas en órdenes de suministro están pendientes de validación.'],
    ['Solicitudes', 'La bitácora puede incluir snapshots distintos de un mismo periodo.'],
    ['Método de cobertura', 'La cobertura de claves divide claves completas entre claves evaluables por unidad. La cobertura por piezas utiliza cantidades.'],
  ], [49, 90]);
  resumen.getCell('B15').numFmt = '0.00%';
  for (let i = 16; i <= 20; i++) {
    resumen.getRow(i).alignment = { wrapText: true, vertical: 'middle' };
    resumen.getRow(i).height = i === 16 ? 56 : 32;
  }
  const unidad = (u: UnidadSegundoNivel) => [u.jurisdiccion, u.municipio, u.nombre, u.clues];
  const clasificacion = etiquetasInsumos(informe);
  const base = (f: Fila) => [...unidad(f), f.clave, f.descripcion || 'Sin descripción', ...clasificacion(f.clave)];
  const identificacion = ['Jurisdicción', 'Municipio', 'Unidad', 'CLUES'];
  const columnasClasificacion = ['Tipo de insumo', 'Grupo(s) terapéutico(s)'];
  const insumo = [...identificacion, 'Clave CNIS', 'Descripción', ...columnasClasificacion];
  documento('COBERTURA_POR_UNIDAD', [...identificacion, 'Claves evaluables', 'Completas', 'Parciales', 'Sin surtimiento positivo', 'Porcentaje completamente abastecido'],
    cobertura.map(u => [...unidad(u), u.evaluables, u.completas, u.parciales, u.sinPositivo, porcentaje(u.porcentaje)]),
    [19, 19, 45, 19, 17, 14, 14, 22, 26], [9]);
  documento('CONCILIACION', [...insumo, 'Solicitado', 'Surtido', 'Pendiente', 'Excedente', 'Cobertura (%)', 'Surtido/solicitado (%)', 'Surtido en', 'Estado de conciliación'],
    filas.map(f => [...base(f), f.cantidad, f.surtido, f.pendiente, f.excedente, porcentaje(f.cobertura), porcentaje(f.relacion), fechaSalida(f.ultimaSalida), estado(f)]),
    [19, 19, 45, 19, 23, 62, 22, 48, 15, 15, 15, 15, 17, 20, 18, 25], [13, 14]);
  documento('SIN_SOLICITUD', [...insumo, 'Surtido neto', 'Surtido en'],
    sinSolicitud.map(f => [...base(f), f.surtido, fechaSalida(f.ultimaSalida)]), [19, 19, 45, 19, 23, 62, 22, 48, 17, 18]);
  if (filas.every(f => Array.isArray(f.origenes))) {
    documento('SURTIMIENTO_POR_ORIGEN', ['Unidad destino', 'CLUES destino', 'Clave CNIS', 'Descripción', ...columnasClasificacion, 'Tipo de origen', 'Origen institucional', 'Surtido neto', 'Última fecha de salida'],
      filas.flatMap(f => f.origenes.map(o => [f.nombre, f.clues, f.clave, f.descripcion || 'Sin descripción', ...clasificacion(f.clave),
        o.fuente === 'HOSPITAL' ? 'Transferencia hospitalaria' : o.fuente, o.nombre, o.surtido, fechaSalida(o.ultimaSalida)])),
      [45, 19, 23, 62, 22, 48, 27, 45, 17, 23]);
  }
  const nota = (hoja: ReturnType<typeof documento>, texto: string) => {
    const fila = hoja.addRow([texto]);
    hoja.mergeCells(fila.number, 1, fila.number, Math.min(5, hoja.columnCount));
    fila.alignment = { wrapText: true, vertical: 'middle' };
    fila.height = 31;
  };
  const porId = new Map(filas.map(f => [idFila(f.clues, f.clave), f]));
  const candidatos = enriquecimiento.sustituciones.flatMap(s => {
    const original = porId.get(idFila(s.clues, s.original));
    const sustituta = porId.get(idFila(s.clues, s.sustituta));
    if (!original || !sustituta) return [];
    return [[...base(original), original.cantidad, original.surtido, original.pendiente,
      sustituta.clave, sustituta.descripcion || 'Sin descripción', ...clasificacion(sustituta.clave), sustituta.surtido,
      s.factor ?? 'N/D', s.equivalente ?? 'N/D', s.potencial ?? 'N/D', s.estado]];
  });
  const hojaSustituciones = documento('SUSTITUCIONES_POTENCIALES', [
    ...identificacion, 'CNIS solicitada', 'Descripción solicitada', 'Tipo de insumo solicitado', 'Grupo(s) del solicitado',
    'Cantidad solicitada', 'Surtido directo', 'Pendiente directo', 'CNIS sustituta', 'Descripción sustituta',
    'Tipo de insumo sustituto', 'Grupo(s) del sustituto', 'Surtido neto de sustituta',
    'Factor de conversión', 'Equivalente estimado', 'Potencial por candidato', 'Estado de ambigüedad',
  ], candidatos, [19, 19, 42, 19, 21, 60, 22, 48, 18, 17, 17, 21, 60, 22, 48, 19, 18, 18, 19, 65]);
  hojaSustituciones.autoFilter = `A1:T${hojaSustituciones.rowCount}`;
  hojaSustituciones.eachRow((fila, i) => {
    const celda = fila.getCell(17);
    if (i > 1 && typeof celda.value === 'number') celda.numFmt = '#,##0.##########';
  });
  nota(hojaSustituciones, 'Las sustituciones detectadas son posibilidades de equivalencia según las relaciones configuradas. No acreditan aplicación, autorización, recepción física ni cobertura efectiva de la clave solicitada.');
  nota(hojaSustituciones, 'Cada potencial representa una alternativa por candidato. Evite sumar alternativas para el mismo faltante o reutilizar el saldo de una sustituta compartida.');
  const hojaGrupos = documento('COBERTURA_POR_GRUPO', [
    'Número de grupo CNIS', 'Nombre del grupo', 'Unidades solicitantes', 'Claves evaluables',
    'Completamente abastecidas', 'Parcialmente abastecidas', 'Sin surtimiento positivo', 'Porcentaje de claves completamente abastecidas',
  ], coberturaPorGrupo(filas, enriquecimiento.grupos).map(g =>
    [g.numero, g.nombre, g.unidades, g.evaluables, g.completas, g.parciales, g.sinPositivo, porcentaje(g.porcentaje)]),
  [20, 57, 20, 18, 23, 23, 23, 27], [8]);
  hojaGrupos.autoFilter = `A1:H${hojaGrupos.rowCount}`;
  nota(hojaGrupos, 'Una combinación unidad y CNIS cuenta una vez por grupo. La pertenencia múltiple solapa los grupos. El total general cuenta combinaciones únicas del concentrado.');
  nota(hojaGrupos, 'Se incluyen medicamentos del catálogo CNIS activo. Las coincidencias ambiguas se reportan aparte, sin asignarles grupo ni porcentaje.');
}
