// src/app/features/dashboard-abasto/existencias/existencias-x-grupo/existencias-x-grupo.component.ts
import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Articulo, UnidadExistente } from '../../../../models/articulo-solicitud';
import { CPMS, ClaveGrupo } from '../../../../models/CPMS';
import { Inventario, InventarioDisponibles } from '../../../../models/Inventario';
import { hospitalesData } from '../../../../models/hospitalesData';
import { Cita } from '../../../../models/Cita';
import * as LZString from 'lz-string';
import { StorageSolicitudService } from '../../../../services/storage-solicitud.service';
import { FormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { StorageVariables } from '../../../../shared/storage-variables';
import { ResumenXGrupo } from '../../../../models/resumen-x-grupo.model';
import { ExcelService } from '../../../../services/excel.service';
import { LucideAngularModule, SheetIcon } from 'lucide-angular';
import { ArticulosService } from '../../../../services/articulos.service';

@Component({
    selector: 'app-existencias-x-grupo',
    standalone: true,
    imports: [CommonModule, FormsModule, NgSelectModule, LucideAngularModule],
    templateUrl: './existencias-x-grupo.component.html'
})
export class ExistenciasXGrupoComponent implements OnInit {
    private articulosMap = new Map<string, { descripcion: string; presentacion: string }>();
    @Input() claveGrupos: ClaveGrupo[] = [];
    @Input() existenciaUnidades: Map<string, Inventario[]> = new Map<string, Inventario[]>();
    @Input() cpms: CPMS[] = [];
    @Input() citas: Cita[] = [];

    inventario: Inventario[] = [];
    resumenXGrupo: ResumenXGrupo[] = [];
    sheetIcon = SheetIcon;

    unidades: UnidadExistente[] = hospitalesData;
    gruposDisponibles: string[] = [];
    grupoSeleccionado: string = '';

    constructor(private storageService: StorageSolicitudService,
        private excelService: ExcelService,
        private articulosService: ArticulosService
    ) { }

    ngOnInit() {
        if (this.claveGrupos.length === 0) {
            this.claveGrupos = this.storageService.getClaveGruposFromLocalStorage();
        }
        // Extraer todos los grupos terapéuticos únicos
        this.gruposDisponibles = Array.from(new Set(this.claveGrupos.map(cg => cg.grupoTerapeutico))).sort();
        if (this.inventario.length === 0) {
            this.inventario = this.storageService.getInventarioFromLocalStorage();
        }
        // Recuperar selección previa
        const grupoGuardado = localStorage.getItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_EXG_GRUPO);
        if (grupoGuardado) {
            this.grupoSeleccionado = grupoGuardado;
            this.calcularResumenXGrupo();
        }
        if (localStorage.getItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_EXU_ARTICULOS_MAP) === null) {
            this.articulosService.buscarArticulosv2('')  // vacío para traer todo
                .subscribe({
                    next: (response) => {
                        const articulos = response.resultados.map(r => ({
                            clave: r.clave,
                            descripcion: r.descripcion,
                            presentacion: r.unidadMedida ?? '',
                        })) as Articulo[];
                        // al cargar:
                        articulos.forEach(a => this.articulosMap.set(a.clave, a));
                        // Guardar comprimido de articulosMap en localStorage (DASH_ABASTO_EXISTENCIAS_EXU_ARTICULOS_MAP)
                        const articulosString = JSON.stringify(Array.from(this.articulosMap.entries()));
                        const articulosComprimido = LZString.compress(articulosString);
                        localStorage.setItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_EXU_ARTICULOS_MAP, articulosComprimido);
                    },
                    error: (err) => {
                        console.warn('⚠️ Error cargando artículos:', err);
                    }
                });
        } else {
            this.cargarArticulosMapDeLocalStorage();
        }
    }

    onGrupoChange(grupo: string) {
        this.grupoSeleccionado = grupo;
        localStorage.setItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_EXG_GRUPO, grupo);
        this.calcularResumenXGrupo();
    }

    private obtenerExistenciaAlmacenes(clave: string): InventarioDisponibles {
        const existenciaAlmacenes = new InventarioDisponibles();
        existenciaAlmacenes.clave = clave;

        const inventarioItems = this.inventario.filter(item => item.clave === clave);

        existenciaAlmacenes.existenciasAZE = 0;
        existenciaAlmacenes.existenciasAZM = 0;
        existenciaAlmacenes.existenciasAZT = 0;
        inventarioItems.forEach(item => {
            if (item.almacen.toLowerCase().includes('almacen estatal zona mexicali') ||
                item.almacen.toLowerCase().includes('almacen zona mexicali')) {
                existenciaAlmacenes.existenciasAZM += item.disponible - item.comprometidos;
            } else if (item.almacen.toLowerCase().includes('almacen zona ensenada')) {
                existenciaAlmacenes.existenciasAZE += item.disponible - item.comprometidos;
            } else if (item.almacen.toLowerCase().includes('almacen zona tijuana')) {
                existenciaAlmacenes.existenciasAZT += item.disponible - item.comprometidos;
            }
        });
        return existenciaAlmacenes;
    }

    private calcularResumenXGrupo() {
        if (!this.grupoSeleccionado) {
            this.resumenXGrupo = [];
            return;
        }

        const unidadesSinEstatal = this.unidades.filter(unidad => unidad.cluesimb !== 'ESTATAL');

        this.resumenXGrupo = unidadesSinEstatal.map(unidad => {
            // Filtrar claves de CPMS para esta unidad y este grupo
            const clavesUnidadGrupo = this.cpms
                .filter(cpm => cpm.cluesimb.toLowerCase() === unidad.cluesimb.toLowerCase())
                .filter(cpm => this.claveGrupos.some(
                    cg => cg.clave === cpm.clave && cg.grupoTerapeutico === this.grupoSeleccionado
                ));

            const clavesUnicas = Array.from(new Set(clavesUnidadGrupo.map(c => c.clave)));
            const clavesManejadas = clavesUnicas.length;

            // Calcular claves en desabasto
            let clavesDesabasto = 0;
            for (const cpm of clavesUnidadGrupo) {
                const existenciaUnidad = (this.existenciaUnidades.get(unidad.key) || [])
                    .filter(item => item.clave === cpm.clave)
                    .reduce((sum, item) => sum + item.disponible, 0);

                const existenciaAlmacenes = this.obtenerExistenciaAlmacenes(cpm.clave);
                const totalAlmacenes = existenciaAlmacenes.existenciasAZM +
                    existenciaAlmacenes.existenciasAZT +
                    existenciaAlmacenes.existenciasAZE;

                const totalExistencias = existenciaUnidad + totalAlmacenes;

                // Nueva lógica de desabasto: CPM > total existencias
                // TODO: Confirmar si esta lógica es correcta o dejar ( totalExistencias === 0 )
                if (totalExistencias === 0) { //(cpm.cantidad > totalExistencias) {
                    clavesDesabasto++;
                }
            }

            const porcentajeDesabasto = clavesManejadas > 0
                ? (clavesDesabasto / clavesManejadas) * 100
                : 0;

            return {
                key: unidad.key,
                municipio: unidad.municipio,
                clues: unidad.cluesimb,
                nombreUnidad: unidad.nombre,
                nivelAtencion: unidad.nivelAtencion,
                tipologia: unidad.tipoUnidad,
                categoria: 'SERVICIOS',
                clavesManejadas,
                clavesDesabasto,
                porcentajeDesabasto
            };
        });
    }


    exportarExcelXGrupo() {
        if (!this.resumenXGrupo || this.resumenXGrupo.length === 0) {
            console.warn('No hay datos para exportar.');
            return;
        }
        console.log('tamanio de existencia unidades', this.existenciaUnidades.size);

        this.excelService.exportarResumenXGrupo(
            `ResumenXGrupo_${this.grupoSeleccionado}_${new Date().toISOString().slice(0, 10)}.xlsx`,
            this.resumenXGrupo,
            this.cpms,
            this.existenciaUnidades,
            this.obtenerDescripcion.bind(this),
            this.obtenerUnidad.bind(this),
            this.obtenerExistenciaAlmacenes.bind(this),
            this.claveGrupos,                   // 🔹 nuevo
            this.grupoSeleccionado              // 🔹 nuevo
        );
    }

    private cargarArticulosMapDeLocalStorage() {
        const articulosMapComprimido = localStorage.getItem(StorageVariables.DASH_ABASTO_EXISTENCIAS_EXU_ARTICULOS_MAP);
        if (articulosMapComprimido) {
            const articulosMapGuardados = LZString.decompress(articulosMapComprimido);
            this.articulosMap = new Map(JSON.parse(articulosMapGuardados));
        }
    }

    private obtenerDescripcion(clave: string): string {
        return this.articulosMap.get(clave)?.descripcion || '-';
    }

    private obtenerUnidad(clave: string): string {
        return this.articulosMap.get(clave)?.presentacion || '-';
    }

    private disponibles(clave: string): number {
        // Busca existencia en this.existenciaUnidades (todas las unidades)
        let total = 0;
        this.existenciaUnidades.forEach(lista => {
            lista.forEach(item => {
                if (item.clave === clave) {
                    total += item.disponible;
                }
            });
        });
        return total;
    }

}
