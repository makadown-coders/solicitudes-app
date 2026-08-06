// src/app/features/tabla-articulos/tabla-articulos.component.ts
import { Component, Input, Output, EventEmitter, inject, ChangeDetectorRef, AfterContentChecked, AfterContentInit, OnChanges, SimpleChange, SimpleChanges, Sanitizer, SecurityContext, OnInit, OnDestroy, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { clasificacionMedicamentosData } from '../../models/clasificacionMedicamentosData';
import { ClasificadorVEN } from '../../models/clasificador-ven';
import { Inventario, InventarioDisponibles } from '../../models/Inventario';
import { DomSanitizer } from '@angular/platform-browser';
import { StorageSolicitudService } from '../../services/storage-solicitud.service';
import { DatosClues } from '../../models/datos-clues';
import { CPMS } from '../../models/CPMS';
import { InventarioService } from '../../services/inventario.service';
import { ArticuloSolicitud } from '../../models/articulo-solicitud';
import { AlertCircleIcon, InfoIcon, LucideAngularModule, TriangleAlertIcon } from 'lucide-angular';
import { CpmService } from '../../services/cpm.service';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { CpmUnionRow } from '../../models/CpmUnionRow';
import { CpmRowLite } from '../../models/CpmExpectedRow';

@Component({
  selector: 'app-tabla-articulos',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './tabla-articulos.component.html',
})
export class TablaArticulosComponent implements OnChanges, OnInit, OnDestroy {

  @Input() articulosSolicitados: ArticuloSolicitud[] = [];
  @Input() modoEdicionIndex: number | null = null;
  @Input() cantidadTemporal: number = 0;
  @Input() inventario: InventarioDisponibles[] = [];
  @Input() cluesimbActual: string = '';
  @Input() capturaStats: { total: number; cpmCero: number; menorCpm: number; igualCpm: number; mayorCpm: number } | null = null;

  cpmsDeCluesActual: CPMS[] = [];
  private cpmIndex = new Map<string, number>();
  alertCircle = AlertCircleIcon;
  infoIcon = InfoIcon;
  triangleAlertIcon = TriangleAlertIcon;

  private cdRef = inject(ChangeDetectorRef);
  private elementRef = inject(ElementRef<HTMLElement>);

  @Output() cantidadTemporalChange = new EventEmitter<number>();
  @Output() confirmar = new EventEmitter<number>();
  @Output() cancelar = new EventEmitter<void>();
  @Output() editar = new EventEmitter<number>();
  @Output() eliminar = new EventEmitter<number>();
  @Output() CPMsPorUnidadActualizado = new EventEmitter<CPMS[]>();

  sanitizer = inject(DomSanitizer);
  storageSolicitudService = inject(StorageSolicitudService);
  inventarioService = inject(InventarioService);
  private cpmService = inject(CpmService);
  private onDestroy$ = new Subject<void>();
  private cpmSubscription?: Subscription;
  descripcionMovilIndex: number | null = null;
  private descripcionTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // console.log('constructor de TablaArticulosComponent');
  }

  ngOnDestroy(): void {
    if (this.descripcionTimer) clearTimeout(this.descripcionTimer);
    this.onDestroy$.next();
    this.onDestroy$.complete();
    this.cpmSubscription?.unsubscribe();
  }

  mostrarDescripcionMovil(index: number): void {
    if (this.descripcionTimer) clearTimeout(this.descripcionTimer);
    this.descripcionMovilIndex = index;
    this.descripcionTimer = setTimeout(() => {
      this.descripcionMovilIndex = null;
      this.cdRef.markForCheck();
    }, 2800);
  }

  /** true si la clave pertenece al KIT de la unidad actual */
  enKit(clave: string | null | undefined): boolean {
    if (!clave) return false;
    return this.cpmService.isClaveInKit(this.inventarioService.normalizarClave(clave), this.cluesimbActual);
  }

  ngOnInit(): void {

  }

  private normClave(clave: string | undefined | null): string {
    return this.inventarioService.normalizarClave((clave ?? '').toString().toUpperCase());
  }

  private mapCpmRowsToCPMS(rows: CpmRowLite[], cluesimbFallback?: string): CPMS[] {
    // Consolidamos por clave (si una clave aparece varias veces por distintos kits, tomamos el mayor CPM)
    const byClave = new Map<string, CPMS>();

    for (const r of rows) {
      const clave = (r.clave_cnis || '').toUpperCase();
      if (!clave) continue;

      const cpmVal = Number(r.cpm ?? 0);
      if (cpmVal <= 0) continue; // solo nos interesan CPMS > 0

      const cluesimb = (r.cluesimb || cluesimbFallback || '').toUpperCase();
      const prev = byClave.get(clave);

      if (!prev || cpmVal > prev.cantidad) {
        byClave.set(clave, {
          clave,
          cluesimb,
          cantidad: cpmVal,   // 👈 aquí ‘cantidad’ = CPM
        });
      }
    }

    return Array.from(byClave.values());
  }

  // Al actualizar articulosSolicitados refrescar CPMs
  ngOnChanges(changes: SimpleChanges) {
    if (changes['articulosSolicitados'] || changes['cluesimbActual']) {
      // Actualizar CPMs por clave y clues
      const cluesStr = this.storageSolicitudService.getDatosCluesFromLocalStorage();
      if (cluesStr) {
        const datosClues = JSON.parse(cluesStr) as DatosClues;
        this.cluesimbActual = datosClues.hospital?.cluesimb ?? '';

        this.cpmSubscription?.unsubscribe();
        this.cpmSubscription = this.cpmService.cpmsForImport(this.cluesimbActual)
          .pipe(takeUntil(this.onDestroy$))
          .subscribe((rows: CpmUnionRow[]) => {
            const clues = this.cluesimbActual;
            this.cpmsDeCluesActual = this.mapCpmRowsToCPMS(rows as any, clues);
            this.cpmIndex.clear();
            for (const r of this.cpmsDeCluesActual) {
              this.cpmIndex.set(this.normClave(r.clave), Number(r.cantidad) || 0);
            }
            this.CPMsPorUnidadActualizado.emit(this.cpmsDeCluesActual);
            this.cdRef.detectChanges();
          });
      }
    }
  }

  /**
 * True si la cantidad temporal NO pasa la sanitización.
 */
  esCantidadInvalida(): boolean {
    return this.sanearCantidad(this.cantidadTemporal) === null;
  }

  /**
   * Emitir confirmación con la cantidad sanitizada.
   * Si la cantidad es inválida, no se emite nada.
   * @param index La posición del elemento en el que se hizo click.
   */
  mandarConfirmacion(index: number) {
    const cantidadValida = this.sanearCantidad(this.cantidadTemporal);

    // Segunda línea de defensa: si algo raro se cuela, simplemente NO emitimos
    if (cantidadValida === null) {
      // Opcional: podrías hacer un pequeño log o snack aquí
      return;
    }

    // Normalizamos la cantidad a la versión sanitizada
    this.cantidadTemporal = cantidadValida;
    this.cantidadTemporalChange.emit(this.cantidadTemporal);
    this.confirmar.emit(index);
  }

  clasificacion(clave: string) {
    const clasificacion = clasificacionMedicamentosData.find(c => c.clave === clave);
    return clasificacion ? ClasificadorVEN[clasificacion.ven] : '';
  }

  getSafeHtml(html: string) {
    return this.sanitizer.sanitize(SecurityContext.HTML,
      this.sanitizer.bypassSecurityTrustHtml(html));
  }

  private normalizarClaveBusqueda(clave: string): string[] {
    const claveSinPuntos = clave.replace(/\./g, '');
    const prefijo = claveSinPuntos.substring(0, 3);

    if (['060', '533', '513', '535', '537', '080', '070'].includes(prefijo)) {
      if (claveSinPuntos.length === 10) {
        // Generar versión con .00
        const conPuntos12 = `${claveSinPuntos.substring(0, 3)}.${claveSinPuntos.substring(3, 6)}.${claveSinPuntos.substring(6, 10)}.00`;
        return [clave, conPuntos12];
      }
      if (claveSinPuntos.length === 12 && claveSinPuntos.endsWith('00')) {
        // Generar versión sin .00
        const clave10 = claveSinPuntos.substring(0, 10);
        const conPuntos10 = `${clave10.substring(0, 3)}.${clave10.substring(3, 6)}.${clave10.substring(6, 10)}`;
        return [clave, conPuntos10];
      }
    }
    // Claves normales (no especiales)
    return [clave];
  }

  buscarEnInventario(clave: string): InventarioDisponibles | undefined {
    const clavesBuscar = this.normalizarClaveBusqueda(clave);
    return this.inventario.find(inventario => clavesBuscar.includes(inventario.clave));
  }

  public buscarCPM(clave: string): number {
    const cpm = this.cpmsDeCluesActual.find(cpmItem => cpmItem.clave.trim() + '' === clave.trim() + '');
    return cpm ? cpm.cantidad : 0;
  }

  scrollPrimerPendiente(): void {
    const row = this.elementRef.nativeElement.querySelector('[data-cantidad-pendiente="true"]') as HTMLElement | null;
    row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row?.classList.add('ring-2', 'ring-amber-500');
    window.setTimeout(() => row?.classList.remove('ring-2', 'ring-amber-500'), 1800);
  }

  /**
 * Sanitiza y valida la cantidad:
 * - Convierte a número
 * - Trunca decimales
 * - Debe estar entre 1 y 99999
 * 
 * @param valor valor crudo del input
 * @returns número válido o null si es inválido
 */
  private sanearCantidad(valor: any): number | null {
    // Permite detectar vacío explícitamente
    if (valor === null || valor === undefined || valor === '') {
      return null;
    }

    let n = Number(valor);

    if (!Number.isFinite(n)) {
      return null;
    }

    // Truncar decimales
    n = Math.trunc(n);

    // Rango permitido
    if (n < 1 || n > 99999) {
      return null;
    }

    return n;
  }

  /**
 * Permite solo dígitos y teclas de control.
 * Evita "-", "+", "e", ".", letras, etc.
 */
  soloEnteroPositivo(event: KeyboardEvent) {
    // Dejamos que Enter lo maneje otro handler
    if (event.key === 'Enter') {
      // No escribas nada en el input
      event.preventDefault();
      return;
    }

    const allowedControlKeys = [
      'Backspace',
      'Tab',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Delete',
      'Home',
      'End'
    ];

    // Teclas de control (borrar, navegar, etc)
    if (allowedControlKeys.includes(event.key)) {
      return;
    }

    // Atajos tipo Ctrl+C, Ctrl+V, etc
    if ((event.ctrlKey || event.metaKey) && ['a', 'c', 'v', 'x'].includes(event.key.toLowerCase())) {
      return;
    }

    const isDigit = /^[0-9]$/.test(event.key);

    if (!isDigit) {
      event.preventDefault();
    }
  }

  /**
 * Al perder el foco, si la cantidad es válida, normalizamos el valor
 * (se asegura que quede como entero limpio).
 */
  normalizarCantidadEnInput() {
    const cantidadValida = this.sanearCantidad(this.cantidadTemporal);
    if (cantidadValida !== null) {
      this.cantidadTemporal = cantidadValida;
    }
  }

  /**
 * Maneja la tecla Enter en el input de cantidad.
 * Si la cantidad es válida, dispara la confirmación del renglón.
 */
  onEnterCantidad(index: number, event?: Event) {
    // Convertimos a KeyboardEvent si aplica
    const keyboardEvent = event as KeyboardEvent | undefined;

    if (keyboardEvent) {
      keyboardEvent?.preventDefault();
      keyboardEvent?.stopPropagation();
    }

    if (this.esCantidadInvalida()) {
      return;
    }

    this.mandarConfirmacion(index);
  }

}
