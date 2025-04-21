import { ChangeDetectorRef, Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NombreMesPipe } from '../nombre-mes.pipe';
import { PeriodoFechasService } from '../periodo-fechas.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-periodo-picker',
  imports: [CommonModule, NombreMesPipe, FormsModule],
  templateUrl: './periodo-picker.component.html',
  styleUrl: './periodo-picker.component.css'
})
export class PeriodoPickerComponent {
  meses = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
  ];

  anios = Array.from({ length: 3 }, (_, i) => 2025 + i); // 2025 → 2027

  @Input() fechaInicio: Date | null = null;
  @Input() fechaFin: Date | null = null;
  fechaInicioAnterior: Date | null = null;
  fechaFinAnterior: Date | null = null;
  mostrarCalendario = false;
  mesActual: number = new Date().getMonth(); // 0 = enero
  anioActual: number = new Date().getFullYear();
  hoveredDate: Date | null = null;
  private cdRef = inject(ChangeDetectorRef);

  @Output() rangoCambiado = new EventEmitter<{ texto: string; fechaInicio: Date; fechaFin: Date }>();

  fechasSvc = inject(PeriodoFechasService);

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
    this.mesActual += delta;
    if (this.mesActual > 11) {
      this.mesActual = 0;
      this.anioActual++;
    } else if (this.mesActual < 0) {
      this.mesActual = 11;
      this.anioActual--;
    }
  }

  seleccionarFecha(fecha: Date) {
    if (!this.fechaInicio || (this.fechaInicio && this.fechaFin)) {
      this.fechaInicio = fecha;
      this.fechaFin = null;
    } else {
      [this.fechaInicio, this.fechaFin] = this.fechasSvc.ordenarFechas(this.fechaInicio, fecha);
      this.emitirPeriodoFormateado();
      this.mostrarCalendario = false;
    }
  }

  emitirPeriodoFormateado() {
    if (this.fechaInicio && this.fechaFin) {
      const texto = this.fechasSvc.formatearRango(this.fechaInicio, this.fechaFin);
      this.rangoCambiado.emit({ texto, fechaInicio: this.fechaInicio, fechaFin: this.fechaFin });
    }
  }

  isExact(dia: number): boolean {
    const check = (d: Date | null) => d && d.getDate() === dia && d.getMonth() === 3 && d.getFullYear() === 2025;
    return (check(this.fechaInicio) || check(this.fechaFin)) ?? false;
  }



  crearFecha(dia: number): Date {
    return new Date(this.anioActual, this.mesActual, dia);
  }

  getDiasDelMes(): (number | null)[] {
    const dias: (number | null)[] = [];

    const primerDia = new Date(this.anioActual, this.mesActual, 1);
    const diaSemana = primerDia.getDay(); // 0 = domingo, 1 = lunes, ...

    const diasEnMes = new Date(this.anioActual, this.mesActual + 1, 0).getDate();

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
    return !!(
      this.fechaInicio &&
      this.fechaInicio.getDate() === dia &&
      this.fechaInicio.getMonth() === this.mesActual &&
      this.fechaInicio.getFullYear() === this.anioActual
    );
  }

  esFin(dia: number): boolean {
    return !!(
      this.fechaFin &&
      this.fechaFin.getDate() === dia &&
      this.fechaFin.getMonth() === this.mesActual &&
      this.fechaFin.getFullYear() === this.anioActual
    );
  }

  esInicioOFin(dia: number): boolean {
    return this.esInicio(dia) || this.esFin(dia);
  }

  esHoverFin(dia: number): boolean {
    return !!(
      this.fechaInicio &&
      !this.fechaFin &&
      this.hoveredDate &&
      this.hoveredDate.getDate() === dia &&
      this.hoveredDate.getMonth() === this.mesActual &&
      this.hoveredDate.getFullYear() === this.anioActual
    );
  }

  isBetween(dia: number): boolean {
    if (!this.fechaInicio || !this.fechaFin) return false;

    const actual = new Date(this.anioActual, this.mesActual, dia).getTime();
    return (
      actual > this.fechaInicio.getTime() &&
      actual < this.fechaFin.getTime()
    );
  }

  isHovered(dia: number): boolean {
    if (!this.fechaInicio || this.fechaFin || !this.hoveredDate) return false;

    const actual = new Date(this.anioActual, this.mesActual, dia).getTime();
    const inicio = this.fechaInicio.getTime();
    const hover = this.hoveredDate.getTime();

    return actual > Math.min(inicio, hover) && actual < Math.max(inicio, hover);
  }

  onMesCambiado(nuevoMes: number) {
    console.log('mes actual', this.mesActual);
    console.log('mes cambiado', nuevoMes);
    this.mesActual = nuevoMes;
    this.hoveredDate = null; // limpiar si estaba seleccionando
    this.cdRef.detectChanges();
  }

  onAnioCambiado(nuevoAnio: number) {
    this.anioActual = nuevoAnio;
    this.hoveredDate = null;
    this.cdRef.detectChanges();
  }

}
