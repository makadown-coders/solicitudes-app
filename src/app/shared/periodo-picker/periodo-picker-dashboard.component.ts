import { ChangeDetectorRef, Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PeriodoFechasService } from '../periodo-fechas.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-periodo-picker-dashboard',
  imports: [CommonModule, FormsModule],
  templateUrl: './periodo-picker-dashboard.component.html',
  styles: [ './periodo-picker-dashboard.component.css' ],
})
export class PeriodoPickerDasboardComponent {
  meses = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
  ];

  anios = Array.from({ length: 3 }, (_, i) => 2025 + i); // 2025 → 2027

  @Input() titulo: string = '';
  @Input() fechaInicio: Date | null = null;
  @Input() fechaFin: Date | null = null;
  fechaInicioAnterior: Date | null = null;
  fechaFinAnterior: Date | null = null;
  mostrarCalendario = false;
  mesElegido: number = new Date().getMonth(); // 0 = enero
  anioElegido: number = new Date().getFullYear();
  hoveredDate: Date | null = null;
  private cdRef = inject(ChangeDetectorRef);

  @Output() rangoCambiado = new EventEmitter<{ texto: string; fechaInicio: Date; fechaFin: Date }>();

  fechasService = inject(PeriodoFechasService);

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
    this.hoveredDate = null;
  }

  cambiarMes(delta: number) {
    this.mesElegido += delta;
    if (this.mesElegido > 11) {
      this.mesElegido = 0;
      this.anioElegido++;
    } else if (this.mesElegido < 0) {
      this.mesElegido = 11;
      this.anioElegido--;
    }
  }

  seleccionarFecha(fecha: Date) {
    if (!this.fechaInicio || (this.fechaInicio && this.fechaFin)) {
      this.fechaInicio = fecha;
      this.fechaFin = null;
    } else {
      [this.fechaInicio, this.fechaFin] = this.fechasService.ordenarFechas(this.fechaInicio, fecha);
      this.emitirPeriodoFormateado();
      this.mostrarCalendario = false;
    }
  }

  emitirPeriodoFormateado() {
    if (this.fechaInicio && this.fechaFin) {
      const texto = this.fechasService.formatearRango(this.fechaInicio, this.fechaFin);
      this.rangoCambiado.emit({ texto, fechaInicio: this.fechaInicio, fechaFin: this.fechaFin });
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
    this.cdRef.detectChanges();
  }

  onAnioCambiado(nuevoAnio: number) {
    this.anioElegido = nuevoAnio;
    this.hoveredDate = null;
    this.cdRef.detectChanges();
  }

}
