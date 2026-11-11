import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { finalize, firstValueFrom, Subscription } from 'rxjs';
import * as XLSX from 'xlsx';
import { CatalogoClaveCandidata, UniversoClave, UniversoUnidad } from '../../models/universos-abasto.model';
import { UniversosAbastoService } from '../../services/universos-abasto.service';

@Component({
  selector: 'app-universos-abasto',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './universos-abasto.component.html',
  styleUrls: ['./universos-abasto.component.css', './universos-abasto-selector.component.css'],
})
export class UniversosAbastoComponent implements OnDestroy {
  private readonly api = inject(UniversosAbastoService);
  private readonly route = inject(ActivatedRoute);
  private readonly cluesInicial = this.normalizarClues(this.route.snapshot.paramMap.get('clues'));
  private cluesInicialAplicada = false;

  readonly unidades = signal<UniversoUnidad[]>([]);
  readonly unidadSeleccionada = signal<UniversoUnidad | null>(null);
  readonly busquedaHospital = signal('');
  readonly hospitalesFiltrados = computed(() => {
    const termino = this.normalizarTexto(this.busquedaHospital());
    if (termino.length < 2) return [];
    return this.unidades()
      .filter(unidad => this.normalizarTexto([
        unidad.nombre,
        unidad.cluesimb,
        unidad.cluessa,
      ].filter(Boolean).join(' ')).includes(termino))
      .slice(0, 12);
  });
  readonly claves = signal<UniversoClave[]>([]);
  readonly cargando = signal(false);
  readonly error = signal('');
  readonly mensajeExito = signal('');
  readonly total = signal(0);
  readonly totalPages = signal(0);
  readonly clavesSinCorrespondencia = computed(
    () => this.claves().filter(row => !row.correspondenciaArticulo).length,
  );
  readonly dialogoAgregarAbierto = signal(false);
  readonly candidatos = signal<CatalogoClaveCandidata[]>([]);
  readonly candidatoSeleccionado = signal<CatalogoClaveCandidata | null>(null);
  readonly buscandoCandidatos = signal(false);
  readonly errorDialogo = signal('');
  readonly totalCandidatos = signal(0);
  readonly totalPaginasCandidatos = signal(0);
  readonly confirmandoIncorporacion = signal(false);
  readonly guardandoIncorporacion = signal(false);
  readonly claveCambioActivo = signal<UniversoClave | null>(null);
  readonly guardandoCambioActivo = signal(false);
  readonly errorCambioActivo = signal('');
  readonly exportando = signal(false);
  readonly errorExportacion = signal('');

  page = 1;
  readonly pageSize = 25;
  search = '';
  tipoInsumo = '';
  activo = '';
  busquedaCandidato = '';
  paginaCandidatos = 1;
  readonly pageSizeCandidatos = 10;
  tipoInsumoNuevo = '';
  private busquedaTimer?: ReturnType<typeof setTimeout>;
  private busquedaSubscription?: Subscription;

  constructor() {
    this.cargarUnidades();
  }

  ngOnDestroy(): void {
    if (this.busquedaTimer) clearTimeout(this.busquedaTimer);
    this.busquedaSubscription?.unsubscribe();
  }

  seleccionarUnidad(unidad: UniversoUnidad): void {
    this.unidadSeleccionada.set(unidad);
    this.busquedaHospital.set('');
    this.page = 1;
    this.search = '';
    this.tipoInsumo = '';
    this.activo = '';
    this.cargarClaves();
  }

  cambiarUnidad(): void {
    this.unidadSeleccionada.set(null);
    this.busquedaHospital.set('');
    this.limpiarResultados();
  }

  aplicarFiltros(): void {
    this.page = 1;
    this.cargarClaves();
  }

  cambiarPagina(nextPage: number): void {
    if (nextPage < 1 || nextPage > this.totalPages() || nextPage === this.page) return;
    this.page = nextPage;
    this.cargarClaves();
  }

  paginasVisibles(): number[] {
    const total = this.totalPages();
    if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
    const inicio = Math.max(1, Math.min(this.page - 2, total - 4));
    return Array.from({ length: 5 }, (_, index) => inicio + index);
  }

