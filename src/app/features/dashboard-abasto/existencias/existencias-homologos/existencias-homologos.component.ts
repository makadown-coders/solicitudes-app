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
import { Subject, takeUntil, firstValueFrom } from 'rxjs';
import { Inventario, InventarioDisponibles } from '../../../../models/Inventario';
import { HomologosService } from '../../../../services/homologos.service';
import { ArticulosService } from '../../../../services/articulos.service';
import { InventarioService } from '../../../../services/inventario.service';
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

  private homologosService = inject(HomologosService);
  private articulosService = inject(ArticulosService);
  private inventarioService = inject(InventarioService);

  private loading = signal(false);
  private allData = signal<HomologoResumen[]>([]);
  private filteredData = signal<HomologoResumen[]>([]);

  searchQuery = signal('');
  page = signal(1);
  pageSize = signal(10);

  private articulosMapa = new Map<string, { descripcion: string; presentacion?: string }>();
  private inventarioxAlmacen = new Map<string, InventarioDisponibles>();

  private onDestroy$ = new Subject<void>();

  constructor(activatedRoute: ActivatedRoute) {
    if (activatedRoute.snapshot.url[0]?.path === 'homologos') {
      this.inventarioService.existencias$.forEach((value, key) => {
        value.pipe(takeUntil(this.onDestroy$)).subscribe({
          next: (data: Inventario[]) => {
            this.existenciaUnidades.set(key, data as Inventario[]);
          },
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
    try {
      this.loading.set(true);

      const mapa = await firstValueFrom(this.articulosService.getArticulosMapa());
      this.articulosMapa = new Map(Object.entries(mapa));

      const inventario = await firstValueFrom(
        this.inventarioService.inventario$.pipe(takeUntil(this.onDestroy$))
      );
      this.construirInventarioDisponible(inventario);

      const todasLasClaves = this.obtenerTodasLasClaves();
      if (todasLasClaves.length === 0) {
        this.loading.set(false);
        return;
      }

      const mapHomologos = await this.obtenerHomologosEnLotes(todasLasClaves);
      const homologosConExistencias = this.construirHomologosConExistencias(mapHomologos);

      this.allData.set(homologosConExistencias);
      this.aplicarFiltros();
    } catch (error) {
      console.error('Error cargando datos de homologos:', error);
    } finally {
      this.loading.set(false);
    }
  }

  private obtenerTodasLasClaves(): string[] {
    return Array.from(new Set(Array.from(this.articulosMapa.keys()).map((c) => c.trim().toUpperCase())));
  }

  private async obtenerHomologosEnLotes(claves: string[]): Promise<Map<string, HomologoDTO[]>> {
    const batchSize = 500;
    const resultado = new Map<string, HomologoDTO[]>();

    for (let i = 0; i < claves.length; i += batchSize) {
      const lote = claves.slice(i, i + batchSize);
      const parcial = await firstValueFrom(this.homologosService.batch(lote));
      for (const [clave, homologos] of parcial) {
        resultado.set(clave, homologos);
      }
    }

    return resultado;
  }

  private construirInventarioDisponible(inventario: Inventario[]): void {
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
      const almacenNorm = (inv.almacen || '').toLowerCase();
      const neto = (inv.disponible || 0) - (inv.comprometidos || 0);

      if (
        almacenNorm.includes('almacen estatal zona mexicali') ||
        almacenNorm.includes('almacen zona mexicali')
      ) {
        item.existenciasAZM += neto;
      } else if (almacenNorm.includes('almacen zona ensenada')) {
        item.existenciasAZE += neto;
      } else if (almacenNorm.includes('almacen zona tijuana')) {
        item.existenciasAZT += neto;
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

      const sustitutos: HomologoConExistencias[] = homologosDto.map((homologo) => {
        const invSustituto = this.inventarioxAlmacen.get(homologo.candidato.toUpperCase());
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

    return resultado.sort((a, b) => a.claveOrigen.localeCompare(b.claveOrigen));
  }

  private getDescripcion(clave: string): string {
    return this.articulosMapa.get(clave)?.descripcion || `(${clave})`;
  }

  aplicarFiltros(): void {
    let filtered = this.allData();

    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      filtered = filtered.filter(
        (h) =>
          h.claveOrigen.toLowerCase().includes(query) ||
          h.descripcionOrigen.toLowerCase().includes(query) ||
          h.sustitutos.some(
            (s) =>
              s.clave.toLowerCase().includes(query) || s.descripcion.toLowerCase().includes(query)
          )
      );
    }

    this.filteredData.set(filtered);
  }

  onSearchChange(value: string): void {
    this.searchQuery.set(value ?? '');
    this.page.set(1);
    this.aplicarFiltros();
  }

  async exportarExcel(): Promise<void> {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Homologos');

      worksheet.columns = [
        { header: 'Clave Origen', key: 'claveOrigen', width: 15 },
        { header: 'Descripcion Origen', key: 'descripcionOrigen', width: 40 },
        { header: 'Stock AZM', key: 'stockAZM', width: 12 },
        { header: 'Stock AZT', key: 'stockAZT', width: 12 },
        { header: 'Stock AZE', key: 'stockAZE', width: 12 },
        { header: 'Total', key: 'total', width: 12 },
        { header: 'Clave Sustituto', key: 'claveSustituto', width: 15 },
        { header: 'Descripcion Sustituto', key: 'descripcionSustituto', width: 40 },
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

      for (const homologo of this.filteredData()) {
        if (homologo.sustitutos.length === 0) {
          worksheet.addRow({
            claveOrigen: homologo.claveOrigen,
            descripcionOrigen: homologo.descripcionOrigen,
            stockAZM: homologo.existenciasOrigen.AZM,
            stockAZT: homologo.existenciasOrigen.AZT,
            stockAZE: homologo.existenciasOrigen.AZE,
            total: homologo.existenciasOrigen.total,
            claveSustituto: '',
            descripcionSustituto: 'Sin sustitutos registrados',
            stockAZM_S: 0,
            stockAZT_S: 0,
            stockAZE_S: 0,
            total_S: 0,
          });
          continue;
        }

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

      const buffer = await workbook.xlsx.writeBuffer();
      const nombreArchivo = ensureExcelExtension(
        `Reporte_Homologos_${new Date().toISOString().slice(0, 10)}`
      );
      descargarArchivo(buffer, nombreArchivo);
    } catch (error) {
      console.error('Error exportando a Excel:', error);
    }
  }

  get isLoading(): boolean {
    return this.loading();
  }

  get homologosFiltrados(): HomologoResumen[] {
    return this.filteredData();
  }

  fmt(n: number): string {
    return (n ?? 0).toLocaleString('es-MX');
  }
}
