import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable, of } from 'rxjs';
import { environment } from '../../environments/environment';
import { Cita } from '../models/Cita';
import { ResumenResponse } from '../models/StatsCitas';
import { CitaQueryResponse } from '../models/CitaQueryResponse';
import { CitasCacheEntry } from '../models/CitasCacheEntry';
import { SearchCitasParams } from '../models/searchCitasParams';
import * as LZString from 'lz-string';

@Injectable({
  providedIn: 'root'
})
export class CitasService {
  private apiUrl = environment.apiUrl + '/citas'; // Ajusta si necesitas proxy
  private mapCluesUnidad: Map<string, string> = new Map<string, string>();

  // ⚙️ Config caché
  private readonly CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas
  private readonly CACHE_LS_KEY = 'CITAS_CACHE_V1';
  private readonly CACHE_LS_PREFIX = 'DASH_ABASTO_CITAS_CACHE';

  // cache en memoria: key -> entry
  private cache = signal<Record<string, CitasCacheEntry>>({});

  constructor(private http: HttpClient) {
  }

  clearCache() {
    // 1) Limpiar cache en memoria (signal)
    this.cache.set({});

    // 2) Limpiar la llave legacy (por si acaso)
    localStorage.removeItem(this.CACHE_LS_KEY);

    // 3) Limpiar TODAS las llaves per-combinación que empiecen con el prefijo
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (key.startsWith(this.CACHE_LS_PREFIX + '::')) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(k => localStorage.removeItem(k));
  }

  // ======================================================
  //   API pública original (stats, etc.)
  // ======================================================

  // Obtener clues de la unidad por unidad
  getCluesUnidad(unidad: string) {
    return this.mapCluesUnidad.get(unidad);
  }

  init(reset = true) {
    return this.http.post<{ ok: true }>(`${this.apiUrl}/init?reset=${reset}`, {}, {
      headers: { 'X-Skip-Loader': '1' }
    });
  }

  batch(rows: Cita[]) {
    return this.http.post<{ inserted: number }>(`${this.apiUrl}/batch`, { rows }, {
      headers: { 'X-Skip-Loader': '1' }
    });
  }

  getStatsResumen(params?: HttpParams): Observable<ResumenResponse> {
    return this.http.get<ResumenResponse>(`${this.apiUrl}/stats/resumen`, { params });
  }

