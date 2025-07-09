import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Cita } from '../models/Cita';
import * as LZString from 'lz-string';
import { CitasService } from './citas.service';
import { CitasFull, InventarioFull } from '../models/ElementosBase64';
import { Existencias, StorageVariables } from '../shared/storage-variables';
import { ExistenciasTabInfo } from '../models/existenciasTabInfo';

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private STORAGE_KEY = 'citasFull';
  private citasSubject = new BehaviorSubject<Cita[]>([]);
  public citas$: Observable<Cita[]> = this.citasSubject.asObservable();
  private existenciasTabInfoSubject = new BehaviorSubject<ExistenciasTabInfo>(new ExistenciasTabInfo());
  public existenciasTabInfo$: Observable<ExistenciasTabInfo> = this.existenciasTabInfoSubject.asObservable();
  
  private citasService = inject(CitasService);

  constructor(private http: HttpClient) {
    this.cargarDesdeLocalStorage();
  }

  private cargarDesdeLocalStorage() {
    console.log('cargarDesdeLocalStorage');
    const compressed = localStorage.getItem(this.STORAGE_KEY);
    let existenciasData: ExistenciasTabInfo = new ExistenciasTabInfo();
    existenciasData.citas = [];
    if (compressed) {
      try {
        const raw = LZString.decompress(compressed);
        existenciasData.citas = raw ? JSON.parse(raw) : [];
        this.citasSubject.next(existenciasData.citas as Cita[]);
      } catch {
        localStorage.removeItem(this.STORAGE_KEY);
      }
    }
    // aplicar misma tecnica para cpms
    const compressedCPMS = localStorage.getItem(StorageVariables.SOLICITUD_CPMS);
    if (compressedCPMS) {
      try {
        const raw = LZString.decompress(compressedCPMS);
        existenciasData.cpms = raw ? JSON.parse(raw) : [];
      } catch {
        localStorage.removeItem(StorageVariables.SOLICITUD_CPMS);
      }
    }
    
    // aplicar misma tecnica iterando sobre el enum de hospitales para emitir las existencias de cada uno
    for (const hospital of Object.values(Existencias)) {
      const compressedExistencias = localStorage.getItem(hospital);
      if (compressedExistencias) {
        try {
          const raw = LZString.decompress(compressedExistencias);
          existenciasData.existenciaUnidades.set(hospital,  raw ? JSON.parse(raw) : [] );
        } catch {
          localStorage.removeItem(hospital);
        }
      }
    }
    console.log('dashboard.service > cargarDesdeLocalStorage > emitiendo existenciasData');
    this.existenciasTabInfoSubject.next(existenciasData);
    this.citasSubject.next(existenciasData.citas as Cita[]);
  }

  refrescarDatos(): void {
    // purgar todo el localStorage
    // this.limpiarDatos();

    // console.info('🔄 Actualizando datos del dashboard...');
    const url = `${environment.apiUrl}/citas/full`;
    // console.log('solicitando a ', url);
    this.http.get<CitasFull>(url).subscribe({
      next: (response: CitasFull) => {
        const citas = this.citasService.obtenerCitasDeBase64(response.citas);

        // 1) Serializar y comprimir
        const raw = JSON.stringify(citas);
        const compressed = LZString.compress(raw);
        try {
          localStorage.setItem(this.STORAGE_KEY, compressed);
        } catch {
          console.warn('😱 localStorage lleno, omitiendo guardado');
        }
        // 2) Emitir
        // console.info('✅ Datos del dashboard actualizados.');
        this.citasSubject.next(citas as Cita[]);
      },
      error: (err) => {
        console.error('❌ Error al cargar datos del dashboard:', err);
      }
    });
  }

  limpiarDatos(): void {
    console.info('🧹 Limpiando datos del dashboard...');
    localStorage.removeItem(this.STORAGE_KEY);
    this.citasSubject.next([] as Cita[]);
  }

  refrescarDeLocalStorage(): void {
    this.cargarDesdeLocalStorage();
  }
}


