import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Unidadv2 } from '../../../models/articulo-solicitud';
import { AbastoProgramasNecesidadesResponse, EvidenciaClasificacion, ModalidadNecesidades, VentanaSasProgramas, VertienteProgramatica, ZonaSas } from '../../../models/AbastoProgramasNecesidades';
import { AbastoProgramasNecesidadesService } from '../../../services/abasto-programas-necesidades.service';
import { ApsEstructuraEje, NecesidadesPrimerNivelApsService } from '../../../services/necesidades-primer-nivel-aps.service';
import { UnidadesService } from '../../../services/unidades.service';
import { construirCoberturaPorUnidad } from './abasto-programas-cobertura';

function fechasTijuana(): { mes: string; desde: string; corte: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tijuana', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find(item => item.type === type)?.value ?? '';
  const corte = `${value('year')}-${value('month')}-${value('day')}`;
  const inicio = new Date(`${corte}T00:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - 29);
  return { mes: corte.slice(0, 7), desde: inicio.toISOString().slice(0, 10), corte };
}

function finMes(mes: string): string {
  const [year, month] = mes.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function normalizar(texto: string): string {
  return (texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX').replace(/\s+/g, ' ').trim();
}

type UnidadOpcion = { clues: string; cluessa: string; unidad: string; municipio: string; jurisdiccion: string };

@Component({
  selector: 'app-abasto-por-programas', standalone: true, imports: [CommonModule, FormsModule],
  templateUrl: './abasto-por-programas.component.html', styleUrl: './abasto-por-programas.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AbastoPorProgramasComponent implements OnInit {
  private readonly service = inject(AbastoProgramasNecesidadesService);
  private readonly unidadesService = inject(UnidadesService);
  private readonly apsService = inject(NecesidadesPrimerNivelApsService);
  private readonly unidadesInstitucionales = signal<Unidadv2[]>([]);
  private readonly cacheClavesGrupo = new Map<string, Set<string>>();

  readonly fechasIniciales = fechasTijuana();
  readonly vertienteActiva = signal<VertienteProgramatica>('APS');
  readonly modalidad = signal<ModalidadNecesidades>('MES_CALENDARIO');
  readonly mes = signal(this.fechasIniciales.mes);
  readonly desde = signal(this.fechasIniciales.desde);
  readonly jurisdiccion = signal('');
  readonly clues = signal('');
  readonly programa = signal('');
  readonly ventanasSas = signal<VentanaSasProgramas[]>(this.crearVentanas(`${this.fechasIniciales.mes}-01`, finMes(this.fechasIniciales.mes)));
  readonly page = signal(1);
  readonly pageSize = 10;
  readonly paginaEjecutiva = signal(1);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly resultado = signal<AbastoProgramasNecesidadesResponse | null>(null);

  readonly unidadBusqueda = signal('');
  readonly selectorUnidadAbierto = signal(false);
  readonly opcionUnidadActiva = signal(-1);

  readonly estructuraAps = signal<ApsEstructuraEje[]>([]);
  readonly cargandoEstructuraAps = signal(false);
  readonly ejeAps = signal('');
  readonly grupoAps = signal<number | null>(null);
  readonly clavesGrupoAps = signal<Set<string> | null>(null);
  readonly cargandoGrupoAps = signal(false);
  readonly cargandoRelacionesAps = signal(false);
  readonly ramificacionesPorClave = signal<Map<string, string[]>>(new Map());
  readonly errorAps = signal('');

  readonly unidadesOpciones = computed<UnidadOpcion[]>(() => {
    const ssaPorImb = new Map(this.unidadesInstitucionales().map(item => [item.cluesimb.toUpperCase(), item.cluesssa || '']));
    return (this.resultado()?.catalogos.unidades ?? []).map(item => ({ ...item, cluessa: ssaPorImb.get(item.clues.toUpperCase()) ?? '' }));
  });
  readonly coincidenciasUnidad = computed(() => {
    const termino = normalizar(this.unidadBusqueda());
    const jurisdiccion = this.jurisdiccion();
    return this.unidadesOpciones().filter(item => {
      if (jurisdiccion && item.jurisdiccion !== jurisdiccion) return false;
      if (!termino) return true;
      return normalizar(`${item.unidad} ${item.clues} ${item.cluessa}`).includes(termino);
    }).slice(0, 12);
  });
  readonly unidadSeleccionada = computed(() => this.unidadesOpciones().find(item => item.clues === this.clues()) ?? null);
  readonly ejesAps = computed(() => this.estructuraAps());
  readonly gruposAps = computed(() => this.estructuraAps().find(item => item.ejeCodigo === this.ejeAps())?.grupos ?? []);
  readonly filasFiltradas = computed(() => {
    const filas = this.resultado()?.data ?? [];
    const claves = this.clavesGrupoAps();
    return this.vertienteActiva() === 'APS' && claves ? filas.filter(item => claves.has(item.clave)) : filas;
  });
  readonly filasPagina = computed(() => this.filasFiltradas().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize));
  readonly totalRegistros = computed(() => this.filasFiltradas().length);
  readonly totalPaginas = computed(() => Math.max(1, Math.ceil(this.totalRegistros() / this.pageSize)));
  readonly paginas = computed(() => Array.from({ length: this.totalPaginas() }, (_, index) => index + 1));
  readonly inicioVisible = computed(() => this.totalRegistros() ? (this.page() - 1) * this.pageSize + 1 : 0);
  readonly finVisible = computed(() => Math.min(this.page() * this.pageSize, this.totalRegistros()));
  readonly coberturaUnidades = computed(() => construirCoberturaPorUnidad(this.filasFiltradas()));
  readonly totalPaginasEjecutivas = computed(() => Math.max(1, Math.ceil(this.coberturaUnidades().length / this.pageSize)));
  readonly paginasEjecutivas = computed(() => Array.from({ length: this.totalPaginasEjecutivas() }, (_, index) => index + 1));
  readonly coberturaUnidadesPagina = computed(() => this.coberturaUnidades().slice((this.paginaEjecutiva() - 1) * this.pageSize, this.paginaEjecutiva() * this.pageSize));
  readonly inicioEjecutivo = computed(() => this.coberturaUnidades().length ? (this.paginaEjecutiva() - 1) * this.pageSize + 1 : 0);
  readonly finEjecutivo = computed(() => Math.min(this.paginaEjecutiva() * this.pageSize, this.coberturaUnidades().length));

  ngOnInit(): void {
    void this.cargarCatalogosAuxiliares();
    void this.cargar(true);
  }

  seleccionarVertiente(vertiente: VertienteProgramatica): void {
    if (this.vertienteActiva() === vertiente) return;
    this.vertienteActiva.set(vertiente);
    this.page.set(1);
    this.paginaEjecutiva.set(1);
    void this.cargar();
  }

  cambiarModalidad(modalidad: ModalidadNecesidades): void { this.modalidad.set(modalidad); this.restablecerVentanasSas(); this.reiniciarPaginas(); }
  cambiarMes(mes: string): void { this.mes.set(mes); this.restablecerVentanasSas(); this.reiniciarPaginas(); }
  cambiarDesde(desde: string): void { this.desde.set(desde); this.restablecerVentanasSas(); this.reiniciarPaginas(); }
  cambiarJurisdiccion(valor: string): void { this.jurisdiccion.set(valor); this.limpiarUnidad(false); this.reiniciarPaginas(); }
  actualizarVentana(zona: ZonaSas, campo: 'desde' | 'hasta', valor: string): void {
    this.ventanasSas.update(ventanas => ventanas.map(item => item.zona === zona ? { ...item, [campo]: valor } : item));
    this.reiniciarPaginas();
  }

  async cargar(reiniciarPagina = false, omitirCache = false): Promise<void> {
    if (reiniciarPagina) this.reiniciarPaginas();
    this.loading.set(true); this.error.set(''); this.resultado.set(null);
    try {
      const resultado = await this.service.consultar({
        modalidad: this.modalidad(), mes: this.mes(), desde: this.desde(), jurisdiccion: this.jurisdiccion(), municipio: '', clues: this.clues(),
        vertiente: this.vertienteActiva(), programa: this.vertienteActiva() === 'PROGRAMAS_PREVENTIVOS' ? this.programa() : '', ventanasSas: this.ventanasSas(), page: 1, pageSize: 100,
      }, omitirCache);
      this.resultado.set(resultado);
      if (this.page() > this.totalPaginas()) this.page.set(1);
      if (this.paginaEjecutiva() > this.totalPaginasEjecutivas()) this.paginaEjecutiva.set(1);
    } catch (error: any) {
      this.error.set(error?.error?.detail || 'No fue posible consultar la información de Primer Nivel.');
    } finally { this.loading.set(false); }
  }

  actualizarDatos(): void { void this.cargar(true, true); }
  irPagina(page: number): void {
    const destino = Math.min(this.totalPaginas(), Math.max(1, Number(page)));
    if (destino !== this.page()) this.page.set(destino);
  }
  irPaginaEjecutiva(page: number): void {
    const destino = Math.min(this.totalPaginasEjecutivas(), Math.max(1, Number(page)));
    if (destino !== this.paginaEjecutiva()) this.paginaEjecutiva.set(destino);
  }
  aplicarPrograma(codigo: string): void { this.programa.set(this.programa() === codigo ? '' : codigo); void this.cargar(true); }

  abrirSelectorUnidad(): void { this.selectorUnidadAbierto.set(true); this.opcionUnidadActiva.set(this.coincidenciasUnidad().length ? 0 : -1); }
  buscarUnidad(valor: string): void {
    const seleccionada = this.unidadSeleccionada();
    if (seleccionada && valor !== `${seleccionada.unidad} · ${seleccionada.clues}`) this.clues.set('');
    this.unidadBusqueda.set(valor); this.selectorUnidadAbierto.set(true); this.opcionUnidadActiva.set(this.coincidenciasUnidad().length ? 0 : -1); this.page.set(1);
  }
  seleccionarUnidad(unidad: UnidadOpcion): void {
    this.clues.set(unidad.clues); this.unidadBusqueda.set(`${unidad.unidad} · ${unidad.clues}`); this.selectorUnidadAbierto.set(false); this.opcionUnidadActiva.set(-1); this.page.set(1);
  }
  limpiarUnidad(abrir = true): void { this.clues.set(''); this.unidadBusqueda.set(''); this.selectorUnidadAbierto.set(abrir); this.opcionUnidadActiva.set(-1); this.page.set(1); }
  cerrarSelectorUnidad(): void { setTimeout(() => this.selectorUnidadAbierto.set(false), 120); }
  manejarTeclaUnidad(event: KeyboardEvent): void {
    const opciones = this.coincidenciasUnidad();
    if (event.key === 'Escape') { this.selectorUnidadAbierto.set(false); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); this.selectorUnidadAbierto.set(true);
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      this.opcionUnidadActiva.set(opciones.length ? (this.opcionUnidadActiva() + delta + opciones.length) % opciones.length : -1);
    } else if (event.key === 'Enter' && this.selectorUnidadAbierto() && this.opcionUnidadActiva() >= 0) {
      event.preventDefault(); this.seleccionarUnidad(opciones[this.opcionUnidadActiva()]);
    }
  }

  seleccionarEjeAps(codigo: string): void { this.ejeAps.set(this.ejeAps() === codigo ? '' : codigo); this.grupoAps.set(null); this.clavesGrupoAps.set(null); this.reiniciarPaginas(); }
  async seleccionarGrupoAps(numero: number): Promise<void> {
    if (this.grupoAps() === numero) { this.grupoAps.set(null); this.clavesGrupoAps.set(null); this.reiniciarPaginas(); return; }
    this.grupoAps.set(numero); this.reiniciarPaginas(); this.errorAps.set('');
    const claveCache = `${this.ejeAps()}|${numero}`;
    const guardadas = this.cacheClavesGrupo.get(claveCache);
    if (guardadas) { this.clavesGrupoAps.set(guardadas); return; }
    this.cargandoGrupoAps.set(true); this.clavesGrupoAps.set(new Set());
    try {
      const primera = await firstValueFrom(this.apsService.buscar({ eje: this.ejeAps(), grupo: numero, page: 1, pageSize: 100 }));
      const paginas = Math.ceil(primera.total / 100);
      const resto = await Promise.all(Array.from({ length: Math.max(0, paginas - 1) }, (_, index) => firstValueFrom(this.apsService.buscar({ eje: this.ejeAps(), grupo: numero, page: index + 2, pageSize: 100 }))));
      const medicamentos = [primera, ...resto].flatMap(item => item.items);
      const detalles = await Promise.all(medicamentos.map(item => firstValueFrom(this.apsService.obtenerMedicamento(item.codigo))));
      const claves = new Set(detalles.flatMap(item => item.variantes.map(variante => variante.clave)));
      this.cacheClavesGrupo.set(claveCache, claves); this.clavesGrupoAps.set(claves);
    } catch { this.errorAps.set('No fue posible cargar esta ramificación APS.'); this.grupoAps.set(null); this.clavesGrupoAps.set(null); }
    finally { this.cargandoGrupoAps.set(false); }
  }

  etiquetaVertiente(vertiente: VertienteProgramatica): string { return vertiente === 'APS' ? 'APS' : 'Programas Preventivos'; }
  etiquetaEvidencia(evidencia: EvidenciaClasificacion): string { return evidencia === 'REGISTRADA' ? 'Registrada' : evidencia === 'INFERIDA' ? 'Inferida' : 'Registrada e inferida'; }
  etiquetaApsPrograma(vertiente: VertienteProgramatica, programaNombre: string | null, clave: string): string {
    if (vertiente === 'PROGRAMAS_PREVENTIVOS') return programaNombre || 'Programa no identificado';
    const ramificaciones = this.ramificacionesPorClave().get(clave);
    if (ramificaciones?.length) return ramificaciones.join(' · ');
    return this.cargandoRelacionesAps() ? 'Cargando clasificación APS…' : 'Sin clasificación APS disponible';
  }

  private async cargarCatalogosAuxiliares(): Promise<void> {
    this.cargandoEstructuraAps.set(true);
    try {
      const [unidades, estructura] = await Promise.all([firstValueFrom(this.unidadesService.load({ skipLoader: true })), firstValueFrom(this.apsService.obtenerEstructura())]);
      this.unidadesInstitucionales.set(unidades); this.estructuraAps.set(estructura);
      void this.cargarRelacionesAps();
    } catch { this.errorAps.set('No fue posible cargar los catálogos auxiliares.'); }
    finally { this.cargandoEstructuraAps.set(false); }
  }
  private async cargarRelacionesAps(): Promise<void> {
    this.cargandoRelacionesAps.set(true);
    try {
      const primera = await firstValueFrom(this.apsService.buscar({ page: 1, pageSize: 100 }));
      const paginas = Math.ceil(primera.total / 100);
      const resto = await Promise.all(Array.from({ length: Math.max(0, paginas - 1) }, (_, index) =>
        firstValueFrom(this.apsService.buscar({ page: index + 2, pageSize: 100 }))
      ));
      const medicamentos = [primera, ...resto].flatMap(item => item.items);
      if (!medicamentos.length) { this.ramificacionesPorClave.set(new Map()); return; }

      const resueltos = await firstValueFrom(this.apsService.resolver({
        medicamentos: medicamentos.map(item => ({ codigo: item.codigo, cantidad: 1 })),
      }));
      const medicamentoPorCodigo = new Map(medicamentos.map(item => [item.codigo, item]));
      const ramificaciones = new Map<string, Set<string>>();
      const registrar = (codigo: string, clave: string) => {
        const medicamento = medicamentoPorCodigo.get(codigo);
        if (!medicamento) return;
        const claveNormalizada = clave.trim().toUpperCase();
        const nombres = ramificaciones.get(claveNormalizada) ?? new Set<string>();
        if (medicamento.eje?.nombre) nombres.add(medicamento.eje.nombre);
        ramificaciones.set(claveNormalizada, nombres);
        const claveGrupo = `${medicamento.eje?.codigo ?? ''}|${medicamento.grupo.numero}`;
        const clavesGrupo = this.cacheClavesGrupo.get(claveGrupo) ?? new Set<string>();
        clavesGrupo.add(claveNormalizada);
        this.cacheClavesGrupo.set(claveGrupo, clavesGrupo);
      };
      for (const item of resueltos.resueltos) registrar(item.codigoMedicamento, item.clave);
      for (const item of resueltos.pendientes) for (const opcion of item.opciones) registrar(item.codigoMedicamento, opcion.clave);
      this.ramificacionesPorClave.set(new Map([...ramificaciones].map(([clave, nombres]) => [clave, [...nombres].sort((a, b) => a.localeCompare(b, 'es'))])));
    } catch {
      this.errorAps.set('No fue posible resolver las ramificaciones APS del catálogo.');
    } finally {
      this.cargandoRelacionesAps.set(false);
    }
  }
  private crearVentanas(desde: string, hasta: string): VentanaSasProgramas[] { return (['AZM', 'AZT', 'AZE'] as ZonaSas[]).map(zona => ({ zona, desde, hasta })); }
  private reiniciarPaginas(): void { this.page.set(1); this.paginaEjecutiva.set(1); }
  private restablecerVentanasSas(): void {
    const desde = this.modalidad() === 'MES_CALENDARIO' ? `${this.mes()}-01` : this.desde();
    const hasta = this.modalidad() === 'MES_CALENDARIO' ? finMes(this.mes()) : this.fechasIniciales.corte;
    this.ventanasSas.set(this.crearVentanas(desde, hasta));
  }
}
