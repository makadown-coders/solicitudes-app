import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  EventEmitter,
  inject,
  Input,
  OnInit,
  Output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { AlertCircle, Loader2, LucideAngularModule, MonitorSmartphone, X } from 'lucide-angular';
import { Subject, catchError, debounceTime, distinctUntilChanged, from, of, switchMap } from 'rxjs';
import { DispositivoCreate, TipoDispositivo } from '../../../../models/ti-inventario.models';
import { TiPersonasService, TiUnidadMedicaItem } from '../../../../services/ti-personas.service';
import { ConfirmacionModalComponent } from '../../../../shared/confirmacion-modal/confirmacion-modal.component';

@Component({
  selector: 'app-equipo-form-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgSelectModule, LucideAngularModule, ConfirmacionModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './equipo-form-modal.component.html',
})
export class EquipoFormModalComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly tiPersonasSvc = inject(TiPersonasService);
  private readonly destroyRef = inject(DestroyRef);

  @Input() tipos: TipoDispositivo[] = [];
  @Input() saving = false;
  @Input() errorMsg: string | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<DispositivoCreate>();

  readonly icons = {
    device: MonitorSmartphone,
    close: X,
    loader: Loader2,
    alert: AlertCircle,
  };

  readonly unidades = signal<TiUnidadMedicaItem[]>([]);
  readonly loadingUnidades = signal(false);
  readonly unidadSearch$ = new Subject<string>();
  readonly confirmarDescarte = signal(false);

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
  private readonly valoresIniciales = this.form.getRawValue();

  ngOnInit(): void {
    this.loadUnidades('');
    this.unidadSearch$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((term) => {
          this.loadingUnidades.set(true);
          return from(this.tiPersonasSvc.buscarUnidades({ q: term, page: 1, pageSize: 25 })).pipe(
            catchError(() => of({ items: [], page: 1, pageSize: 25, total: 0 }))
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((res) => {
        this.unidades.set(res.items ?? []);
        this.loadingUnidades.set(false);
      });
  }

  private loadUnidades(q: string): void {
    this.loadingUnidades.set(true);
    from(this.tiPersonasSvc.buscarUnidades({ q, page: 1, pageSize: 25 }))
      .pipe(
        catchError(() => of({ items: [], page: 1, pageSize: 25, total: 0 })),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((res) => {
        this.unidades.set(res.items ?? []);
        this.loadingUnidades.set(false);
      });
  }

  solicitarCierre(): void {
    if (this.saving || this.confirmarDescarte()) return;
    const valores = this.form.getRawValue();
    const normalizar = (valor: string | number | null) => typeof valor === 'string' ? valor.trim() : valor;
    const cambios = (Object.keys(valores) as (keyof typeof valores)[]).some(
      (campo) => normalizar(valores[campo]) !== normalizar(this.valoresIniciales[campo]),
    );
    if (cambios) this.confirmarDescarte.set(true);
    else this.closed.emit();
  }

  descartarCambios(): void {
    if (this.saving || !this.confirmarDescarte()) return;
    this.confirmarDescarte.set(false);
    this.closed.emit();
  }

  onSubmit(): void {
    if (this.form.invalid || this.saving || this.confirmarDescarte()) {
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
