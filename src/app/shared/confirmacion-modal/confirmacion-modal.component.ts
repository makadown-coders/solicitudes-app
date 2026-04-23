import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, Output, SimpleChanges, ViewChild } from '@angular/core';

@Component({
  selector: 'app-confirmacion-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirmacion-modal.component.html',
  styleUrl: './confirmacion-modal.component.css'
})
export class ConfirmacionModalComponent implements AfterViewInit {
  @Input() titulo: string = '';
  @Input() mensaje: string = '';
  @Input() textoCancelar: string = '';
  @Input() textoConfirmar: string = '';
  @Input() soloInfo: boolean = false;
  @Input() ariaLabelledBy: string = 'confirmacion-modal-titulo';
  @Input() ariaDescribedBy: string = 'confirmacion-modal-mensaje';

  @Output() confirmar = new EventEmitter<void>();
  @Output() cancelar = new EventEmitter<void>();

  @ViewChild('confirmButton') private confirmButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('cancelButton') private cancelButton?: ElementRef<HTMLButtonElement>;

  ngAfterViewInit(): void {
    this.focusPrimaryAction();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    queueMicrotask(() => this.focusPrimaryAction());
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget && !this.soloInfo) {
      this.cancelar.emit();
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !this.soloInfo) {
      event.preventDefault();
      this.cancelar.emit();
    }
  }

  private focusPrimaryAction(): void {
    const target = this.soloInfo ? this.confirmButton : this.cancelButton;
    target?.nativeElement.focus();
  }
}