  registroInicial(): number {
    return this.total() === 0 ? 0 : (this.page - 1) * this.pageSize + 1;
  }

  registroFinal(): number {
    return Math.min(this.page * this.pageSize, this.total());
  }

  async exportarExcel(): Promise<void> {
    const unidad = this.unidadSeleccionada();
    if (!unidad || this.exportando()) return;

    const filtros = {
      search: this.search.trim() || undefined,
      tipoInsumo: this.tipoInsumo || undefined,
      activo: this.activo === '' ? undefined : this.activo === 'true',
    };

    this.exportando.set(true);
    this.errorExportacion.set('');

    try {
      const primera = await firstValueFrom(this.api.listarClaves(unidad.id, {
        page: 1,
        pageSize: 100,
        ...filtros,
      }));
      const totalEsperado = primera.pagination.total;
      const registros = [...primera.data];

      for (let page = 2; page <= primera.pagination.totalPages; page++) {
        const response = await firstValueFrom(this.api.listarClaves(unidad.id, {
          page,
          pageSize: 100,
          ...filtros,
        }));
        if (response.pagination.total !== totalEsperado) {
          throw new Error('El universo cambió durante la exportación. Vuelve a intentarlo.');
        }
        registros.push(...response.data);
      }

      const unicos = new Map(registros.map(row => [row.clave.trim().toUpperCase(), row]));
      if (unicos.size !== totalEsperado) {
        throw new Error('No fue posible validar el total exportado. Vuelve a intentarlo.');
      }

      const filas = [...unicos.values()].map(row => ({
        'Clave CNIS': row.clave,
        'Descripción': row.descripcion || 'Sin descripción en catálogo',
        'Presentación': row.presentacion || '',
        'Tipo de insumo': row.tipoInsumo,
        'CPM': row.cpm,
        'Estado operativo': row.activo ? 'Habilitada' : 'Deshabilitada',
      }));

      const detalle = XLSX.utils.json_to_sheet(
        filas.length ? filas : [{ Mensaje: 'Sin resultados para los filtros seleccionados' }],
      );
      detalle['!cols'] = [
        { wch: 22 }, { wch: 65 }, { wch: 35 }, { wch: 24 },
        { wch: 12 }, { wch: 23 },
      ];
      if (detalle['!ref'] && filas.length) {
        detalle['!autofilter'] = { ref: detalle['!ref'] };
      }

      const informacion = XLSX.utils.aoa_to_sheet([
        ['UNIVERSOS DE ABASTO'],
        [],
        ['Unidad médica', unidad.nombre],
        ['CLUES IMB', unidad.cluesimb || ''],
        ['CLUES SSA', unidad.cluessa || ''],
        ['Generado', new Date().toLocaleString('es-MX')],
        ['Búsqueda', filtros.search || 'Sin filtro'],
        ['Tipo de insumo', filtros.tipoInsumo || 'Todos'],
        ['Habilitación operativa', filtros.activo === undefined ? 'Todas' : (filtros.activo ? 'Habilitadas' : 'Deshabilitadas')],
        ['Total exportado', unicos.size],
        [],
        ['Aclaración CPM', 'Los CPM sin registro aparecen como 0.'],
        ['Periodo de referencia', 'No identificado. El CPM no se presenta como oficial ni vigente.'],
      ]);
      informacion['!cols'] = [{ wch: 28 }, { wch: 85 }];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, detalle, 'Universo');
      XLSX.utils.book_append_sheet(workbook, informacion, 'Información');
      const identificador = unidad.cluesimb || unidad.cluessa || String(unidad.id);
      const nombreSeguro = identificador.replace(/[^A-Z0-9_-]/gi, '_');
      XLSX.writeFile(workbook, `universo_abasto_${nombreSeguro}.xlsx`, { bookType: 'xlsx' });
    } catch (error) {
      this.errorExportacion.set(
        error instanceof Error ? error.message : 'No fue posible exportar el universo.',
      );
    } finally {
      this.exportando.set(false);
    }
  }

  abrirDialogoAgregar(): void {
    if (!this.unidadSeleccionada()) return;
    this.dialogoAgregarAbierto.set(true);
    this.busquedaCandidato = '';
    this.paginaCandidatos = 1;
    this.tipoInsumoNuevo = '';
    this.candidatos.set([]);
    this.candidatoSeleccionado.set(null);
    this.confirmandoIncorporacion.set(false);
    this.guardandoIncorporacion.set(false);
    this.errorDialogo.set('');
  }

  cerrarDialogoAgregar(): void {
    if (this.busquedaTimer) clearTimeout(this.busquedaTimer);
    this.busquedaSubscription?.unsubscribe();
    this.dialogoAgregarAbierto.set(false);
  }

  programarBusquedaCandidatos(value: string): void {
    this.busquedaCandidato = value;
    if (this.busquedaTimer) clearTimeout(this.busquedaTimer);
    this.busquedaSubscription?.unsubscribe();
    this.candidatoSeleccionado.set(null);
    this.confirmandoIncorporacion.set(false);
    this.paginaCandidatos = 1;

    if (value.trim().length < 2) {
      this.candidatos.set([]);
      this.totalCandidatos.set(0);
      this.totalPaginasCandidatos.set(0);
      this.buscandoCandidatos.set(false);
      this.errorDialogo.set('');
      return;
    }

    this.buscandoCandidatos.set(true);
    this.errorDialogo.set('');
    this.busquedaTimer = setTimeout(() => this.buscarCandidatos(1), 350);
  }

  buscarCandidatos(page = 1): void {
    const unidad = this.unidadSeleccionada();
    const search = this.busquedaCandidato.trim();
    if (!unidad || search.length < 2) {
      this.errorDialogo.set('Escribe al menos 2 caracteres para buscar.');
      return;
    }
    this.paginaCandidatos = page;
    this.buscandoCandidatos.set(true);
    this.errorDialogo.set('');
    this.candidatoSeleccionado.set(null);
    this.confirmandoIncorporacion.set(false);
    this.busquedaSubscription?.unsubscribe();
    this.busquedaSubscription = this.api.buscarClavesCandidatas(unidad.id, search, page, this.pageSizeCandidatos)
      .pipe(finalize(() => this.buscandoCandidatos.set(false)))
      .subscribe({
        next: response => {
          this.candidatos.set(response.data);
          this.totalCandidatos.set(response.pagination.total);
          this.totalPaginasCandidatos.set(response.pagination.totalPages);
        },
        error: error => this.errorDialogo.set(error?.error?.error || 'No fue posible buscar claves.'),
      });
  }

  seleccionarCandidato(candidato: CatalogoClaveCandidata): void {
    if (candidato.perteneceUniverso) return;
    this.candidatoSeleccionado.set(candidato);
    this.tipoInsumoNuevo = '';
    this.confirmandoIncorporacion.set(false);
  }

  revisarIncorporacion(): void {
    const candidato = this.candidatoSeleccionado();
    if (!candidato || !this.clasificacionResuelta(candidato)) return;
    this.confirmandoIncorporacion.set(true);
  }

  clasificacionResuelta(candidato: CatalogoClaveCandidata | null): boolean {
    if (!candidato || candidato.perteneceUniverso) return false;
    if (candidato.clasificacionEstado === 'AUTOMATICA') return !!candidato.tipoInsumo;
    return candidato.clasificacionEstado === 'MANUAL_160'
      && (this.tipoInsumoNuevo === 'Medicamento' || this.tipoInsumoNuevo === 'Material de curación');
  }

  tipoDefinitivo(candidato: CatalogoClaveCandidata | null): string {
    if (!candidato) return '';
    return candidato.tipoInsumo || this.tipoInsumoNuevo;
  }

  guardarIncorporacion(): void {
    const unidad = this.unidadSeleccionada();
    const candidato = this.candidatoSeleccionado();
    if (!unidad || !candidato || !this.clasificacionResuelta(candidato)) return;
    this.guardandoIncorporacion.set(true);
    this.errorDialogo.set('');
    this.api.incorporarClave(
      unidad.id,
      candidato.clave,
      candidato.clasificacionEstado === 'MANUAL_160' ? this.tipoInsumoNuevo : undefined,
    ).pipe(finalize(() => this.guardandoIncorporacion.set(false))).subscribe({
      next: response => {
        this.mensajeExito.set(`La clave ${response.data.clave} se incorporó correctamente.`);
        this.cerrarDialogoAgregar();
        this.cargarClaves();
        this.cargarUnidades(unidad.id);
      },
      error: error => this.errorDialogo.set(error?.error?.error || 'No fue posible incorporar la clave.'),
    });
  }

  solicitarCambioActivo(clave: UniversoClave): void {
    this.claveCambioActivo.set(clave);
    this.errorCambioActivo.set('');
  }

  cancelarCambioActivo(): void {
    if (this.guardandoCambioActivo()) return;
    this.claveCambioActivo.set(null);
    this.errorCambioActivo.set('');
  }

  confirmarCambioActivo(): void {
    const unidad = this.unidadSeleccionada();
    const clave = this.claveCambioActivo();
    if (!unidad || !clave || this.guardandoCambioActivo()) return;

    const nuevoActivo = !clave.activo;
    this.guardandoCambioActivo.set(true);
    this.errorCambioActivo.set('');
    this.api.actualizarActivo(unidad.id, clave.clave, nuevoActivo)
      .pipe(finalize(() => this.guardandoCambioActivo.set(false)))
      .subscribe({
        next: response => {
          const accion = response.data.activo ? 'rehabilitó' : 'deshabilitó';
          this.mensajeExito.set(`La clave ${response.data.clave} se ${accion} correctamente.`);
          this.claveCambioActivo.set(null);
          if (this.activo !== '' && this.claves().length === 1 && this.page > 1) this.page--;
          this.cargarClaves();
        },
        error: error => this.errorCambioActivo.set(
          error?.error?.error || 'No fue posible actualizar la habilitación de la clave.',
        ),
      });
  }

  cargarClaves(corregirPaginaFueraDeRango = false): void {
    const unidad = this.unidadSeleccionada();
    if (!unidad) return;
    this.cargando.set(true);
    this.error.set('');
    this.consultarClaves(unidad.id, corregirPaginaFueraDeRango);
  }

  private consultarClaves(unidadId: number, corregirPaginaFueraDeRango: boolean): void {
    this.api.listarClaves(unidadId, {
      page: this.page,
      pageSize: this.pageSize,
      search: this.search.trim() || undefined,
      tipoInsumo: this.tipoInsumo || undefined,
      activo: this.activo === '' ? undefined : this.activo === 'true',
    }).subscribe({
      next: response => {
        if (corregirPaginaFueraDeRango && this.page > 1 && response.data.length === 0) {
          this.page--;
          this.consultarClaves(unidadId, false);
          return;
        }
        this.claves.set(response.data);
        this.total.set(response.pagination.total);
        this.totalPages.set(response.pagination.totalPages);
        this.cargando.set(false);
      },
      error: () => {
        this.limpiarResultados();
        this.error.set('No fue posible consultar las claves del universo.');
        this.cargando.set(false);
      },
    });
  }

  private limpiarResultados(): void {
    this.claves.set([]);
    this.total.set(0);
    this.totalPages.set(0);
  }

  private cargarUnidades(mantenerUnidadId?: number): void {
    this.api.listarUnidades().subscribe({
      next: response => {
        this.unidades.set(response.data);
        if (mantenerUnidadId) {
          this.unidadSeleccionada.set(response.data.find(item => item.id === mantenerUnidadId) ?? null);
          return;
        }
        if (this.cluesInicial && !this.cluesInicialAplicada) {
          this.cluesInicialAplicada = true;
          const unidad = response.data.find(item =>
            this.normalizarClues(item.cluesimb) === this.cluesInicial
            || this.normalizarClues(item.cluessa) === this.cluesInicial,
          );
          if (unidad) {
            this.seleccionarUnidad(unidad);
          } else {
            this.error.set(`No se encontró una unidad con universo para la CLUES ${this.cluesInicial}.`);
          }
        }
      },
      error: () => this.error.set('No fue posible consultar las unidades con universo.'),
    });
  }

  private normalizarClues(value: string | null): string {
    return value?.trim().toUpperCase() ?? '';
  }

  private normalizarTexto(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  }
}
