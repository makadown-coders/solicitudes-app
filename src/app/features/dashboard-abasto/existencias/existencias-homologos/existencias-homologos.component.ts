import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Input,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { Inventario, InventarioDisponibles } from '../../../../models/Inventario';
import { HomologosService } from '../../../../services/homologos.service';
import { ArticulosService } from '../../../../services/articulos.service';
import { InventarioService } from '../../../../services/inventario.service';
import { firstValueFrom } from 'rxjs';
import { HomologoDTO } from '../../../../models/homologos/HomologoDto';
import * as ExcelJS from 'exceljs';
import { descargarArchivo, ensureExcelExtension } from '../../../../services/excel/excel-utils';
import { ActivatedRoute } from '@angular/router';

interface HomologoResumen {
  claveOrigen: string;
  descripcionOrigen: string;
  sustitutos: HomologoConExistencias[];
  existenciasOrigen: {
    AZM: number;
    AZT: number;
    AZE: number;
    total: number;
  };
}

interface HomologoConExistencias {
  clave: string;
  descripcion: string;
  existenciasAZM: number;
  existenciasAZT: number;
  existenciasAZE: number;
  total: number;
}

interface AlmacenCardsData {
  almacen: string;
  almacenNombre: string;
  homologos: HomologoResumen[];
}

