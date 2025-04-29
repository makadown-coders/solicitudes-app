import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Cita, CitasService, PaginacionCitas } from '../../services/citas.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-citas-abasto',
  imports: [CommonModule, FormsModule],
  templateUrl: './citas-abasto.component.html',
  styleUrl: './citas-abasto.component.css'
})
export class CitasAbastoComponent {
  isLoading = false;

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
    this.buscar();
  }

  buscar(): void {
    this.isLoading = true;
    this.citasService.obtenerCitas(this.page, this.limit, this.filtros, this.searchTerm)
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
}
