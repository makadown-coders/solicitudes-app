// src/app/services/inventario.service.ts
import * as LZString from 'lz-string';
import { inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  BehaviorSubject,
  catchError,
  defer,
  finalize,
  map,
  Observable,
  shareReplay,
  tap,
  of
} from 'rxjs';
import { environment } from '../../environments/environment';
import { PeriodoFechasService } from '../shared/periodo-fechas.service';
import { ExcelService } from './excel.service';
import { Inventario, InventarioRow } from '../models/Inventario';
import { Existencias, StorageVariables } from '../shared/storage-variables';
import { CPMSFull, InventarioFull } from '../models/ElementosBase64';
import { ClaveGrupo, CPMS } from '../models/CPMS';
import { StorageSolicitudService } from './storage-solicitud.service';
import { TemporalExistenciaRow } from '../models/temporal-existencia-row.model';
import { CitaSlimByClaveLote, CitaSlimExistencia } from '../models/cita-slim-inventario.model';
import { UnidadesService } from './unidades.service';
import { hospitalesData, UnidadExistente } from '../models';

// helper compartido
function cleanLote(l?: string | null) {
  if (!l) return '';
  return l.replace(/[\/'']/g, '').slice(0, 20).trim();
}

@Injectable({
  providedIn: 'root'
})
export class InventarioService {
  private apiUrl = environment.apiUrl + '/inventario'; // Ajusta si necesitas proxy
  private inventarioSubject = new BehaviorSubject<Inventario[]>([]);
  public inventario$: Observable<Inventario[]> = this.inventarioSubject.asObservable();
  private fechaService = inject(PeriodoFechasService);
  private excelService = inject(ExcelService);
  private unidadesService = inject(UnidadesService);
  // ========================= CPMS Legacy, en vías de deprecación =========================
  // private cpmsSubject = new BehaviorSubject<CPMS[]>([]);
  // public cpms$: Observable<CPMS[]> = this.cpmsSubject.asObservable();

  private claveGruposSubject = new BehaviorSubject<ClaveGrupo[]>([]);
  public claveGrupos$: Observable<ClaveGrupo[]> = this.claveGruposSubject.asObservable();

  // TODO: Desacoplar esto de Dashboard para meterlo en CPMService
  // private cpmsCluesActualSubject = new BehaviorSubject<CPMS[]>([]);
  // public cpmsCluesActual$: Observable<CPMS[]> = this.cpmsCluesActualSubject.asObservable();

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

  private existenciasByCluesimb = new Map<string, Observable<Inventario[]>>();

  private _citasByClaveLote = signal<Map<string, CitaSlimByClaveLote[]>>(new Map());
  citasByClaveLote = this._citasByClaveLote.asReadonly();

  private slimInFlight$?: Observable<Map<string, CitaSlimByClaveLote[]>>;
  private slimLoadedAt = 0;
  private readonly SLIM_TTL_MS = 30 * 60 * 1000; // 30 min (ajústalo)
  private readonly TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

  constructor(private http: HttpClient) {
    // Inicializar mapa de existencias
    for (const existencia of Object.values(Existencias)) {
      this.existenciasSubject.set(existencia, new BehaviorSubject<Inventario[]>([]));
      this.existencias$.set(existencia, this.existenciasSubject.get(existencia)!.asObservable());
    }
  }

  private isExpired(tsStr: string | null): boolean {
    if (!tsStr) return true;
    const ts = Date.parse(tsStr);
    if (Number.isNaN(ts)) return true;
    return (Date.now() - ts) > this.TTL_MS;
  }

