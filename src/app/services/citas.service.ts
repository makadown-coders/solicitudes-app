import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Cita, CitaRow } from '../models/Cita';
import { PaginacionCitas } from '../models/PaginacionCitas';
import { PeriodoFechasService } from '../shared/periodo-fechas.service';
import { ExcelService } from './excel.service';

@Injectable({
  providedIn: 'root'
})
export class CitasService {
  private apiUrl = environment.apiUrl + '/citas'; // Ajusta si necesitas proxy
  private fechaService = inject(PeriodoFechasService);
  private excelService = inject(ExcelService);

  constructor(private http: HttpClient) {}

  obtenerCitas(
    page = 1,
    limit = 10,
    filtros: Partial<Cita> = {},
    search = '', sortBy = 'fecha_de_cita', sortOrder: 'ASC' | 'DESC' = 'DESC') {
      let params = new HttpParams()
        .set('page', page)
        .set('limit', limit)
        .set('sortBy', sortBy)
        .set('sortOrder', sortOrder);
  
    if (search.trim()) {
      params = params.set('search', search.trim());
    }
  
    // Agregar todos los filtros como query params
    Object.entries(filtros).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, value.toString());
      }
    });
  
    return this.http.get<PaginacionCitas>(this.apiUrl, { params });
  }

  buscarOrdenes(q: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/buscar-orden?q=${encodeURIComponent(q)}`);
  }

  obtenerCitasDeBase64(base64: string): Cita[] {
    
    console.log('🔁 Obteniendo info con Power Automate');
    let citasRetorno: Cita[] = [];
    let fila: any = null;
    try {
       
      // 1. Convertir Base64 a ArrayBuffer
      const arrayBuffer = this.base64ToArrayBuffer(base64);
      
      const rows: CitaRow[] = this.excelService.obtenerCitasDeExcel(arrayBuffer);
      console.log('🔁 Procesando', rows.length, 'filas.');

      let headerLeido = false;
      for (const popo of rows) {
        fila = popo;
        if (!headerLeido) {
          headerLeido = true;
          continue;
        }
      //  console.log('🔁 Procesando orden de suministro:', fila[1]);
        const ejercicio = fila[0];
        if (!ejercicio || (ejercicio + '').trim().length === 0) {
          console.log('🔁 fin de archivo detectado. Finalizando obtención de datos', fila);
          break;
        }
        const ordenSuministro = fila[1];
        const institucion = fila[2];
        const tipoEntrega = fila[3];
        const cluesDestino = fila[4];
        const unidad = fila[5];
        const fuenteFinanciamiento = fila[6];
        const proveedor = fila[7];
        const claveCNIS = fila[8];
        const descripcion = fila[9];
        const compra = fila[10];
        const tipoRed = fila[11];
        const tipoInsumo = fila[12];
        const grupoTerapeutico = fila[13];
        const precioUnitario = fila[14];
        const piezasEmitidas = fila[15];
        fila[16] = fila[16] instanceof Date ?
          fila[16] :
          (this.fechaService.excelDateToDatestring(fila[16]));
        const fechaLimiteEntrega = fila[16];
        const piezasRecibidas = fila[17];
        // console.log('fechaRecepcionAlmacen before', fila[18]);

        /* Condiciono a que la fecha de recepción siempre sea null 
           si no tiene numero de remision (fila[19]) porque están intimamente ligados
        */
        const fechaRecepcionAlmacen =
          fila[19] === null ? null :
            (fila[18] instanceof Date ? fila[18] :
              (!(fila[18] + '').includes('/') ? 
              this.fechaService.excelDateToDatestring(fila[18] + '') :
                (this.fechaService.formatFechaMultiple(fila[18] as string | null))
              ))
          ;
        // console.log('fechaRecepcionAlmacen after', fechaRecepcionAlmacen);
        const numeroRemision = fila[19];
        const lote = fila[20];
        const caducidad = fila[21] === null ? null :
          (fila[21] instanceof Date ? fila[21] :
            (!(fila[21] + '').includes('/') ?
            this.fechaService.excelDateToDatestring(fila[21] + '') :
              (this.fechaService.formatFechaMultiple(fila[21] as string | null))
            ))
          ;
        const estatus = fila[22];
        const folioAbasto = fila[23];
        const almacenHospital = fila[24];
        const evidencia = fila[25];
        const carga = fila[26];
        const fechaCita = (fila[27] instanceof Date ?
          fila[27] :
          (this.fechaService.excelDateToDatestring(fila[27]+'')) )! as Date | null;
        // columnas 28 y 29 no se usan en el excel        
        const observacion = fila[30];

        const nuevoRegistro: Cita = new Cita();
        nuevoRegistro.ejercicio = ejercicio;
        nuevoRegistro.orden_de_suministro = ordenSuministro;
        nuevoRegistro.institucion = institucion;
        nuevoRegistro.tipo_de_entrega = tipoEntrega;
        nuevoRegistro.clues_destino = cluesDestino;
        nuevoRegistro.unidad = unidad;
        nuevoRegistro.fte_fmto = fuenteFinanciamiento;
        nuevoRegistro.proveedor = proveedor;
        nuevoRegistro.clave_cnis = claveCNIS;
        nuevoRegistro.descripcion = descripcion;
        nuevoRegistro.compra = compra;
        nuevoRegistro.tipo_de_red = tipoRed;
        nuevoRegistro.tipo_de_insumo = tipoInsumo;
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
        nuevoRegistro.observacion = observacion;

        citasRetorno.push(nuevoRegistro);
      }

      console.log(`✅ Datos cargados desde Power Automate. Total: ${citasRetorno.length} registros.`);

    } catch (err: any) {
      console.error('❌ Error al obtener de power automate:', err);
      console.log('🔁 Procesando fila:', fila);
    }

    return citasRetorno;
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    // Decodificar el string Base64
    const binaryString = atob(base64);
    
    // Convertir a ArrayBuffer
    const length = binaryString.length;
    const bytes = new Uint8Array(length);
    
    for (let i = 0; i < length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return bytes.buffer;
  }
}
