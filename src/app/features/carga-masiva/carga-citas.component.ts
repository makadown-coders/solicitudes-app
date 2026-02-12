import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import { firstValueFrom } from 'rxjs';
import { UnidadesService } from '../../services/unidades.service';
import { Cita, CitaRow, Inventario } from '../../models';
import { CitasService } from '../../services/citas.service';
import { InventarioService } from '../../services/inventario.service';
import { PeriodoFechasService } from '../../shared/periodo-fechas.service';

@Component({
    selector: 'app-carga-citas',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './carga-citas.component.html'
})
export class CargaCitasComponent {
    isUploading = false;
    progress = 0;

    // buffers ya parseados
    citasASubir: Cita[] = [];

    // UI
    fileNameCitas = '';
    resetTable = true;            // ⇠ “limpiar antes de subir”
    BATCH_SIZE = 500;
    unidadesService = inject(UnidadesService);
    fechaService = inject(PeriodoFechasService);
    inv = inject(InventarioService);
    private unidadesLoaded = false;

    constructor(
        private svc: CitasService
    ) { }

    get canUpload() {
        return (this.citasASubir.length) > 0;
    }

    private async ensureUnidadesLoaded() {
        if (this.unidadesLoaded) return;
        // Dispara la carga y espera una vez
        try {
            const list = await firstValueFrom(this.unidadesService.load());
            this.unidadesLoaded = !!(list && list.length);
        } catch {
            // si falla, igual intentamos con lo que haya
            this.unidadesLoaded = true;
        }
    }

    // ---------- input handlers ----------
    async onFilesCitas(ev: Event) {
        const input = ev.target as HTMLInputElement;
        if (!input.files?.length) return;

        // +++ asegura índices (byAliasSas) construidos
        await this.ensureUnidadesLoaded();

        const files = Array.from(input.files);
        const buffers = await Promise.all(files.map(f => f.arrayBuffer()));
        const rows = buffers.map(b => this.parseCitas(b)).flat();
        this.citasASubir = rows;
        this.fileNameCitas = `${files.length} archivo(s)`;
    }

