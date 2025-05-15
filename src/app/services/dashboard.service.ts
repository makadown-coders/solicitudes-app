import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Cita } from '../models/Cita';
import * as LZString from 'lz-string';
import { CitasService } from './citas.service';

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private STORAGE_KEY = 'citasFull';
  private citasSubject = new BehaviorSubject<Cita[]>([]);
  public citas$: Observable<Cita[]> = this.citasSubject.asObservable();
  private citasService = inject(CitasService);

  constructor(private http: HttpClient) {
    this.cargarDesdeLocalStorage();
  }

  private cargarDesdeLocalStorage() {
    const compressed = localStorage.getItem(this.STORAGE_KEY);
    if (compressed) {
      try {
        const raw = LZString.decompress(compressed);
        const citas = raw ? JSON.parse(raw) : [];
        this.citasSubject.next(citas as Cita[]);
      } catch {
        localStorage.removeItem(this.STORAGE_KEY);
      }
    }
  }

  refrescarDatos(): void {
    console.log('🔄 Actualizando datos del dashboard...');
    const url = `${environment.apiUrl}/citas/full`;
    this.http.get<CitasFull>(url).subscribe({
      next: (response: CitasFull) => {
        console.log('Recibiendo datos...'); 
        console.log('serializando Base64');

        // TODO: inyectar servicio de citas para transpormar base64 a excel y luego a citas[]
        const citas = this.citasService.obtenerCitasDeBase64(response.citas);

        // 1) Serializar y comprimir
        const raw = JSON.stringify(citas);
        const compressed = LZString.compress(raw);
        try {
          console.log('Guardando en localStorage...');
          localStorage.setItem(this.STORAGE_KEY, compressed);
        } catch {
          console.warn('😱 localStorage lleno, omitiendo guardado');
        }
        // 2) Emitir
        console.log('✅ Datos del dashboard actualizados.');
       // console.log('data emitida desde servicio:', citas);
        this.citasSubject.next(citas as Cita[]);
      },
      error: (err) => {
        console.error('❌ Error al cargar datos del dashboard:', err);
      }
    });
  }

  limpiarDatos(): void {
    console.log('🧹 Limpiando datos del dashboard...');
    localStorage.removeItem(this.STORAGE_KEY);
    this.citasSubject.next([] as Cita[]);
  }
}


interface CitasFull {
  citas: string; // String en Base64 que contiene el archivo excel
}