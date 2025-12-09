// src/app/services/excel.service.ts

import { inject, Injectable } from '@angular/core';
import { ArticuloSolicitud } from '../models/articulo-solicitud';
import { Cita } from '../models/Cita';
import { Inventario, InventarioDisponibles } from '../models/Inventario';
import { CPMS, ClaveGrupo } from '../models/CPMS';
import { ResumenXGrupo } from '../models/resumen-x-grupo.model';
import { DetalleBalanceo } from '../models/balanceo/DetalleBalanceo';
import { UltimaEjecucion } from '../models/balanceo/UltimaEjecucion';
import { ResumenBalanceo } from '../models/balanceo/ResumenBalanceo';
import { ArticuloCritico } from '../shared/inventario-critico.service';
import { StorageSolicitudService } from './storage-solicitud.service';
import { base64ToArrayBuffer } from './excel/excel-utils';
import { SolicitudExcelExporter } from './excel/solicitud-excel-exporter';
import { InventarioExcelExporter } from './excel/inventario-excel-exporter';
import { BalanceoExcelExporter } from './excel/balanceo-excel-exporter';
import { KitCatalogoRow } from '../models/KitCatalogoRow';
import { ArticuloInfo } from '../models/ArticuloInfo';
import { KitsExcelExporter } from './excel/kits-excel-exporter';

@Injectable({ providedIn: 'root' })
export class ExcelService {
    solicitudService = inject(StorageSolicitudService);

    private readonly solicitudExporter = new SolicitudExcelExporter(this.solicitudService);
    private readonly inventarioExporter = new InventarioExcelExporter();
    private readonly balanceoExporter = new BalanceoExcelExporter();
    private readonly kitsExporter = new KitsExcelExporter();

    exportarExcelPrecarga(nombreArchivo: string, articulosSolicitados: ArticuloSolicitud[]) {
        return this.solicitudExporter.exportarExcelPrecarga(nombreArchivo, articulosSolicitados);
    }

    exportarExcel(nombreArchivo: string, articulosSolicitados: ArticuloSolicitud[]) {
        return this.solicitudExporter.exportarExcel(nombreArchivo, articulosSolicitados);
    }

    exportarExcelConTemplate(
        templateUrl: string,
        nombreArchivo: string,
        articulosSolicitados: ArticuloSolicitud[],
        standalone: boolean,
        existencias: InventarioDisponibles[],
        cpmsDeCluesActual: CPMS[],
        kitHas?: (clave: string) => boolean
    ) {
        return this.solicitudExporter.exportarExcelConTemplate(
            templateUrl,
            nombreArchivo,
            articulosSolicitados,
            standalone,
            existencias,
            cpmsDeCluesActual,
            kitHas
        );
    }

    descripcionVEN(clave: string): string {
        return this.solicitudExporter.descripcionVEN(clave);
    }

    leerArchivoPrecarga(file: File): Promise<any[]> {
        return this.solicitudExporter.leerArchivoPrecarga(file);
    }

    base64ToArrayBuffer(base64: string): ArrayBuffer {
        return base64ToArrayBuffer(base64);
    }

    procesarArchivoCPMS(buffer: ArrayBuffer): [CPMS[], ClaveGrupo[]] {
        return this.solicitudExporter.procesarArchivoCPMS(buffer);
    }

    exportarInventarioCritico(articulos: ArticuloCritico[]) {
        return this.inventarioExporter.exportarInventarioCritico(articulos);
    }

    obtenerCitasDeExcel(buffer: ArrayBuffer) {
        return this.inventarioExporter.obtenerCitasDeExcel(buffer);
    }

    obtenerInventarioDeExcel(buffer: ArrayBuffer) {
        return this.inventarioExporter.obtenerInventarioDeExcel(buffer);
    }

    exportarDetalleCitasPorInsumo(nombreArchivo: string, registros: Cita[]) {
        return this.inventarioExporter.exportarDetalleCitasPorInsumo(nombreArchivo, registros);
    }

    exportarExcelExistenciasUnidadConTemplate(
        templateUrl: string,
        nombreArchivo: string,
        existencias: {
            clave: string;
            clasificacionVEN: string;
            descripcion: string;
            unidadMedida: string;
            gpo: string;
            grupoTerapeutico: string;
            cpm: number;
            existenciaTotal: number;
            existenciaAZM: number;
            existenciaAZT: number;
            existenciaAZE: number;
            puntoReorden: number;
        }[],
        disponibles: number,
        faltantes: number,
        totalPiezasDisponibles: number
    ) {
        return this.inventarioExporter.exportarExcelExistenciasUnidadConTemplate(
            templateUrl,
            nombreArchivo,
            existencias,
            disponibles,
            faltantes,
            totalPiezasDisponibles
        );
    }

    exportarResumenXGrupo(
        nombreArchivo: string,
        resumenData: ResumenXGrupo[],
        cpms: CPMS[],
        existenciaUnidades: Map<string, Inventario[]>,
        obtenerDescripcion: (clave: string) => string,
        obtenerUnidad: (clave: string) => string,
        obtenerExistenciaAlmacenes: (clave: string) => InventarioDisponibles,
        claveGrupos: ClaveGrupo[],
        grupoSeleccionado: string
    ) {
        return this.inventarioExporter.exportarResumenXGrupo(
            nombreArchivo,
            resumenData,
            cpms,
            existenciaUnidades,
            obtenerDescripcion,
            obtenerUnidad,
            obtenerExistenciaAlmacenes,
            claveGrupos,
            grupoSeleccionado
        );
    }

    exportarBalanceoSugerencias(
        nombreArchivo: string,
        ejecucion: UltimaEjecucion | null,
        resumen: ResumenBalanceo[],
        detalle: DetalleBalanceo[]
    ) {
        return this.balanceoExporter.exportarBalanceoSugerencias(
            nombreArchivo,
            ejecucion,
            resumen,
            detalle
        );
    }


    async exportarCatalogoKits(
        nombreArchivo: string,
        kits: string[],
        filas: KitCatalogoRow[],
        articulosMapa?: Record<string, ArticuloInfo>
    ) {
        await this.kitsExporter.exportarCatalogoKits(
            nombreArchivo,
            kits,
            filas,
            articulosMapa
        );
    }
}
