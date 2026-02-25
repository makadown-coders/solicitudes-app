// src/app/features/dashboard-abasto/proveedores/proveedores.component.ts
import {
    Component,
    ViewChildren,
    QueryList,
    ElementRef,
    inject,
    OnInit,
    ChangeDetectionStrategy,
    signal,
} from '@angular/core';

import { Cita } from '../../../models/Cita';
import { FormsModule } from '@angular/forms';
import { PeriodoFechasService } from '../../../shared/periodo-fechas.service';
import { PeriodoPickerDasboardComponent } from '../../../shared/periodo-picker/periodo-picker-dashboard.component';
import { StorageVariables } from '../../../shared/storage-variables';
import { DetalleCitaModalComponent } from '../../../shared/detalle-cita-modal/detalle-cita-modal.component';
import { CitasService } from '../../../services/citas.service';
import { CitaQueryResponse } from '../../../models/CitaQueryResponse';
import { catchError, firstValueFrom, Observable, of } from 'rxjs';
import { AbstractTabComponent } from '../../../shared/abstract-tab.component';
import { ArticulosService } from '../../../services/articulos.service';
import { ProveedoresService } from '../../../services/proveedores.service';
import { ActivatedRoute } from '@angular/router';

@Component({
    selector: 'app-proveedores',
    standalone: true,
    imports: [
    FormsModule,
    PeriodoPickerDasboardComponent,
    DetalleCitaModalComponent
],
    templateUrl: './proveedores.component.html',
    styleUrls: ['./proveedores.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProveedoresComponent extends AbstractTabComponent implements OnInit {
    mostradoPorPrimeraVez = false;
    // 🔁 Ahora las citas se cargan desde el backend, no por @Input()
    citas = signal<Cita[]>([]); // 👈 antes era Cita[] = []

    @ViewChildren('grupoRef') grupoRefs!: QueryList<
        ElementRef<HTMLDivElement>
    >;

    filtroBusqueda: string = '';
    filtroUnidad: string = '';
    filtroCompra: string = '';
    periodoFormateado: string = '';
    proveedorExpandido: string | null = null;

    // fechaInicio: Date = new Date(new Date().getFullYear(), 0, 1); // 1 enero año actual
    fechaFin: Date = new Date(); // hoy
    // fechaInicio es fechaFin menos 90 días por defecto
    fechaInicio: Date = new Date(
        this.fechaFin.getTime() - 90 * 24 * 60 * 60 * 1000
    );

    citaSeleccionada: Cita | null = null;
    mostrarModalDetalle = false;

    // estado UI
    loading = false;
    errorMsg: string | null = null;

    // inyección de servicios
    private fechasService = inject(PeriodoFechasService);
    private citasService = inject(CitasService);
    private artSrv = inject(ArticulosService);
    private provSrv = inject(ProveedoresService);

    proveedoresAgrupados = signal<{ proveedor: string; citas: Cita[] }[]>([]);
    // proveedoresAgrupados: { proveedor: string; citas: Cita[] }[] = [];

    constructor(activatedRoute: ActivatedRoute) {
        super();
        // Si viene con parámetros de ruta (que la ruta contenga el texto 'ordenes-completadas'), hacer this.isActive = true
        if (activatedRoute.snapshot.url[0].path === 'ordenes-completadas') {
            this.isActive = true;
            this.mostradoPorPrimeraVez = true;
            this.cargarDeLocalStorage();
            this.periodoFormateado = this.fechasService.formatearRango(
                this.fechaInicio,
                this.fechaFin
            );
            // 🔁 Primera carga desde backend
            this.cargarCitasDesdeBackend(true);
        }
    }

    ngOnInit(): void {
        if (this.mostradoPorPrimeraVez === false && this.isActive) {
            this.onTabActivated();
        }
    }

    /**
     * Para ser usada desde componentes padres (via ViewChild) que quieran forzar
     * la recarga de datos desde el backend.
     * @param forceRefresh
     */
    refrescarDatos(forceRefresh = false): void {
        this.cargarCitasDesdeBackend(false, forceRefresh);
    }

    // =======================
    //   Helpers de fechas
    // =======================
    private toYmd(fecha: Date): string {
        // formato YYYY-MM-DD
        return fecha.toISOString().slice(0, 10);
    }

    // =======================
    //      Carga backend
    // =======================
    private async cargarCitasDesdeBackend(cargandoDesdeNgOnInit = false, forceRefresh = false) {
        this.loading = true;
        this.errorMsg = null;

        const desde = this.toYmd(this.fechaInicio);
        const hasta = this.toYmd(this.fechaFin);

        this.citasService
            .searchCitasCached({
                desde,
                hasta,
                // Solo citas COMPLETAS (ajusta según tu catálogo real)
                estatus: ['COMPLETO'],
                // si quieres limitar duro (por ej. para pruebas) podrías usar:
                limit: 20000
            },
                { forceRefresh }).subscribe({
                    next: async (rows: CitaQueryResponse) => {
                        this.citas.set(rows ? rows.data : []);
                        // Reaplicar filtros en memoria
                        this.loading = false;
                        await this.onBusqueda(cargandoDesdeNgOnInit);
                    },
                    error: (err) => {
                        console.error('Error al cargar citas para Proveedores', err);
                        this.errorMsg = 'Error al obtener las citas desde el servidor.';
                        this.citas.set([]);
                        this.proveedoresAgrupados.set([]);
                        this.loading = false;
                    },
                });
    }

    // =======================
    //   Filtros + LocalStorage
    // =======================

    cargarDeLocalStorage() {
        this.filtroBusqueda =
            localStorage.getItem(
                StorageVariables.DASH_ABASTO_PROV_FILTRO_PROVEEDOR
            ) || '';
        this.filtroUnidad =
            localStorage.getItem(
                StorageVariables.DASH_ABASTO_PROV_FILTRO_UNIDAD
            ) || '';
        this.filtroCompra =
            localStorage.getItem(
                StorageVariables.DASH_ABASTO_PROV_FILTRO_COMPRA
            ) || '';

        const inicio = localStorage.getItem(
            StorageVariables.DASH_ABASTO_PROV_FECHA_INICIO
        );
        const fin = localStorage.getItem(
            StorageVariables.DASH_ABASTO_PROV_FECHA_FIN
        );
        if (inicio && fin) {
            this.fechaInicio = new Date(inicio);
            this.fechaFin = new Date(fin);
        }
    }

    async onPeriodoSeleccionado(
        texto: string,
        fechaInicio: Date,
        fechaFin: Date
    ) {
        this.periodoFormateado = texto;
        this.fechaInicio = fechaInicio;
        this.fechaFin = fechaFin;

        // persistir
        localStorage.setItem(
            StorageVariables.DASH_ABASTO_PROV_FECHA_INICIO,
            this.fechaInicio.toISOString()
        );
        localStorage.setItem(
            StorageVariables.DASH_ABASTO_PROV_FECHA_FIN,
            this.fechaFin.toISOString()
        );

        // 🔁 nuevo fetch desde backend con el nuevo rango
        await this.cargarCitasDesdeBackend();
    }

    async onBusqueda(cargandoDesdeNgOnInit = false) {
        if (!cargandoDesdeNgOnInit) {
            // solo persiste filtros y recalcula agrupación en memoria
            localStorage.setItem(
                StorageVariables.DASH_ABASTO_PROV_FILTRO_PROVEEDOR,
                this.filtroBusqueda
            );
            localStorage.setItem(
                StorageVariables.DASH_ABASTO_PROV_FILTRO_UNIDAD,
                this.filtroUnidad
            );
            localStorage.setItem(
                StorageVariables.DASH_ABASTO_PROV_FILTRO_COMPRA,
                this.filtroCompra
            );
        }
        const agrupados = await this.getProveedoresAgrupados();
        this.proveedoresAgrupados.set(agrupados);
    }

    // =======================
    //   Datos derivados
    // =======================

    get unidadesUnicas(): string[] {
        const set = new Set<string>();
        const lista = this.citas(); // 👈 signal
        lista.forEach((c) => {
            if (c.unidad) set.add(c.unidad);
        });
        return Array.from(set).sort();
    }

    get tiposCompra(): string[] {
        const set = new Set<string>();
        const lista = this.citas(); // 👈 signal
        lista.forEach((c) => {
            if (c.compra) set.add(c.compra);
        });
        return Array.from(set).sort();
    }

    getTotalPiezasPorProveedor(citas: Cita[]): number {
        return citas.reduce(
            (total, cita) => total + (+cita.pzas_recibidas_por_la_entidad! || 0),
            0
        );
    }

    async getProveedoresAgrupados(): Promise<{ proveedor: string; citas: Cita[] }[]> {
        let articulosMapa: Record<string, { descripcion: string; presentacion?: string; categoria?: string | null }> = {};

        try {
            // Usamos el servicio en lugar de la llamada directa
            articulosMapa = await firstValueFrom(
                this.artSrv.getArticulosMapa().pipe(
                    catchError(() => of({})) // En caso de error, retornamos objeto vacío
                )
            );
        } catch {
            articulosMapa = {};
        }

        const proveedorMap = new Map<string, Cita[]>();
        const lista = this.citas(); // 👈 usamos el valor actual del signal

        const citasFiltradas = lista.filter((c) => {
            const filtro = this.filtroBusqueda.toLowerCase();

            const coincideBusqueda =
                (c.orden_de_suministro ?? '')
                    .toLowerCase()
                    .includes(filtro) ||
                (c.proveedor ?? '').toLowerCase().includes(filtro) ||
                (c.clave_cnis ?? '').toLowerCase().includes(filtro) ||
                (c.descripcion ?? '').toLowerCase().includes(filtro);

            const coincideUnidad =
                !this.filtroUnidad || c.unidad === this.filtroUnidad;
            const coincideCompra =
                !this.filtroCompra || c.compra === this.filtroCompra;

            // ⬇️ Si quieres, puedes mantener este filtro por fecha como “doble seguridad”
            const coincideFecha = this.fechasService.fechaEnRango(
                c.fecha_recepcion_almacen,
                this.fechaInicio,
                this.fechaFin
            );

            return (
                coincideBusqueda &&
                coincideUnidad &&
                coincideCompra &&
                coincideFecha
            );
        });

        // console.log('Citas filtradas:', citasFiltradas);
        citasFiltradas.forEach((c) => {
            const articulo = articulosMapa[c.clave_cnis];
            // agregar descripcion, ya que es el unico campo que no viene en la cita
            if (articulo) {
                c.descripcion = articulo.descripcion;
            }
            let proveedor = c.proveedor ?? 'Desconocido';
            const provFromService = this.provSrv.findByNombre(proveedor);
            if (provFromService && provFromService.rfc && provFromService.rfc.trim() !== '') {
                proveedor += ' (' + provFromService.rfc + ')';
            }
            if (!proveedorMap.has(proveedor)) proveedorMap.set(proveedor, []);

            proveedorMap.get(proveedor)!.push(c);
        });

        let resultado = Array.from(proveedorMap.entries()).map(
            ([proveedor, citas]) => ({ proveedor, citas })
        );

        if (this.filtroUnidad) {
            resultado = resultado
                .map((g) => ({
                    proveedor: g.proveedor,
                    citas: g.citas.filter(
                        (c) => c.unidad === this.filtroUnidad
                    ),
                }))
                .filter((g) => g.citas.length > 0);
        }
        // console.log('Proveedores agrupados:', resultado);
        return resultado;
    }

    // =======================
    //    UI: acordeones + modal
    // =======================

    toggleProveedor(proveedor: string, index: number) {
        const yaExpandido = this.proveedorExpandido === proveedor;
        this.proveedorExpandido = yaExpandido ? null : proveedor;

        if (!yaExpandido && index >= 5) {
            setTimeout(() => {
                const el = this.grupoRefs.get(index);
                if (el) {
                    el.nativeElement.scrollIntoView({
                        behavior: 'instant',
                        block: 'start',
                    });
                }
            }, 100);
        }
    }

    abrirModalDetalle(cita: Cita) {
        this.citaSeleccionada = cita;
        this.mostrarModalDetalle = true;
    }

    cerrarModalDetalle() {
        this.mostrarModalDetalle = false;
        this.citaSeleccionada = null;
    }

    protected override onTabActivated(): void {
        if (this.mostradoPorPrimeraVez === false) {
            this.cargarDeLocalStorage();
            this.periodoFormateado = this.fechasService.formatearRango(
                this.fechaInicio,
                this.fechaFin
            );
            // 🔁 Primera carga desde backend
            this.cargarCitasDesdeBackend(true); // cargandoDesdeNgOnInit = true para evitar repersistencia
            this.mostradoPorPrimeraVez = true;
        }
    }

    protected override onTabDeactivated(): void {
        // No se requiere acción específica al desactivar la pestaña actualmente
    }
}
