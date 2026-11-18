import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  Briefcase,
  KeyRound,
  LogOut,
  LucideAngularModule,
  ShieldCheck,
  User,
} from 'lucide-angular';
import { AuthClient } from '../../core/auth/auth-client.service';
import { resolveRhRoleContext } from '../../core/auth/rh-access.guard';
import { SessionStore } from '../../core/auth/session-store.service';

@Component({
  selector: 'app-rh-employee-portal',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rh-employee-portal.component.html',
})
export class RhEmployeePortalComponent {
  private readonly authClient = inject(AuthClient);
  private readonly sessionStore = inject(SessionStore);
  private readonly router = inject(Router);

  readonly icons = {
    user: User,
    briefcase: Briefcase,
    shieldCheck: ShieldCheck,
    keyRound: KeyRound,
    logOut: LogOut,
  };

  readonly loggingOut = signal(false);

  /** Señal con el usuario autenticado actual desde SessionStore */
  readonly user = this.sessionStore.user;

  readonly displayName = computed(() => {
    const profile = this.user();
    if (!profile) {
      return 'Usuario autenticado';
    }
    return profile.name?.trim() || profile.email?.trim() || 'Usuario autenticado';
  });

  readonly displayEmail = computed(() => {
    const profile = this.user();
    return profile?.email?.trim() || '';
  });

  /**
   * Evalúa si el contexto de roles existente permite acceso a `/rh-admin`
   * reutilizando estrictamente `resolveRhRoleContext()`.
   */
  readonly adminRoleContext = computed(() => resolveRhRoleContext(this.user()));

  readonly canAccessRhAdmin = computed(() => this.adminRoleContext() !== null);

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