@Component({
  selector: 'app-existencias-homologos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './existencias-homologos.component.html',
  styleUrls: ['./existencias-homologos.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExistenciasHomologosComponent implements OnInit, OnDestroy {
  @Input() isActive = false;
  @Input() existenciaUnidades: Map<string, Inventario[]> = new Map();

  // Services
  private homologosService = inject(HomologosService);
  private articulosService = inject(ArticulosService);
  private inventarioService = inject(InventarioService);

  // Signals
  private loading = signal(false);
  private allData = signal<HomologoResumen[]>([]);
  private filteredData = signal<HomologoResumen[]>([]);
  private cardsData = signal<AlmacenCardsData[]>([]);

  // UI Signals
  searchQuery = signal('');
  selectedAlmacen = signal<'AZM' | 'AZT' | 'AZE' | 'TODOS'>('TODOS');
  page = signal(1);
  pageSize = signal(10);

  // Maps
  private articulosMapa = new Map<string, { descripcion: string; presentacion?: string }>();
  private inventarioxAlmacen = new Map<string, InventarioDisponibles>();

  // RxJS
  private onDestroy$ = new Subject<void>();

  constructor(activatedRoute: ActivatedRoute) {
    if (activatedRoute.snapshot.url[0].path === 'homologos') {
      this.inventarioService.existencias$.forEach((value, key) => {
        value.pipe(takeUntil(this.onDestroy$)).subscribe({
          next: (data: Inventario[]) => {
            // console.log('Cargando existencias de unidad', key);
            this.existenciaUnidades.set(key, data as Inventario[]);
          }
        });
      });
      this.isActive = true;
    }
  }

  async ngOnInit() {
    if (this.isActive) {
      setTimeout(async () => {
        await this.cargarDatos();
      }, 1000);

    }
  }

  ngOnDestroy(): void {
    this.onDestroy$.next();
    this.onDestroy$.complete();
  }

  private async cargarDatos(): Promise<void> {
    console.log('Cargando datos de homologos...');
    try {
      this.loading.set(true);

      // 1. Cargar mapa de artículos
      const mapa = await firstValueFrom(this.articulosService.getArticulosMapa());
      this.articulosMapa = new Map(Object.entries(mapa));

      // 2. Obtener inventario disponible (almacenes) - AHORA CORRECTAMENTE ESPERADO
      const inventario = await firstValueFrom(
        this.inventarioService.inventario$.pipe(
          takeUntil(this.onDestroy$)
        )
      );
      this.construirInventarioDisponible(inventario);

      // 3. Obtener todas las claves únicas que tienen homologos
      const todasLasClaves = this.obtenerTodasLasClaves();

      if (todasLasClaves.length === 0) {
        console.log('No se encontraron claves con homologos');
        this.loading.set(false);
        return;
      }

      // 4. Obtener homologos en batch
      const mapHomologos = await firstValueFrom(
        this.homologosService.batch(todasLasClaves)
      );

      // 5. Construir lista de homologos con existencias
      const homologosConExistencias = this.construirHomologosConExistencias(
        mapHomologos
      );

      this.allData.set(homologosConExistencias);
      console.log('allData:', this.allData());
      this.aplicarFiltros();
    } catch (error) {
      console.error('Error cargando datos de homologos:', error);
    } finally {
      this.loading.set(false);
    }
  }

  private obtenerTodasLasClaves(): string[] {
    // Obtener todas las claves únicas del inventario disponible
    const claves = new Set<string>();
    for (const [, inventarios] of this.existenciaUnidades) {
      for (const inv of inventarios) {
        if (inv.clave) {
          claves.add(inv.clave.trim().toUpperCase());
        }
      }
    }
    return Array.from(claves);
  }

  private construirInventarioDisponible(inventario: Inventario[]): void {
    // Agrupar inventario por clave para obtener existencias por almacén
    const mapa = new Map<string, InventarioDisponibles>();

    for (const inv of inventario) {
      const claveNorm = (inv.clave || '').trim().toUpperCase();
      if (!claveNorm) continue;

      if (!mapa.has(claveNorm)) {
        mapa.set(claveNorm, {
          clave: claveNorm,
          existenciasAZM: 0,
          existenciasAZT: 0,
          existenciasAZE: 0,
        });
      }

      const item = mapa.get(claveNorm)!;
      const almacenNorm = (inv.almacen || '').toLowerCase(); // CORRECCIÓN: antes era 'ubicacion'

      // Clasificar por almacén según patrón de texto (como en otros componentes)
      if (
        almacenNorm.includes('almacen estatal zona mexicali') ||
        almacenNorm.includes('almacen zona mexicali')
      ) {
        item.existenciasAZM +=
          (inv.disponible || 0) - (inv.comprometidos || 0); // CORRECCIÓN: resta comprometidos
      } else if (almacenNorm.includes('almacen zona ensenada')) {
        item.existenciasAZE +=
          (inv.disponible || 0) - (inv.comprometidos || 0);
      } else if (almacenNorm.includes('almacen zona tijuana')) {
        item.existenciasAZT +=
          (inv.disponible || 0) - (inv.comprometidos || 0);
      }
    }

    this.inventarioxAlmacen = mapa;
  }

  private construirHomologosConExistencias(
    mapHomologos: Map<string, HomologoDTO[]>
  ): HomologoResumen[] {
    const resultado: HomologoResumen[] = [];

    for (const [claveOrigen, homologosDto] of mapHomologos) {
      if (!homologosDto || homologosDto.length === 0) continue;

      // Existencias de la clave origen
      const invOrigen = this.inventarioxAlmacen.get(claveOrigen.toUpperCase());
      const existenciasOrigen = {
        AZM: invOrigen?.existenciasAZM ?? 0,
        AZT: invOrigen?.existenciasAZT ?? 0,
        AZE: invOrigen?.existenciasAZE ?? 0,
        total:
          (invOrigen?.existenciasAZM ?? 0) +
          (invOrigen?.existenciasAZT ?? 0) +
          (invOrigen?.existenciasAZE ?? 0),
      };

      // Construir sustitutos (máximo 4)
      const sustitutos: HomologoConExistencias[] = homologosDto
        .slice(0, 4)
        .map((homologo) => {
          const invSustituto = this.inventarioxAlmacen.get(
            homologo.candidato.toUpperCase()
          );
          return {
            clave: homologo.candidato,
            descripcion: this.getDescripcion(homologo.candidato),
            existenciasAZM: invSustituto?.existenciasAZM ?? 0,
            existenciasAZT: invSustituto?.existenciasAZT ?? 0,
            existenciasAZE: invSustituto?.existenciasAZE ?? 0,
            total:
              (invSustituto?.existenciasAZM ?? 0) +
              (invSustituto?.existenciasAZT ?? 0) +
              (invSustituto?.existenciasAZE ?? 0),
          };
        });

      resultado.push({
        claveOrigen,
        descripcionOrigen: this.getDescripcion(claveOrigen),
        sustitutos,
        existenciasOrigen,
      });
    }

    return resultado;
  }

  private getDescripcion(clave: string): string {
    return this.articulosMapa.get(clave)?.descripcion || `(${clave})`;
  }

  aplicarFiltros(): void {
    let filtered = this.allData();

    // Filtrar por búsqueda
    const query = this.searchQuery().toLowerCase();
    if (query) {
      filtered = filtered.filter(
        (h) =>
          h.claveOrigen.toLowerCase().includes(query) ||
          h.descripcionOrigen.toLowerCase().includes(query)
      );
    }

    this.filteredData.set(filtered);
    this.agruparPorAlmacen();
  }

  private agruparPorAlmacen(): void {
    const almacenes = ['AZM', 'AZT', 'AZE'];
    const resultado: AlmacenCardsData[] = [];

    for (const almacen of almacenes) {
      const almacenKey = almacen as 'AZM' | 'AZT' | 'AZE';
      const homologosDelAlmacen = this.filteredData().filter(
        (h) =>
          h.existenciasOrigen[almacenKey] > 0 ||
          h.sustitutos.some((s) => this.getExistenciasAlmacen(s, almacenKey) > 0)
      );

      if (homologosDelAlmacen.length > 0) {
        resultado.push({
          almacen: almacen,
          almacenNombre: this.getAlmacenNombre(almacen),
          homologos: homologosDelAlmacen,
        });
      }
    }

    this.cardsData.set(resultado);
  }

  private getExistenciasAlmacen(sustituto: HomologoConExistencias, almacen: 'AZM' | 'AZT' | 'AZE'): number {
    switch (almacen) {
      case 'AZM': return sustituto.existenciasAZM;
      case 'AZT': return sustituto.existenciasAZT;
      case 'AZE': return sustituto.existenciasAZE;
      default: return 0;
    }
  }

  private getAlmacenNombre(almacen: string): string {
    switch (almacen) {
      case 'AZM':
        return 'Almacén Mexicali';
      case 'AZT':
        return 'Almacén Tijuana';
      case 'AZE':
        return 'Almacén Ensenada';
      default:
        return almacen;
    }
  }

  onSearchChange(): void {
    this.page.set(1);
    this.aplicarFiltros();
  }

  async exportarExcel(): Promise<void> {
    try {
      const workbook = new ExcelJS.Workbook();

      // Una hoja por almacén
      for (const almacenData of this.cardsData()) {
        const worksheet = workbook.addWorksheet(almacenData.almacen);

        // Encabezados
        worksheet.columns = [
          { header: 'Clave Origen', key: 'claveOrigen', width: 15 },
          { header: 'Descripción Origen', key: 'descripcionOrigen', width: 40 },
          { header: 'Stock AZM', key: 'stockAZM', width: 12 },
          { header: 'Stock AZT', key: 'stockAZT', width: 12 },
          { header: 'Stock AZE', key: 'stockAZE', width: 12 },
          { header: 'Total', key: 'total', width: 12 },
          { header: 'Clave Sustituto', key: 'claveSustituto', width: 15 },
          { header: 'Descripción Sustituto', key: 'descripcionSustituto', width: 40 },
          { header: 'Stock AZM (S)', key: 'stockAZM_S', width: 12 },
          { header: 'Stock AZT (S)', key: 'stockAZT_S', width: 12 },
          { header: 'Stock AZE (S)', key: 'stockAZE_S', width: 12 },
          { header: 'Total (S)', key: 'total_S', width: 12 },
        ];

        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD3D3D3' },
        };

        // Datos
        for (const homologo of almacenData.homologos) {
          if (homologo.sustitutos.length === 0) continue;

          for (let i = 0; i < homologo.sustitutos.length; i++) {
            const sustituto = homologo.sustitutos[i];
            worksheet.addRow({
              claveOrigen: i === 0 ? homologo.claveOrigen : '',
              descripcionOrigen: i === 0 ? homologo.descripcionOrigen : '',
              stockAZM: i === 0 ? homologo.existenciasOrigen.AZM : '',
              stockAZT: i === 0 ? homologo.existenciasOrigen.AZT : '',
              stockAZE: i === 0 ? homologo.existenciasOrigen.AZE : '',
              total: i === 0 ? homologo.existenciasOrigen.total : '',
              claveSustituto: sustituto.clave,
              descripcionSustituto: sustituto.descripcion,
              stockAZM_S: sustituto.existenciasAZM,
              stockAZT_S: sustituto.existenciasAZT,
              stockAZE_S: sustituto.existenciasAZE,
              total_S: sustituto.total,
            });
          }
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const nombreArchivo = ensureExcelExtension(
        `Reporte_Homologos_${new Date().toISOString().slice(0, 10)}`
      );
      descargarArchivo(buffer, nombreArchivo);
    } catch (error) {
      console.error('Error exportando a Excel:', error);
    }
  }

  // Getters para template
  get isLoading(): boolean {
    return this.loading();
  }

  get cardsDataValue(): AlmacenCardsData[] {
    return this.cardsData();
  }

  fmt(n: number): string {
    return (n ?? 0).toLocaleString('es-MX');
  }
}
