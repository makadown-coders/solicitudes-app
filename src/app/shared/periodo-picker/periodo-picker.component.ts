// src/app/shared/periodo-picker/periodo-picker.component.ts
import { ChangeDetectorRef, Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PeriodoFechasService } from '../periodo-fechas.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-periodo-picker',
  imports: [CommonModule, FormsModule],
  templateUrl: './periodo-picker.component.html',
  styleUrl: './periodo-picker.component.css'
})
export class PeriodoPickerComponent implements OnInit {
  meses = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
  ];

  // ↓ nuevo: lista derivada de meses visibles según (anioElegido, regla de pasado)
  mesesVisibles: { label: string; index: number }[] = [];

  anios = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() + i); // 2025 → 2027

  @Input() disallowPastDates = false;   // true => no se permiten fechas pasadas en el rango
  @Input() allowToday = true;           // true => hoy permitido; false => a partir de mañana

  private startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  private readonly hoy = this.startOfDay(new Date());

  rangoInvalido = false;

  @Input() fechaInicio: Date | null = null;
  @Input() fechaFin: Date | null = null;
  fechaInicioAnterior: Date | null = null;
  fechaFinAnterior: Date | null = null;
  mostrarCalendario = false;
  mesElegido: number = new Date().getMonth(); // 0 = enero
  anioElegido: number = new Date().getFullYear();
  hoveredDate: Date | null = null;
  private cdRef = inject(ChangeDetectorRef);

  @Output() rangoCambiado =
    new EventEmitter<{
      texto: string;
      fechaInicio: Date;
      fechaFin: Date;
      valido: boolean
    }>();

  fechasSvc = inject(PeriodoFechasService);

  ngOnInit() {
    this.recomputeValidity();
    this.recomputeMesesVisiblesFor(this.anioElegido);
    this.emitirPeriodoFormateado();
  }

  toggleCalendario() {
    this.mostrarCalendario = !this.mostrarCalendario;

    if (this.mostrarCalendario && this.fechaInicio && this.fechaFin) {
      this.fechaInicioAnterior = new Date(this.fechaInicio);
      this.fechaFinAnterior = new Date(this.fechaFin);
    }
  }

  cancelarEdicionRango() {
    this.fechaInicio = this.fechaInicioAnterior;
    this.fechaFin = this.fechaFinAnterior;
    this.mostrarCalendario = false;
    this.recomputeValidity();
    this.hoveredDate = null;
  }

  cambiarMes(delta: number) {
    if (!delta) return;

    // índice del mes actual dentro de la lista de visibles
    let idx = this.mesesVisibles.findIndex(m => m.index === this.mesElegido);

    // si por alguna razón no está, recomputa y reintenta
    if (idx === -1) {
      this.recomputeMesesVisiblesFor(this.anioElegido);
      idx = this.mesesVisibles.findIndex(m => m.index === this.mesElegido);
    }

    // avanzar/retroceder
    idx += Math.sign(delta);

    // pasar de diciembre a enero del siguiente año, o viceversa
    if (idx >= this.mesesVisibles.length) {
      this.onAnioCambiado(this.anioElegido + 1);
      idx = 0;
    } else if (idx < 0) {
      this.onAnioCambiado(this.anioElegido - 1);
      idx = this.mesesVisibles.length ? this.mesesVisibles.length - 1 : 0;
    }

    // proteger si no hay visibles (raro, pero por si acaso)
    if (!this.mesesVisibles.length) return;

    this.mesElegido = this.mesesVisibles[idx].index;
  }

  seleccionarFecha(d: Date) {
    // Bloquea clicks en fechas pasadas
    if (this.disallowPastDates && this.isPast(d)) return;

    if (!this.fechaInicio || (this.fechaInicio && this.fechaFin)) {
      this.fechaInicio = d;
      this.fechaFin = null;
    } else {
      [this.fechaInicio, this.fechaFin] = this.fechasSvc.ordenarFechas(this.fechaInicio, d);
      this.recomputeValidity();
      this.emitirPeriodoFormateado();
      this.mostrarCalendario = false;
    }
  }

  emitirPeriodoFormateado() {
    if (this.fechaInicio && this.fechaFin) {
      const texto = this.fechasSvc.formatearRango(this.fechaInicio, this.fechaFin);
      this.rangoCambiado.emit({
        texto,
        fechaInicio: this.fechaInicio,
        fechaFin: this.fechaFin,
        valido: !this.rangoInvalido,
      });
    }
  }

  isExact(dia: number): boolean {
    const check = (d: Date | null) => d && d.getDate() === dia && d.getMonth() === 3 && d.getFullYear() === 2025;
    return (check(this.fechaInicio) || check(this.fechaFin)) ?? false;
  }



  crearFecha(dia: number): Date {
    return new Date(this.anioElegido, this.mesElegido, dia);
  }

  getDiasDelMes(): (number | null)[] {
    const dias: (number | null)[] = [];

    const primerDia = new Date(this.anioElegido, this.mesElegido, 1);
    const diaSemana = primerDia.getDay(); // 0 = domingo, 1 = lunes, ...

    const diasEnMes = new Date(this.anioElegido, this.mesElegido + 1, 0).getDate();

    // Agrega espacios vacíos al inicio
    for (let i = 0; i < diaSemana; i++) {
      dias.push(null);
    }

    // Agrega los días reales
    for (let i = 1; i <= diasEnMes; i++) {
      dias.push(i);
    }

    return dias;
  }

  esInicio(dia: number): boolean {
    const retorno = !!(
      this.fechaInicio &&
      this.fechaInicio.getDate() === dia &&
      this.fechaInicio.getMonth() === this.mesElegido &&
      this.fechaInicio.getFullYear() === this.anioElegido
    );
    return retorno;
  }

  esFin(dia: number): boolean {
    const retorno = this.fechaFin !== null && (
      this.fechaFin.getDate() === dia &&
      this.fechaFin.getMonth() === this.mesElegido as number &&
      this.fechaFin.getFullYear() === this.anioElegido
    );
    return retorno;
  }

  esInicioOFin(dia: number): boolean {
    const retorno = this.esInicio(dia) || this.esFin(dia);
    return retorno;
  }

  esHoverFin(dia: number): boolean {
    return !!(
      this.fechaInicio &&
      !this.fechaFin &&
      this.hoveredDate &&
      this.hoveredDate.getDate() === dia &&
      this.hoveredDate.getMonth() === this.mesElegido &&
      this.hoveredDate.getFullYear() === this.anioElegido
    );
  }

  isBetween(dia: number): boolean {
    if (!this.fechaInicio || !this.fechaFin) return false;

    const actual = new Date(this.anioElegido, this.mesElegido, dia).getTime();
    return (
      actual > this.fechaInicio.getTime() &&
      actual < this.fechaFin.getTime()
    );
  }

  isHovered(dia: number): boolean {
    if (!this.fechaInicio || this.fechaFin || !this.hoveredDate) return false;

    const actual = new Date(this.anioElegido, this.mesElegido, dia).getTime();
    const inicio = this.fechaInicio.getTime();
    const hover = this.hoveredDate.getTime();

    return actual > Math.min(inicio, hover) && actual < Math.max(inicio, hover);
  }

  onMesCambiado(nuevoMes: number) {
    this.mesElegido = +nuevoMes; // forzando a número porque viene como string quien sabe porqué :/
    this.hoveredDate = null; // limpiar si estaba seleccionando
    this.recomputeValidity();
    this.cdRef.detectChanges();
  }

  onAnioCambiado(nuevoAnio: number) {
    this.anioElegido = +nuevoAnio;
    this.hoveredDate = null;
    this.recomputeMesesVisiblesFor(this.anioElegido);
    this.recomputeValidity();
    this.cdRef.detectChanges();
  }

  /** ¿La fecha está en el pasado según allowToday? */
  isPast(d: Date): boolean {
    const d0 = this.startOfDay(d);
    return this.allowToday ? d0 < this.hoy : d0 <= this.hoy;
  }

  /** Recalcula invalidez del rango (solo por la regla de “no pasado”) */
  private recomputeValidity() {
    if (!this.disallowPastDates) { this.rangoInvalido = false; return; }

    // si cualquiera de las dos está en pasado → inválido
    const inv =
      (!!this.fechaInicio && this.isPast(this.fechaInicio)) ||
      (!!this.fechaFin && this.isPast(this.fechaFin));
    this.rangoInvalido = inv;
  }

  // cutoff: si allowToday = true ⇒ hoy permitido; si false ⇒ desde mañana
  private get cutoffForPast(): Date {
    return this.allowToday
      ? this.hoy
      : new Date(this.hoy.getFullYear(), this.hoy.getMonth(), this.hoy.getDate() + 1);
  }

  // ¿El mes (year, monthIndex) ya pasó COMPLETAMENTE?
  private isMonthFullyPast(year: number, monthIndex: number): boolean {
    if (!this.disallowPastDates) return false;
    const endOfMonth = this.startOfDay(new Date(year, monthIndex + 1, 0));
    return endOfMonth < this.cutoffForPast;
  }

  // Recalcula meses visibles del año dado y corrige mesElegido si quedó oculto
  private recomputeMesesVisiblesFor(year: number) {
    const currentYear = this.hoy.getFullYear();

    // 1) Si la regla no aplica o el año es futuro → todos visibles
    if (!this.disallowPastDates || year > currentYear) {
      this.mesesVisibles = this.meses.map((label, index) => ({ label, index }));
    }
    // 2) Año pasado con regla activa → salta al año actual
    else if (year < currentYear) {
      this.anioElegido = currentYear;
      this.recomputeMesesVisiblesFor(this.anioElegido);
      return;
    }
    // 3) Año actual con regla activa → filtra los meses totalmente pasados
    else {
      const visibles = this.meses
        .map((label, index) => ({ label, index }))
        .filter(m => !this.isMonthFullyPast(year, m.index));

      // Edge case: si el año actual no tiene ninguno (ej. 31-DIC con allowToday=false) → brinca a siguiente año
      if (visibles.length === 0) {
        this.anioElegido = currentYear + 1;
        this.recomputeMesesVisiblesFor(this.anioElegido);
        return;
      }

      this.mesesVisibles = visibles;
    }

    // Asegura que mesElegido sea visible
    if (!this.mesesVisibles.some(m => m.index === this.mesElegido)) {
      // si es año futuro: arranca en enero; si es año actual: intenta desde el mes actual
      const targetMonth = (this.anioElegido > currentYear) ? 0 : this.hoy.getMonth();
      const nextVisible =
        this.mesesVisibles.find(m => m.index >= targetMonth)
        ?? this.mesesVisibles[this.mesesVisibles.length - 1]; // último visible como fallback
      this.mesElegido = nextVisible.index;
      console.log('mesElegido cambiado a', this.mesElegido);
      console.log('mesesVisibles', this.mesesVisibles);
    }
  }
}
