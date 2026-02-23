import * as ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import {
    convertirBufferABase64,
    descargarArchivo,
    ensureExcelExtension
} from './excel-utils';
import { environment } from '../../../environments/environment';
import {
    ArticuloSolicitud,
    InventarioDisponibles,
    CPMS,
    clasificacionMedicamentosData,
    ClasificadorVEN,
    ClaveGrupo
} from '../../models';
import { DatosClues } from '../../models/datos-clues';
import { ModoCapturaSolicitud } from '../../shared/modo-captura-solicitud';
import { StorageSolicitudService } from '../storage-solicitud.service';

export class SolicitudExcelExporter {
    constructor(private readonly solicitudService: StorageSolicitudService) { }

    exportarExcelPrecarga(nombreArchivo: string, articulosSolicitados: ArticuloSolicitud[]) {
        articulosSolicitados.sort((a, b) => a.clave.localeCompare(b.clave));

        const worksheet = XLSX.utils
            .json_to_sheet(
                articulosSolicitados
                    .map(a => ({
                        clave: a.clave,
                        ven: this.descripcionVEN(a.clave),
                        descripcion: a.descripcion,
                        unidadMedida: a.unidadMedida,
                        cantidad: a.cantidad
                    }))
            );

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Solicitudes');

        const nombreFinal = ensureExcelExtension(nombreArchivo);
        XLSX.writeFile(workbook, nombreFinal);
    }

    exportarExcel(nombreArchivo: string, articulosSolicitados: ArticuloSolicitud[]) {
        const worksheet = XLSX.utils.json_to_sheet(articulosSolicitados);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Solicitudes');

        const nombreFinal = ensureExcelExtension(nombreArchivo);
        XLSX.writeFile(workbook, nombreFinal);
    }

