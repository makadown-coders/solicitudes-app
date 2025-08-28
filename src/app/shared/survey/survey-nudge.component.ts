// src/app/shared/survey/survey-nudge.component.ts
import { Component, OnDestroy, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SurveyService } from '../../services/survey.service';

@Component({
  selector: 'app-survey-nudge',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './survey-nudge.component.html',
})
export class SurveyNudgeComponent implements OnInit, OnDestroy {
  svc = inject(SurveyService);
  private timer?: any;

  ngOnInit() {
    // Autocierre suave a los 10 s (no aplica snooze largo, solo oculta en esta sesión)
    this.timer = setTimeout(() => this.svc.dismissSoft(), 10000);
  }
  ngOnDestroy() { if (this.timer) clearTimeout(this.timer); }
}
