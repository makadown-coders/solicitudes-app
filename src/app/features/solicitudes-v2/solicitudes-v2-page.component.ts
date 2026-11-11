import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, QueryList, ViewChildren, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { UniversoUnidad } from '../../models/universos-abasto.model';
import { UniversosAbastoService } from '../../services/universos-abasto.service';
import { EstadoCatalogoFiltro, SolicitudV2Contexto, SolicitudV2Renglon, VistaSolicitudV2 } from './solicitudes-v2.model';
import { SolicitudesV2ExcelService } from './solicitudes-v2-excel.service';

@Component({
  selector: 'app-solicitudes-v2-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './solicitudes-v2-page.component.html',
  styleUrl: './solicitudes-v2-page.component.css',
})
export class SolicitudesV2PageComponent {
  private readonly universosApi = inject(UniversosAbastoService);
  private readonly excel = new SolicitudesV2ExcelService();
  private readonly pageSize = 100;

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

  readonly paginaCompletaSeleccionada = computed(() => {
    const disponibles = this.renglonesVisibles().filter(row => !this.estaAgregada(row.claveNormalizada));
    return disponibles.length > 0
      && disponibles.every(row => this.seleccionCatalogo().has(row.claveNormalizada));
  });

  readonly contextoValido = computed(() => {
    const ctx = this.contexto();
    return !!ctx.unidad && /^2027-(0[1-9]|1[0-2])$/.test(ctx.periodo);
  });

  constructor() {
    void this.cargarUnidades();
  }

  @HostListener('window:beforeunload', ['$event'])
  prevenirSalidaConCambios(event: BeforeUnloadEvent): void {
    if (!this.cambiosSinGuardar()) return;
    event.preventDefault();
    event.returnValue = '';
  }

  async cargarUnidades(): Promise<void> {
    this.cargandoUnidades.set(true);
    this.errorUnidades.set('');
    try {
      const response = await firstValueFrom(this.universosApi.listarUnidades());
      this.unidades.set(response.data ?? []);
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
      'Cambiar de hospital descartará las cantidades capturadas en memoria. ¿Deseas continuar?',
    )) return;

    this.contexto.update(ctx => ({ ...ctx, unidad: nuevaUnidad }));
    this.reiniciarUniverso();
  }

  actualizarPeriodo(periodo: string): void {
    if (periodo === this.contexto().periodo) return;
    if (this.cambiosSinGuardar() && !window.confirm(
      'Cambiar el periodo descartará las cantidades capturadas en memoria. ¿Deseas continuar?',
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
      'Recargar el universo descartará las cantidades capturadas en memoria. ¿Deseas continuar?',
    )) return;

    this.cargandoUniverso.set(true);
    this.errorUniverso.set('');
    this.errorExcel.set('');
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
    return this.miSolicitud().some(row => row.claveNormalizada === claveNormalizada);
  }

  estaSeleccionada(claveNormalizada: string): boolean {
    return this.seleccionCatalogo().has(claveNormalizada);
  }

  alternarSeleccion(row: SolicitudV2Renglon, seleccionada: boolean): void {
    if (this.estaAgregada(row.claveNormalizada)) return;
    this.seleccionCatalogo.update(actual => {
      const siguiente = new Set(actual);
      if (seleccionada) siguiente.add(row.claveNormalizada);
      else siguiente.delete(row.claveNormalizada);
      return siguiente;
    });
  }

  alternarPagina(seleccionada: boolean): void {
    this.seleccionCatalogo.update(actual => {
      const siguiente = new Set(actual);
      for (const row of this.renglonesVisibles()) {
        if (this.estaAgregada(row.claveNormalizada)) continue;
        if (seleccionada) siguiente.add(row.claveNormalizada);
        else siguiente.delete(row.claveNormalizada);
      }
      return siguiente;
    });
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
    this.seleccionCatalogo.set(new Set());
    this.cambiosSinGuardar.set(true);
    this.vista.set('SOLICITUD');
  }

  quitarDeSolicitud(row: SolicitudV2Renglon): void {
    if (row.cantidad !== null && !window.confirm(
      `La clave ${row.clave} ya tiene una cantidad capturada. ¿Deseas quitarla de Mi solicitud?`,
    )) return;
    this.miSolicitud.update(rows => rows.filter(item => item.claveNormalizada !== row.claveNormalizada));
    this.errorExcel.set('');
    this.cambiosSinGuardar.set(true);
  }

  async verExcelInterno(): Promise<void> {
    if (this.descargandoExcelInterno()) return;
    const articulos = this.articulosExportables();
    if (articulos.length === 0) {
      this.errorExcel.set('Captura al menos una cantidad mayor que cero para generar el Excel interno.');
      return;
    }

    this.descargandoExcelInterno.set(true);
    this.errorExcel.set('');
    try {
      const buffer = await this.excel.generarExcelOperativo(this.contexto(), articulos);
      if (buffer.byteLength === 0) throw new Error('El libro generado está vacío.');
      this.excel.descargar(buffer, this.contexto(), 'INTERNO');
    } catch {
      this.errorExcel.set('No fue posible generar el Excel interno. Tus cantidades se conservaron; intenta nuevamente.');
    } finally {
      this.descargandoExcelInterno.set(false);
    }
  }

  async descargarExcel(): Promise<void> {
    if (this.descargandoExcel()) return;
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
    this.miSolicitud.update(rows => rows.map(row =>
      row.claveNormalizada === claveNormalizada ? { ...row, cantidad } : row,
    ));
    this.errorExcel.set('');
    this.cambiosSinGuardar.set(true);
  }

  private reiniciarUniverso(): void {
    this.renglones.set([]);
    this.miSolicitud.set([]);
    this.seleccionCatalogo.set(new Set());
    this.vista.set('CATALOGO');
    this.universoCargado.set(false);
    this.cambiosSinGuardar.set(false);
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
}
