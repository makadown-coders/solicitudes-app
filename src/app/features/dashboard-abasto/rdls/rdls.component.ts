// src/app/features/dashboard-abasto/rdls/rdls.component.ts
import { Component, ChangeDetectionStrategy, inject, signal, computed, OnDestroy, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subscription, firstValueFrom, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
// arriba de tu archivo
import * as XLSX from 'xlsx';

import { kitCatalogoBasal } from '../../../data/kit-catalogo-basal';
import { GruposClavesService } from '../../../services/grupo-clases.service';
import { InventarioService } from '../../../services/inventario.service';
import { hospitalesData } from '../../../models/hospitalesData';
import { CPMS } from '../../../models/CPMS';
import { Inventario } from '../../../models/Inventario';
import { Existencias } from '../../../shared/storage-variables';
import { RdlsRow } from '../../../models/rdls/RdlsRow';
import { ArticulosService } from '../../../services/articulos.service';
import { RdlsAlmacenesService } from '../../../services/rdls/rdls-almacenes.service';
import { RdlsNormalizeService } from '../../../services/rdls/rdls-normalize.service';

type ArticuloLite = { clave: string; descripcion: string; presentacion?: string };

@Component({
  selector: 'app-rdls',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rdls.component.html'
})
export class RdlSComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private inventario = inject(InventarioService);

  private artSrv = inject(ArticulosService);
  private gruposSrv = inject(GruposClavesService);
  private norm = inject(RdlsNormalizeService);
  private almSrv = inject(RdlsAlmacenesService);

  // 🔢 Paginación
  pageSize = signal<number>(50);
  page = signal<number>(1);

  totalItems = computed(() => this.filteredRows().length);
  totalPages = computed(() => Math.max(1, Math.ceil(this.totalItems() / this.pageSize())));

  pageSlice = computed(() => {
    const start = (this.page() - 1) * this.pageSize();
    return this.filteredRows().slice(start, start + this.pageSize());
  });

  term = signal<string>('');
  rows = signal<RdlsRow[]>([]);
  filteredRows = computed(() => {
    const q = this.term().trim().toLowerCase();
    if (!q) return this.rows();
    return this.rows().filter(r => r.clave.toLowerCase().includes(q) || r.descripcion.toLowerCase().includes(q));
  });

  // ==== caches reactivos ====
  private articulosMapa = signal<Record<string, { categoria?: string | null }>>({});
  private gruposMapa = signal<Map<string, { categoria: string; grupoInsumo: string }>>(new Map());

  private subs: Subscription[] = [];

  constructor(/* ... */) {
    // 1) Artículos → índice normalizado
    this.artSrv.getArticulosMapaFromLocal?.().subscribe((m: any) => {
      const idx: Record<string, { categoria?: string | null }> = {};
      for (const [k, v] of Object.entries(m ?? {})) {
        idx[this.norm.normClave(k)] = v as any;
      }
      this.articulosMapa.set(idx);
    });

    // 2) Grupos → índice normalizado
    this.gruposSrv.load().subscribe(mp => {
      const flat = new Map<string, { categoria: string; grupoInsumo: string }>();
      for (const [k, v] of mp.entries()) {
        flat.set(this.norm.normClave(k), { categoria: v.categoria, grupoInsumo: v.grupoInsumo });
      }
      this.gruposMapa.set(flat);
    });
    // cuando cambia filtro, vuelve a pág 1 (si ya lo traías)
    effect(() => {
      this.term(); this.page.set(1);
    });

    effect(() => {
      // si cambian los datos/filtrado y la página se sale de rango, te regresa al final válido
      const tp = this.totalPages();
      if (this.page() > tp) this.page.set(tp);
      if (this.page() < 1) this.page.set(1);
    });
  }

  async ngOnInit() {
    await this.initRows();
    this.hydrateConCpms();
    this.hydrateConExistenciasHospitales();
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
  }

  private async initRows() {
    let articulos: ArticuloLite[] = [];
    try {
      articulos = await firstValueFrom(
        this.http.get<ArticuloLite[]>('/articulos.json').pipe(catchError(() => of([])))
      );
    } catch { /* ignore */ }

    const descMap = new Map<string, string>(articulos.map(a => [a.clave?.trim() ?? '', a.descripcion ?? '']));

    const base: RdlsRow[] = kitCatalogoBasal.map((clave, idx) => {
      const descripcion = descMap.get(clave) || '';
      return {
        no: idx + 1,
        clave,
        descripcion,
        tipo: '',
        grupo_terapeutico: '',
        piezas: 1,

        AZM: 0, AZE: 0, AZT: 0,
        totalAlmacenes: 0,

        HGTK: 0, HMIT: 0, HGTZOE: 0, HGT: 0, HGPR: 0,
        HGM: 0, HMIM: 0, UNEME: 0, HGSF: 0, HGE: 0,
        totalHospitales: 0,

        CPM_HGTK: 0, CPM_HMIT: 0, CPM_HGTZOE: 0, CPM_HGT: 0, CPM_HGPR: 0,
        CPM_HGM: 0, CPM_HMIM: 0, CPM_UNEME: 0, CPM_HGSF: 0, CPM_HGE: 0,
        TOTAL_CPM_TIJUANA: 0,
        TOTAL_CPM_MEXICALI: 0,
        TOTAL_CPM_ENSENADA: 0,
      };
    });

    this.rows.set(base);
    this.page.set(1);
  }

  private hydrateConCpms() {
    const sub = this.inventario.cpms$.subscribe((cpms: CPMS[]) => {
      if (!Array.isArray(cpms) || !cpms.length) return;
      const mapClaveClues = new Map<string, number>(); // `${clave}|${cluesimb}` -> cantidad
      for (const c of cpms) {
        const key = `${(c.clave ?? '').trim()}|${(c.cluesimb ?? '').trim()}`;
        mapClaveClues.set(key, (mapClaveClues.get(key) || 0) + (c.cantidad ?? 0));
      }
      const cluesMap = new Map<string, string>(); // "HGTK" -> cluesimb
      for (const h of hospitalesData) cluesMap.set(h.key, h.cluesimb);

      const rows = this.rows().slice();
      for (const r of rows) {
        const clave = (r.clave ?? '').trim();
        // TIJUANA set
        r.CPM_HGTK = mapClaveClues.get(`${clave}|${cluesMap.get('HGTKT')}`) ?? 0; // Tecate (HGTK → HGTKT)
        r.CPM_HMIT = mapClaveClues.get(`${clave}|${cluesMap.get('HMITIJ')}`) ?? 0;
        r.CPM_HGTZOE = mapClaveClues.get(`${clave}|${cluesMap.get('HGTZE')}`) ?? 0;
        r.CPM_HGT = mapClaveClues.get(`${clave}|${cluesMap.get('HGTIJ')}`) ?? 0;
        r.CPM_HGPR = mapClaveClues.get(`${clave}|${cluesMap.get('HGPR')}`) ?? 0;
        r.TOTAL_CPM_TIJUANA = r.CPM_HGTK + r.CPM_HMIT + r.CPM_HGTZOE + r.CPM_HGT + r.CPM_HGPR;

        // MEXICALI set
        r.CPM_HGM = mapClaveClues.get(`${clave}|${cluesMap.get('HGMXL')}`) ?? 0;
        r.CPM_HMIM = mapClaveClues.get(`${clave}|${cluesMap.get('HMIMXL')}`) ?? 0;
        r.CPM_UNEME = mapClaveClues.get(`${clave}|${cluesMap.get('UOMXL')}`) ?? 0;
        r.CPM_HGSF = mapClaveClues.get(`${clave}|${cluesMap.get('HGSF')}`) ?? 0;      // si no existe, queda 0
        r.TOTAL_CPM_MEXICALI = r.CPM_HGM + r.CPM_HMIM + r.CPM_UNEME + r.CPM_HGSF;

        // ENSENADA set
        r.CPM_HGE = mapClaveClues.get(`${clave}|${cluesMap.get('HGENS')}`) ?? 0;
        r.TOTAL_CPM_ENSENADA = r.CPM_HGE;
      }
      this.rows.set(rows);
    });
    this.subs.push(sub);
  }

  private hydrateConExistenciasHospitales() {

    const applyForHospital = (key: Existencias, assign: (r: RdlsRow, val: number) => void) => {
      const sub = (this.inventario.existencias$.get(key)!).subscribe((items: Inventario[]) => {
        if (!Array.isArray(items)) return;
        const idx = new Map<string, number>(); // clave normalizada → total disponible
        for (const it of items) {
          const k = this.inventario.normalizarClave(it.clave);
          const disp = Number(it.disponible ?? 0);
          idx.set(k, (idx.get(k) || 0) + disp);
        }
        const rows = this.rows().slice();
        for (const r of rows) {
          const keyNorm = this.inventario.normalizarClave(r.clave);
          const val = idx.get(keyNorm) ?? 0;
          assign(r, val);
          r.totalHospitales = r.HGTK + r.HMIT + r.HGTZOE + r.HGT + r.HGPR + r.HGM + r.HMIM + r.UNEME + r.HGSF + r.HGE;
        }
        this.rows.set(rows);
      });
      this.subs.push(sub);
    };

    applyForHospital(Existencias.HGTKT, (r, v) => r.HGTK = v);
    applyForHospital(Existencias.HMITIJ, (r, v) => r.HMIT = v);
    applyForHospital(Existencias.HGTZE, (r, v) => r.HGTZOE = v);
    applyForHospital(Existencias.HGTIJ, (r, v) => r.HGT = v);
    applyForHospital(Existencias.HGPR, (r, v) => r.HGPR = v);
    applyForHospital(Existencias.HGMXL, (r, v) => r.HGM = v);
    applyForHospital(Existencias.HMIMXL, (r, v) => r.HMIM = v);
    applyForHospital(Existencias.UOMXL, (r, v) => r.UNEME = v);
    applyForHospital(Existencias.HGENS, (r, v) => r.HGE = v);
    // TODO:
    // applyForHospital(Existencias.HGSF, (r, v) => r.HGSF = v);

    this.applyTipoYGrupo();
    this.almSrv.existenciasAlmacenesByClave$.subscribe(map => {
      this.applyAlmacenesBuckets(map);
    });
  }

  // al final de la clase RdlSComponent (o donde gustes)
  trackClave(index: number, r: { clave?: string; no?: number }): string {
    // usa clave si existe; si hay claves duplicadas, cae al # consecutivo
    return (r?.clave && r.clave.trim()) ? r.clave.trim() : String(r?.no ?? index);
  }

  // ✅ si ya tienes applyFilter(), solo añade el reset a la página 1 al final:
  applyFilter() {
    this.page.set(1); // <-- reset
  }

  // 🔘 Controles
  goTo(p: number) { this.page.set(Math.min(Math.max(1, p), this.totalPages())); }
  nextPage() { if (this.page() < this.totalPages()) this.page.update(v => v + 1); }
  prevPage() { if (this.page() > 1) this.page.update(v => v - 1); }
  jump(delta: number) { this.goTo(this.page() + delta); }

  // === aplica TIPO/GRUPO con los servicios (sin helpers sueltos) ===
  private applyTipoYGrupo() {
    const rows = this.rows().slice();
    const grupos = this.gruposMapa();
    const arts = this.articulosMapa();

    for (const r of rows) {
      const clave = this.norm.normClave(r.clave);
      /* if (clave==='010.000.0247.02') {
         console.log('debug test 010.000.0247.02');
       }*/
      const g = grupos.get(clave);
      const art = arts[clave];
      /* if (clave==='010.000.0247.02') {
         console.log('grupos ', g);
         console.log('art ', art);
       }*/

      const cat = g?.categoria ?? art?.categoria ?? null;
      /* if (clave==='010.000.0247.02') {
         console.log('cat ', cat);
       }*/

      r.tipo = this.norm.normalizeCategoria(cat);
      /* if (clave==='010.000.0247.02') {
         console.log('r.tipo ', r.tipo);
       }*/

      r.grupo_terapeutico = g?.grupoInsumo ?? ''; // this.norm.grupoTerapeutico(cat, g?.grupoInsumo ?? null);
      /*if (clave==='010.000.0247.02') {
        console.log('r.grupo_terapeutico ', r.grupo_terapeutico);
      }*/
    }
    this.rows.set(rows);
  }

  // === aplica AZM/AZE/AZT desde el Map<clave, {AZM, AZE, AZT}> ===
  private applyAlmacenesBuckets(map: Map<string, { AZM: number; AZE: number; AZT: number }>) {
    const rows = this.rows().slice();
    for (const r of rows) {
      const clave = this.norm.normClave(r.clave);
      const b = map.get(clave);
      r.AZM = b?.AZM ?? 0;
      r.AZE = b?.AZE ?? 0;
      r.AZT = b?.AZT ?? 0;
      r.totalAlmacenes = (r.AZM || 0) + (r.AZE || 0) + (r.AZT || 0);
    }
    this.rows.set(rows);
  }

  exportarExcelRdlS(todo: boolean = true) {
    // 1) filas a exportar (todo lo filtrado o solo la página)
    const rows = todo ? this.filteredRows() : this.pageSlice();

    // 2) columnas en el orden deseado
    const headers = [
      'NO.', 'CLAVE', 'DESCRIPCIÓN', 'TIPO', 'GRUPO TERAPEUTICO', 'PIEZAS',
      'AZM', 'AZE', 'AZT', 'TOTAL ALMACENES',
      'HGTK', 'HMIT', 'HGTZOE', 'HGT', 'HGPR', 'HGM', 'HMIM', 'UNEME', 'HGSF', 'HGE', 'TOTAL HOSPITALES',
      'CPM HGTK', 'CPM HMIT', 'CPM HGTZOE', 'CPM HGT', 'CPM HGPR', 'TOTAL CPM TIJUANA',
      'CPM HGM', 'CPM HMIM', 'CPM UNEME', 'CPM HGSF', 'TOTAL CPM MEXICALI',
      'CPM HGE', 'TOTAL CPM ENSENADA',
    ] as const;

    // 3) mapeo de tus filas a salida XLSX
    const data = rows.map(r => ({
      'NO.': r.no ?? null,
      'CLAVE': r.clave ?? '',
      'DESCRIPCIÓN': r.descripcion ?? '',
      'TIPO': r.tipo ?? '',
      'GRUPO TERAPEUTICO': r.grupo_terapeutico ?? '',
      'PIEZAS': r.piezas ?? 1,

      'AZM': r.AZM ?? 0,
      'AZE': r.AZE ?? 0,
      'AZT': r.AZT ?? 0,
      'TOTAL ALMACENES': r.totalAlmacenes ?? ((r.AZM || 0) + (r.AZE || 0) + (r.AZT || 0)),

      'HGTK': r.HGTK ?? 0,
      'HMIT': r.HMIT ?? 0,
      'HGTZOE': r.HGTZOE ?? 0,
      'HGT': r.HGT ?? 0,
      'HGPR': r.HGPR ?? 0,
      'HGM': r.HGM ?? 0,
      'HMIM': r.HMIM ?? 0,
      'UNEME': r.UNEME ?? 0,
      'HGSF': r.HGSF ?? 0,
      'HGE': r.HGE ?? 0,
      'TOTAL HOSPITALES': r.totalHospitales ?? (
        (r.HGTK || 0) + (r.HMIT || 0) + (r.HGTZOE || 0) + (r.HGT || 0) + (r.HGPR || 0) +
        (r.HGM || 0) + (r.HMIM || 0) + (r.UNEME || 0) + (r.HGSF || 0) + (r.HGE || 0)
      ),

      'CPM HGTK': r.CPM_HGTK ?? 0,
      'CPM HMIT': r.CPM_HMIT ?? 0,
      'CPM HGTZOE': r.CPM_HGTZOE ?? 0,
      'CPM HGT': r.CPM_HGT ?? 0,
      'CPM HGPR': r.CPM_HGPR ?? 0,
      'TOTAL CPM TIJUANA': r.TOTAL_CPM_TIJUANA ?? (
        (r.CPM_HGTK || 0) + (r.CPM_HMIT || 0) + (r.CPM_HGTZOE || 0) + (r.CPM_HGT || 0) + (r.CPM_HGPR || 0)
      ),

      'CPM HGM': r.CPM_HGM ?? 0,
      'CPM HMIM': r.CPM_HMIM ?? 0,
      'CPM UNEME': r.CPM_UNEME ?? 0,
      'CPM HGSF': r.CPM_HGSF ?? 0,
      'TOTAL CPM MEXICALI': r.TOTAL_CPM_MEXICALI ?? (
        (r.CPM_HGM || 0) + (r.CPM_HMIM || 0) + (r.CPM_UNEME || 0) + (r.CPM_HGSF || 0)
      ),

      'CPM HGE': r.CPM_HGE ?? 0,
      'TOTAL CPM ENSENADA': r.TOTAL_CPM_ENSENADA ?? (r.CPM_HGE || 0),
    }));

    // 4) hoja
    const ws = XLSX.utils.json_to_sheet(data, { header: [...headers] as any });

    // 5) anchos, autofiltro y congelar encabezado
    ws['!cols'] = [
      { wch: 6 },   // NO.
      { wch: 16 },  // CLAVE
      { wch: 60 },  // DESCRIPCIÓN
      { wch: 22 },  // TIPO
      { wch: 24 },  // GRUPO
      { wch: 8 },   // PIEZAS
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, // AZM..TOTAL ALMACENES
      { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
      { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, // hospitales
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, // CPM TIJ
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 18 },              // CPM MXL
      { wch: 12 }, { wch: 18 }                                                      // CPM ENS
    ];
    // congelar encabezado
    (ws as any)['!freeze'] = { xSplit: 0, ySplit: 1 };
    // autofiltro sobre todo el rango con datos
    const range = XLSX.utils.decode_range(ws['!ref']!);
    ws['!autofilter'] = { ref: XLSX.utils.encode_range(range) };

    // 6) libro y guardar
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'RdlS');

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const filename = `RdlS_Distribucion_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.xlsx`;

    XLSX.writeFile(wb, filename, { bookType: 'xlsx' });
  }

}
