import * as LZString from 'lz-string';
import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { PeriodoFechasService } from '../shared/periodo-fechas.service';
import { ExcelService } from './excel.service';
import { Inventario, InventarioRow } from '../models/Inventario';
import { Existencias, StorageVariables } from '../shared/storage-variables';
import { CPMSFull, InventarioFull } from '../models/ElementosBase64';
import { ClaveGrupo, CPMS } from '../models/CPMS';
import { StorageSolicitudService } from './storage-solicitud.service';
import { TemporalExistenciaRow } from '../models/temporal-existencia-row.model';

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

  private claveGruposSubject = new BehaviorSubject<ClaveGrupo[]>([]);
  public claveGrupos$: Observable<ClaveGrupo[]> = this.claveGruposSubject.asObservable();

  // TODO: Desacoplar esto de Dashboard para meterlo en CPMService
  private cpmsCluesActualSubject = new BehaviorSubject<CPMS[]>([]);
  public cpmsCluesActual$: Observable<CPMS[]> = this.cpmsCluesActualSubject.asObservable();

  // crear un booleano para avisar que se está cargando el CPMS
  private cargandoCPMSBehaviorSubject = new BehaviorSubject<boolean>(false);
  public cargandoCPMS$ = this.cargandoCPMSBehaviorSubject.asObservable();

  // crear un booleano para avisar que se está refrescando inventario y/o existencias
  private cargandoInventarioBehaviorSubject = new BehaviorSubject<boolean>(false);
  public cargandoInventario$ = this.cargandoInventarioBehaviorSubject.asObservable();

  // crear un Map de BehaviorSubject<Inventario[]> para cada uno de estos elementos: 
  //  HGENS, HGMXL, HGTKT, HGTIJ, HMITIJ, HGPR, HMIMXL, UOMXL, HGTZE
  private existenciasSubject: Map<Existencias, BehaviorSubject<Inventario[]>> = new Map<Existencias, BehaviorSubject<Inventario[]>>();
  public existencias$: Map<Existencias, Observable<Inventario[]>> = new Map<Existencias, Observable<Inventario[]>>();


  constructor(private http: HttpClient) {
    // Inicializar mapa de existencias
    for (const existencia of Object.values(Existencias)) {
      this.existenciasSubject.set(existencia, new BehaviorSubject<Inventario[]>([]));
      this.existencias$.set(existencia, this.existenciasSubject.get(existencia)!.asObservable());
    }
  }

  /**
   * Metodo para refrescar los datos de CPMS (mediante power automate)
   * En vias de deprecacion para usar backend.
   */
  refrescarDatosCPMS() {
    //    console.info('🔄 InventarioService.refrescarDatosCPMS() - Actualizando CPMS...');
    this.cargandoCPMSBehaviorSubject.next(true);
    // purgar todo el localStorage
    this.limpiarCPMS();
    const url = environment.apiUrl + '/cpms';
    this.http.get<CPMSFull>(url).subscribe({
      next: (response: CPMSFull) => {
        const arrayBuffer = this.excelService.base64ToArrayBuffer(response.cpms);
        let cpms: CPMS[] = [];
        let claveGrupos: ClaveGrupo[] = [];
        [cpms, claveGrupos] = this.excelService.procesarArchivoCPMS(arrayBuffer);

        // console.info('✅ InventarioService.refrescarDatosCPMS() - CPMS tamanio original', cpms.length);
        // 0-1) Procesar los cpms para que excluya claves que tienen cantidad cero en todas las unidades 
        if (cpms && cpms.length > 0) {
          let resumenEstatal = this.agregarResumenEstatal(cpms);
          // crear un arreglo de claves en resumenEstatal que tienen CPM total > 0
          const clavesConCpmTotal = resumenEstatal.filter(item => item.cantidad > 0).map(item => item.clave);
          //          console.info('🧹 Filtrando CPMS...');
          // filtrar this.existenciasTabInfo.cpms para mantener solo las claves que tienen CPM total > 0
          let cpmsFiltrados: CPMS[] = [];
          for (let i = 0; i < clavesConCpmTotal.length; i++) {
            const clave = clavesConCpmTotal[i];
            const cpm = cpms.filter(item => item.clave === clave && item.cantidad > 0);
            if (cpm) {
              cpmsFiltrados = [...cpmsFiltrados, ...cpm];
            }
          }
          // filtrar en claveGrupos para que muestre lo que hay tambien en cpmsFiltrados
          claveGrupos = claveGrupos.filter(item => clavesConCpmTotal.includes(item.clave));


          //          console.log('cpmsFiltrados tamanio', cpmsFiltrados.filter(item => item.cantidad > 0).map(item => item.clave).length);
          // agregando resumen estatal por si se ofrece
          resumenEstatal = resumenEstatal.filter(item => clavesConCpmTotal.includes(item.clave));
          // console.log('resumenEstatal tamanio', resumenEstatal.filter(item => item.cantidad > 0).map(item => item.clave).length);

          cpms = [];

          cpms = [...resumenEstatal, ...cpmsFiltrados];
          // console.log('cpms tamanio', cpms.map(item => item.clave).length);

          // 1) Serializar y comprimir
          const raw = JSON.stringify(cpms);
          // console.log('InventarioService.refrescarDatosCPMS() - raw un pedazo', raw.substring(0, 10));
          const compressed = LZString.compress(raw);
          try {
            // console.log('InventarioService.refrescarDatosCPMS() - comprimiendo');
            localStorage.setItem(StorageVariables.SOLICITUD_CPMS, compressed);
            localStorage.setItem(StorageVariables.SOLICITUD_CLAVEGRUPOS, JSON.stringify(claveGrupos));
          } catch {
            console.warn('😱 InventarioService.refrescarDatosCPMS() - localStorage lleno, omitiendo guardado');
          }

        }
        // 2) Emitir        
        this.cpmsSubject.next(cpms as CPMS[]);
        this.claveGruposSubject.next(claveGrupos as ClaveGrupo[]);
        this.cargandoCPMSBehaviorSubject.next(false);
        //        console.info('✅ InventarioService.refrescarDatosCPMS() - FINALIZADO');
      },
      error: (err) => {
        this.cargandoCPMSBehaviorSubject.next(false);
        console.error('❌ InventarioService.refrescarDatosCPMS() - Error al cargar CPMS:', err);
      }
    });
  }

  private agregarResumenEstatal(cpmsList: CPMS[]): CPMS[] {
    const resumenPorClave = new Map<string, number>();

    cpmsList.forEach(item => {
      const clave = item.clave;
      const cantidadActual = resumenPorClave.get(clave) || 0;
      resumenPorClave.set(clave, cantidadActual + item.cantidad);
    });

    const registrosEstatales: CPMS[] = Array.from(resumenPorClave.entries()).map(([clave, cantidad]) => ({
      cluesimb: 'ESTATAL',
      clave: clave,
      cantidad: cantidad
      // otros campos opcionales: nombre: '', fecha: null, etc.
    }));

    return registrosEstatales;
  }

  emitirCPMS(cpms: CPMS[]) {
    this.cpmsSubject.next(cpms);
  }

  emitirCPMSCluesActual(cpms: CPMS[]) {
    this.cpmsCluesActualSubject.next(cpms);
  }

  emitirInventario(inventario: Inventario[]) {
    // console.info('📦 InventarioService.emitirInventario()', inventario);
    this.inventarioSubject.next(inventario);
  }

  limpiarCPMS() {
    //    console.info('🧹 Limpiando CPMS...');
    localStorage.removeItem(StorageVariables.SOLICITUD_CPMS);
    this.cpmsSubject.next([]);
  }

  cargarCPMSdesdeLocalStorage() {
    this.cpmsSubject.next(new StorageSolicitudService().getCPMSFromLocalStorage());
  }

  /**
   * Metodo para refrescar los datos de inventario (mediante power automate)
   * En vias de deprecacion para usar backend.
   * Obtiene existencias de los 3 almacenes AZM, AZT y AZE
   */
  refrescarDatosInventario(): void {
    //    console.info('🔄 InventarioService.refrescarDatosInventario() - Actualizando datos de inventario temporal...');
    this.cargandoInventarioBehaviorSubject.next(true);
    // purgar todo el localStorage
    this.limpiarInventario();
    const url = this.apiUrl;
    this.http.get<InventarioFull>(url).subscribe({
      next: (response: InventarioFull) => {

        const inventario = this.obtenerInventarioDeBase64(response.inventario);
        const inventarioNormalizado = this.normalizarClavesInventario(inventario);

        // 1) Serializar y comprimir
        const raw = JSON.stringify(inventarioNormalizado);
        const compressed = LZString.compress(raw);
        try {
          localStorage.setItem(StorageVariables.SOLICITUD_INVENTARIO, compressed);
        } catch {
          console.warn('😱 InventarioService.refrescarDatosInventario() - localStorage lleno, omitiendo guardado');
        }
        // 2) Emitir
        //        console.info('✅ InventarioService.refrescarDatosInventario() - Datos del inventario temporal actualizados.');
        this.inventarioSubject.next(inventarioNormalizado as Inventario[]);
        this.cargandoInventarioBehaviorSubject.next(false);
        //        console.info('✅ InventarioService.refrescarDatosInventario() - FINALIZADO');
      },
      error: (err) => {
        console.error('❌ InventarioService.refrescarDatosInventario() - Error al cargar datos:', err);
        this.cargandoInventarioBehaviorSubject.next(false);
      }
    });
  }

  /*
  HGENS 
  HGMXL
  HGTKT
  HGTIJ
  HMITIJ 
  HGPR 
  HMIMXL
  UOMXL 
  HGTZE
   */
  refrescarDatosExistenciasDeLocalStorage(existencia: Existencias = Existencias.HGENS): void {
    const comprimido = localStorage.getItem(existencia);
    if (!comprimido) {
      console.warn('😱 InventarioService.refrescarDatosExistencias() - No se encontraron datos de ' + existencia + ' en localStorage.')
      return;
    }
    const raw = LZString.decompress(comprimido);
    const inventario = raw ? JSON.parse(raw) : [];
    this.existenciasSubject.get(existencia)!.next(inventario as Inventario[]);
  }

  /**
   * Refresca datos de existencias de una unidad (aplica solo segundo nivel)
   * @param existencia 
   */
  refrescarDatosExistencias(existencia: Existencias = Existencias.HGENS): void {
    // console.info('🔄 InventarioService.refrescarDatosExistencias() - Actualizando existencias de ' + existencia + '...');
    // purgar todo el localStorage
    this.limpiarExistencias(existencia);
    // TODO: temporalmente usar cluesimb fija BCIMB000623 de san felipe para pruebas
    const url = existencia === Existencias.HGSF ?
      environment.apiUrl + '/existencias-temp/by-unidad-full?cluesimb=BCIMB000623'
      :
      this.apiUrl + '/' + existencia;

    if (existencia !== Existencias.HGSF) {
      this.http.get<InventarioFull>(url).subscribe({
        next: (response: InventarioFull) => {

          const inventario = this.obtenerInventarioDeBase64(response.inventario);
          const inventarioNormalizado = this.normalizarClavesInventario(inventario);
          this.serializarYComprimir(inventarioNormalizado, existencia);
        },
        error: (err) => {
          console.error('❌ InventarioService.refrescarDatosExistencias() ' + existencia + ' - Error al cargar datos:', err);
          this.existenciasSubject.get(existencia)!.next([]);
          // this.cargandoInventarioBehaviorSubject.next(false);
        }
      });
    } else {
      // caso especial de San Felipe, que usa otro endpoint y otro modelo
      this.http.get<{ rows: TemporalExistenciaRow[]}>(url).subscribe({
        next: (res) => {
          const response = res.rows;
          if (!response || response.length === 0) {
            this.existenciasSubject.get(existencia)!.next([]);
            return;
          }
          const inventario: Inventario[] = response.map(item => {
            const nuevoRegistro: Inventario = new Inventario();
            nuevoRegistro.clave = item.clave_cnis;
            nuevoRegistro.partida = ''; // item.lote || '';
            nuevoRegistro.descripcion = '';
            nuevoRegistro.disponible = item.existencia;
            nuevoRegistro.almacen = 'HOSPITAL COMUNITARIO SAN FELIPE';
            nuevoRegistro.fuente = '';
            nuevoRegistro.comprometidos = 0;
            nuevoRegistro.lote = item.lote || '';
            nuevoRegistro.caducidad = item.fecha_caducidad as string;
            nuevoRegistro.fecha_entrada = null;
            nuevoRegistro.disponible = item.existencia;
            return nuevoRegistro;
          });
          const inventarioNormalizado = this.normalizarClavesInventario(inventario);

          // console.log('🔁 InventarioService.refrescarDatosExistencias() HGSF - Serializando y comprimiendo ' + inventarioNormalizado.length + ' registros.' );
          // 1) Serializar y comprimir
          this.serializarYComprimir(inventarioNormalizado, existencia);
        },
        error: (err) => {
          console.error('❌ InventarioService.refrescarDatosExistencias() ' + existencia + ' - Error al cargar datos:', err);
          this.existenciasSubject.get(existencia)!.next([]);
        }
      });
    }
  }


  /*************  ✨ Windsurf Command ⭐  *************/
  /**
   * Serializa y comprime el inventario normalizado para guardarlo en localStorage.
   * En caso de que localStorage esté lleno, se omite la guardado.
   * Se emite el inventario normalizado como observador.
   * @param inventarioNormalizado Inventario normalizado a serializar
   * @param existencia Existencias a la que se refiere el inventario
   */
  /*******  62ae1001-464f-463f-be07-273cb8c330fa  *******/
  private serializarYComprimir(inventarioNormalizado: Inventario[], existencia: Existencias) {
    const raw = JSON.stringify(inventarioNormalizado);
    const compressed = LZString.compress(raw);
    try {
      localStorage.setItem(existencia, compressed);
    } catch {
      console.warn('😱 InventarioService.refrescarDatosInventario() - localStorage lleno, omitiendo guardado');
    }
    // 2) Emitir
    //console.info('✅ InventarioService.refrescarDatosInventario() - Datos del inventario temporal actualizados.');
    this.existenciasSubject.get(existencia)!.next(inventarioNormalizado as Inventario[]);
    // this.cargandoInventarioBehaviorSubject.next(false);
    //console.info('✅ InventarioService.refrescarDatosExistencias() - ' + existencia + ' FINALIZADO');
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
      console.error('❌ InventarioService.obtenerInventarioDeBase64() - Error al obtener de power automate:', err);
      console.error('🔁 InventarioService.obtenerInventarioDeBase64() - Error procesando fila:', fila);
    }

    return inventarioRetorno;
  }

  private limpiarInventario() {
    // console.info('🧹 Limpiando inventario...');
    localStorage.removeItem(StorageVariables.SOLICITUD_INVENTARIO);
    this.inventarioSubject.next([]);
  }

  private limpiarExistencias(existencia: Existencias) {
    localStorage.removeItem(existencia);
  }

  private normalizarClavesInventario(inventario: Inventario[]): Inventario[] {
    const prefijos10 = ['060', '533', '535', '513', '537', '080', '070'];
    return inventario.map(item => {
      const claveSinPuntos = item.clave.replace(/\./g, '');
      if (claveSinPuntos.length === 12 &&
        prefijos10.includes(claveSinPuntos.substring(0, 3)) &&
        claveSinPuntos.endsWith('00')) {
        // Convertir 12 dígitos a 10, manteniendo formato con puntos
        const clave10 = claveSinPuntos.substring(0, 10);
        item.clave = `${clave10.substring(0, 3)}.${clave10.substring(3, 6)}.${clave10.substring(6, 10)}`;
      }
      return item;
    });
  }

  public normalizarClave(clave: string): string {
    const prefijos10 = ['060', '533', '535', '513', '537', '080', '070'];
    let normalizado = clave;

    const claveSinPuntos = clave.replace(/\./g, '');
    if (claveSinPuntos.length === 12 &&
      prefijos10.includes(claveSinPuntos.substring(0, 3)) &&
      claveSinPuntos.endsWith('00')) {
      // Convertir 12 dígitos a 10, manteniendo formato con puntos
      const clave10 = claveSinPuntos.substring(0, 10);
      normalizado = `${clave10.substring(0, 3)}.${clave10.substring(3, 6)}.${clave10.substring(6, 10)}`;
    }
    return normalizado;
  }

}
