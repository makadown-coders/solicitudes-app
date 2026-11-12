import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { Building2, LogOut, LucideAngularModule, ShieldCheck, User } from 'lucide-angular';
import { AuthClient } from '../../core/auth/auth-client.service';
import { SessionStore } from '../../core/auth/session-store.service';

@Component({
  selector: 'app-rh-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rh-shell.component.html',
})
export class RhShellComponent {
  private readonly authClient = inject(AuthClient);
  private readonly sessionStore = inject(SessionStore);
  private readonly router = inject(Router);

  readonly icons = {
    user: User,
    logOut: LogOut,
    building: Building2,
    shieldCheck: ShieldCheck,
  };

  readonly loggingOut = signal(false);

  /** Señal con el usuario autenticado actual desde SessionStore */
  readonly user = this.sessionStore.user;

  /** Nombre visible del usuario autenticado (fallback seguro al correo o 'Usuario autenticado') */
  readonly displayName = computed(() => {
    const profile = this.user();
    if (!profile) {
      return 'Usuario autenticado';
    }
    return profile.name?.trim() || profile.email?.trim() || 'Usuario autenticado';
  });

  /** Correo visible del usuario autenticado */
  readonly displayEmail = computed(() => {
    const profile = this.user();
    return profile?.email?.trim() || '';
  });

  /**
   * Ejecuta el cierre de sesión utilizando `AuthClient.logout()`.
   *
   * Protección contra redirección tardía:
   * - `AuthClient.logout()` limpia sincrónicamente `SessionStore` y `TokenStore` e incrementa
   *   `currentEpoch` antes del `await` HTTP.
   * - Capturamos `expectedLogoutEpoch = this.sessionStore.currentEpoch + 1`.
   * - Si mientras el `POST /auth/logout` está en vuelo se iniciara una sesión nueva (avanzando
   *   `currentEpoch` más allá de `expectedLogoutEpoch`), este `onLogout()` antiguo NO ejecuta
   *   `router.navigate(['/login'])`, evitando interrumpir la sesión nueva.
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
