import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  inject,
  Input,
  OnInit,
  Output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { Loader2, LucideAngularModule, MonitorSmartphone, X } from 'lucide-angular';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import {
  DispositivoCreate,
  TipoDispositivo,
  UnidadMedica,
} from '../../../../models/ti-inventario.models';
import { TiCatalogosService } from '../../../../services/ti-catalogos.service';

@Component({
  selector: 'app-equipo-form-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgSelectModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './equipo-form-modal.component.html',
})
export class EquipoFormModalComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly catalogos = inject(TiCatalogosService);

  @Input() tipos: TipoDispositivo[] = [];
  @Input() saving = false;

  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<DispositivoCreate>();

  readonly icons = {
    device: MonitorSmartphone,
    close: X,
    loader: Loader2,
  };

  readonly unidades = signal<UnidadMedica[]>([]);
  readonly loadingUnidades = signal(false);
  readonly unidadSearch$ = new Subject<string>();

  readonly form = this.fb.group({
    unidad_medica_id: [null as number | null, Validators.required],
    tipo_dispositivo_id: [null as number | null, Validators.required],
    serial: [''],
    marca: [''],
    modelo: [''],
    ip: [''],
    conexion: [''],
    observaciones: [''],
  });

  ngOnInit(): void {
    this.loadUnidades('');
    this.unidadSearch$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((term) => {
          this.loadingUnidades.set(true);
          return this.catalogos.unidades({ q: term, page: 1, pageSize: 25 });
        })
      )
      .subscribe({
        next: (res) => {
          this.unidades.set(res.items ?? []);
          this.loadingUnidades.set(false);
        },
        error: () => {
          this.unidades.set([]);
          this.loadingUnidades.set(false);
        },
      });
  }

  private loadUnidades(q: string): void {
    this.loadingUnidades.set(true);
    this.catalogos.unidades({ q, page: 1, pageSize: 25 }).subscribe({
      next: (res) => {
        this.unidades.set(res.items ?? []);
        this.loadingUnidades.set(false);
      },
      error: () => {
        this.unidades.set([]);
        this.loadingUnidades.set(false);
      },
    });
  }

  onSubmit(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    this.saved.emit({
      unidad_medica_id: Number(v.unidad_medica_id),
      tipo_dispositivo_id: Number(v.tipo_dispositivo_id),
      serial: v.serial?.trim() || '',
      marca: v.marca?.trim() || '',
      modelo: v.modelo?.trim() || '',
      ip: v.ip?.trim() || '',
      conexion: v.conexion?.trim() || '',
      observaciones: v.observaciones?.trim() || '',
    });
  }
}
