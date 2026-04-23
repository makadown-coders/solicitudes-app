import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ArticuloAutocompleteComponent, ArticuloAutocompleteItem } from '../../shared/articulo-autocomplete/articulo-autocomplete.component';
import { HomologoCrudUpsertPayload, HomologoCrudUiRow } from '../../models/homologos/homologo-crud.model';

type FormMode = 'create' | 'edit';

@Component({
  selector: 'app-homologos-form-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ArticuloAutocompleteComponent],
  templateUrl: './homologos-form-modal.component.html',
  styleUrl: './homologos-form-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomologosFormModalComponent implements OnChanges, AfterViewInit {
  @Input({ required: true }) mode: FormMode = 'create';
  @Input() row: HomologoCrudUiRow | null = null;
  @Input() saving = false;

  @Output() cancel = new EventEmitter<void>();
  @Output() save = new EventEmitter<HomologoCrudUpsertPayload>();

  @ViewChild('dialog') private dialog?: ElementRef<HTMLDivElement>;
  @ViewChild('claveAutocomplete') private claveAutocomplete?: ArticuloAutocompleteComponent;

  private fb = new FormBuilder();

  readonly form = this.fb.nonNullable.group({
    clave: ['', [Validators.required]],
    sustituto: ['', [Validators.required]],
    factor: ['', [Validators.required, Validators.pattern(/^-?\d+(\.\d+)?$/)]],
  });

  claveDescripcion: string | null = null;
  sustitutoDescripcion: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['row'] || changes['mode']) {
      this.patchForm(this.row);
      queueMicrotask(() => this.focusFirstField());
    }
  }

  ngAfterViewInit(): void {
    this.focusFirstField();
  }

  get title(): string {
    return this.mode === 'create' ? 'Nuevo homologo' : 'Editar homologo';
  }

  get claveControl() {
    return this.form.controls.clave;
  }

  get sustitutoControl() {
    return this.form.controls.sustituto;
  }

  get factorControl() {
    return this.form.controls.factor;
  }

  onClaveInput(value: string): void {
    this.claveControl.setValue(value);
    this.claveControl.markAsDirty();
    this.claveDescripcion = null;
  }

  onSustitutoInput(value: string): void {
    this.sustitutoControl.setValue(value);
    this.sustitutoControl.markAsDirty();
    this.sustitutoDescripcion = null;
  }

  onClaveSelected(item: ArticuloAutocompleteItem): void {
    this.claveControl.setValue((item?.clave ?? '').trim().toUpperCase());
    this.claveControl.markAsDirty();
    this.claveDescripcion = (item?.descripcion ?? '').trim() || null;
  }

  onSustitutoSelected(item: ArticuloAutocompleteItem): void {
    this.sustitutoControl.setValue((item?.clave ?? '').trim().toUpperCase());
    this.sustitutoControl.markAsDirty();
    this.sustitutoDescripcion = (item?.descripcion ?? '').trim() || null;
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.save.emit({
      clave: this.claveControl.getRawValue().trim().toUpperCase(),
      sustituto: this.sustitutoControl.getRawValue().trim().toUpperCase(),
      factor: this.factorControl.getRawValue().trim(),
    });
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget && !this.saving) {
      this.cancel.emit();
    }
  }

  onDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !this.saving) {
      event.preventDefault();
      this.cancel.emit();
    }
  }

  fieldError(field: 'clave' | 'sustituto' | 'factor'): string | null {
    const control = this.form.controls[field];
    if (!(control.touched || control.dirty) || !control.errors) return null;

    if (control.errors['required']) {
      if (field === 'clave') return 'La clave es requerida.';
      if (field === 'sustituto') return 'El sustituto es requerido.';
      return 'El factor es requerido.';
    }

    if (field === 'factor' && control.errors['pattern']) {
      return 'El factor debe ser numérico.';
    }

    return null;
  }

  private patchForm(row: HomologoCrudUiRow | null): void {
    this.form.reset({
      clave: row?.clave ?? '',
      sustituto: row?.sustituto ?? '',
      factor: row?.factor ?? '',
    });
    this.claveDescripcion = row?.claveDescripcion ?? null;
    this.sustitutoDescripcion = row?.sustitutoDescripcion ?? null;
  }

  private focusFirstField(): void {
    if (this.claveAutocomplete) {
      this.claveAutocomplete.focusInput();
      return;
    }
    this.dialog?.nativeElement.focus();
  }
}
