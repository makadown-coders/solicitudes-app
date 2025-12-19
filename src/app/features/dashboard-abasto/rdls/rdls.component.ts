// src/app/features/dashboard-abasto/rdls/rdls.component.ts
import { Component, ChangeDetectionStrategy, inject, signal, computed, OnDestroy, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
import { BalanceoService } from '../../../services/balanceo.service';
import { KitsService } from '../../../services/kits.service';
import { AbstractTabComponent } from '../../../shared/abstract-tab.component';

// Subconjunto de RdlsRow sólo para campos CPM
type CpmsBuckets = Pick<RdlsRow,
  | 'CPM_HGTK' | 'CPM_HMIT' | 'CPM_HGTZOE' | 'CPM_HGT' | 'CPM_HGPR'
  | 'CPM_HGM' | 'CPM_HMIM' | 'CPM_UNEME' | 'CPM_HGSF'
  | 'CPM_HGE'
  | 'TOTAL_CPM_TIJUANA'
  | 'TOTAL_CPM_MEXICALI'
  | 'TOTAL_CPM_ENSENADA'
>;

@Component({
  selector: 'app-rdls',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rdls.component.html'
})
export class RdlSComponent extends AbstractTabComponent implements OnInit, OnDestroy {
  mostradoPorPrimeraVez = false;

  private inventario = inject(InventarioService);

  private artSrv = inject(ArticulosService);
  private gruposSrv = inject(GruposClavesService);
  private norm = inject(RdlsNormalizeService);
  private almSrv = inject(RdlsAlmacenesService);

  private balanceoService = inject(BalanceoService);
  private kitsService = inject(KitsService);


  // === Ruta de la Salud (kits) ===
  kitRutaSaludElegido = signal<string>('ALL');             // 'ALL' | código de kit
  kitsRuta = signal<string[]>([]);                     // lista de códigos de kit
  loadingKitsRuta = signal<boolean>(false);
  clavesRutasSalud = signal<Set<string> | null>(null); // claves CNIS pertenecientes al kit seleccionado

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
    const term = this.term().trim().toLowerCase();
    const kitSel = this.kitRutaSaludElegido();
    const setRutas = this.clavesRutasSalud();

    // 1) Partimos SIEMPRE de todas las rows “crudas”
    let rowsList = this.rows();

    // 2) Si hay kit seleccionado (ALL o uno específico) + set de claves de RdlS,
    //    construimos el universo: (rows que pertenecen al kit) U (filas vacías faltantes)
    if (kitSel && setRutas && setRutas.size > 0) {
      const mapPorClave = new Map<string, RdlsRow>();

      // 2.1 metemos todas las filas existentes cuya clave esté en el kit
      for (const r of rowsList) {
        const claveNorm = this.norm.normClave(r.clave);
        if (setRutas.has(claveNorm)) {
          mapPorClave.set(claveNorm, r);
        }
      }

      // 2.2 para cada clave del kit que falte, añadimos fila vacía
      for (const claveRuta of setRutas) {
        if (!mapPorClave.has(claveRuta)) {
          mapPorClave.set(claveRuta, this.crearFilaVaciaParaClave(claveRuta));
        }
      }

      rowsList = Array.from(mapPorClave.values());
    }

    // 3) Filtro por texto (clave / descripción) sobre el universo ya definido
    if (term) {
      rowsList = rowsList.filter(r =>
        (r.clave ?? '').toLowerCase().includes(term) ||
        (r.descripcion ?? '').toLowerCase().includes(term)
      );
    }

    // 4) Orden y reenumeración del NO.
    rowsList = rowsList
      .sort((a, b) => (a.clave ?? '').localeCompare(b.clave ?? ''))
      .map((r, idx) => ({ ...r, no: idx + 1 }));

    return rowsList;
  });

  // ==== caches reactivos ====
  private articulosMapa = signal<Record<string, { categoria?: string | null }>>({});
  private gruposMapa = signal<Map<string, { categoria: string; grupoInsumo: string }>>(new Map());

  private subs: Subscription[] = [];

  constructor() {
    super();
    this.constructorDeTab();
  }

  constructorDeTab(): void {
    // 1) Artículos → índice normalizado
    this.artSrv.getArticulosMapa?.().subscribe((m: any) => {
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
      this.term();
      this.kitRutaSaludElegido();
      this.page.set(1);
    });

    effect(() => {
      // si cambian los datos/filtrado y la página se sale de rango, te regresa al final válido
      const tp = this.totalPages();
      if (this.page() > tp) this.page.set(tp);
      if (this.page() < 1) this.page.set(1);
    });
  }

  async ngOnInit() {
    // movido hacia onTabActivated para evitar cargas innecesarias
    if (this.mostradoPorPrimeraVez === false && this.isActive) {
      this.onTabActivated();
    }
    /* await this.initRows();
    this.hydrateConCpms();
    this.hydrateConExistenciasHospitales();
    this.cargarKitsRutaSalud(); */
  }

  private cargarKitsRutaSalud(): void {
    this.loadingKitsRuta.set(true);

    this.kitsService.list().subscribe({
      next: (resp: any[]) => {
        const list = (resp ?? []).map(k => k.codigo as string);
        this.kitsRuta.set(list.sort());
        this.loadingKitsRuta.set(false);
      },
      error: (err) => {
        console.error('Error obteniendo kits Ruta de la Salud', err);
        // Fallback simple para no romper la UI
        this.kitsRuta.set([]);
        this.loadingKitsRuta.set(false);
      },
    });
  }

  onKitRutaChange(value: string) {
    this.kitRutaSaludElegido.set(value);

    // value === 'ALL' => todas las claves de todos los kits
    const kitParam = value === 'ALL' ? undefined : value;

    this.balanceoService.obtenerClavesRutasSalud(kitParam).subscribe({
      next: (resp) => {
        const set = new Set<string>(
          (resp.claves ?? []).map((c: string) => this.norm.normClave(c))
        );
        this.clavesRutasSalud.set(set);
      },
      error: (err) => {
        console.error('Error cargando claves de Rutas de la Salud', err);
        this.clavesRutasSalud.set(null);
      },
    });
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
  }

  private async initRows() {
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

    // TODO: Refactor aqui con catalogo de kits
    const base: RdlsRow[] = kitCatalogoBasal.map((clave, idx) => {
      const articulo = articulosMapa[clave];
      const descripcion = articulo?.descripcion || '';

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

      // 1) Mapa bruto clave|cluesimb -> cantidad
      const mapClaveClues = new Map<string, number>(); // `${clave}|${cluesimb}` -> cantidad
      for (const c of cpms) {
        const claveRaw = (c.clave ?? '').trim();
        const cluesRaw = (c.cluesimb ?? '').trim();
        if (!claveRaw || !cluesRaw) continue;

        const key = `${claveRaw}|${cluesRaw}`;
        mapClaveClues.set(key, (mapClaveClues.get(key) || 0) + (c.cantidad ?? 0));
      }

      // 2) Mapa de "HGTK" -> cluesimb, etc., igual que antes
      const cluesMap = new Map<string, string>();
      for (const h of hospitalesData) {
        cluesMap.set(h.key, h.cluesimb);
      }

      // 3) Construimos cpmsBucketsPorClave desde cero
      this.cpmsBucketsPorClave = new Map<string, CpmsBuckets>();

      const clavesSet = new Set<string>();
      for (const c of cpms) {
        const claveRaw = (c.clave ?? '').trim();
        if (claveRaw) clavesSet.add(claveRaw);
      }

      for (const claveRaw of clavesSet) {
        const clave = claveRaw.trim();

        const cpm_hgtk = mapClaveClues.get(`${clave}|${cluesMap.get('HGTKT')}`) ?? 0; // Tecate
        const cpm_hmit = mapClaveClues.get(`${clave}|${cluesMap.get('HMITIJ')}`) ?? 0;
        const cpm_hgtzoe = mapClaveClues.get(`${clave}|${cluesMap.get('HGTZE')}`) ?? 0;
        const cpm_hgt = mapClaveClues.get(`${clave}|${cluesMap.get('HGTIJ')}`) ?? 0;
        const cpm_hgpr = mapClaveClues.get(`${clave}|${cluesMap.get('HGPR')}`) ?? 0;

        const cpm_hgm = mapClaveClues.get(`${clave}|${cluesMap.get('HGMXL')}`) ?? 0;
        const cpm_hmim = mapClaveClues.get(`${clave}|${cluesMap.get('HMIMXL')}`) ?? 0;
        const cpm_uneme = mapClaveClues.get(`${clave}|${cluesMap.get('UOMXL')}`) ?? 0;
        const cpm_hgsf = mapClaveClues.get(`${clave}|${cluesMap.get('HGSF')}`) ?? 0;

        const cpm_hge = mapClaveClues.get(`${clave}|${cluesMap.get('HGENS')}`) ?? 0;

        const TOTAL_CPM_TIJUANA = cpm_hgtk + cpm_hmit + cpm_hgtzoe + cpm_hgt + cpm_hgpr;
        const TOTAL_CPM_MEXICALI = cpm_hgm + cpm_hmim + cpm_uneme + cpm_hgsf;
        const TOTAL_CPM_ENSENADA = cpm_hge;

        const normClave = this.norm.normClave(clave);

        this.cpmsBucketsPorClave.set(normClave, {
          CPM_HGTK: cpm_hgtk,
          CPM_HMIT: cpm_hmit,
          CPM_HGTZOE: cpm_hgtzoe,
          CPM_HGT: cpm_hgt,
          CPM_HGPR: cpm_hgpr,
          CPM_HGM: cpm_hgm,
          CPM_HMIM: cpm_hmim,
          CPM_UNEME: cpm_uneme,
          CPM_HGSF: cpm_hgsf,
          CPM_HGE: cpm_hge,
          TOTAL_CPM_TIJUANA,
          TOTAL_CPM_MEXICALI,
          TOTAL_CPM_ENSENADA,
        });
      }

      // 4) Hidratar las filas base (this.rows) con esos buckets
      const rows = this.rows().slice();
      for (const r of rows) {
        const claveNorm = this.norm.normClave(r.clave);
        const buckets = this.cpmsBucketsPorClave.get(claveNorm) ?? this.getEmptyCpmsBuckets();

        r.CPM_HGTK = buckets.CPM_HGTK;
        r.CPM_HMIT = buckets.CPM_HMIT;
        r.CPM_HGTZOE = buckets.CPM_HGTZOE;
        r.CPM_HGT = buckets.CPM_HGT;
        r.CPM_HGPR = buckets.CPM_HGPR;

        r.CPM_HGM = buckets.CPM_HGM;
        r.CPM_HMIM = buckets.CPM_HMIM;
        r.CPM_UNEME = buckets.CPM_UNEME;
        r.CPM_HGSF = buckets.CPM_HGSF;

        r.CPM_HGE = buckets.CPM_HGE;

        r.TOTAL_CPM_TIJUANA = buckets.TOTAL_CPM_TIJUANA;
        r.TOTAL_CPM_MEXICALI = buckets.TOTAL_CPM_MEXICALI;
        r.TOTAL_CPM_ENSENADA = buckets.TOTAL_CPM_ENSENADA;
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
          r.totalHospitales = r.HGTK + r.HMIT + r.HGTZOE + r.HGT + r.HGPR + r.HGM + r.HMIM + r.UNEME + r.HGSF + r.HGE + r.HGSF;
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
    applyForHospital(Existencias.HGSF, (r, v) => r.HGSF = v);

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

  async exportarExcelRdlS(todo: boolean = true) {
    // 1) filas a exportar (todo lo filtrado o solo la página)
    const rows = todo ? this.filteredRows() : this.pageSlice();

    // 🔑 universo de claves a exportar (normalizadas)
    const clavesExportNorm = new Set(
      rows
        .map(r => this.inventario.normalizarClave(r.clave ?? ''))
        .filter(c => !!c)
    );

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

    // 7) Crear ciclo para crear una hoja por cada hospital
    for (const existencia of Object.values(Existencias)) {
      const itemsAll = await firstValueFrom(this.inventario.existencias$.get(existencia)!);

      if (!Array.isArray(itemsAll) || !itemsAll.length) continue;

      // 🔍 filtramos sólo las claves del universo exportado
      const items = itemsAll.filter(item =>
        clavesExportNorm.has(this.inventario.normalizarClave(item.clave ?? ''))
      );

      if (!items.length) continue; // si ninguna clave coincide con el kit/filtro, no creamos hoja

      const hospitalData = hospitalesData.find(h => h.key === existencia);
      const nombreHospital = hospitalData ? hospitalData.nombre : existencia;

      const itemsWithHospital = items.map(item => ({
        'nombre_hospital': nombreHospital,
        'CLAVE': item.clave,
        'CANTIDAD': item.disponible,
        'LOTE': item.lote,
        'F_CAD': item.caducidad,
        'FTE': item.fuente
      }));

      const item_headers = ['nombre_hospital', 'CLAVE', 'CANTIDAD', 'LOTE', 'F_CAD', 'FTE'];

      const wsHosp = XLSX.utils.json_to_sheet(
        itemsWithHospital,
        { header: [...item_headers] as any }
      );

      XLSX.utils.book_append_sheet(wb, wsHosp, hospitalData?.cluesimb || existencia);
    }

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    // incluir el kit elegido (codigo)
    const filename = `RdlS_Distribucion_${this.kitRutaSaludElegido()}_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.xlsx`;

    XLSX.writeFile(wb, filename, { bookType: 'xlsx' });
  }

  private crearFilaVaciaParaClave(claveNorm: string): RdlsRow {
    const arts = this.articulosMapa();
    const grupos = this.gruposMapa();

    const artRaw = arts[claveNorm] as any | undefined;
    const g = grupos.get(claveNorm);

    const descripcion: string = artRaw?.descripcion ?? '';
    const cat: string | null = g?.categoria ?? artRaw?.categoria ?? null;

    const tipo = this.norm.normalizeCategoria(cat);
    const grupo = g?.grupoInsumo ?? '';

    // 👇 aquí reusamos la lógica del hydrateConCpms
    const buckets = this.cpmsBucketsPorClave.get(claveNorm) ?? this.getEmptyCpmsBuckets();

    return {
      no: 0, // se reenumera después en el computed
      clave: claveNorm,   // ya viene normalizada
      descripcion,
      tipo,
      grupo_terapeutico: grupo,
      piezas: 1,          // igual que en initRows, “pieza basal”

      AZM: 0, AZE: 0, AZT: 0,
      totalAlmacenes: 0,

      HGTK: 0, HMIT: 0, HGTZOE: 0, HGT: 0, HGPR: 0,
      HGM: 0, HMIM: 0, UNEME: 0, HGSF: 0, HGE: 0,
      totalHospitales: 0,

      // 👇 inyectamos CPMs calculados
      CPM_HGTK: buckets.CPM_HGTK,
      CPM_HMIT: buckets.CPM_HMIT,
      CPM_HGTZOE: buckets.CPM_HGTZOE,
      CPM_HGT: buckets.CPM_HGT,
      CPM_HGPR: buckets.CPM_HGPR,

      CPM_HGM: buckets.CPM_HGM,
      CPM_HMIM: buckets.CPM_HMIM,
      CPM_UNEME: buckets.CPM_UNEME,
      CPM_HGSF: buckets.CPM_HGSF,

      CPM_HGE: buckets.CPM_HGE,

      TOTAL_CPM_TIJUANA: buckets.TOTAL_CPM_TIJUANA,
      TOTAL_CPM_MEXICALI: buckets.TOTAL_CPM_MEXICALI,
      TOTAL_CPM_ENSENADA: buckets.TOTAL_CPM_ENSENADA,
    };
  }

  // Mapa global: clave normalizada -> buckets CPM
  private cpmsBucketsPorClave = new Map<string, CpmsBuckets>();

  private getEmptyCpmsBuckets(): CpmsBuckets {
    return {
      CPM_HGTK: 0,
      CPM_HMIT: 0,
      CPM_HGTZOE: 0,
      CPM_HGT: 0,
      CPM_HGPR: 0,
      CPM_HGM: 0,
      CPM_HMIM: 0,
      CPM_UNEME: 0,
      CPM_HGSF: 0,
      CPM_HGE: 0,
      TOTAL_CPM_TIJUANA: 0,
      TOTAL_CPM_MEXICALI: 0,
      TOTAL_CPM_ENSENADA: 0,
    };
  }

  protected override async onTabActivated(): Promise<void> {
    if (this.mostradoPorPrimeraVez === false) {
      await this.initRows();
      this.hydrateConCpms();
      this.hydrateConExistenciasHospitales();
      this.cargarKitsRutaSalud();
      this.mostradoPorPrimeraVez = true;
    }
  }

  protected override onTabDeactivated(): void {
    // No action needed
  }

}
