import * as LZString from 'lz-string';
import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { PeriodoFechasService } from '../shared/periodo-fechas.service';
import { ExcelService } from './excel.service';
import { Inventario, InventarioRow } from '../models/Inventario';
import { StorageVariables } from '../shared/storage-variables';
import { InventarioFull } from '../models/ElementosBase64';

@Injectable({
  providedIn: 'root'
})
export class InventarioService {
  private apiUrl = environment.apiUrl + '/inventario'; // Ajusta si necesitas proxy
  private inventarioSubject = new BehaviorSubject<Inventario[]>([]);
  public inventario$: Observable<Inventario[]> = this.inventarioSubject.asObservable();
  private fechaService = inject(PeriodoFechasService);
  private excelService = inject(ExcelService);

  constructor(private http: HttpClient) { }

  refrescarDatosInventario(): void {
      // purgar todo el localStorage
      this.limpiarInventario();
  
     // console.info('🔄 Actualizando datos de inventario temporal...');
      const url = this.apiUrl;
      this.http.get<InventarioFull>(url).subscribe({
        next: (response: InventarioFull) => {
  
          const inventario = this.obtenerInventarioDeBase64(response.inventario);
  
          // 1) Serializar y comprimir
          const raw = JSON.stringify(inventario);
          const compressed = LZString.compress(raw);
          try {
            localStorage.setItem(StorageVariables.SOLICITUD_INVENTARIO, compressed);
          } catch {
            console.warn('😱 localStorage lleno, omitiendo guardado');
          }
          // 2) Emitir
         // console.info('✅ Datos del inventario temporal actualizados.');
          this.inventarioSubject.next(inventario as Inventario[]);
        },
        error: (err) => {
          console.error('❌ Error al cargar datos:', err);
        }
      });
    }

  private obtenerInventarioDeBase64(base64: string): Inventario[] {

    //console.info('🔁 Obteniendo info con Power Automate');
    let inventarioRetorno: Inventario[] = [];
    let fila: any = null;
    try {

      // 1. Convertir Base64 a ArrayBuffer
      const arrayBuffer = this.excelService.base64ToArrayBuffer(base64);

      const rows: InventarioRow[] = this.excelService.obtenerInventarioDeExcel(arrayBuffer);
      //console.info('🔁 Procesando', rows.length, 'filas.');

      let headerLeido = false;
      for (const popo of rows) {
        fila = popo;
        if (!headerLeido) {
          headerLeido = true;
          continue;
        }
        const clave = fila[0];
        if (!clave || (clave + '').trim().length === 0) {
          console.info('🔁 fin de archivo detectado. Finalizando obtención de datos', fila);
          break;
        }
        const partida = fila[1];
        const descrip = fila[2];
        const disponible = fila[3];
        const almacen = fila[4];
        // const usuario = fila[5]; // no se usa
        const comprometidos = fila[6];
        const lote = fila[7];
        const caducidad = fila[8] === null ? null :
          (fila[8] instanceof Date ? fila[8] :
            (!(fila[8] + '').includes('/') ?
              this.fechaService.excelDateToDatestring(fila[8] + '') :
              (this.fechaService.formatFechaMultiple(fila[8] as string | null))
            ))
          ;
        const fuente = fila[9];
        const fechaEntrada = fila[10] === null ? null :
          (fila[10] instanceof Date ? fila[10] :
            (!(fila[10] + '').includes('/') ?
              this.fechaService.excelDateToDatestring(fila[10] + '') :
              (this.fechaService.formatFechaMultiple(fila[10] as string | null))
            ))
          ;

        const nuevoRegistro: Inventario = new Inventario();
        nuevoRegistro.clave = clave;
        nuevoRegistro.partida = partida;
        nuevoRegistro.descripcion = descrip;
        nuevoRegistro.disponible = disponible;
        nuevoRegistro.almacen = almacen;
        nuevoRegistro.comprometidos = comprometidos;
        nuevoRegistro.lote = lote;
        nuevoRegistro.caducidad = caducidad;
        nuevoRegistro.fuente = (fuente + '').trim().toLocaleUpperCase();
        nuevoRegistro.fecha_entrada = fechaEntrada;
        inventarioRetorno.push(nuevoRegistro);
      }
    //  console.info(`✅ Inventario cargado desde Power Automate. Total: ${inventarioRetorno.length} registros.`);

    } catch (err: any) {
      console.error('❌ Error al obtener de power automate:', err);
      console.error('🔁 Procesando fila:', fila);
    }

    // Guardar en localstorage[StorageVariables.SOLICITUD_INVENTARIO]
    try {
      localStorage.setItem(StorageVariables.SOLICITUD_INVENTARIO, JSON.stringify(inventarioRetorno));
    } catch {
      console.warn('😱 localStorage lleno, omitiendo guardado');
    }

    return inventarioRetorno;
  }

  private limpiarInventario() {
    localStorage.removeItem(StorageVariables.SOLICITUD_INVENTARIO);
    this.inventarioSubject.next([]);
  }
}
