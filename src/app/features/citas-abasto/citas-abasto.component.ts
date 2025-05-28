import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { CitasService } from '../../services/citas.service';
import { PaginacionCitas } from '../../models/PaginacionCitas';
import { Cita } from '../../models/Cita';
import { FormsModule } from '@angular/forms';

/**
 * @deprecated 
 */
@Component({
  selector: 'app-citas-abasto',
  imports: [CommonModule, FormsModule],
  templateUrl: './citas-abasto.component.html',
  styleUrl: './citas-abasto.component.css'
})
export class CitasAbastoComponent {
  isLoading = false;

  sortBy: string = 'fecha_de_cita';
  sortOrder: 'ASC' | 'DESC' = 'DESC';

  ordenarPor(campo: string): void {
    if (this.sortBy === campo) {
      this.sortOrder = this.sortOrder === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortBy = campo;
      this.sortOrder = 'ASC';
    }
    this.page = 1;
    this.buscar();
  }


  citas: Cita[] = [];

  filtros: Record<string, string> = {
    ejercicio: '',
    orden_de_suministro: '',
    institucion: '',
    tipo_de_entrega: '',
    clues_destino: '',
    unidad: '',
    fte_fmto: '',
    proveedor: '',
    clave_cnis: '',
    descripcion: '',
    compra: '',
    tipo_de_red: '',
    tipo_de_insumo: '',
    grupo_terapeutico: '',
    precio_unitario: '',
    no_de_piezas_emitidas: '',
    fecha_limite_de_entrega: '',
    pzas_recibidas_por_la_entidad: '',
    fecha_recepcion_almacen: '',
    numero_de_remision: '',
    lote: '',
    caducidad: '',
    estatus: '',
    folio_abasto: '',
    almacen_hospital_que_recibio: '',
    evidencia: '',
    carga: '',
    fecha_de_cita: '',
    observacion: '',
  };

  page = 1;
  limit = 25;
  total = 0;
  searchTerm = '';

  constructor(private citasService: CitasService) { }

  ngOnInit(): void {
    const guardado = localStorage.getItem('citas_limit');
    if (guardado) {
      this.limit = parseInt(guardado, 10);
    }
    this.buscar();
  }

  buscar(): void {
    this.isLoading = true;
    this.citasService.obtenerCitas(this.page, this.limit, this.filtros, this.searchTerm, this.sortBy, this.sortOrder)
      .subscribe({
        next: (res) => {
          this.citas = res.data;
          this.total = res.total;
          this.isLoading = false;
        },
        error: (err) => {
          console.error('Error al cargar citas:', err);
          this.isLoading = false;
        }
      });
  }

  anterior(): void {
    if (this.page > 1) {
      this.page--;
      this.buscar();
    }
  }

  siguiente(): void {
    if (this.page < this.totalPages) {
      this.page++;
      this.buscar();
    }
  }

  get totalPages(): number {
    return Math.ceil(this.total / this.limit);
  }

  limpiarFiltros(): void {
    this.searchTerm = '';
    this.page = 1;

    // Limpia todos los campos del objeto `filtros`
    for (const key in this.filtros) {
      if (Object.prototype.hasOwnProperty.call(this.filtros, key)) {
        this.filtros[key as keyof typeof this.filtros] = '';
      }
    }

    this.buscar();
  }

  get paginasVisibles(): number[] {
    const totalPages = this.totalPages;
    const current = this.page;
    const delta = 2;

    const range: number[] = [];

    const start = Math.max(2, current - delta);
    const end = Math.min(totalPages - 1, current + delta);

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) range.push(i);
    } else {
      if (current > 3) range.push(1); // Primer botón fijo
      if (start > 2) range.push(-1); // -1 será "..."

      for (let i = start; i <= end; i++) range.push(i);

      if (end < totalPages - 1) range.push(-2); // -2 será "..."
      if (current < totalPages - 2) range.push(totalPages); // Último botón fijo
    }

    return range;
  }

  cambiarLimite(): void {
    localStorage.setItem('citas_limit', this.limit.toString());
    this.page = 1; // Reiniciar a la primera página
    this.buscar();
  }


  irAPagina(pagina: number): void {
    if (pagina !== this.page && pagina > 0 && pagina <= this.totalPages) {
      this.page = pagina;
      this.buscar();
    }
  }


}
