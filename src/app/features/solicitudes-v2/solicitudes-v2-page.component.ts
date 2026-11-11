import { CommonModule } from '@angular/common';
import { Component, ElementRef, QueryList, ViewChildren, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { UniversoUnidad } from '../../models/universos-abasto.model';
import { UniversosAbastoService } from '../../services/universos-abasto.service';
import { EstadoCatalogoFiltro, SolicitudV2AnalisisOperativo, SolicitudV2Contexto, SolicitudV2Renglon, VistaSolicitudV2 } from './solicitudes-v2.model';
import { SolicitudesV2ExcelService } from './solicitudes-v2-excel.service';
import { SolicitudesV2OperativoService } from './solicitudes-v2-operativo.service';

type BorradorSolicitudV2 = {
  version: 1;
  unidadId: number;
  periodo: string;
  responsableCaptura: string;
  solicitud: Array<{ claveNormalizada: string; cantidad: number | null }>;
  seleccionCatalogo: string[];
  vista: VistaSolicitudV2;
  busqueda: string;
  tipoInsumo: string;
  estadoCatalogo: EstadoCatalogoFiltro;
  pagina: number;
};

@Component({
  selector: 'app-solicitudes-v2-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './solicitudes-v2-page.component.html',
  styleUrl: './solicitudes-v2-page.component.css',
})
export class SolicitudesV2PageComponent {
  private readonly universosApi = inject(UniversosAbastoService);
  private readonly operativoApi = inject(SolicitudesV2OperativoService);
  private readonly excel = new SolicitudesV2ExcelService();
  private readonly pageSize = 100;
  private readonly borradorKey = 'solicitudes-v2:borrador:2027:v1';
  private readonly restaurandoBorrador = signal(true);
  private restauracionIntentada = false;

  @ViewChildren('cantidadInput') private cantidadInputs!: QueryList<ElementRef<HTMLInputElement>>;

  readonly unidades = signal<UniversoUnidad[]>([]);
  readonly contexto = signal<SolicitudV2Contexto>({
    unidad: null,
    periodo: '',
    tipoPedido: 'Ordinario',
    responsableCaptura: '',
  });
  readonly renglones = signal<SolicitudV2Renglon[]>([]);
  readonly miSolicitud = signal<SolicitudV2Renglon[]>([]);
  readonly seleccionCatalogo = signal<Set<string>>(new Set());
  readonly vista = signal<VistaSolicitudV2>('CATALOGO');
  readonly cargandoUnidades = signal(false);
  readonly cargandoUniverso = signal(false);
  readonly universoCargado = signal(false);
  readonly errorUnidades = signal('');
  readonly errorUniverso = signal('');
  readonly cambiosSinGuardar = signal(false);
  readonly descargandoExcel = signal(false);
  readonly descargandoExcelInterno = signal(false);
  readonly simulandoEnvio = signal(false);
  readonly simulacionCompletada = signal(false);
  readonly analisisOperativo = signal<SolicitudV2AnalisisOperativo | null>(null);
  readonly errorExcel = signal('');

  readonly busqueda = signal('');
  readonly tipoInsumo = signal('');
  readonly estadoCatalogo = signal<EstadoCatalogoFiltro>('TODAS');
  readonly pagina = signal(1);

  readonly tiposInsumo = computed(() =>
    [...new Set(this.renglones().map(row => row.tipoInsumo).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'es')),
  );

  readonly renglonesFiltrados = computed(() => {
    const termino = this.normalizarTexto(this.busqueda());
    const tipo = this.tipoInsumo();
    const estado = this.estadoCatalogo();
    const agregadas = new Set(this.miSolicitud().map(row => row.claveNormalizada));

    return this.renglones().filter(row => {
      const coincideTexto = !termino || this.normalizarTexto(
        `${row.clave} ${row.descripcion ?? ''}`,
      ).includes(termino);
      const coincideTipo = !tipo || row.tipoInsumo === tipo;
      const coincideEstado = estado === 'TODAS'
        || (estado === 'DISPONIBLES' && !agregadas.has(row.claveNormalizada))
        || (estado === 'AGREGADAS' && agregadas.has(row.claveNormalizada));
      return coincideTexto && coincideTipo && coincideEstado;
    });
  });

  readonly totalPaginas = computed(() =>
    Math.max(1, Math.ceil(this.renglonesFiltrados().length / this.pageSize)),
  );

  readonly renglonesVisibles = computed(() => {
    const inicio = (this.pagina() - 1) * this.pageSize;
    return this.renglonesFiltrados().slice(inicio, inicio + this.pageSize);
  });

  readonly resumen = computed(() => {
    let pendientes = 0;
    let cero = 0;
    let positivas = 0;
    let piezas = 0;
    for (const row of this.miSolicitud()) {
      if (row.cantidad === null) pendientes++;
      else if (row.cantidad === 0) cero++;
      else {
        positivas++;
        piezas += row.cantidad;
      }
    }
    return {
      disponibles: this.renglones().length,
      seleccionadas: this.miSolicitud().length,
      pendientes,
      cero,
      positivas,
      piezas,
    };
  });

  readonly articulosExportables = computed(() =>
    this.miSolicitud().filter(row => row.cantidad !== null && row.cantidad > 0),
  );

  readonly clavesAgregadas = computed(() =>
    new Set(this.miSolicitud().map(row => row.claveNormalizada)),
  );

  readonly omitidasExcel = computed(() =>
    this.miSolicitud().length - this.articulosExportables().length,
  );

  readonly paginaCompletaSeleccionada = computed(() => {
    const visibles = this.renglonesVisibles();
    return visibles.length > 0 && visibles.every(row =>
      this.estaAgregada(row.claveNormalizada) || this.seleccionCatalogo().has(row.claveNormalizada),
    );
  });

  readonly contextoValido = computed(() => {
    const ctx = this.contexto();
    return !!ctx.unidad && /^2027-(0[1-9]|1[0-2])$/.test(ctx.periodo);
  });

  constructor() {
    effect(() => {
      const estado = {
        universoCargado: this.universoCargado(),
        contexto: this.contexto(),
        solicitud: this.miSolicitud(),
        seleccion: this.seleccionCatalogo(),
        vista: this.vista(),
        busqueda: this.busqueda(),
        tipoInsumo: this.tipoInsumo(),
        estadoCatalogo: this.estadoCatalogo(),
        pagina: this.pagina(),
        restaurando: this.restaurandoBorrador(),
      };
      if (!estado.restaurando && estado.universoCargado) this.guardarBorrador(estado);
    });
    void this.cargarUnidades();
  }

  async cargarUnidades(): Promise<void> {
    this.cargandoUnidades.set(true);
    this.errorUnidades.set('');
    try {
      const response = await firstValueFrom(this.universosApi.listarUnidades());
      this.unidades.set(response.data ?? []);
      await this.restaurarBorrador();
    } catch {
      this.errorUnidades.set('No fue posible consultar los hospitales con universo.');
    } finally {
      this.cargandoUnidades.set(false);
    }
  }

  seleccionarUnidad(unidadId: string | number): void {
    const id = Number(unidadId);
    const nuevaUnidad = this.unidades().find(unidad => unidad.id === id) ?? null;
    const actual = this.contexto().unidad;
    if (actual?.id === nuevaUnidad?.id) return;

    if (this.cambiosSinGuardar() && !window.confirm(
      'Cambiar de hospital descartará el borrador y las cantidades capturadas. ¿Deseas continuar?',
    )) return;

    this.contexto.update(ctx => ({ ...ctx, unidad: nuevaUnidad }));
    this.reiniciarUniverso();
  }

  actualizarPeriodo(periodo: string): void {
    if (periodo === this.contexto().periodo) return;
    if (this.cambiosSinGuardar() && !window.confirm(
      'Cambiar el periodo descartará el borrador y las cantidades capturadas. ¿Deseas continuar?',
    )) return;
    this.contexto.update(ctx => ({ ...ctx, periodo }));
    if (this.universoCargado()) this.reiniciarUniverso();
  }

  actualizarResponsable(responsableCaptura: string): void {
    this.contexto.update(ctx => ({ ...ctx, responsableCaptura }));
  }

  async cargarUniverso(): Promise<void> {
    const unidad = this.contexto().unidad;
    if (!unidad || !this.contextoValido() || this.cargandoUniverso()) return;
    if (this.cambiosSinGuardar() && !window.confirm(
      'Recargar el universo descartará el borrador y las cantidades capturadas. ¿Deseas continuar?',
    )) return;

    this.cargandoUniverso.set(true);
    this.errorUniverso.set('');
    this.errorExcel.set('');
    this.simulacionCompletada.set(false);
    this.universoCargado.set(false);
    this.renglones.set([]);

    try {
      const primera = await firstValueFrom(this.universosApi.listarClaves(unidad.id, {
        page: 1,
        pageSize: this.pageSize,
        activo: true,
      }));
      const totalEsperado = primera.pagination.total;
      const recuperados = [...primera.data];

      for (let page = 2; page <= primera.pagination.totalPages; page++) {
        const response = await firstValueFrom(this.universosApi.listarClaves(unidad.id, {
          page,
          pageSize: this.pageSize,
          activo: true,
        }));
        if (response.pagination.total !== totalEsperado) {
          throw new Error('El universo cambió durante la consulta. Vuelve a intentarlo.');
        }
        recuperados.push(...response.data);
      }

      const unicos = new Map<string, SolicitudV2Renglon>();
      for (const row of recuperados) {
        const claveNormalizada = this.normalizarClave(row.clave);
        if (!claveNormalizada || unicos.has(claveNormalizada)) continue;
        unicos.set(claveNormalizada, { ...row, claveNormalizada, cantidad: null });
      }
      if (recuperados.length !== totalEsperado || unicos.size !== totalEsperado) {
        throw new Error('No fue posible validar el universo completo. No se mostrará una carga parcial.');
      }

      this.renglones.set([...unicos.values()]);
      this.miSolicitud.set([]);
      this.seleccionCatalogo.set(new Set());
      this.vista.set('CATALOGO');
      this.universoCargado.set(true);
      this.cambiosSinGuardar.set(false);
      this.limpiarFiltros();
    } catch (error) {
      this.renglones.set([]);
      this.errorUniverso.set(
        error instanceof Error ? error.message : 'No fue posible cargar el universo completo.',
      );
    } finally {
      this.cargandoUniverso.set(false);
    }
  }

  actualizarCantidad(row: SolicitudV2Renglon, input: HTMLInputElement): void {
    const valor = input.value.trim();
    if (valor === '') {
      this.asignarCantidad(row.claveNormalizada, null);
      input.setCustomValidity('');
      return;
    }
    if (!/^\d+$/.test(valor)) {
      input.setCustomValidity('Captura un número entero no negativo.');
      input.reportValidity();
      return;
    }
    const cantidad = Number(valor);
    if (!Number.isSafeInteger(cantidad) || cantidad < 0 || cantidad > 99999) {
      input.setCustomValidity('La cantidad debe estar entre 0 y 99999.');
      input.reportValidity();
      return;
    }
    input.setCustomValidity('');
    this.asignarCantidad(row.claveNormalizada, cantidad);
  }

  impedirCaracteresInvalidos(event: KeyboardEvent): void {
    if (['-', '+', 'e', 'E', '.', ','].includes(event.key)) event.preventDefault();
  }

  avanzarCantidad(event: Event, index: number): void {
    event.preventDefault();
    const input = event.target as HTMLInputElement;
    if (!input.checkValidity()) {
      input.reportValidity();
      return;
    }
    const inputs = this.cantidadInputs.toArray();
    if (inputs[index + 1]) {
      inputs[index + 1].nativeElement.focus();
      inputs[index + 1].nativeElement.select();
      return;
    }
  }

  aplicarFiltros(): void {
    this.pagina.set(1);
  }

  limpiarFiltros(): void {
    this.busqueda.set('');
    this.tipoInsumo.set('');
    this.estadoCatalogo.set('TODAS');
    this.pagina.set(1);
  }

  cambiarPagina(pagina: number): void {
    if (pagina < 1 || pagina > this.totalPaginas()) return;
    this.pagina.set(pagina);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  registroInicial(): number {
    return this.renglonesFiltrados().length === 0 ? 0 : (this.pagina() - 1) * this.pageSize + 1;
  }

  registroFinal(): number {
    return Math.min(this.pagina() * this.pageSize, this.renglonesFiltrados().length);
  }

  cambiarVista(vista: VistaSolicitudV2): void {
    this.vista.set(vista);
  }

  estaAgregada(claveNormalizada: string): boolean {
    return this.clavesAgregadas().has(claveNormalizada);
  }

  estaSeleccionada(claveNormalizada: string): boolean {
    return this.seleccionCatalogo().has(claveNormalizada);
  }

  cantidadCatalogo(claveNormalizada: string): number | '' {
    return this.miSolicitud().find(row => row.claveNormalizada === claveNormalizada)?.cantidad ?? '';
  }

  alternarSeleccion(row: SolicitudV2Renglon, seleccionada: boolean): void {
    if (!seleccionada && this.estaAgregada(row.claveNormalizada)) {
      const agregada = this.miSolicitud().find(item => item.claveNormalizada === row.claveNormalizada);
      if (agregada) this.quitarDeSolicitud(agregada);
      return;
    }
    if (seleccionada && this.estaAgregada(row.claveNormalizada)) return;
    this.seleccionCatalogo.update(actual => {
      const siguiente = new Set(actual);
      if (seleccionada) siguiente.add(row.claveNormalizada);
      else siguiente.delete(row.claveNormalizada);
      return siguiente;
    });
  }

  alternarPagina(seleccionada: boolean): void {
    if (seleccionada) this.seleccionarConjunto(this.renglonesVisibles(), 'visibles');
    else this.deseleccionarConjunto(this.renglonesVisibles(), 'visibles');
  }

  seleccionarConjuntoVisible(): void {
    this.seleccionarConjunto(this.renglonesVisibles(), 'visibles en esta página');
  }

  seleccionarCoincidencias(): void {
    this.seleccionarConjunto(this.renglonesFiltrados(), 'que coinciden con el filtro');
  }

  deseleccionarCoincidencias(): void {
    this.deseleccionarConjunto(this.renglonesFiltrados(), 'que coinciden con el filtro');
  }

  agregarSeleccionadas(): void {
    const seleccionadas = this.seleccionCatalogo();
    if (seleccionadas.size === 0) return;
    const existentes = new Set(this.miSolicitud().map(row => row.claveNormalizada));
    const nuevas = this.renglones().filter(row =>
      seleccionadas.has(row.claveNormalizada) && !existentes.has(row.claveNormalizada),
    );
    if (nuevas.length === 0) return;
    this.miSolicitud.update(rows => [...rows, ...nuevas.map(row => ({ ...row, cantidad: null }))]);
    this.errorExcel.set('');
    this.simulacionCompletada.set(false);
    this.seleccionCatalogo.update(actual => {
      const siguiente = new Set(actual);
      nuevas.forEach(row => siguiente.delete(row.claveNormalizada));
      return siguiente;
    });
    this.cambiosSinGuardar.set(true);
  }

  quitarDeSolicitud(row: SolicitudV2Renglon): void {
    if (row.cantidad !== null && !window.confirm(
      `La clave ${row.clave} ya tiene una cantidad capturada. ¿Deseas quitarla de Mi solicitud?`,
    )) return;
    this.miSolicitud.update(rows => rows.filter(item => item.claveNormalizada !== row.claveNormalizada));
    this.errorExcel.set('');
    this.simulacionCompletada.set(false);
    this.cambiosSinGuardar.set(true);
  }

  async verExcelInterno(): Promise<void> {
    if (this.descargandoExcelInterno() || !this.simulacionCompletada()) return;
    const articulos = this.articulosExportables();
    if (articulos.length === 0) {
      this.errorExcel.set('Captura al menos una cantidad mayor que cero para generar el Excel interno.');
      return;
    }

    const analisis = this.analisisOperativo();
    if (!analisis) {
      this.errorExcel.set('El análisis operativo ya no está disponible. Ejecuta nuevamente la simulación.');
      return;
    }

    this.descargandoExcelInterno.set(true);
    this.errorExcel.set('');
    try {
      const buffer = await this.excel.generarExcelOperativo(this.contexto(), articulos, analisis);
      if (buffer.byteLength === 0) throw new Error('El libro generado está vacío.');
      this.excel.descargar(buffer, this.contexto(), 'INTERNO');
    } catch {
      this.errorExcel.set('No fue posible generar el Excel interno. Tus cantidades se conservaron; intenta nuevamente.');
    } finally {
      this.descargandoExcelInterno.set(false);
    }
  }

  async simularEnvio(): Promise<void> {
    if (this.simulandoEnvio()) return;
    const articulos = this.articulosExportables();
    if (articulos.length === 0) {
      this.errorExcel.set('Captura al menos una cantidad mayor que cero para simular el envío.');
      return;
    }

    this.simulandoEnvio.set(true);
    this.simulacionCompletada.set(false);
    this.analisisOperativo.set(null);
    this.errorExcel.set('');
    try {
      const unidadId = this.contexto().unidad?.id;
      if (!unidadId) throw new Error('No hay una unidad seleccionada.');
      const analisis = await firstValueFrom(this.operativoApi.obtenerAnalisis(unidadId, articulos));
      const buffer = await this.excel.generarExcelOperativo(this.contexto(), articulos, analisis);
      if (buffer.byteLength === 0) throw new Error('El libro generado está vacío.');
      this.analisisOperativo.set(analisis);
      this.simulacionCompletada.set(true);
    } catch {
      this.errorExcel.set('No fue posible completar la simulación. Tus cantidades se conservaron; intenta nuevamente.');
    } finally {
      this.simulandoEnvio.set(false);
    }
  }

  async descargarExcel(): Promise<void> {
    if (this.descargandoExcel() || !this.simulacionCompletada()) return;
    const articulos = this.articulosExportables();
    if (articulos.length === 0) {
      this.errorExcel.set('Captura al menos una cantidad mayor que cero para descargar el Excel.');
      return;
    }

    this.descargandoExcel.set(true);
    this.errorExcel.set('');
    try {
      const buffer = await this.excel.generarExcelUsuario(this.contexto(), articulos);
      if (buffer.byteLength === 0) throw new Error('El libro generado está vacío.');
      this.excel.descargar(buffer, this.contexto(), 'USUARIO');
    } catch {
      this.errorExcel.set('No fue posible generar el Excel. Tus cantidades se conservaron; intenta nuevamente.');
    } finally {
      this.descargandoExcel.set(false);
    }
  }

  trackByClave(_index: number, row: SolicitudV2Renglon): string {
    return row.claveNormalizada;
  }

  private asignarCantidad(claveNormalizada: string, cantidad: number | null): void {
    let cambio = false;
    this.miSolicitud.update(rows => {
      const indice = rows.findIndex(row => row.claveNormalizada === claveNormalizada);
      if (indice >= 0) {
        if (rows[indice].cantidad === cantidad) return rows;
        cambio = true;
        return rows.map((row, i) => i === indice ? { ...row, cantidad } : row);
      }
      if (cantidad === null) return rows;
      const catalogo = this.renglones().find(row => row.claveNormalizada === claveNormalizada);
      if (!catalogo) return rows;
      cambio = true;
      return [...rows, { ...catalogo, cantidad }];
    });
    if (!cambio) return;
    this.seleccionCatalogo.update(actual => {
      if (!actual.has(claveNormalizada)) return actual;
      const siguiente = new Set(actual);
      siguiente.delete(claveNormalizada);
      return siguiente;
    });
    this.errorExcel.set('');
    this.simulacionCompletada.set(false);
    this.analisisOperativo.set(null);
    this.cambiosSinGuardar.set(true);
  }

  private seleccionarConjunto(rows: SolicitudV2Renglon[], descripcion: string): void {
    const nuevas = rows.filter(row =>
      !this.estaAgregada(row.claveNormalizada) && !this.seleccionCatalogo().has(row.claveNormalizada),
    );
    if (!nuevas.length) return;
    if (!window.confirm(`Se seleccionarán ${nuevas.length} claves ${descripcion}. ¿Deseas continuar?`)) return;
    this.seleccionCatalogo.update(actual => {
      const siguiente = new Set(actual);
      nuevas.forEach(row => siguiente.add(row.claveNormalizada));
      return siguiente;
    });
  }

  private deseleccionarConjunto(rows: SolicitudV2Renglon[], descripcion: string): void {
    const claves = new Set(rows.map(row => row.claveNormalizada));
    const temporales = [...this.seleccionCatalogo()].filter(clave => claves.has(clave));
    const agregadas = this.miSolicitud().filter(row => claves.has(row.claveNormalizada));
    if (!temporales.length && !agregadas.length) return;
    const conCantidad = agregadas.filter(row => row.cantidad !== null).length;
    const detalle = conCantidad ? ` Se descartarán cantidades de ${conCantidad} claves.` : '';
    if (!window.confirm(`Se deseleccionarán ${temporales.length + agregadas.length} claves ${descripcion}.${detalle} ¿Deseas continuar?`)) return;
    this.seleccionCatalogo.update(actual => {
      const siguiente = new Set(actual);
      temporales.forEach(clave => siguiente.delete(clave));
      return siguiente;
    });
    if (agregadas.length) {
      this.miSolicitud.update(actual => actual.filter(row => !claves.has(row.claveNormalizada)));
      this.errorExcel.set('');
      this.simulacionCompletada.set(false);
      this.analisisOperativo.set(null);
      this.cambiosSinGuardar.set(true);
    }
  }

  private reiniciarUniverso(): void {
    localStorage.removeItem(this.borradorKey);
    this.renglones.set([]);
    this.miSolicitud.set([]);
    this.seleccionCatalogo.set(new Set());
    this.vista.set('CATALOGO');
    this.universoCargado.set(false);
    this.cambiosSinGuardar.set(false);
    this.simulacionCompletada.set(false);
    this.errorExcel.set('');
    this.errorUniverso.set('');
    this.limpiarFiltros();
  }

  private normalizarClave(clave: string): string {
    return (clave ?? '').trim().toUpperCase();
  }

  private normalizarTexto(texto: string): string {
    return (texto ?? '').toLocaleLowerCase('es-MX').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').trim();
  }

  private guardarBorrador(estado: {
    contexto: SolicitudV2Contexto;
    solicitud: SolicitudV2Renglon[];
    seleccion: Set<string>;
    vista: VistaSolicitudV2;
    busqueda: string;
    tipoInsumo: string;
    estadoCatalogo: EstadoCatalogoFiltro;
    pagina: number;
  }): void {
    const unidadId = estado.contexto.unidad?.id;
    if (!unidadId) return;
    const borrador: BorradorSolicitudV2 = {
      version: 1,
      unidadId,
      periodo: estado.contexto.periodo,
      responsableCaptura: estado.contexto.responsableCaptura,
      solicitud: estado.solicitud.map(row => ({
        claveNormalizada: row.claveNormalizada,
        cantidad: row.cantidad,
      })),
      seleccionCatalogo: [...estado.seleccion],
      vista: estado.vista,
      busqueda: estado.busqueda,
      tipoInsumo: estado.tipoInsumo,
      estadoCatalogo: estado.estadoCatalogo,
      pagina: estado.pagina,
    };
    try {
      localStorage.setItem(this.borradorKey, JSON.stringify(borrador));
    } catch {
      // La captura sigue disponible en memoria aunque el navegador rechace el almacenamiento local.
    }
  }

  private async restaurarBorrador(): Promise<void> {
    if (this.restauracionIntentada) return;
    this.restauracionIntentada = true;
    const borrador = this.leerBorrador();
    if (!borrador) {
      this.restaurandoBorrador.set(false);
      return;
    }
    const unidad = this.unidades().find(item => item.id === borrador.unidadId);
    if (!unidad) {
      localStorage.removeItem(this.borradorKey);
      this.restaurandoBorrador.set(false);
      return;
    }

    this.contexto.set({
      unidad,
      periodo: borrador.periodo,
      responsableCaptura: borrador.responsableCaptura,
      tipoPedido: 'Ordinario',
    });
    await this.cargarUniverso();
    if (this.universoCargado()) {
      const catalogo = new Map(this.renglones().map(row => [row.claveNormalizada, row]));
      this.miSolicitud.set(borrador.solicitud.flatMap(item => {
        const row = catalogo.get(item.claveNormalizada);
        return row ? [{ ...row, cantidad: item.cantidad }] : [];
      }));
      this.seleccionCatalogo.set(new Set(
        borrador.seleccionCatalogo.filter(clave => catalogo.has(clave)),
      ));
      this.busqueda.set(borrador.busqueda);
      this.tipoInsumo.set(borrador.tipoInsumo);
      this.estadoCatalogo.set(borrador.estadoCatalogo);
      this.pagina.set(Math.min(Math.max(1, borrador.pagina), this.totalPaginas()));
      this.vista.set(borrador.vista === 'REVISION' && this.miSolicitud().length === 0
        ? 'CATALOGO' : borrador.vista);
      this.cambiosSinGuardar.set(this.miSolicitud().length > 0 || this.seleccionCatalogo().size > 0);
    }
    this.restaurandoBorrador.set(false);
  }

  private leerBorrador(): BorradorSolicitudV2 | null {
    try {
      const raw = localStorage.getItem(this.borradorKey);
      if (!raw) return null;
      const value = JSON.parse(raw) as Partial<BorradorSolicitudV2>;
      if (value.version !== 1 || !Number.isInteger(value.unidadId)
        || !/^2027-(0[1-9]|1[0-2])$/.test(value.periodo ?? '')
        || !Array.isArray(value.solicitud) || !Array.isArray(value.seleccionCatalogo)) return null;
      const solicitud = value.solicitud.filter(item =>
        typeof item?.claveNormalizada === 'string'
        && (item.cantidad === null || (Number.isSafeInteger(item.cantidad) && item.cantidad! >= 0 && item.cantidad! <= 99999)),
      );
      return {
        version: 1,
        unidadId: value.unidadId!,
        periodo: value.periodo!,
        responsableCaptura: typeof value.responsableCaptura === 'string' ? value.responsableCaptura : '',
        solicitud,
        seleccionCatalogo: value.seleccionCatalogo.filter((clave): clave is string => typeof clave === 'string'),
        vista: ['CATALOGO', 'SOLICITUD', 'REVISION'].includes(value.vista ?? '')
          ? value.vista as VistaSolicitudV2 : 'CATALOGO',
        busqueda: typeof value.busqueda === 'string' ? value.busqueda : '',
        tipoInsumo: typeof value.tipoInsumo === 'string' ? value.tipoInsumo : '',
        estadoCatalogo: ['TODAS', 'DISPONIBLES', 'AGREGADAS'].includes(value.estadoCatalogo ?? '')
          ? value.estadoCatalogo as EstadoCatalogoFiltro : 'TODAS',
        pagina: Number.isInteger(value.pagina) && value.pagina! > 0 ? value.pagina! : 1,
      };
    } catch {
      return null;
    }
  }
}