  getStatsProveedores(params?: HttpParams): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/stats/proveedores`, { params });
  }

  getStatsCumplimientoClaves(params?: HttpParams): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/stats/cumplimiento-claves`, { params });
  }

  /** 🔎 Buscar citas por filtros (nuevo) */
  searchCitas(params: SearchCitasParams): Observable<CitaQueryResponse> {
    let hp = new HttpParams();
    const appendMany = (k: string, arr?: (string | number)[]) =>
      (arr ?? []).forEach(v => hp = hp.append(k, String(v)));

    if (params.clave_cnis) hp = hp.set('clave_cnis', params.clave_cnis);
    if (params.desde) hp = hp.set('desde', params.desde);
    if (params.hasta) hp = hp.set('hasta', params.hasta);
    if (params.recibido) hp = hp.set('recibido', params.recibido);
    if (params.limit != null) hp = hp.set('limit', String(params.limit));

    appendMany('ejercicio', params.ejercicio);
    appendMany('estatus', params.estatus);
    appendMany('tipo_de_entrega', params.tipo_de_entrega);
    appendMany('compra', params.compra);
    appendMany('unidad', params.unidad);

    return this.http.get<CitaQueryResponse>(`${this.apiUrl}`, { params: hp })
      .pipe(
        map(resp => {
          resp?.data?.forEach((cita: Cita) => {
            if (cita.tipo_de_entrega?.trim().toLowerCase() === 'operador logísitico' ||
              cita.tipo_de_entrega?.trim().toLowerCase() === 'operador logistico' ||
              cita.tipo_de_entrega?.trim().toLowerCase() === 'operador logístico') {
              cita.tipo_de_entrega = 'Operador Logístico';
            }
            /*if (cita.unidad?.trim().length == 0) {
              cita.unidad = this.mapCluesUnidad.get(cita.clues_destino) ?? '';
            }*/
            if (cita.unidad?.trim() == 'Almacén Zona Ensenada' ||
              cita.unidad?.trim() == 'ALMACEN ZONA ENSENADA') {
              cita.unidad = 'ALMACÉN ZONA ENSENADA';
            }
            if (cita.unidad?.trim() == 'ALMACÉN DE MEXICALI' ||
              cita.unidad?.trim() == 'ALMACEN DE MEXICALI') {
              cita.unidad = 'ALMACÉN ZONA MEXICALI';
            }
            if (cita.unidad?.trim() == 'ALMACEN TIJUANA' ||
              cita.unidad?.trim() == 'ALMACÉN TIJUANA' ||
              cita.unidad?.trim() == 'ALMACEN ZONA TIJUANA') {
              cita.unidad = 'ALMACÉN ZONA TIJUANA';
            }
            if (cita.unidad?.trim() == 'UNEME DE ONCOLOGIA' ||
              cita.unidad?.trim() == 'UNEME ONCOLOGIA' ||
              cita.unidad?.trim() == 'UNEME ONCOLOGÍA'
            ) {
              cita.unidad = 'UNEME DE ONCOLOGÍA';
            }
            if (cita.fecha_recepcion_almacen == null || cita.fecha_recepcion_almacen?.trim().length == 0) {
              // asignar fecha_recepcion_min pero sin el formato UTC (T00:00:00Z)
              cita.fecha_recepcion_almacen = cita.fecha_recepcion_min?.substring(0, 10) || null;
            }
            cita.unidad = cita.unidad.toLocaleUpperCase();
          });
          return resp;
        })
      );
  }

  /**
   * Construye una llave de cache en base a la combinación maestra de filtros.
   * La idea es que si otro tab pide exactamente lo mismo, reutilice el cache.
   */
  private buildCacheKey(params: SearchCitasParams): string {
    const norm = (v?: string | number | null) =>
      v === undefined || v === null ? '' : String(v).trim();

    const normArr = (arr?: (string | number)[]) =>
      (arr ?? [])
        .map(x => norm(x))
        .filter(x => !!x)
        .sort()                 // 👈 importante para que [A,B] == [B,A]
        .join(',');

    const partes = [
      `desde=${norm(params.desde)}`,
      `hasta=${norm(params.hasta)}`,
      `clave=${norm(params.clave_cnis)}`,
      `rec=${norm(params.recibido)}`,
      `ejercicio=${normArr(params.ejercicio)}`,
      `estatus=${normArr(params.estatus)}`,
      `tipo_entrega=${normArr(params.tipo_de_entrega)}`,
      `compra=${normArr(params.compra)}`,
      `unidad=${normArr(params.unidad)}`,
      `limit=${norm(params.limit)}`
    ];

    return `${this.CACHE_LS_PREFIX}::${partes.join('|')}`;
  }

  private isCacheValid(entry: { ts: number; data: CitaQueryResponse }): boolean {
    if (!entry?.ts) return false;
    const ahora = Date.now();
    return (ahora - entry.ts) < this.CACHE_TTL_MS;
  }

  /**
   * Buscar citas por filtros (con caché).
   *
   * Esta función es similar a `searchCitas` pero utiliza un caché en memoria (Map<string, CitasCacheEntry>)
   * para evitar requests innecesarios al backend.
   *
   * Si se encuentra una entrada en el caché con un timestamp reciente (menos de `CACHE_TTL_MS` milisegundos)
   * se devuelve directo el resultado desde el caché sin ir al backend.
   *
   * Si no se encuentra una entrada en el caché o está vencido, se va al backend y se actualiza el caché.
   *
   * La caché se guarda en memoria y se persiste en `localStorage`.
   *
   * @param params Filtros para buscar las citas
   * @param opts Opciones extras; si { forceRefresh: true } se fuerza la recarga del caché
   * @returns Una respuesta de tipo `CitaQueryResponse` con las citas encontradas
   */
  searchCitasCached(
    params: SearchCitasParams,
    options?: { forceRefresh?: boolean }
  ): Observable<CitaQueryResponse> {
    const force = options?.forceRefresh === true;
    const cacheKey = this.buildCacheKey(params);

    if (!force) {
      try {
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
          // descomprimir y parsear
          const decompressed = LZString.decompress(raw);
          if (decompressed) {
            const parsed = JSON.parse(decompressed) as { ts: number; data: CitaQueryResponse };
            if (this.isCacheValid(parsed) && parsed.data) {
              console.log('👉 Devolviendo citas desde cache');
              // 👇 Devolvemos observable “frío” desde cache
              return of(parsed.data);
            }
          }
        }
      } catch (e) {
        console.warn('Error leyendo cache de citas', e);
      }
    }

    // 👉 Si no hay cache válido (o forceRefresh = true), llamamos al backend
    let hp = new HttpParams();
    const appendMany = (k: string, arr?: (string | number)[]) =>
      (arr ?? []).forEach(v => hp = hp.append(k, String(v)));

    if (params.clave_cnis) hp = hp.set('clave_cnis', params.clave_cnis);
    if (params.desde) hp = hp.set('desde', params.desde);
    if (params.hasta) hp = hp.set('hasta', params.hasta);
    if (params.recibido) hp = hp.set('recibido', params.recibido);
    if (params.limit != null) hp = hp.set('limit', String(params.limit));

    appendMany('ejercicio', params.ejercicio);
    appendMany('estatus', params.estatus);
    appendMany('tipo_de_entrega', params.tipo_de_entrega);
    appendMany('compra', params.compra);
    appendMany('unidad', params.unidad);

    return this.http.get<CitaQueryResponse>(`${this.apiUrl}`, { params: hp })
      .pipe(
        map(resp => {
          // 👇 tu normalización actual (tipo_de_entrega, unidad, fechas, etc.)
          resp?.data?.forEach((cita: Cita) => {
            if (cita.tipo_de_entrega?.trim().toLowerCase() === 'operador logísitico' ||
              cita.tipo_de_entrega?.trim().toLowerCase() === 'operador logistico' ||
              cita.tipo_de_entrega?.trim().toLowerCase() === 'operador logístico') {
              cita.tipo_de_entrega = 'Operador Logístico';
            }
            if (cita.unidad?.trim() == 'Almacén Zona Ensenada' ||
              cita.unidad?.trim() == 'ALMACEN ZONA ENSENADA') {
              cita.unidad = 'ALMACÉN ZONA ENSENADA';
            }
            if (cita.unidad?.trim() == 'ALMACÉN DE MEXICALI' ||
              cita.unidad?.trim() == 'ALMACEN DE MEXICALI') {
              cita.unidad = 'ALMACÉN ZONA MEXICALI';
            }
            if (cita.unidad?.trim() == 'ALMACEN TIJUANA' ||
              cita.unidad?.trim() == 'ALMACÉN TIJUANA' ||
              cita.unidad?.trim() == 'ALMACEN ZONA TIJUANA') {
              cita.unidad = 'ALMACÉN ZONA TIJUANA';
            }
            if (cita.unidad?.trim() == 'UNEME DE ONCOLOGIA' ||
              cita.unidad?.trim() == 'UNEME ONCOLOGIA' ||
              cita.unidad?.trim() == 'UNEME ONCOLOGÍA'
            ) {
              cita.unidad = 'UNEME DE ONCOLOGÍA';
            }
            if ( (cita.fecha_recepcion_almacen == null || cita.fecha_recepcion_almacen?.trim().length == 0
                 && cita.fecha_recepcion_min) ) {
              cita.fecha_recepcion_almacen = cita.fecha_recepcion_min?.substring(0, 10) || null;
            }
            cita.unidad = cita.unidad.toLocaleUpperCase();
          });

          // 👇 Guardar cache
          try {
            const payload = JSON.stringify({
              ts: Date.now(),
              data: resp
            });
            const compressed = LZString.compress(payload);
            localStorage.setItem(cacheKey, compressed);
          } catch (e) {
            console.warn('No se pudo guardar cache de citas', e);
          }
          console.log('👉 Devolviendo citas desde backend y actualizando cache');

          return resp;
        })
      );
  }

  getCitasPorClaveXClave(opts: {
    clave: string;
    desde?: string;   // 'YYYY-MM-DD' - aplica solo a fecha_recepcion_lista
    hasta?: string;   // 'YYYY-MM-DD'
    windowDays?: number;           // default 30
    incluyeNoRecibidas?: boolean;  // default true
    limit?: number;                // default 200
  }) {
    let params = new HttpParams().set('clave', (opts.clave ?? '').toUpperCase());
    if (opts.desde) params = params.set('desde', opts.desde);
    if (opts.hasta) params = params.set('hasta', opts.hasta);
    if (opts.windowDays != null) params = params.set('window_days', String(opts.windowDays));
    if (opts.incluyeNoRecibidas != null) params = params.set('incluye_no_recibidas', opts.incluyeNoRecibidas ? '1' : '0');
    if (opts.limit != null) params = params.set('limit', String(opts.limit));

    return this.http.get<{ ok: boolean; rows: any[]; ref: any }>(`${this.apiUrl}/xclave`, { params });
  }

  refreshMaterializedViews(): Observable<{ ok: boolean; refreshed: string[]; concurrently: boolean }> {
    const headers: any = {};
    if ((window as any).ADMIN_KEY) headers['x-admin-key'] = (window as any).ADMIN_KEY;
    return this.http.post<{ ok: boolean; refreshed: string[]; concurrently: boolean }>(
      `${this.apiUrl}/stats/refresh-mv`, {}, { headers }
    );
  }

  /**
   * En vias de deprecación!
   * @param base64
   * @returns
   */
  /*  obtenerCitasDeBase64(base64: string): Cita[] {

      // console.info('🔁 Obteniendo info con Power Automate');
      let citasRetorno: Cita[] = [];
      let fila: any = null;
      let citaProcesando: any = null;
      let corriendoCiclo = false;
      let corriendoCicloCitas = false;

      try {

        // 1. Convertir Base64 a ArrayBuffer
        const arrayBuffer = this.excelService.base64ToArrayBuffer(base64);

        const rows: CitaRow[] = this.excelService.obtenerCitasDeExcel(arrayBuffer);
        // console.info('🔁 Procesando', rows.length, 'filas.');

        let headerLeido = false;
        let renglon = 0;
        corriendoCiclo = true;
        for (const popo of rows) {
          renglon++;
          fila = popo;
          if (!headerLeido) {
            headerLeido = true;
            continue;
          }
          const ejercicio = fila[0];
          if (!ejercicio || (ejercicio + '').trim().length === 0) {
            console.info('🔁 fin de archivo detectado en renglón ' + renglon + '. Finalizando obtención de datos', fila);
            break;
          }
          const ordenSuministro = fila[1];
          const institucion = fila[2];
          const contrato = fila[3];
          const procedimiento = fila[4];
          const tipoEntrega = fila[5];
          const cluesDestino = fila[6];
          const unidad = fila[7];
          const fuenteFinanciamiento = fila[8];
          const proveedor = fila[9];
          const claveCNIS = fila[10];
          const descripcion = fila[11];
          const compra = fila[12];
          const tipoRed = fila[13];
          const tipoInsumo = fila[14];
          const grupoTerapeutico = fila[15];
          const precioUnitario = fila[16];
          const piezasEmitidas = fila[17];
          fila[18] = fila[18] instanceof Date ?
            fila[18] :
            (this.fechaService.excelDateToDatestring(fila[18]));
          const fechaEmision = fila[18];
          fila[19] = fila[19] instanceof Date ?
            fila[19] :
            (this.fechaService.excelDateToDatestring(fila[19]));
          const fechaLimiteEntrega = fila[19];
          const piezasRecibidas = fila[20];
          // Condiciono a que la fecha de recepción siempre sea null
          // si no tiene numero de remision (fila[22]) porque están intimamente ligados

          const fechaRecepcionAlmacen =
            fila[22] === null ? null :
              (fila[21] instanceof Date ? fila[21] :
                (!(fila[21] + '').includes('/') ?
                  this.fechaService.excelDateToDatestring(fila[21] + '') :
                  (this.fechaService.formatFechaMultiple(fila[21] as string | null))
                ))
            ;
          const numeroRemision = fila[22];
          const lote = fila[23];
          const caducidad = fila[24] === null ? null :
            (fila[24] instanceof Date ? fila[24] :
              (!(fila[24] + '').includes('/') ?
                this.fechaService.excelDateToDatestring(fila[24] + '') :
                (this.fechaService.formatFechaMultiple(fila[24] as string | null))
              ))
            ;
          const estatus = fila[25];
          const folioAbasto = fila[26];
          const almacenHospital = fila[27];
          const evidencia = fila[28];
          const carga = fila[29];
          const fechaCita = (fila[30] instanceof Date ?
            fila[30] :
            (this.fechaService.excelDateToDatestring(fila[30] + '')))! as Date | null;
          // columnas 31 y 32 no se usan en el excel
          // const observacion = fila[33];

          const nuevoRegistro: Cita = new Cita();
          nuevoRegistro.ejercicio = ejercicio;
          nuevoRegistro.orden_de_suministro = ordenSuministro;
          nuevoRegistro.institucion = institucion;
          nuevoRegistro.contrato = contrato;
          nuevoRegistro.procedimiento = procedimiento;
          nuevoRegistro.tipo_de_entrega = tipoEntrega;
          nuevoRegistro.clues_destino = cluesDestino;
          nuevoRegistro.unidad = unidad;
          nuevoRegistro.fte_fmto = fuenteFinanciamiento;
          nuevoRegistro.proveedor = (proveedor + '').trim().toLocaleUpperCase();
          nuevoRegistro.clave_cnis = claveCNIS;
          nuevoRegistro.descripcion = descripcion;
          nuevoRegistro.compra = compra;
          nuevoRegistro.tipo_de_red = tipoRed;
          nuevoRegistro.tipo_de_insumo = tipoInsumo;
          nuevoRegistro.fecha_emision = fechaEmision;
          nuevoRegistro.fecha_limite_de_entrega = fechaLimiteEntrega;
          nuevoRegistro.grupo_terapeutico = grupoTerapeutico;
          nuevoRegistro.precio_unitario = precioUnitario !== null && precioUnitario !== undefined ? Number(precioUnitario) : null;
          nuevoRegistro.no_de_piezas_emitidas = piezasEmitidas !== null && piezasEmitidas !== undefined ? Number(piezasEmitidas) : null;
          nuevoRegistro.pzas_recibidas_por_la_entidad = piezasRecibidas !== null && piezasRecibidas !== undefined ? Number(piezasRecibidas) : null;
          nuevoRegistro.fecha_recepcion_almacen = fechaRecepcionAlmacen ?
            (fechaRecepcionAlmacen + '').replace('NaN-NaN-NaN', '') : null;
          nuevoRegistro.numero_de_remision = numeroRemision;
          nuevoRegistro.lote = lote;
          nuevoRegistro.caducidad = caducidad ?
            (caducidad + '').replace('NaN-NaN-NaN', '') : null;
          nuevoRegistro.estatus = estatus;
          nuevoRegistro.folio_abasto = folioAbasto;
          nuevoRegistro.almacen_hospital_que_recibio = almacenHospital;
          nuevoRegistro.evidencia = evidencia;
          nuevoRegistro.carga = carga ?? null;
          nuevoRegistro.fecha_de_cita = fechaCita;
          //nuevoRegistro.observacion = observacion;

          citasRetorno.push(nuevoRegistro);
        }

        corriendoCiclo = false;

        // console.info(`✅ Datos cargados desde Power Automate. Total: ${citasRetorno.length} registros.`);

        corriendoCicloCitas = true;
        // creando rapidamente un map para relacion entre clues_destino y unidad
        // donde unidad no tenga valor vacío
        this.mapCluesUnidad = new Map<string, string>();
        citasRetorno.forEach((cita: Cita) => {
          citaProcesando = cita;
          if (cita.clues_destino && cita.unidad && cita.unidad.trim().length > 0) {
            this.mapCluesUnidad.set(cita.clues_destino, cita.unidad);
          }
        });

        // Corrigiendo inconsistencias:
        // En tipo_de_entrega reemplacemos la palabra "operador logísitico" por "operador lógistico"
        citasRetorno.forEach((cita: Cita) => {
          citaProcesando = cita;
          if (cita.tipo_de_entrega?.trim().toLowerCase() === 'operador logísitico' ||
            cita.tipo_de_entrega?.trim().toLowerCase() === 'operador logistico' ||
            cita.tipo_de_entrega?.trim().toLowerCase() === 'operador logístico') {
            cita.tipo_de_entrega = 'Operador Logístico';
          }
          if (cita.unidad?.trim().length == 0) {
            cita.unidad = this.mapCluesUnidad.get(cita.clues_destino) ?? '';
          }
          if (cita.unidad?.trim() == 'Almacén Zona Ensenada') {
            cita.unidad = cita.unidad.toLocaleUpperCase();
          }
        });
        corriendoCicloCitas = false;

      } catch (err: any) {
        console.error('❌ CitasService.obtenerCitasDePowerAutomate() - Error al obtener de power automate:', err);
        if (corriendoCiclo) {
          console.error('🔁 CitasService.obtenerCitasDePowerAutomate() - Error Procesando fila:', fila);
        } else if (corriendoCicloCitas) {
          console.error('🔁 CitasService.obtenerCitasDePowerAutomate() - Error Procesando cita:', citaProcesando);
        }
      }
      return citasRetorno;
    } */
}
