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
  page = 1;
  limit = 10;
  total = 0;
  searchTerm = '';

  constructor(private citasService: CitasService) {}

  ngOnInit(): void {
    this.buscar();
  }

  buscar(): void {
    this.isLoading = true;
    this.citasService.obtenerCitas(this.page, this.limit, this.searchTerm)
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
