import * as LZString from 'lz-string';
import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { PeriodoFechasService } from '../shared/periodo-fechas.service';
import { ExcelService } from './excel.service';
import { Inventario, InventarioRow } from '../models/Inventario';
import { StorageVariables } from '../shared/storage-variables';
import { CPMSFull, InventarioFull } from '../models/ElementosBase64';
import { CPMS } from '../models/CPMS';

@Injectable({
  providedIn: 'root'
})
export class InventarioService {
  private apiUrl = environment.apiUrl + '/inventario'; // Ajusta si necesitas proxy
  private inventarioSubject = new BehaviorSubject<Inventario[]>([]);
  public inventario$: Observable<Inventario[]> = this.inventarioSubject.asObservable();
  private fechaService = inject(PeriodoFechasService);
  private excelService = inject(ExcelService);
  private cpmsSubject = new BehaviorSubject<CPMS[]>([]);
  public cpms$: Observable<CPMS[]> = this.cpmsSubject.asObservable();

  private cpmsCluesActualSubject = new BehaviorSubject<CPMS[]>([]);
  public cpmsCluesActual$: Observable<CPMS[]> = this.cpmsCluesActualSubject.asObservable();

  // crear un booleano para avisar que se está cargando el CPMS
  public cargandoCPMSBehaviorSubject = new BehaviorSubject<boolean>(false);
  public cargandoCPMS$ = this.cargandoCPMSBehaviorSubject.asObservable();

  // crear un booleano para avisar que se está refrescando inventario
  public cargandoInventarioBehaviorSubject = new BehaviorSubject<boolean>(false);
  public cargandoInventario$ = this.cargandoInventarioBehaviorSubject.asObservable();

  constructor(private http: HttpClient) { }

  refrescarDatosCPMS() {
    console.info('🔄 InventarioService.refrescarDatosCPMS() - Actualizando CPMS...');
    this.cargandoCPMSBehaviorSubject.next(true);
    // purgar todo el localStorage
    this.limpiarCPMS();    
    const url = environment.apiUrl + '/cpms';
    this.http.get<CPMSFull>(url).subscribe({
      next: (response: CPMSFull) => {
        const arrayBuffer = this.excelService.base64ToArrayBuffer(response.cpms);
        const cpms: CPMS[] = this.excelService.procesarArchivoCPMS(arrayBuffer);        
        
        // 1) Serializar y comprimir
        const raw = JSON.stringify(cpms);
        // console.log('InventarioService.refrescarDatosCPMS() - raw un pedazo', raw.substring(0, 10));
        const compressed = LZString.compress(raw);
        try {
          // console.log('InventarioService.refrescarDatosCPMS() - comprimiendo');
          localStorage.setItem(StorageVariables.SOLICITUD_CPMS, compressed);
        } catch {
          console.warn('😱 InventarioService.refrescarDatosCPMS() - localStorage lleno, omitiendo guardado');
        }
        console.info('✅ InventarioService.refrescarDatosCPMS() - CPMS tamanio', cpms.length);
        // 2) Emitir
        this.cpmsSubject.next(cpms as CPMS[]);
        this.cargandoCPMSBehaviorSubject.next(false);
        console.info('✅ InventarioService.refrescarDatosCPMS() - FINALIZADO');
      },
      error: (err) => {
        this.cargandoCPMSBehaviorSubject.next(false);
        console.error('❌ InventarioService.refrescarDatosCPMS() - Error al cargar CPMS:', err);
      }
    });
  }

  emitirCPMS(cpms: CPMS[]) {
    this.cpmsSubject.next(cpms);
  }

  emitirCPMSCluesActual(cpms: CPMS[]) {
    this.cpmsCluesActualSubject.next(cpms);
  }

  emitirInventario(inventario: Inventario[]) {
    this.inventarioSubject.next(inventario);
  }

  limpiarCPMS() {
    console.info('🧹 Limpiando CPMS...');
    localStorage.removeItem(StorageVariables.SOLICITUD_CPMS);
    this.cpmsSubject.next([]);
  }

  refrescarDatosInventario(): void {
    console.info('🔄 InventarioService.refrescarDatosInventario() - Actualizando datos de inventario temporal...');
    this.cargandoInventarioBehaviorSubject.next(true);
    // purgar todo el localStorage
    this.limpiarInventario();    
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
          console.warn('😱 InventarioService.refrescarDatosInventario() - localStorage lleno, omitiendo guardado');
        }
        // 2) Emitir
        console.info('✅ InventarioService.refrescarDatosInventario() - Datos del inventario temporal actualizados.');
        this.inventarioSubject.next(inventario as Inventario[]);
        this.cargandoInventarioBehaviorSubject.next(false);
        console.info('✅ InventarioService.refrescarDatosInventario() - FINALIZADO');
      },
      error: (err) => {
        console.error('❌ InventarioService.refrescarDatosInventario() - Error al cargar datos:', err);
        this.cargandoInventarioBehaviorSubject.next(false);
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
