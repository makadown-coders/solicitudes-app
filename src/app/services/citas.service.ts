import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Cita, CitaRow } from '../models/Cita';
import { PeriodoFechasService } from '../shared/periodo-fechas.service';
import { ExcelService } from './excel.service';
import { ResumenResponse } from '../models/StatsCitas';

@Injectable({
  providedIn: 'root'
})
export class CitasService {
  private apiUrl = environment.apiUrl + '/citas'; // Ajusta si necesitas proxy
  private fechaService = inject(PeriodoFechasService);
  private excelService = inject(ExcelService);
  private mapCluesUnidad: Map<string, string> = new Map<string, string>();

  constructor(private http: HttpClient) { }

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
  obtenerCitasDeBase64(base64: string): Cita[] {

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
        /* Condiciono a que la fecha de recepción siempre sea null 
           si no tiene numero de remision (fila[22]) porque están intimamente ligados
        */
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
  }
}
