import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject,
  Injector, input, OnInit, output, signal, viewChild,
} from '@angular/core';
import {
  RhPersonalUnidadItem, RhPersonalUnidadPagedResponse, RhService, RhSupervisionDirecta, RhTrabajadorFichaResponse,
} from '../../services/rh.service';

export const etiquetasSupervision: Record<RhSupervisionDirecta['estado'], string> = {
  PENDIENTE: 'Pendiente de definir',
  SIN_JEFE_ASIGNADO: 'Sin jefe directo asignado',
  ASIGNADO: 'Jefe asignado',
};

type Candidato = Pick<RhPersonalUnidadItem, 'persona_id' | 'nombre_completo'>;

@Component({
  selector: 'app-rh-supervision-directa-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rh-supervision-directa-dialog.component.html',
  styles: [`
    .rh-supervision-btn {
      cursor: pointer; border: 1px solid #cbd5e1; border-radius: .5rem;
      background: white; padding: .45rem .65rem; font-size: .75rem; font-weight: 600;
    }
    .rh-supervision-btn:hover:not(:disabled) { background: #f1f5f9; }
    .rh-supervision-btn:focus-visible { outline: 2px solid #047857; outline-offset: 2px; }
    .rh-supervision-btn:disabled { cursor: not-allowed; opacity: .5; }
    .rh-supervision-btn[aria-pressed="true"] { border-color: #047857; background: #ecfdf5; }
  `],
})
export class RhSupervisionDirectaDialogComponent implements OnInit {
  private readonly rh = inject(RhService);
  private readonly destroy = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  private readonly titulo = viewChild.required<ElementRef<HTMLElement>>('titulo');
  private readonly entradaBusqueda = viewChild<ElementRef<HTMLInputElement>>('entrada');
  private readonly campoMotivo = viewChild<ElementRef<HTMLTextAreaElement>>('campoMotivo');
  private readonly continuar = viewChild<ElementRef<HTMLButtonElement>>('continuar');
  private temporizador?: ReturnType<typeof setTimeout>;
  private secuencia = 0;

  readonly ficha = input.required<RhTrabajadorFichaResponse>();
  readonly cerrar = output<RhSupervisionDirecta | null>();
  readonly etiquetas = etiquetasSupervision;
  readonly actual = signal<RhSupervisionDirecta | null>(null);
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly actualizarRequerido = signal(false);
  readonly error = signal('');
  readonly accion = signal<'asignar' | 'sin-jefe' | null>(null);
  readonly candidato = signal<Candidato | null>(null);
  readonly motivo = signal('');
  readonly descarte = signal(false);
  readonly texto = signal('');
  readonly buscando = signal(false);
  readonly errorBusqueda = signal('');
  readonly resultado = signal<RhPersonalUnidadPagedResponse | null>(null);
  readonly pagina = computed(() => this.resultado()?.page ?? 1);
  readonly totalPaginas = computed(() => {
    const resultado = this.resultado();
    return resultado ? Math.max(1, Math.ceil(resultado.total / resultado.pageSize)) : 1;
  });
  readonly sugerenciaVisible = computed(() => {
    const datos = this.actual();
    const sugerida = datos?.sugerencia;
    if (!datos || !sugerida) return null;
    if (datos.estado === 'SIN_JEFE_ASIGNADO') return null;
    if (datos.estado === 'ASIGNADO' && datos.persona_supervisora_id === sugerida.persona_id) return null;
    return sugerida;
  });
  readonly puedeElegirSugerencia = computed(() => {
    const datos = this.actual();
    return Boolean(datos && datos.estado === 'PENDIENTE' && this.sugerenciaVisible() && this.accion() !== 'sin-jefe');
  });
  readonly puedeGuardar = computed(() => Boolean(this.actual() && !this.guardando() && !this.cargando() &&
    !this.actualizarRequerido() && !this.descarte() && this.motivo().trim() &&
    Array.from(this.motivo().trim()).length <= 500 &&
    (this.accion() === 'sin-jefe' || (this.accion() === 'asignar' && this.candidato()))));

  constructor() {
    this.destroy.onDestroy(() => clearTimeout(this.temporizador));
    afterNextRender(() => {
      this.dialogo().nativeElement.showModal();
      this.titulo().nativeElement.focus();
    });
  }

  ngOnInit(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    if (this.cargando() || this.guardando()) return;
    const { unidad, personal } = this.ficha();
    this.cargando.set(true);
    this.error.set('');
    try {
      const actual = await this.rh.obtenerSupervisionDirecta(unidad.id, personal.persona_id);
      if (this.destroy.destroyed) return;
      this.actual.set(actual);
      this.actualizarRequerido.set(false);
    } catch (err) {
      this.error.set(this.mensaje(err, 'No se pudo consultar la jefatura directa.'));
    } finally {
      this.cargando.set(false);
    }
  }

  preparar(accion: 'asignar' | 'sin-jefe'): void {
    if (!this.actual() || this.guardando() || this.cargando()) return;
    this.accion.set(accion);
    this.candidato.set(null);
    this.enfocarEditor();
  }

