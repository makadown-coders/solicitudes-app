import { Component, ChangeDetectionStrategy, EventEmitter, Output, signal, computed, inject } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { UnidadesService } from '../../services/unidades.service';
import { Unidadv2 } from '../../models';

@Component({
    selector: 'app-captura-clues-lite',
    standalone: true,
    imports: [FormsModule],
    templateUrl: './captura-clues-lite.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CapturaCluesLiteComponent {
    constructor(private unidades: UnidadesService) { }

    @Output() unidadSeleccionada = new EventEmitter<Unidadv2>();
    @Output() unidadCambiada = new EventEmitter<void>();

    texto = '';
    primerNivel = true;                // si quieres permitir alternar
    results = signal<Unidadv2[]>([]);
    selected: Unidadv2 | null = null;

    ngOnInit(): void {
        // llena el caché si viene vacío; si ya estaba cargado, regresa rápido
        this.unidades.load().subscribe({ next: () => { }, error: () => { } });
    }

    private esAlmacen(u: Unidadv2): boolean {
        return (u.tipoUnidad || '').toUpperCase().includes('ALMAC');
    }

    onInputChange(v: string) {
        this.texto = v;
        const q = (v || '').trim();
        if (q.length < 2) { this.results.set([]); return; }

        // usa tu búsqueda local e ignora almacenes
        const list = this.unidades.searchLocal(q, { primerNivel: this.primerNivel, limit: 20 })
            .filter(u => !this.esAlmacen(u));
        this.results.set(list);
    }

    onKeyDown(e: KeyboardEvent) {
        if (e.key === 'Enter' && this.results().length) {
            this.pick(this.results()[0]);
            e.preventDefault();
        }
    }

    pick(u: Unidadv2) {
        this.selected = u;
        this.results.set([]);
        this.texto = `${u.cluesssa || '—'} | ${u.cluesimb || '—'} — ${u.nombre}`;
        this.unidadSeleccionada.emit(u);
    }

    cambiar() {
        this.selected = null;
        this.texto = '';
        this.results.set([]);
        this.unidadCambiada.emit();
    }

    onToggleNivel(v: boolean) {
        this.primerNivel = !!v;
        // refresca resultados con el nuevo filtro si hay texto
        this.onInputChange(this.texto);
    }

    trackByCluesimb = (_: number, u: Unidadv2) => u.cluesimb;
}
