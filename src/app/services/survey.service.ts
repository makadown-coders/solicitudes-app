// src/app/services/survey.service.ts
import { Injectable, signal } from '@angular/core';
import { SurveyRecord, Meta } from '../models';

@Injectable({ providedIn: 'root' })
export class SurveyService {
  // Estado UI controlado por servicio (inyectable en nudge y modal)
  nudgeOpen = signal(false);
  modalOpen = signal(false);
  meta = signal<Meta | null>(null);

  // Config
  private readonly RESPOND_LOCK_DAYS = 30;
  private readonly DEFAULT_SNOOZE_DAYS = 7;
  private readonly BASE_KEY = 'SURVEY_SOLICITUDES_V2025::';
  private readonly SESSION_PREFIX = 'SURVEY_SESSION_SEEN::';

  maybeShow(event: string, meta: { cluesimb?: string; appVersion?: string }) {
    const clues = (meta.cluesimb || 'UNKNOWN').trim();
    if (!this.isEligible(clues)) return;

    // Evitar repetición en la misma sesión
    if (sessionStorage.getItem(this.sessionKey(clues))) return;

    this.meta.set({ ...meta, event });
    this.nudgeOpen.set(true);
    // Marcamos "visto en sesión" (si cierra solo, no hacemos snooze largo)
    sessionStorage.setItem(this.sessionKey(clues), '1');
  }

  /** El usuario aceptó responder */
  accept() {
    this.nudgeOpen.set(false);
    this.modalOpen.set(true);
  }

  /** “Ahora no” => snooze X días */
  dismissSnooze(days = this.DEFAULT_SNOOZE_DAYS) {
    const clues = this.meta()?.cluesimb || 'UNKNOWN';
    this.snooze(clues, days);
    this.nudgeOpen.set(false);
  }

  /** Cierre automático por timeout (no molestar en la misma sesión, sin snooze largo) */
  dismissSoft() {
    this.nudgeOpen.set(false);
  }

  /** Al enviar respuestas con éxito */
  markResponded() {
    const clues = this.meta()?.cluesimb || 'UNKNOWN';
    const rec = this.getRecord(clues);
    const now = new Date();
    const lockUntil = new Date(now.getTime() + this.days(this.RESPOND_LOCK_DAYS));
    this.setRecord(clues, {
      ...rec,
      respondedAt: now.toISOString(),
      snoozeUntil: lockUntil.toISOString(),
      appVersion: this.meta()?.appVersion,
    });
    this.modalOpen.set(false);
  }

  // ===== Helpers de elegibilidad / storage =====
  private isEligible(clues: string): boolean {
    const r = this.getRecord(clues);
    const now = Date.now();
    if (r.respondedAt && now - Date.parse(r.respondedAt) < this.days(this.RESPOND_LOCK_DAYS)) return false;
    if (r.snoozeUntil && Date.parse(r.snoozeUntil) > now) return false;
    return true;
  }

  private snooze(clues: string, days: number) {
    const r = this.getRecord(clues);
    const until = new Date(Date.now() + this.days(days)).toISOString();
    this.setRecord(clues, { ...r, snoozeUntil: until, appVersion: this.meta()?.appVersion });
  }

  private getRecord(clues: string): SurveyRecord {
    try { return JSON.parse(localStorage.getItem(this.key(clues)) || '{}'); }
    catch { return {}; }
  }
  private setRecord(clues: string, rec: SurveyRecord) {
    localStorage.setItem(this.key(clues), JSON.stringify(rec));
  }

  private key(clues: string) { return `${this.BASE_KEY}${clues}`; }
  private sessionKey(clues: string) { return `${this.SESSION_PREFIX}${clues}`; }
  private days(n: number) { return n * 24 * 60 * 60 * 1000; }
}