    async exportarExcelConTemplate(
        templateUrl: string,
        nombreArchivo: string,
        articulosSolicitados: ArticuloSolicitud[],
        standalone: boolean,
        existencias: InventarioDisponibles[],
        cpmsDeCluesActual: CPMS[],
        kitHas?: (clave: string) => boolean
    ) {
        articulosSolicitados.sort((a, b) => a.clave.localeCompare(b.clave));

        let B4 = '';
        let E4 = '';
        let F5 = '';
        let F7 = '';
        let F8 = '';

        const datosCluesStr = this.solicitudService.getDatosCluesFromLocalStorage();
        let datosClues: DatosClues | null = null;
        if (datosCluesStr && !standalone) {
            datosClues = JSON.parse(datosCluesStr) as DatosClues;
            B4 = datosClues.nombreHospital;
            E4 = datosClues.tipoInsumo;
            F5 = datosClues.periodo;
            F7 = datosClues?.tipoPedido ?? 'Ordinario';
            F8 = datosClues?.responsableCaptura ?? '';
        }

        const esPrimerNivel =
            this.solicitudService.getModoCapturaSolicitud() === ModoCapturaSolicitud.PRIMER_NIVEL;

        const municipio = datosClues?.hospital?.municipio?.trim();
        if (!standalone && esPrimerNivel && municipio) {
            B4 = `${B4} (${municipio})`;
        }

        const workbook = new ExcelJS.Workbook();
        const response = await fetch(templateUrl);
        const arrayBuffer = await response.arrayBuffer();
        await workbook.xlsx.load(arrayBuffer);
        const worksheet = workbook.worksheets[0];

        const imgBuffer = await fetch('imssb-logo.png')
            .then(res => res.arrayBuffer())
            .then(buffer => new Uint8Array(buffer));

        const imageId = workbook.addImage({
            buffer: imgBuffer.buffer,
            extension: 'png',
        });
        worksheet!.getCell('C1').value = '';
        worksheet.addImage(imageId, {
            tl: { col: 2, row: 0 },
            ext: { width: 150, height: 40 },
            editAs: 'oneCell',
        });
        worksheet!.getCell('B4').value = B4;
        worksheet!.getCell('E4').value = E4;
        worksheet!.getCell('F5').value = F5;
        worksheet!.getCell('F7').value = F7;
        worksheet!.getCell('F8').value = F8;

        for (let i = 0; i < articulosSolicitados.length; i++) {
            const renglon = i + 12;
            worksheet!.getCell(`B${renglon}`).value = i + 1;
            worksheet!.getCell(`C${renglon}`).value = this.descripcionVEN(articulosSolicitados[i].clave);
            worksheet!.getCell(`D${renglon}`).value = articulosSolicitados[i].clave;
            worksheet!.getCell(`E${renglon}`).value = articulosSolicitados[i].descripcion;
            worksheet!.getCell(`F${renglon}`).value = articulosSolicitados[i].unidadMedida;
            const existencia = existencias.find(e => e.clave === articulosSolicitados[i].clave);
            const existenciaAZT = existencia ? existencia.existenciasAZT : 0;
            const existenciaAZE = existencia ? existencia.existenciasAZE : 0;
            const existenciaAZM = existencia ? existencia.existenciasAZM : 0;
            const cpm = articulosSolicitados[i].cpm === 0 ? (cpmsDeCluesActual
                .find(cpm => cpm.clave === articulosSolicitados[i].clave)?.cantidad ?? 0) : articulosSolicitados[i].cpm;
            const cantidad = articulosSolicitados[i].cantidad;

            const celdaCantidad = worksheet!.getCell(`G${renglon}`);
            celdaCantidad.value = cantidad;

            if (cpm > 0) {
                if (cantidad > cpm) {
                    celdaCantidad.font = { color: { argb: 'FFFF0000' } };
                } else if (cantidad < cpm) {
                    celdaCantidad.font = { color: { argb: '3933ff' } };
                }
            }

            const celdaCpm = worksheet!.getCell(`H${renglon}`);
            celdaCpm.value = cpm;
            if (cpm === 0) {
                celdaCpm.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f3ff33' } };
            }

            worksheet!.getCell(`I${renglon}`).value = existenciaAZM;
            worksheet!.getCell(`J${renglon}`).value = existenciaAZT;
            worksheet!.getCell(`K${renglon}`).value = existenciaAZE;
            // const enKit = kitHas?.(articulosSolicitados[i].clave) === true;
            const celdaObs = worksheet!.getCell(`L${renglon}`);
            celdaObs.value = articulosSolicitados[i].observaciones; // enKit ? 'En KIT de Rutas de la Salud' : '';

            if (articulosSolicitados[i].observaciones && articulosSolicitados[i].observaciones.length > 0) {
                celdaObs.font = { italic: true, color: { argb: '22543D' } };
                celdaObs.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D1FAE5' } };
                worksheet.getColumn('L').width = 42;
                worksheet.getCell('L11').value = 'OBSERVACIONES';
            }
        }
        const buffer = await workbook.xlsx.writeBuffer();
        const base64 = await convertirBufferABase64(buffer);
        const enProduccion = environment.production;

        datosClues = datosCluesStr && !standalone
            ? (JSON.parse(datosCluesStr) as DatosClues)
            : null;

        if (enProduccion) {
            await fetch(environment.apiUrl + '/historial', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nombreArchivo,
                    contenidoBase64: base64,
                    nombre: datosClues?.responsableCaptura ?? 'Desconocido',
                    unidad: datosClues?.nombreHospital ?? '',
                    clues: datosClues?.hospital?.cluesimb ?? '',
                    periodo: datosClues?.periodo ?? '',
                    tipoMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                })
            });
        }

        descargarArchivo(buffer, nombreArchivo);
    }

    descripcionVEN(clave: string): string {
        const clasificacion = clasificacionMedicamentosData
            .find(c => c.clave === clave);
        return clasificacion
            ? ClasificadorVEN[clasificacion.ven]
            : '';
    }

    leerArchivoPrecarga(file: File): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array((e.target as any).result);
                const workbook = XLSX.read(data, { type: 'array' });
                const primeraHoja = workbook.SheetNames[0];
                const datos = XLSX.utils.sheet_to_json(workbook.Sheets[primeraHoja], { defval: '' });
                resolve(datos);
            };
            reader.onerror = (e) => reject(e);
            reader.readAsArrayBuffer(file);
        });
    }

    procesarArchivoCPMS(buffer: ArrayBuffer): [CPMS[], ClaveGrupo[]] {
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        const CPMs: CPMS[] = [];
        const clavesGrupos: ClaveGrupo[] = [];

        const claves: string[] = [];
        let row = 5;
        while (true) {
            const celda = sheet[`A${row}`];
            if (!celda || !celda.v) break;
            claves.push(celda.v.toString());
            clavesGrupos.push({ clave: celda.v.toString(), gpo: '', grupoTerapeutico: '' });
            row++;
        }

        const cluesimb: string[] = [];
        const startCol = XLSX.utils.decode_col('I');
        const endCol = XLSX.utils.decode_col('GB');
        for (let col = startCol; col <= endCol; col++) {
            const colLetter = XLSX.utils.encode_col(col);
            const celda = sheet[`${colLetter}2`];
            cluesimb.push(celda?.v?.toString() ?? '');
        }

        claves.forEach((clave, idxFila) => {
            const fila = 5 + idxFila;

            cluesimb.forEach((clue, idxCol) => {
                const colLetter = XLSX.utils.encode_col(startCol + idxCol);
                const celda = sheet[`${colLetter}${fila}`];
                const cantidad = celda?.v ? Number(celda.v) : 0;
                const gpo = sheet[`C${fila}`]?.v?.toString() ?? '';
                const grupoTerapeutico = sheet[`D${fila}`]?.v?.toString() ?? '';

                const claveGrupo = clavesGrupos.find(cg => cg.clave === clave);
                if (claveGrupo) {
                    claveGrupo.gpo = gpo;
                    claveGrupo.grupoTerapeutico = grupoTerapeutico;
                }

                CPMs.push({
                    clave,
                    cluesimb: clue,
                    cantidad: isNaN(cantidad) ? 0 : cantidad
                });
            });
        });

        return [CPMs, clavesGrupos];
    }

    procesarArchivoCPMS1erNivel(buffer: ArrayBuffer): CPMS[] {
        try {
            const workbook = XLSX.read(buffer, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];

            const CPMs: CPMS[] = [];
            const claves: string[] = [];
            let row = 2;
            while (true) {
                const celda = sheet[`A${row}`];
                if (!celda || !celda.v) break;
                const clave = celda.v.toString();
                // si la clave[0] empieza con una letra, omitirlo
                if (clave.length > 0 && !clave[0].match(/[A-Z]/)) {
                    claves.push(celda.v.toString());
                }
                row++;
            }
            console.log('Claves detectadas:', claves, row);

            const cluesimb: string[] = [];
            const startCol = XLSX.utils.decode_col('B');
            const endCol = XLSX.utils.decode_col('DJ');

            for (let col = startCol; col <= endCol; col++) {
                const colLetter = XLSX.utils.encode_col(col);
                const celda = sheet[`${colLetter}1`];
                console.log(`Leyendo celda ${colLetter}1:`, celda);
                cluesimb.push(celda?.v?.toString() ?? '');
            }
            console.log('Clues detectadas:', cluesimb);

            claves.forEach((clave, idxFila) => {
                const fila = 2 + idxFila;

                cluesimb.forEach((clue, idxCol) => {
                    const colLetter = XLSX.utils.encode_col(startCol + idxCol);
                    const celda = sheet[`${colLetter}${fila}`];
                    const cantidad = celda?.v ? Number(celda.v) : 0;

                    if (!(isNaN(cantidad) || cantidad <= 0)) {
                        CPMs.push({
                            clave,
                            cluesimb: clue,
                            cantidad: isNaN(cantidad) ? 0 : cantidad
                        });
                    }
                });
            });
            console.log(CPMs);
            return CPMs;
        } catch (e) {
            console.error('Error procesando archivo CPM 1er nivel:', e);
            return [];
        }
    }
}
