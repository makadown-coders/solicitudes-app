// src/app/services/proveedores.service.ts
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, map } from 'rxjs';
import { Proveedor } from '../models/proveedor';

@Injectable({ providedIn: 'root' })
export class ProveedoresService {
  private http = inject(HttpClient);

  private proveedoresSubject = new BehaviorSubject<Proveedor[]>([]);
  public proveedores$: Observable<Proveedor[]> = this.proveedoresSubject.asObservable();

  // índices “flex” (si los quieres conservar)
  private byRFC = new Map<string, Proveedor>();
  private byNombre = new Map<string, Proveedor>();

  // índices ESTRICTOS (case-sensitive y accent-sensitive)
  private byRFCStrict = new Map<string, Proveedor>();
  private byNombreStrict = new Map<string, Proveedor>(); // clave: nombre SIN comas/puntos (pero con acentos y case intactos)

  load(): Observable<Proveedor[]> {
    return this.http.get<Proveedor[]>('/proveedores.json').pipe(
      map(list => Array.isArray(list) ? list : []),
      map(list => {
        // reconstruir índices
        this.byRFC.clear(); this.byNombre.clear();
        this.byRFCStrict.clear(); this.byNombreStrict.clear();

        for (const p of list) {
          // --------- índices FLEX (opcionales) ----------
          const rfcFlex = this.normalizeRFC(p.rfc);
          if (rfcFlex) this.byRFC.set(rfcFlex, p);
          const nomFlex = this.normalizeName(p.descripcion);
          if (nomFlex) this.byNombre.set(nomFlex, p);

          // --------- índices ESTRICTOS ----------
          const rfcStrict = (p.rfc ?? '').trim();                 // sin uppercase; exacto
          if (rfcStrict) this.byRFCStrict.set(rfcStrict, p);

          const nombreStrict = this.removeCommasDots(p.descripcion ?? '').trim(); // sin comas/puntos, pero respeta acentos y mayúsculas
          if (nombreStrict) this.byNombreStrict.set(nombreStrict, p);
        }
        this.proveedoresSubject.next(list);
        return list;
      })
    );
  }

  // ====== BÚSQUEDAS ESTRICTAS ======
  /** Coincidencia EXACTA por RFC (case & accent sensitive). */
  findByRFCStrict(rfc: string | null | undefined): Proveedor | undefined {
    if (!rfc) return undefined;
    return this.byRFCStrict.get((rfc as string).trim());
  }

  /** Coincidencia EXACTA por nombre SIN comas/puntos (case & accent sensitive). */
  findByNombreStrict(nombre: string | null | undefined): Proveedor | undefined {
    if (!nombre) return undefined;
    const key = this.removeCommasDots(nombre).trim();
    return this.byNombreStrict.get(key);
  }

  /** Busca primero por RFC estricto, si no encuentra intenta por nombre estricto. */
  findStrict(rfcOrNombre: string | null | undefined): Proveedor | undefined {
    if (!rfcOrNombre) return undefined;
    return this.findByRFCStrict(rfcOrNombre) ?? this.findByNombreStrict(rfcOrNombre);
  }

  // ====== (Flex) BÚSQUEDAS NO ESTRICTAS – por si las sigues usando en otros lados ======
  findByRFC(rfc: string | null | undefined): Proveedor | undefined {
    if (!rfc) return undefined;
    return this.byRFC.get(this.normalizeRFC(rfc));
  }
  findByNombre(nombre: string | null | undefined): Proveedor | undefined {
    if (!nombre) return undefined;
    return this.byNombre.get(this.normalizeName(nombre));
  }

  // ====== Helpers ======
  private removeCommasDots(s: string): string {
    return (s ?? '').replace(/[.,]/g, '');
  }
  private normalizeRFC(raw: string): string {
    // (flex) upper + quitar espacios y no alfanum/guiones
    let s = (raw ?? '').toUpperCase().replace(/\s+/g, '');
    s = s.replace(/[–—−]/g, '-').replace(/[^A-Z0-9-]/g, '').replace(/-+/g, '-').replace(/^-/, '').replace(/-$/, '');
    return s;
  }
  private normalizeName(raw: string): string {
    return (raw ?? '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar acentos
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** (Solo para mostrar bonito; NO usar para buscar estricto) */
  formatRFC15(rfcInput: string): string {
    const s = (rfcInput ?? '').trim(); // respetar case original si quieres
    const m = s.match(/^([A-Za-z]{3,4})-?(\d{6})-?([A-Za-z0-9]{3})$/);
    if (!m) return s;
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
}