    private parseCitas(buf: ArrayBuffer): Cita[] {
        const workbook = XLSX.read(buf, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: CitaRow[] = XLSX.utils.sheet_to_json<CitaRow>(sheet, { header: 1 });
        const citasRetorno: Cita[] = [];
        let headerLeido = false;
        let renglon = 0;

        let fila: any = null;

        for (const popo of rows) {
            renglon++;
            fila = popo;
            if (!headerLeido) {
                headerLeido = true;
                continue;
            }
            let ejercicio = fila[0];
            if (!ejercicio || (ejercicio + '').trim().length === 0) {
                console.info('🔁 fin de archivo detectado en renglón ' + renglon + '. Finalizando obtención de datos', fila);
                break;
            }

            let ordenSuministro = fila[1];
            const nuevoFormato = isNaN(ejercicio);
            // si ejercicio no es numero, lo tomo de columna V (índice 21)
            if (isNaN(ejercicio)) {
                ordenSuministro = fila[0];
                // fila[21] es una fecha, de modo que debo sacar el año                
                ejercicio = fila[21] instanceof Date ?
                    fila[21].getFullYear() :
                    (this.fechaService
                        .parseLocalDate(this.fechaService.excelDateToDatestring(fila[21])!)
                        .getFullYear());
            }

            let institucion = nuevoFormato ? fila[1] : fila[2];
            let contrato = nuevoFormato ? fila[7] : fila[3];
            let procedimiento = nuevoFormato ? fila[8] : fila[4];
            let tipoEntrega = nuevoFormato ? fila[2] : fila[5];
            let cluesDestino = nuevoFormato ? fila[5] : fila[6];
            let unidad = nuevoFormato ? fila[6] : fila[7];
            let fuenteFinanciamiento = nuevoFormato ? fila[9] : fila[8];
            let proveedor = nuevoFormato ? fila[11] : fila[9];
            let claveCNIS = nuevoFormato ? fila[13] : fila[10];
            let descripcion = nuevoFormato ? fila[14] : fila[11];
            let compra = nuevoFormato ? fila[10] : fila[12];
            let tipoRed = nuevoFormato ? fila[15] : fila[13];
            let tipoInsumo = nuevoFormato ? fila[16] : fila[14];
            let grupoTerapeutico = nuevoFormato ? fila[17] : fila[15];
            let precioUnitario = nuevoFormato ? fila[18] : fila[16];
            let piezasEmitidas = nuevoFormato ? fila[19] : fila[17];
            if (!nuevoFormato) {
                fila[18] = fila[18] instanceof Date ?
                    fila[18] :
                    (this.fechaService.excelDateToDatestring(fila[18]));
            } else {
                fila[21] = fila[21] instanceof Date ?
                    fila[21] :
                    (this.fechaService.excelDateToDatestring(fila[21]));
            }
            let fechaEmision = nuevoFormato ? fila[21] : fila[18];
            if (!nuevoFormato) {
                fila[19] = fila[19] instanceof Date ?
                    fila[19] :
                    (this.fechaService.excelDateToDatestring(fila[19]));
            } else {
                fila[22] = fila[22] instanceof Date ?
                    fila[22] :
                    (this.fechaService.excelDateToDatestring(fila[22]));
            }
            let fechaLimiteEntrega = nuevoFormato ? fila[22] : fila[19];
            let piezasRecibidas = nuevoFormato ? fila[25] : fila[20];
            /* Condiciono a que la fecha de recepción siempre sea null 
               si no tiene numero de remision (fila[22]) porque están intimamente ligados
            */
            let fechaRecepcionAlmacen =
                fila[22] === null ? null :
                    (fila[21] instanceof Date ? fila[21] :
                        (!(fila[21] + '').includes('/') ?
                            this.fechaService.excelDateToDatestring(fila[21] + '') :
                            (this.fechaService.formatFechaMultiple(fila[21] as string | null))
                        ))
                ;

            if (nuevoFormato) {
                fechaRecepcionAlmacen =
                    fila[23] === null ? null :
                        (fila[23] instanceof Date ? fila[23] :
                            (!(fila[23] + '').includes('/') ?
                                this.fechaService.excelDateToDatestring(fila[23] + '') :
                                (this.fechaService.formatFechaMultiple(fila[23] as string | null))
                            ))
                    ;
            }
            
            let numeroRemision = nuevoFormato ? fila[24] : fila[22];
            let lote = nuevoFormato ? fila[26] : fila[23];
            let caducidad = fila[24] === null ? null :
                (fila[24] instanceof Date ? fila[24] :
                    (!(fila[24] + '').includes('/') ?
                        this.fechaService.excelDateToDatestring(fila[24] + '') :
                        (this.fechaService.formatFechaMultiple(fila[24] as string | null))
                    ))
                ;
            if (!nuevoFormato) {
                // recalcular caducidad con fila[27]
                caducidad = fila[27] === null ? null :
                    (fila[27] instanceof Date ? fila[27] :
                        (!(fila[27] + '').includes('/') ?
                            this.fechaService.excelDateToDatestring(fila[27] + '') :
                            (this.fechaService.formatFechaMultiple(fila[27] as string | null))
                        ))
                ;
            }
            let estatus = nuevoFormato ? fila[28] : fila[25];
            let folioAbasto = nuevoFormato ? fila[29] : fila[26];
            let almacenHospital = nuevoFormato ? fila[30] : fila[27];
            let evidencia = nuevoFormato ? fila[31] : fila[28];
            let carga = nuevoFormato ? fila[32] : fila[29];
            // fecha de cita en nuevo formato ya no existe (por lo pronto).
            let fechaCita = nuevoFormato ? null : ((fila[30] instanceof Date ?
                fila[30] :
                (this.fechaService.excelDateToDatestring(fila[30] + '')))! as Date | null);
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
            nuevoRegistro.unidad = unidad.trim().length > 0 ? unidad :
                (this.unidadesService.findByCluessa(cluesDestino)?.nombre ||
                    this.unidadesService.findByCluesimb(cluesDestino)?.nombre || '');
            nuevoRegistro.fte_fmto = fuenteFinanciamiento;
            nuevoRegistro.proveedor = (proveedor + '').trim().toLocaleUpperCase();
            nuevoRegistro.clave_cnis = claveCNIS;
            nuevoRegistro.descripcion = (descripcion + '').substring(0, 2048);
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
        return citasRetorno;
    }


    // ---------- subir ----------
    async subir() {
        if (!this.canUpload) return;

        this.isUploading = true;
        this.progress = 0;

        try {
            // 1) reset (TRUNCATE)
            await firstValueFrom(this.svc.init(this.resetTable));

            // 2) lotes SAS y SALUS (mezclamos para una sola barra)
            const total = this.citasASubir.length;
            let done = 0;
            const bump = (n: number) => {
                done += n; this.progress = Math.min(100, Math.round(done * 100 / total));
            };

            const uploadBatches = async (rows: Cita[]) => {
                for (let i = 0; i < rows.length; i += this.BATCH_SIZE) {
                    const batch = rows.slice(i, i + this.BATCH_SIZE);
                    await firstValueFrom(this.svc.batch(batch));
                    bump(batch.length);
                }
            };

            await uploadBatches(this.citasASubir);

            alert(`✅ Citas cargadas. Registros: ${total}`);
        } catch (e) {
            console.error(e);
            alert('❌ Error durante la carga de Citas');
        } finally {
            this.isUploading = false;
            this.progress = 0;
        }
    }
}