  private enfocarEditor(): void {
    afterNextRender(() => (this.entradaBusqueda()?.nativeElement ?? this.campoMotivo()?.nativeElement)?.focus(),
      { injector: this.injector });
  }

  elegir(candidato: Candidato): void {
    if (!this.guardando() && candidato.persona_id !== this.ficha().personal.persona_id) {
      this.candidato.set(candidato);
    }
  }

  buscar(texto: string): void {
    clearTimeout(this.temporizador);
    const seq = ++this.secuencia;
    this.texto.set(texto);
    this.candidato.set(null);
    this.resultado.set(null);
    this.errorBusqueda.set('');
    const q = texto.trim().replace(/\s+/g, ' ');
    this.buscando.set(q.length >= 2);
    if (q.length >= 2) {
      this.temporizador = setTimeout(() => void this.consultarPersonas(q, 1, seq), 300);
    }
  }

  irPagina(pagina: number): void {
    if (!Number.isInteger(pagina) || pagina < 1 || pagina > this.totalPaginas() ||
      pagina === this.pagina() || this.buscando() || this.guardando()) return;
    void this.consultarPersonas(this.texto().trim().replace(/\s+/g, ' '), pagina, ++this.secuencia);
  }

  navegarBusqueda(evento: KeyboardEvent, zona: HTMLElement, entrada: HTMLInputElement): void {
    if (evento.key === 'Escape') {
      this.solicitarCerrar(evento);
      return;
    }
    if (evento.key !== 'ArrowDown' && evento.key !== 'ArrowUp') return;
    const opciones = Array.from(zona.querySelectorAll<HTMLButtonElement>('[data-supervisor]:not(:disabled)'));
    const indice = opciones.findIndex((opcion) => opcion === evento.target);
    if (!opciones.length || (indice === -1 && evento.target !== entrada)) return;
    evento.preventDefault();
    if (evento.key === 'ArrowDown') opciones[Math.min(indice + 1, opciones.length - 1)].focus();
    else if (indice > 0) opciones[indice - 1].focus();
    else entrada.focus();
  }

  private async consultarPersonas(q: string, page: number, secuencia: number): Promise<void> {
    this.buscando.set(true);
    this.errorBusqueda.set('');
    try {
      const resultado = await this.rh.listarPersonalUnidad(this.ficha().unidad.id, {
        q, page, pageSize: 8, situacion: 'ACTIVOS',
      });
      if (!this.destroy.destroyed && secuencia === this.secuencia) this.resultado.set(resultado);
    } catch (err) {
      if (secuencia === this.secuencia) this.errorBusqueda.set(this.mensaje(err, 'No se pudo buscar personal.'));
    } finally {
      if (secuencia === this.secuencia) this.buscando.set(false);
    }
  }

  solicitarCerrar(event?: Event): void {
    event?.preventDefault();
    if (this.guardando()) return;
    if (this.descarte() && event) {
      this.seguirEditando();
    } else if (this.accion()) {
      this.descarte.set(true);
      afterNextRender(() => this.continuar()?.nativeElement.focus(), { injector: this.injector });
    } else {
      this.terminar(null);
    }
  }

  seguirEditando(): void {
    this.descarte.set(false);
    this.enfocarEditor();
  }

  descartar(): void {
    if (this.descarte() && !this.guardando()) this.terminar(null);
  }

  private terminar(resultado: RhSupervisionDirecta | null): void {
    this.dialogo().nativeElement.close();
    this.cerrar.emit(resultado);
  }

  async confirmar(): Promise<void> {
    const actual = this.actual();
    if (!actual || !this.puedeGuardar()) return;
    const { unidad, personal } = this.ficha();
    this.guardando.set(true);
    this.error.set('');
    try {
      const guardada = await this.rh.actualizarSupervisionDirecta(unidad.id, personal.persona_id, {
        persona_supervisora_id: this.accion() === 'sin-jefe' ? null : this.candidato()!.persona_id,
        motivo: this.motivo().trim(),
        revision_esperada: actual.revision,
      });
      if (!this.destroy.destroyed) this.terminar(guardada);
    } catch (err) {
      this.actualizarRequerido.set(err instanceof HttpErrorResponse && (err.status === 409 || err.status === 404));
      this.error.set(this.mensaje(err, 'No se pudo guardar la jefatura directa.'));
    } finally {
      this.guardando.set(false);
    }
  }

  private mensaje(err: unknown, fallback: string): string {
    if (!(err instanceof HttpErrorResponse)) return fallback;
    switch (err.error?.codigo) {
      case 'REVISION_OBSOLETA': return 'Otra persona actualizó la jefatura. Actualiza los datos y revisa el cambio antes de confirmar.';
      case 'AUTORREFERENCIA': return 'El trabajador no puede ser su propio jefe directo.';
      case 'CICLO_SUPERVISION': return 'Este supervisor formaría un ciclo o ya pertenece a una cadena circular. Elige otra persona.';
      case 'UNIDAD_FUERA_DE_PILOTO': return 'La administración de jefaturas se limita a Coordinación Estatal.';
      default:
        if (err.status === 0) return 'No se pudo conectar con el servidor. Intenta de nuevo.';
        return typeof err.error?.error === 'string' ? err.error.error : fallback;
    }
  }
}
