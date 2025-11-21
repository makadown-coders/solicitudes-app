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
import { CommonModule } from '@angular/common';
import { Cita } from '../../../models/Cita';
import { FormsModule } from '@angular/forms';
import { PeriodoFechasService } from '../../../shared/periodo-fechas.service';
import { PeriodoPickerDasboardComponent } from '../../../shared/periodo-picker/periodo-picker-dashboard.component';
import { StorageVariables } from '../../../shared/storage-variables';
import { DetalleCitaModalComponent } from '../../../shared/detalle-cita-modal/detalle-cita-modal.component';
import { CitasService } from '../../../services/citas.service';
import { CitaQueryResponse } from '../../../models/CitaQueryResponse';

@Component({
    selector: 'app-proveedores',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        PeriodoPickerDasboardComponent,
        DetalleCitaModalComponent,
    ],
    templateUrl: './proveedores.component.html',
    styleUrls: ['./proveedores.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProveedoresComponent implements OnInit {
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

    fechaInicio: Date = new Date(new Date().getFullYear(), 0, 1); // 1 enero año actual
    fechaFin: Date = new Date(); // hoy

    citaSeleccionada: Cita | null = null;
    mostrarModalDetalle = false;

    // estado UI
    loading = false;
    errorMsg: string | null = null;

    // inyección de servicios
    private fechasService = inject(PeriodoFechasService);
    private citasService = inject(CitasService);

    proveedoresAgrupados = signal<{ proveedor: string; citas: Cita[] }[]>([]);
    // proveedoresAgrupados: { proveedor: string; citas: Cita[] }[] = [];

    ngOnInit(): void {
        this.cargarDeLocalStorage();
        this.periodoFormateado = this.fechasService.formatearRango(
            this.fechaInicio,
            this.fechaFin
        );
        // 🔁 Primera carga desde backend
        this.cargarCitasDesdeBackend(true); // cargandoDesdeNgOnInit = true para evitar repersistencia
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
    private cargarCitasDesdeBackend(cargandoDesdeNgOnInit = false): void {
        this.loading = true;
        this.errorMsg = null;

        const desde = this.toYmd(this.fechaInicio);
        const hasta = this.toYmd(this.fechaFin);

        this.citasService
            .searchCitas({
                desde,
                hasta,
                // Solo citas COMPLETAS (ajusta según tu catálogo real)
                estatus: ['COMPLETO'],
                // si quieres limitar duro (por ej. para pruebas) podrías usar:
                limit: 9999,
            })
            .subscribe({
                next: (rows: CitaQueryResponse) => {
                    console.log('Citas recibidas para Proveedores:', rows);
                    this.citas.set(rows ? rows.data : []);
                    // Reaplicar filtros en memoria
                    this.loading = false;
                    this.onBusqueda(cargandoDesdeNgOnInit);
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

    onPeriodoSeleccionado(
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
        this.cargarCitasDesdeBackend();
    }

    onBusqueda(cargandoDesdeNgOnInit = false) {
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
        this.proveedoresAgrupados.set(this.getProveedoresAgrupados());
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
            (total, cita) => total + ( +cita.pzas_recibidas_por_la_entidad! || 0),
            0
        );
    }

    getProveedoresAgrupados(): { proveedor: string; citas: Cita[] }[] {
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

        console.log('Citas filtradas:', citasFiltradas);

        citasFiltradas.forEach((c) => {
            const proveedor = c.proveedor ?? 'Desconocido';
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
        console.log('Proveedores agrupados:', resultado);
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
}
