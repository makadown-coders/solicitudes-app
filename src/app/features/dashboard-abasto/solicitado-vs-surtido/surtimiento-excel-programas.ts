import type { Fila, FilaProgramatica, Informe } from '../../../models/SurtimientoPrimerNivel';

const idClave = (f: { clues: string; clave: string }) => JSON.stringify([f.clues, f.clave]);
const nota = 'Análisis operativo referencial elaborado a partir de necesidades Wishlist y salidas registradas SAS. Los resultados no acreditan recepción física ni constituyen certificación oficial de abasto. Su uso en comunicaciones institucionales requiere validación de las áreas competentes.';

export function agregarHojasProgramaticas(
  x: typeof import('xlsx'), libro: import('xlsx').WorkBook, informe: Informe,
  pedidosFiltrados: Fila[], modalidad: string, fechaGeneracion: string,
): void {
  const pedidos = new Map(pedidosFiltrados.map(f => [idClave(f), f]));
  const filas = (informe.desgloseProgramatico ?? []).filter(f => pedidos.has(idClave(f)));
  const metadata = [
    [nota],
    ['Modalidad', modalidad],
    ['Solicitudes desde', informe.solicitudesDesde, 'Hasta', informe.solicitudesHasta, 'Corte', informe.corte],
    ['Fecha de generación', fechaGeneracion],
    ...informe.ventanas.map(v => ['Ventana SAS ' + v.zona, v.desde, 'Hasta', v.hasta]),
    ['Criterio de atribución', 'Wishlist define el origen. Se infiere por catálogo únicamente para solicitudes sin contexto y con coincidencia única.'],
    ['Cobertura', 'Solo se evalúan cantidades positivas con atribución exclusiva y cálculo válido en el informe general.'],
    ['Compartidos', 'Las cantidades solicitadas se conservan. El surtimiento compartido queda fuera de los indicadores programáticos.'],
    ['Validación', 'Los desgloses con cantidades discrepantes quedan sin atribución. Las secciones indican pertenencia catalográfica.'],
  ];
  const dato = (valor: number | null) => valor ?? 'N/D';
  const porcentaje = (valor: number | null) => valor === null ? 'N/D' : valor / 100;
  const hoja = (nombre: string, titulos: string[], datos: unknown[][], porcentajes: number[]) => {
    const sheet = x.utils.aoa_to_sheet([...metadata, [], titulos, ...datos]);
    const encabezado = metadata.length + 1;
    sheet['!autofilter'] = { ref: x.utils.encode_range({
      s: { r: encabezado, c: 0 }, e: { r: encabezado + datos.length, c: titulos.length - 1 },
    }) };
    sheet['!cols'] = titulos.map(t => ({ wch: Math.max(18, t.length + 3) }));
    datos.forEach((_, i) => porcentajes.forEach(c => {
      const cell = sheet[x.utils.encode_cell({ r: encabezado + 1 + i, c })];
      if (cell?.t === 'n') cell.z = '0.00%';
    }));
    x.utils.book_append_sheet(libro, sheet, nombre);
  };
  for (const aps of [true, false]) {
    const titulos = [
      'Jurisdicción', 'Municipio', 'Unidad médica', 'CLUES',
      ...(aps ? ['Ramificación APS catalográfica'] : ['Programa Preventivo', 'Sección catalográfica']),
      'Clave CNIS', 'Descripción', 'Cantidad solicitada', 'Origen registrado/inferido',
      'Surtido atribuible', 'Pendiente', 'Excedente', 'Cobertura', 'Porcentaje surtido/solicitado', 'Condición de atribución',
    ];
    const datos = filas.filter(f => (f.vertiente === 'APS') === aps).map(f => {
      const pedido = pedidos.get(idClave(f))!;
      return [
        pedido.jurisdiccion || 'N/D', pedido.municipio, pedido.nombre, f.clues,
        ...(!aps ? [f.programaNombre ?? f.programa] : []),
        f.ramificaciones.join(', ') || 'N/D', f.clave, pedido.descripcion, f.cantidad, f.evidencia,
        dato(f.surtido), dato(f.pendiente), dato(f.excedente), porcentaje(f.cobertura),
        porcentaje(f.relacion), f.condicion,
      ];
    });
    hoja(aps ? 'ABASTO_APS' : 'ABASTO_PREVENTIVOS', titulos, datos, [titulos.length - 3, titulos.length - 2]);
  }

  const grupos = new Map<string, { nombre: string; filas: FilaProgramatica[] }>([
    ['APS', { nombre: 'APS', filas: [] }],
  ]);
  for (const fila of filas) {
    const id = fila.vertiente === 'APS' ? 'APS' : 'PP:' + fila.programa;
    const grupo = grupos.get(id) ?? { nombre: fila.programaNombre ?? fila.programa ?? 'N/D', filas: [] };
    grupo.filas.push(fila);
    grupos.set(id, grupo);
  }
  const resumen = [...grupos.values()].map(grupo => {
    const evaluables = grupo.filas.filter(f => f.cobertura !== null);
    const compartidas = grupo.filas.filter(f => f.condicion === 'COMPARTIDO');
    const solicitado = evaluables.reduce((sum, f) => sum + f.cantidad, 0);
    const surtido = evaluables.reduce((sum, f) => sum + (f.surtido ?? 0), 0);
    const cubierto = evaluables.reduce((sum, f) => sum + Math.min(Math.max(f.surtido ?? 0, 0), f.cantidad), 0);
    const completas = evaluables.filter(f => (f.surtido ?? 0) >= f.cantidad).length;
    const parciales = evaluables.filter(f => (f.surtido ?? 0) > 0 && (f.surtido ?? 0) < f.cantidad).length;
    const porClaves = evaluables.length ? 100 * completas / evaluables.length : null;
    return {
      nombre: grupo.nombre, porClaves,
      datos: [
        grupo.nombre, new Set(grupo.filas.map(f => f.clues)).size, evaluables.length, completas, parciales,
        evaluables.length - completas - parciales, compartidas.length,
        grupo.filas.reduce((sum, f) => sum + f.cantidad, 0), solicitado,
        compartidas.reduce((sum, f) => sum + f.cantidad, 0), evaluables.length ? surtido : 'N/D',
        evaluables.length ? evaluables.reduce((sum, f) => sum + (f.pendiente ?? 0), 0) : 'N/D',
        evaluables.length ? evaluables.reduce((sum, f) => sum + (f.excedente ?? 0), 0) : 'N/D',
        porcentaje(porClaves), porcentaje(solicitado ? 100 * cubierto / solicitado : null),
        porcentaje(solicitado ? 100 * surtido / solicitado : null),
      ],
    };
  }).sort((a, b) => (b.porClaves ?? -1) - (a.porClaves ?? -1) || a.nombre.localeCompare(b.nombre, 'es'));
  hoja('COBERTURA_POR_PROGRAMA', [
    'Vertiente o programa', 'Unidades solicitantes', 'Claves evaluables', 'Claves completamente cubiertas',
    'Claves parcialmente cubiertas', 'Claves sin surtimiento atribuible', 'Claves compartidas', 'Cantidad solicitada',
    'Cantidad evaluable con atribución', 'Cantidad excluida por condición compartida', 'Surtido atribuible',
    'Cantidad pendiente', 'Cantidad excedente', '% claves completamente abastecidas',
    '% cobertura por cantidad', '% surtido/solicitado',
  ], resumen.map(f => f.datos), [13, 14, 15]);
}
