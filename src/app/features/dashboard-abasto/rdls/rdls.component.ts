// src/app/features/dashboard-abasto/rdls/rdls.component.ts
import { Component, ChangeDetectionStrategy, inject, signal, computed, OnDestroy, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subscription, firstValueFrom, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { kitCatalogoBasal } from '../../../data/kit-catalogo-basal';
import { GruposClavesService } from '../../../services/grupo-clases.service';
import { InventarioService } from '../../../services/inventario.service';
import { hospitalesData } from '../../../models/hospitalesData';
import { CPMS } from '../../../models/CPMS';
import { Inventario } from '../../../models/Inventario';
import { Existencias } from '../../../shared/storage-variables';

interface RdlsRow {
  no: number;
  clave: string;
  descripcion: string;
  tipo: string;
  grupo_terapeutico: string;
  piezas: number;

  AZM: number; AZE: number; AZT: number;
  totalAlmacenes: number;

  HGTK: number; HMIT: number; HGTZOE: number; HGT: number; HGPR: number;
  HGM: number; HMIM: number; UNEME: number; SF: number; HGE: number;
  totalHospitales: number;

  CPM_HGTK: number; CPM_HMIT: number; CPM_HGTZOE: number; CPM_HGT: number; CPM_HGPR: number;
  CPM_HGM: number; CPM_HMIM: number; CPM_UNEME: number; CPM_SF: number; CPM_HGE: number;
  TOTAL_CPM_TIJUANA: number;
  TOTAL_CPM_MEXICALI: number;
  TOTAL_CPM_ENSENADA: number;
}

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
  private gruposService = inject(GruposClavesService);
  private inventario = inject(InventarioService);

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

  private subs: Subscription[] = [];

  constructor(/* ... */) {
    // si ya tenías constructor, conserva y añade este clamp:
    effect(() => {
      // si cambian los datos/filtrado y la página se sale de rango, te regresa al final válido
      const tp = this.totalPages();
      if (this.page() > tp) this.page.set(tp);
      if (this.page() < 1) this.page.set(1);
    });
  }

  async ngOnInit() {
    await this.initRows();
    this.hydrateGrupos();
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
        HGM: 0, HMIM: 0, UNEME: 0, SF: 0, HGE: 0,
        totalHospitales: 0,

        CPM_HGTK: 0, CPM_HMIT: 0, CPM_HGTZOE: 0, CPM_HGT: 0, CPM_HGPR: 0,
        CPM_HGM: 0, CPM_HMIM: 0, CPM_UNEME: 0, CPM_SF: 0, CPM_HGE: 0,
        TOTAL_CPM_TIJUANA: 0,
        TOTAL_CPM_MEXICALI: 0,
        TOTAL_CPM_ENSENADA: 0,
      };
    });

    this.rows.set(base);
    this.page.set(1);
  }

  private hydrateGrupos() {
    const sub = this.gruposService.load().subscribe(mp => {
      const rows = this.rows().slice();
      for (const r of rows) {
        const g = this.gruposService.findByClave(r.clave);
        if (g) {
          r.tipo = g.categoria || '';
          const grupo = (g.grupoInsumo || '').toUpperCase();
          if (grupo.includes('MEDICAMENTO')) r.grupo_terapeutico = 'Medicamento';
          else if (grupo.includes('MATERIAL')) r.grupo_terapeutico = 'Material de curacion';
          else r.grupo_terapeutico = '';
        }
      }
      this.rows.set(rows);
    });
    this.subs.push(sub);
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
        r.CPM_SF = mapClaveClues.get(`${clave}|${cluesMap.get('SF')}`) ?? 0;      // si no existe, queda 0
        r.TOTAL_CPM_MEXICALI = r.CPM_HGM + r.CPM_HMIM + r.CPM_UNEME + r.CPM_SF;

        // ENSENADA set
        r.CPM_HGE = mapClaveClues.get(`${clave}|${cluesMap.get('HGENS')}`) ?? 0;
        r.TOTAL_CPM_ENSENADA = r.CPM_HGE;
      }
      this.rows.set(rows);
    });
    this.subs.push(sub);
  }

  private hydrateConExistenciasHospitales() {
    const hospitalKeys: Existencias[] = [
      Existencias.HGTKT, Existencias.HMITIJ, Existencias.HGTZE, Existencias.HGTIJ, Existencias.HGPR,
      Existencias.HGMXL, Existencias.HMIMXL, Existencias.UOMXL, Existencias.HGENS
      // SF no está en enum → permanece 0
    ] as any;

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
          r.totalHospitales = r.HGTK + r.HMIT + r.HGTZOE + r.HGT + r.HGPR + r.HGM + r.HMIM + r.UNEME + r.SF + r.HGE;
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

}