  /**
   * Refresca existencias de ALMACENES desde Postgres (tmp_existencias + v_unidad_medica_detalle)
   * y lo guarda en localStorage (SOLICITUD_INVENTARIO) + emite por inventario$.
   */
  refrescarExistenciaAlmacenesDesdePostgres(skipLoader = true): void {
    this.cargandoInventarioBehaviorSubject.next(true);

    const url = environment.apiUrl + '/existencias-temp/almacenes-full';

    this.http.get<{ ok: boolean; rows: TemporalExistenciaRow[] }>(
      url,
      skipLoader ? { headers: { 'X-Skip-Loader': '1' } } : {}
    ).subscribe({
      next: res => {
        const rows = res.rows ?? [];

        // Mapeo TemporalExistenciaRow -> Inventario
        const inventario: Inventario[] = rows.map(r => {
          const i = new Inventario();
          i.clave = r.clave_cnis;
          i.partida = ''; // no viene, lo podemos enriquecer luego si hace falta
          i.descripcion = ''; // se puede enriquecer con ArticulosService después
          i.disponible = r.existencia;
          i.almacen = (r.alias_sas ?? '').toUpperCase(); // o r.alias_sas / r.cluessa / lo que prefieras
          i.comprometidos = 0;
          i.lote = r.lote || '';
          i.caducidad = r.fecha_caducidad as any;
          i.fuente = ''; //(r.fuente ?? '').toUpperCase();
          i.fecha_entrada = null;
          return i;
        });

        const inventarioNormalizado = this.normalizarClavesInventario(inventario);

        // Serializar + comprimir
        const raw = JSON.stringify(inventarioNormalizado);
        const compressed = LZString.compress(raw);
        try {
          localStorage.setItem(StorageVariables.SOLICITUD_INVENTARIO, compressed);
          localStorage.setItem(StorageVariables.SOLICITUD_INVENTARIO_TS, new Date().toISOString());
        } catch {
          console.warn('😱 InventarioService.refrescarDatosInventarioDesdePostgres() - localStorage lleno, omitiendo guardado');
        }

        this.inventarioSubject.next(inventarioNormalizado as Inventario[]);
        this.cargandoInventarioBehaviorSubject.next(false);
      },
      error: err => {
        console.error('❌ InventarioService.refrescarDatosInventarioDesdePostgres() - Error al cargar datos:', err);
        this.inventarioSubject.next([]);
        this.cargandoInventarioBehaviorSubject.next(false);
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

  emitirInventario(inventario: Inventario[]) {
    // console.info('📦 InventarioService.emitirInventario()', inventario);
    this.inventarioSubject.next(inventario);
  }

  limpiarCPMS() {
    localStorage.removeItem(StorageVariables.SOLICITUD_CPMS);
    localStorage.removeItem(StorageVariables.SOLICITUD_CLAVEGRUPOS);
    localStorage.removeItem(StorageVariables.SOLICITUD_CPMS_TS); // ⬅ limpiar timestamp
    // this.cpmsSubject.next([]);
  }

  /**
   * Metodo para refrescar los datos de inventario (mediante power automate)
   * En vias de deprecacion para usar backend.
   * Obtiene existencias de los 3 almacenes AZM, AZT y AZE
   */
  refrescarDatosInventario(skipLoader = true): void {
    //    console.info('🔄 InventarioService.refrescarDatosInventario() - Actualizando datos de inventario temporal...');
    this.cargandoInventarioBehaviorSubject.next(true);
    this.limpiarInventario();
    const url = this.apiUrl;
    this.http.get<InventarioFull>(url, skipLoader ? {
      headers: { 'X-Skip-Loader': '1' }
    } : {}).subscribe({
      next: (response: InventarioFull) => {
        // console.log('🔄 InventarioService.refrescarDatosInventario() - response recibido');
        const inventario = this.obtenerInventarioDeBase64(response.inventario);
        const inventarioNormalizado = this.normalizarClavesInventario(inventario);

        // Mantener el inventario de almacenes solo en memoria. Si el usuario hace F5,
        // la app volvera a solicitar /api/inventario.
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
   * LEGACY: en vías de deprecación para usar un endpoint específico por unidad que ya regresa datos normalizados (sin necesidad de pasar por Power Automate ni normalizaciones extra).
   * Nueva versión: refrescarDatosExistencias(), que ya no usa Power Automate ni ExcelService, sino que pega directo a un endpoint que regresa datos normalizados.
   * 
   * En caso de emergencia, regresar a usar esta version. Ya que la nueva versión trae datos de 
   * existencias de farmacias de los hospitales
   * 
   * @param existencia 
   */
  refrescarDatosExistenciasLegacy(existencia: Existencias = Existencias.HGENS): void {
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
      this.http.get<{ rows: TemporalExistenciaRow[] }>(url).subscribe({
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

  
/**
 * Refresca datos de existencias de una unidad.
 * Nueva versión sin power automate.
 * @param existencia Clave de la existencia a refrescar.
 */
  refrescarDatosExistencias(existencia: Existencias = Existencias.HGENS): void {
    // purgar todo el localStorage
    this.limpiarExistencias(existencia);

    const url = this.generarURLParaExistencia(existencia);

    // caso especial de San Felipe, que usa otro endpoint y otro modelo
    this.http.get<{ rows: TemporalExistenciaRow[] }>(url).subscribe({
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
          nuevoRegistro.almacen = (existencia === Existencias.HGSF) ? 
                                    'HOSPITAL COMUNITARIO SAN FELIPE' : item.alias_sas!;
          nuevoRegistro.fuente = '';
          nuevoRegistro.comprometidos = 0;
          nuevoRegistro.lote = item.lote || '';
          nuevoRegistro.caducidad = item.fecha_caducidad as string;
          nuevoRegistro.fecha_entrada = null;
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

  private generarURLParaExistencia(existencia: Existencias = Existencias.HGENS): string {
    let urlRetorno = '';
    hospitalesData.forEach((hospital: UnidadExistente) => {
      if (hospital.key === existencia) {
        urlRetorno = environment.apiUrl + '/existencias-temp/by-unidad-full?cluesimb=' + hospital.cluesimb;
      }
    });
    return urlRetorno;
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
      // ⬇⏱ timestamp específico de esta existencia
      localStorage.setItem(`TS_${existencia}`, new Date().toISOString());
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
    localStorage.removeItem(StorageVariables.SOLICITUD_INVENTARIO_TS); // ⬅ limpiar timestamp
    this.inventarioSubject.next([]);
  }

  private limpiarExistencias(existencia: Existencias) {
    localStorage.removeItem(existencia);
    localStorage.removeItem(`TS_${existencia}`); // ⬅ limpiar timestamp
  }

  private normalizarClavesInventario(inventario: Inventario[]): Inventario[] {
    return inventario.map(item => {
      item.clave = this.normalizarClave(item.clave);
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

  loadCitasSlimIfNeeded() {
    this.ensureCitasSlim$().subscribe();
  }

  private isSlimFresh(): boolean {
    return (Date.now() - this.slimLoadedAt) < this.SLIM_TTL_MS;
  }

  ensureCitasSlim$(): Observable<Map<string, CitaSlimByClaveLote[]>> {
    // 1) si el cache está fresco, regresa inmediato (sin pegarle al backend)
    const current = this._citasByClaveLote();
    if (current.size > 0 && this.isSlimFresh()) return of(current);

    // 2) si ya hay una petición en vuelo, reusa la misma
    if (this.slimInFlight$) return this.slimInFlight$;

    // 3) si no hay, crea UNA y compártela
    const url = environment.apiUrl + '/citas/slim-existencia';

    // console.log('🚀 Cargando slim existencias desde backend...');
    this.slimInFlight$ = defer(() =>
      this.http.get<{ ok: boolean; rows: CitaSlimExistencia[] }>(url)
    ).pipe(
      map((res: any) => {
        // console.log('✅ Slim respuesta:', res.data);
        return this.buildSlimMap(res.data.rows ?? []);
      }),
      tap(mp => {
        this._citasByClaveLote.set(mp);
        this.slimLoadedAt = Date.now();
      }),
      // si falla, no revientes: deja cache como esté y suelta inFlight
      catchError(err => {
        console.error('Error cargando slim inventario:', err);
        return of(this._citasByClaveLote());
      }),
      finalize(() => {
        this.slimInFlight$ = undefined;
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );

    return this.slimInFlight$;
  }

  /**
   * Convierte una lista de CitaSlimExistencia en un Map de clave-lote a CitaSlimByClaveLote[].
   *
   * La clave del Map es una concatenación de la clave de la cita y el lote, separados por '__'.
   * El valor asociado a cada clave es un array de CitaSlimByClaveLote.
   * Cada CitaSlimByClaveLote tiene los campos precio, orden, fte y proveedor de la cita original.
   *
   * @param rows La lista de CitaSlimExistencia a convertir
   * @returns El Map de clave-lote a CitaSlimByClaveLote[]
   */
  private buildSlimMap(rows: CitaSlimExistencia[]): Map<string, CitaSlimByClaveLote[]> {
    const mp = new Map<string, CitaSlimByClaveLote[]>();
    // console.log('🔍 buildSlimMap - procesando', rows.length, 'registros de citas slim');

    for (const r of rows ?? []) {
      const clave = this.normalizarClave(r.clave_cnis);
      const lote = cleanLote(r.lote);
      if (!clave || !lote) continue;

      const key = `${clave}__${lote}`;
      const item: CitaSlimByClaveLote = {
        precio: r.precio_unitario,
        orden: r.orden_de_suministro,
        fte: r.fte_fmto,
        proveedor: r.proveedor,
      };

      const arr = mp.get(key);
      if (arr) arr.push(item);
      else mp.set(key, [item]);
    }

    return mp;
  }

  /** Fuerza recargar desde el backend (para el botón Actualizar) */
  refreshCitasSlim() {
    this.slimLoadedAt = 0;
    this._citasByClaveLote.set(new Map());
    this.ensureCitasSlim$().subscribe();
  }

  initExistenciaAlmacenes(): void {
    const inventarioEnMemoria = this.inventarioSubject.getValue();
    if (inventarioEnMemoria.length > 0) return;

    this.refrescarDatosInventario();
  }

  /**
 * Inicializa existencias de UNA unidad:
 * - Emite lo que haya en localStorage (si existe)
 * - Si no hay datos o están vencidos → llama a refrescarDatosExistencias(existencia)
 */
  initExistencia(existencia: Existencias): void {
    const comprimido = localStorage.getItem(existencia);
    let inventario: Inventario[] = [];

    if (comprimido) {
      const raw = LZString.decompress(comprimido);
      inventario = raw ? JSON.parse(raw) : [];
    }

    this.existenciasSubject.get(existencia)!.next(inventario);

    const tsStr = localStorage.getItem(`TS_${existencia}`);
    const expired = this.isExpired(tsStr);
    const noData = !inventario || inventario.length === 0;

    if (noData || expired) {
      this.refrescarDatosExistencias(existencia);
    }
  }

  /** Inicializa TODAS las existencias (se usa en DashboardAbasto) */
  initTodasExistencias(): void {
    for (const existencia of Object.values(Existencias)) {
      this.initExistencia(existencia as Existencias);
    }
  }

  public getExistenciasByCluesimb(cluesimb: string, opts?: { force?: boolean }): Observable<Inventario[]> {
    const key = (cluesimb || '').trim().toUpperCase();
    if (!key) return of([]);

    if (!opts?.force) {
      const cached$ = this.existenciasByCluesimb.get(key);
      if (cached$) return cached$;
    } else {
      this.existenciasByCluesimb.delete(key);
    }

    const url = environment.apiUrl + `/existencias-temp/by-unidad-full?cluesimb=${encodeURIComponent(key)}`;

    const req$ = this.http.get<{ rows: TemporalExistenciaRow[] }>(url, { headers: { 'X-Skip-Loader': '1' } }).pipe(
      map((response) => {
        // jalar nombre de unidad a partir de cluesimb
        const nombreUnidad = this.getNombreUnidadFromCluesimb(key);
        // crear variable inv y pasarle los valores correspondientes de TemporalExistenciaRow[].
        // NO SE USA EXCEL NI DECODIFICAR 64 !!!!
        const inv = response.rows.map(item => {
          const nuevoRegistro: Inventario = new Inventario();
          nuevoRegistro.clave = item.clave_cnis;
          nuevoRegistro.partida = ''; // item.lote || '';
          nuevoRegistro.descripcion = '';
          nuevoRegistro.disponible = item.existencia;
          nuevoRegistro.almacen = nombreUnidad || '';
          nuevoRegistro.fuente = '';
          nuevoRegistro.comprometidos = 0;
          nuevoRegistro.lote = item.lote || '';
          nuevoRegistro.caducidad = item.fecha_caducidad as string;
          nuevoRegistro.fecha_entrada = null;
          return nuevoRegistro;
        });
        const invNorm = this.normalizarClavesInventario(inv);
        return invNorm;
      }),
      catchError((err) => {
        console.error('❌ getExistenciasByCluesimb', key, err);
        return of([]);
      }),
      shareReplay(1)
    );

    this.existenciasByCluesimb.set(key, req$);
    return req$;
  }

  private getNombreUnidadFromCluesimb(cluesimb: string): string {
    return this.unidadesService.findByCluesimb(cluesimb)?.nombre || '';
  }

}
