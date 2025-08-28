// src/app/shared/survey/survey-modal.component.ts
import { Component, ChangeDetectionStrategy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    ReactiveFormsModule,
    FormBuilder,
    Validators,
    FormGroup,
    AbstractControl,
    FormControl,
} from '@angular/forms';
import { SurveyService } from '../../services/survey.service';
import { SurveyControls } from './SurveyControls';

@Component({
    selector: 'app-survey-modal',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './survey-modal.component.html',
})
export class SurveyModalComponent implements OnInit {
    svc = inject(SurveyService);
    private fb = inject(FormBuilder);

    scale = [1, 2, 3, 4, 5];
    trackByValue = (_: number, v: number) => v;
    form!: FormGroup<SurveyControls>;

    ngOnInit() {
        this.form = this.fb.group<SurveyControls>({
            facilidad: this.fb.control<number | null>(null, {
                validators: [Validators.required, Validators.min(1), Validators.max(5)],
                nonNullable: false,
            }),
            termino: this.fb.control<boolean | null>(null, {
                validators: [Validators.required],
                nonNullable: false,
            }),
            csat: this.fb.control<number | null>(null, {
                validators: [Validators.required, Validators.min(1), Validators.max(5)],
                nonNullable: false,
            }),
            comentario: this.fb.control<string | null>('', {
                validators: [Validators.maxLength(500)],
                nonNullable: false,
            }),
        });
    }

    // (Opcional) auto-agrandar textarea
    autoGrow(e: Event) {
        const ta = e.target as HTMLTextAreaElement;
        ta.style.height = 'auto';
        ta.style.height = ta.scrollHeight + 'px';
    }

    // Helpers para template
    get f() { return this.form.controls as any; }
    isInvalid(ctrl: keyof SurveyModalComponent['f']) {
        const c = this.f[ctrl] as AbstractControl;
        return c.invalid && (c.dirty || c.touched);
    }

    close() { this.svc.modalOpen.set(false); }

    async submit() {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        const v = this.form.value;
        const meta = this.svc.meta();

        const payload = {
            timestamp: new Date().toISOString(),
            app_version: meta?.appVersion ?? 'dev',
            pilot_site: 'Baja California',
            cluesimb: meta?.cluesimb ?? 'UNKNOWN',
            facilidad_1_5: Number(v.facilidad),
            termino_sin_trabas: v.termino === true,
            csat_1_5: Number(v.csat),
            comentario: ((v.comentario || '') as string)
                .toString()
                .replace(/\r\n/g, '\n')   // normaliza saltos de línea
                .slice(0, 500),
            evento: meta?.event ?? 'export_success',
        };

        console.log('payload', payload);
        // TODO opcional: POST real a tu backend
        // await this.http.post('/api/survey', payload).toPromise();

        // Fallback local para pruebas
        try {
            const k = 'SURVEY_RESPONSES_DEV';
            const arr = JSON.parse(localStorage.getItem(k) || '[]');
            arr.push(payload);
            localStorage.setItem(k, JSON.stringify(arr));
        } catch { }

        this.svc.markResponded();
        
        // (Opcional) mostrar toast de “¡Gracias!”
    }
}
