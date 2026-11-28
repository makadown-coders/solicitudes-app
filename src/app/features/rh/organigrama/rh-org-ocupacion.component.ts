import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef,
  inject, Injector, input, OnInit, output, signal, viewChild,
} from '@angular/core';
import {
  RhOrgEstadoOcupacion, RhOrgOcupacion, RhOrgPuestoDto, RhPersonalUnidadItem,
  RhPersonalUnidadPagedResponse, RhService,
} from '../../../services/rh.service';
import { rhOrgEtiquetaOcupacion } from './rh-org-ocupacion-labels';

@Component({
  selector: 'app-rh-org-ocupacion',
  templateUrl: './rh-org-ocupacion.component.html',
  styles: [`
    .org-ocupacion-btn {
      cursor: pointer;
      border: 1px solid #cbd5e1;
      border-radius: .5rem;
      background: white;
      padding: .375rem .625rem;
      font-size: .75rem;
      font-weight: 600;
    }
    .org-ocupacion-btn:hover:not(:disabled) { background: #f1f5f9; }
    .org-ocupacion-btn:focus-visible { outline: 2px solid #047857; outline-offset: 2px; }
    .org-ocupacion-btn:disabled { cursor: not-allowed; opacity: .5; }
    .org-ocupacion-btn[aria-pressed="true"] {
      border-color: #047857;
      background: #ecfdf5;
    }
    .org-ocupacion-modal {
      box-sizing: border-box;
      width: min(42rem, calc(100% - 2rem));
      max-height: 92vh;
      max-height: 92dvh;
      margin: auto;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .org-ocupacion-modal::backdrop { background: rgb(15 23 42 / .55); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RhOrgOcupacionComponent implements OnInit {
  private readonly service = inject(RhService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private searchTimer?: ReturnType<typeof setTimeout>;
  private searchSeq = 0;
  private readonly titulo = viewChild.required<ElementRef<HTMLElement>>('titulo');
  private readonly modal = viewChild.required<ElementRef<HTMLDialogElement>>('modal');
  private readonly entrada = viewChild<ElementRef<HTMLInputElement>>('entrada');
  private readonly campoMotivo = viewChild<ElementRef<HTMLTextAreaElement>>('campoMotivo');
  private readonly continuar = viewChild<ElementRef<HTMLButtonElement>>('continuar');
  readonly etiquetaOcupacion = rhOrgEtiquetaOcupacion;

  readonly puesto = input.required<RhOrgPuestoDto>();
  readonly ruta = input.required<string[]>();
  readonly padre = input.required<string>();
  readonly cerrar = output<void>();
  readonly guardada = output<RhOrgOcupacion>();
  readonly revisarAdscripcion = output<string>();

  readonly detalle = signal<RhOrgOcupacion | null>(null);
  readonly cargando = signal(false);
  readonly enviando = signal(false);
  readonly conflicto = signal(false);
  readonly error = signal('');
  readonly estado = signal<RhOrgEstadoOcupacion | null>(null);
  readonly confirmandoDescarte = signal(false);
  readonly motivo = signal('');
  readonly candidata = signal<RhPersonalUnidadItem | null>(null);
  readonly texto = signal('');
  readonly resultado = signal<RhPersonalUnidadPagedResponse | null>(null);
  readonly buscando = signal(false);
  readonly errorBusqueda = signal('');
  readonly diagnostico = signal('');
  readonly verificando = signal(false);
  private readonly personaSinAdscripcion = signal<string | null>(null);
  readonly pagina = signal(1);
  readonly totalPaginas = computed(() => {
    const resultado = this.resultado();
    return Math.max(1, resultado ? Math.ceil(resultado.total / resultado.pageSize) : 1);
  });

  readonly puedeConfirmar = computed(() => {
    const detalle = this.detalle();
    const estado = this.estado();
    return Boolean(detalle && this.puesto().activo && estado && this.motivo().trim() &&
      this.motivo().trim().length <= 500 && !this.cargando() && !this.enviando() &&
      !this.conflicto() && !this.confirmandoDescarte() &&
      (estado !== 'OCUPADO' || (this.candidata() && !this.verificando())));
  });

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.searchTimer));
    afterNextRender(() => {
      this.modal().nativeElement.showModal();
      this.titulo().nativeElement.focus();
    });
  }

  ngOnInit(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    if (this.cargando() || this.enviando()) return;
    this.cargando.set(true);
    this.error.set('');
    this.personaSinAdscripcion.set(null);
    try {
      const detalle = await this.service.obtenerOcupacionOrganigrama(this.puesto().id);
      if (this.destroyRef.destroyed) return;
      this.detalle.set(detalle);
      this.conflicto.set(false);
    } catch (err) {
      this.error.set(this.mensaje(err, 'No se pudo consultar la ocupación del puesto.'));
    } finally {
      this.cargando.set(false);
    }
  }

  preparar(estado: RhOrgEstadoOcupacion): void {
    if (this.estado() || this.enviando() || this.cargando() || !this.detalle() || !this.puesto().activo) return;
    this.estado.set(estado);
    this.enfocarEditor();
  }

  solicitarCerrar(): void {
    if (this.enviando()) return;
    if (!this.estado()) {
      this.cerrarModal();
      return;
    }
    this.confirmandoDescarte.set(true);
    afterNextRender(() => this.continuar()?.nativeElement.focus(), { injector: this.injector });
  }

  seguirEditando(): void {
    this.confirmandoDescarte.set(false);
    this.enfocarEditor();
  }

  descartar(): void {
    if (!this.enviando() && this.confirmandoDescarte()) this.cerrarModal();
  }

  cancelarConEscape(event: Event): void {
    event.preventDefault();
    if (this.confirmandoDescarte()) this.seguirEditando();
    else this.solicitarCerrar();
  }

  private cerrarModal(): void {
    this.modal().nativeElement.close();
    this.cerrar.emit();
  }

  private enfocarEditor(): void {
    afterNextRender(() => {
      (this.entrada()?.nativeElement ?? this.campoMotivo()?.nativeElement ?? this.titulo().nativeElement).focus();
    }, { injector: this.injector });
  }

  buscar(texto: string): void {
    clearTimeout(this.searchTimer);
    const seq = ++this.searchSeq;
    this.texto.set(texto);
    this.candidata.set(null);
    this.pagina.set(1);
    this.resultado.set(null);
    this.errorBusqueda.set('');
    this.diagnostico.set('');
    this.verificando.set(false);
    this.personaSinAdscripcion.set(null);
    const q = texto.trim().replace(/\s+/g, ' ');
    this.buscando.set(q.length >= 2);
    if (q.length >= 2) this.searchTimer = setTimeout(() => void this.consultarPersonas(q, 1, seq), 300);
  }

  irPagina(pagina: number): void {
    if (!Number.isInteger(pagina) || pagina < 1 || pagina > this.totalPaginas() ||
      this.buscando() || pagina === this.pagina()) return;
    this.verificando.set(false);
    void this.consultarPersonas(this.texto().trim().replace(/\s+/g, ' '), pagina, ++this.searchSeq);
  }

  async verificarEnPlantilla(): Promise<void> {
    if (this.verificando() || this.enviando()) return;
    const nombre = this.texto().trim().replace(/\s+/g, ' ');
    const seq = this.searchSeq;
    this.verificando.set(true);
    this.diagnostico.set('');
    this.personaSinAdscripcion.set(null);
    try {
      const padron = await this.service.listarPersonasPadron({ q: nombre, estado: 'todas', page: 1, pageSize: 100 });
      if (this.destroyRef.destroyed || seq !== this.searchSeq) return;
      const normalizar = (valor: string) => valor.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-MX');
      const exactas = padron.items.filter((p) => normalizar(p.nombre_completo) === normalizar(nombre));
      const [persona] = exactas;
      if (!padron.total) {
        this.diagnostico.set('No encontramos coincidencias en la Plantilla institucional. Verifica el nombre registrado.');
      } else if (exactas.length !== 1 || padron.items.length < padron.total) {
        this.diagnostico.set('Escribe el nombre completo tal como aparece en Plantilla institucional. Si hay homónimos, verifica su identidad en Plantilla.');
      } else if (!persona.activo || persona.fecha_baja) {
        this.diagnostico.set('La persona figura como inactiva o con baja en la Plantilla institucional.');
      } else {
        const adscripciones = await this.service.listAdscripcionesPorPersona(persona.persona_id, {
          estado: 'vigentes', page: 1, pageSize: 100,
        });
        if (this.destroyRef.destroyed || seq !== this.searchSeq) return;
        const compatibles = adscripciones.items.filter((a) => a.unidad_medica_id === 177).length;
        if (compatibles > 1) {
          this.diagnostico.set('La persona tiene varias adscripciones vigentes en Coordinación Estatal. RH debe revisarlas antes de asignarla.');
        } else if (adscripciones.total > adscripciones.items.length) {
          this.diagnostico.set('No fue posible verificar todas las adscripciones vigentes desde esta búsqueda.');
        } else if (compatibles === 0) {
          this.diagnostico.set('La persona está en Plantilla y no tiene una adscripción vigente en Coordinación Estatal.');
          this.personaSinAdscripcion.set(persona.nombre_completo);
        } else {
          this.diagnostico.set('La persona tiene una adscripción vigente en Coordinación Estatal. Revisa el texto y las páginas del buscador de ocupantes.');
        }
      }
    } catch {
      if (seq === this.searchSeq) this.diagnostico.set('No fue posible verificar la Plantilla o las adscripciones. Intenta de nuevo.');
    } finally {
      if (seq === this.searchSeq) this.verificando.set(false);
    }
  }

  navegarResultados(event: KeyboardEvent, zona: HTMLElement, entrada: HTMLInputElement): void {
    if (this.enviando()) return;
    if (event.key === 'Escape') {
      this.cancelarConEscape(event);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const botones = Array.from(zona.querySelectorAll<HTMLButtonElement>('[data-candidata]'));
    if (!botones.length) return;
    const indice = botones.findIndex((boton) => boton === event.target);
    if (indice === -1 && event.target !== entrada) return;
    event.preventDefault();
    if (event.key === 'ArrowDown') botones[Math.min(indice + 1, botones.length - 1)].focus();
    else if (indice > 0) botones[indice - 1].focus();
    else entrada.focus();
  }

  private async consultarPersonas(q: string, pagina: number, seq: number): Promise<void> {
    this.buscando.set(true);
    this.errorBusqueda.set('');
    try {
      const resultado = await this.service.listarPersonalUnidad(177, { q, page: pagina, pageSize: 8, situacion: 'ACTIVOS' });
      if (this.destroyRef.destroyed || seq !== this.searchSeq) return;
      this.resultado.set(resultado);
      this.pagina.set(resultado.page);
    } catch (err) {
      if (seq === this.searchSeq) this.errorBusqueda.set(this.mensaje(err, 'No se pudo consultar el personal.'));
    } finally {
      if (seq === this.searchSeq) this.buscando.set(false);
    }
  }

  async confirmar(): Promise<void> {
    const detalle = this.detalle();
    const estado = this.estado();
    if (!detalle || !estado || !this.puedeConfirmar()) return;
    this.enviando.set(true);
    this.error.set('');
    this.personaSinAdscripcion.set(null);
    const candidata = this.candidata();
    try {
      const actualizada = await this.service.actualizarOcupacionOrganigrama(detalle.puesto_id, {
        estado,
        persona_id: estado === 'OCUPADO' ? candidata!.persona_id : null,
        revision_esperada: detalle.actualizado_en,
        motivo: this.motivo().trim(),
      });
      if (this.destroyRef.destroyed) return;
      this.detalle.set(actualizada);
      this.guardada.emit(actualizada);
      this.cerrarModal();
    } catch (err) {
      this.conflicto.set(err instanceof HttpErrorResponse && err.status === 409);
      if (estado === 'OCUPADO' && candidata && this.conflicto() && err instanceof HttpErrorResponse &&
          err.error?.error === 'La persona no tiene adscripción vigente en Coordinación Estatal') {
        this.personaSinAdscripcion.set(candidata.nombre_completo);
      }
      this.error.set(this.mensaje(err, 'No se pudo guardar la ocupación.'));
      if (err instanceof HttpErrorResponse && err.status === 404) this.detalle.set(null);
    } finally {
      this.enviando.set(false);
    }
  }

  abrirPersonalPorUnidad(): void {
    const nombre = this.personaSinAdscripcion();
    if (!nombre || this.enviando() || this.cargando()) return;
    this.modal().nativeElement.close();
    this.revisarAdscripcion.emit(nombre);
  }

  readonly puedeRevisarAdscripcion = computed(() => Boolean(this.personaSinAdscripcion()));

  private mensaje(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      if (typeof err.error?.error === 'string' && err.error.error.trim()) return err.error.error;
      if (err.status === 400) return 'Los datos enviados para la ocupación no son válidos.';
      if (err.status === 404) return 'El puesto no se encontró o está fuera de Coordinación Estatal.';
      if (err.status === 409) return 'Hay un conflicto con la ocupación. Actualiza los datos antes de confirmar.';
      if (err.status === 0) return 'No se pudo conectar con el servidor. Vuelve a intentarlo.';
    }
    return fallback;
  }
}
