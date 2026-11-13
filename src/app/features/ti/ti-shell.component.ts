import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  ContactRound,
  LogOut,
  LucideAngularModule,
  ShieldCheck,
  User,
  Users,
} from 'lucide-angular';
import { AuthClient } from '../../core/auth/auth-client.service';
import { SessionStore } from '../../core/auth/session-store.service';

@Component({
  selector: 'app-ti-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ti-shell.component.html',
})
export class TiShellComponent {
  private readonly authClient = inject(AuthClient);
  private readonly sessionStore = inject(SessionStore);
  private readonly router = inject(Router);

  readonly icons = {
    user: User,
    users: Users,
    personas: ContactRound,
    logOut: LogOut,
    shieldCheck: ShieldCheck,
  };

  readonly loggingOut = signal(false);

  /** Señal con el usuario autenticado actual desde SessionStore */
  readonly user = this.sessionStore.user;

  /** Nombre visible del usuario autenticado (fallback seguro al correo o 'Administrador TI') */
  readonly displayName = computed(() => {
    const profile = this.user();
    if (!profile) {
      return 'Administrador TI';
    }
    return profile.name?.trim() || profile.email?.trim() || 'Administrador TI';
  });

  /** Correo visible del usuario autenticado */
  readonly displayEmail = computed(() => {
    const profile = this.user();
    return profile?.email?.trim() || '';
  });

  /**
   * Ejecuta el cierre de sesión utilizando `AuthClient.logout()`.
   * Conserva el control de época (`expectedLogoutEpoch`) para evitar navegaciones tardías
   * si se inicia otra sesión antes de que finalice la revocación remota.
   */
  async onLogout(): Promise<void> {
    if (this.loggingOut()) {
      return;
    }

    this.loggingOut.set(true);
    const expectedLogoutEpoch = this.sessionStore.currentEpoch + 1;

    try {
      await this.authClient.logout();
      if (this.sessionStore.currentEpoch === expectedLogoutEpoch) {
        await this.router.navigate(['/login']);
      }
    } finally {
      if (this.sessionStore.currentEpoch === expectedLogoutEpoch) {
        this.loggingOut.set(false);
      }
    }
  }
}
