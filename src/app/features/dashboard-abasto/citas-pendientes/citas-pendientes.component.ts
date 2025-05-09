import { Component, Input, OnChanges, SimpleChanges, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Cita } from '../../../models/Cita';

interface GrupoUnidad {
  unidad: string;
  citas: Cita[];
}

@Component({
  selector: 'app-citas-pendientes',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './citas-pendientes.component.html',
  styleUrls: ['./citas-pendientes.component.css']
})
export class CitasPendientesComponent implements OnChanges {
  @Input() citas: Cita[] = [];

  citasPendientes: Cita[] = [];
  citasSinAgendar: Cita[] = [];
  citasAgendadasSinRecepcion: Cita[] = [];
  unidadesAgrupadas: GrupoUnidad[] = [];

  unidadExpandida: string | null = null;

  @ViewChildren('grupoUnidad') grupoRefs!: QueryList<ElementRef<HTMLDivElement>>;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['citas']) {
      this.procesarCitas();
    }
  }

  procesarCitas(): void {
    this.citasPendientes = this.citas.filter(c =>
      !c.fecha_recepcion_almacen || c.fecha_recepcion_almacen.trim() === ''
    );

    this.citasSinAgendar = this.citasPendientes.filter(c => !c.fecha_de_cita);
    this.citasAgendadasSinRecepcion = this.citasPendientes.filter(c => !!c.fecha_de_cita);

    const map = new Map<string, Cita[]>();
    this.citasPendientes.forEach(c => {
      const unidad = c.unidad ?? 'Desconocida';
      if (!map.has(unidad)) map.set(unidad, []);
      map.get(unidad)!.push(c);
    });

    this.unidadesAgrupadas = Array.from(map.entries()).map(([unidad, citas]) => ({ unidad, citas }));
  }

  toggleUnidad(unidad: string): void {
    if (this.unidadExpandida === unidad) {
      this.unidadExpandida = null;
      return;
    }

    this.unidadExpandida = unidad;

    setTimeout(() => {
      const index = this.unidadesAgrupadas.findIndex(g => g.unidad === unidad);
      const grupo = this.grupoRefs.get(index);
      const topOffset = grupo?.nativeElement.getBoundingClientRect().top ?? 0;

      if (grupo && topOffset > 200) {
        grupo.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        grupo.nativeElement.style.scrollMarginTop = '6rem';
      }
    }, 50);
  }
}
