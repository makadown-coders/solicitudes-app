// trazabilidad-modal.component.ts
import { Component, EventEmitter, Input, OnChanges, Output, computed, signal } from '@angular/core';
import { MovimientoTrazabilidad } from '../../models/movimiento-trazabilidad';
import { TrazabilidadService } from '../../services/trazabilidad.service';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import * as XLSX from 'xlsx';
import { FactorUnidad } from '../../models/factor-unidad';

type MovimientoConSaldo = MovimientoTrazabilidad & {
    entradas: number;   // derivado
    salidas: number;    // derivado
    saldo: number;      // acumulado
};


@Component({
    selector: 'app-trazabilidad-modal',
    standalone: true,
    templateUrl: './trazabilidad-modal.component.html',
    styleUrl: './trazabilidad-modal.component.css',
    imports: [CommonModule]
})
export class TrazabilidadModalComponent implements OnChanges {
    @Input() clave: string = '';
    @Input() cluesimb: string = '';
    @Input() cpmBase: number = 0;
    @Input() descripcionArticulo: string = '';

    @Input() visible = false;
    @Output() closed = new EventEmitter<void>(); // 👈 avisa al padre

    movimientos = signal<MovimientoTrazabilidad[]>([]);
    loading = signal(false);

    factor = signal<FactorUnidad>({ en_dispensacion: 0, cantidad_fc: 1, clave: '', cluesimb: '' });

    // 👉 Generamos columnas derivadas y saldo acumulado
    movimientosConSaldo = computed<MovimientoConSaldo[]>(() => {
        let saldo = 0;
        return this.movimientos()
            .slice()
            .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
            .map(m => {
                const esEntrada = m.tipo_movimiento === 'entrada' || m.tipo_movimiento === 'traspaso';
                const entradas = esEntrada ? Number(m.cantidad || 0) : 0;
                const salidas = m.tipo_movimiento === 'salida' ? Number(m.cantidad || 0) : 0;
                saldo += entradas - salidas;
                return { ...m, entradas, salidas, saldo };
            });
    });

    saldoTotal = computed(() => {
        const arr = this.movimientosConSaldo();
        return arr.length ? arr[arr.length - 1].saldo : 0;
    });

    // Totales para el footer (sin arrow functions en template)
    totales = computed(() => {
        const arr = this.movimientosConSaldo();
        let entradas = 0;
        let salidas = 0;
        for (const m of arr) {
            entradas += m.entradas || 0;
            salidas += m.salidas || 0;
        }
        const saldo = arr.length ? arr[arr.length - 1].saldo : 0;
        return { entradas, salidas, saldo };
    });

    constructor(private trazabilidadService: TrazabilidadService) { }

    async ngOnChanges(changes: any) {
        // Solo carga cuando visible pasa a true
        if (changes?.visible?.currentValue === true && this.clave && this.cluesimb) {
            this.loading.set(true);
            try {
                // 1) movimientos
                const data = await this.trazabilidadService.obtenerPorClaveYClues(this.clave, this.cluesimb);
                const ordenados = data.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
                this.movimientos.set(ordenados ?? []);

                // 2) factor (rápido)
                const fc = await this.trazabilidadService.getFactorConversionPorUnidad(this.clave, this.cluesimb);
                console.log('factor', fc);
                this.factor.set(fc);
            } finally {
                this.loading.set(false);
            }
        }
    }

    cerrar() {
        // 👇 NO tocar this.visible aquí
        this.loading.set(false);
        this.movimientos.set([]);
        this.closed.emit(); // 👈 que el padre cambie el estado
    }

    exportarExcel() {
        const filas: any = this.movimientosConSaldo().map(m => ({
            Fecha: m.fecha ? new Date(m.fecha).toISOString().slice(0, 10) : '',
            Lote: m.lote ?? '',
            Caducidad: m.fecha_caducidad ? new Date(m.fecha_caducidad).toISOString().slice(0, 10) : '',
            'Recibe / Entrega': (m.proveedor + (m.observaciones ? ' ('+ m.observaciones + ')' : '')),
            Entradas: m.entradas ?? 0,
            Salidas: m.salidas ?? 0,
            Saldo: m.saldo ?? 0,
        }));

        const total = this.totales();
        filas.push(
            {},
            {
                Fecha: '—',
                Lote: '—',
                Caducidad: '—',
                'Recibe / Entrega': 'Totales',
                Entradas: total.entradas,
                Salidas: total.salidas,
                Saldo: total.saldo
            }
        );

        // Si hay CPM/factor, añadimos bloque resumen
        if ((this.cpmBase ?? -1) > -1) {
            const fc = this.factor();
            const saldoBase = fc.en_dispensacion && fc.cantidad_fc > 1
                ? Math.round((total.saldo / fc.cantidad_fc) * 100) / 100
                : total.saldo;

            filas.push(
                {},
                { 'Recibe / Entrega': `CPM (base)`, Entradas: this.cpmBase },
            );

            if (fc.en_dispensacion && fc.cantidad_fc > 1) {
                filas.push(
                    { 'Recibe / Entrega': `Factor de conversión`, Entradas: `x${fc.cantidad_fc}` },
                    { 'Recibe / Entrega': `Saldo (base, sin dispensación)`, Entradas: saldoBase }
                );
            }
        }

        const ws = XLSX.utils.json_to_sheet(filas, { skipHeader: false });
        // Ajuste simple de anchos
        (ws as any)['!cols'] = [
            { wch: 12 }, // Fecha
            { wch: 16 }, // Lote
            { wch: 12 }, // Caducidad
            { wch: 40 }, // Recibe / Entrega
            { wch: 12 }, // Entradas
            { wch: 12 }, // Salidas
            { wch: 12 }, // Saldo
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Trazabilidad');

        const safeUnidad = (this.cluesimb || '').replace(/[^A-Za-z0-9_-]+/g, '');
        const safeClave = (this.clave || '').replace(/[^A-Za-z0-9._-]+/g, '');
        const hoy = new Date().toISOString().slice(0, 10);
        const filename = `trazabilidad_${safeClave}_${safeUnidad}_${hoy}.xlsx`;

        XLSX.writeFile(wb, filename);
    }
}
