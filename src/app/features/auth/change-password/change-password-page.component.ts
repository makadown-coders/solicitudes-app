import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  LucideAngularModule,
  ShieldCheck,
  User,
} from 'lucide-angular';
import { merge } from 'rxjs';
import { AuthClient } from '../../../core/auth/auth-client.service';
import { SessionStore } from '../../../core/auth/session-store.service';
import { hasTiAdminGlobalRole } from '../../../core/auth/ti-admin-global.guard';

export const PASSWORD_UPDATED_LOGIN_NOTICE =
  'Contraseña actualizada. Inicia sesión con tu nueva contraseña';

@Component({
  selector: 'app-change-password-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './change-password-page.component.html',
})
export class ChangePasswordPageComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly authClient = inject(AuthClient);
  private readonly sessionStore = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly icons = {
    user: User,
    lock: Lock,
    keyRound: KeyRound,
    eye: Eye,
    eyeOff: EyeOff,
    alertCircle: AlertCircle,
    checkCircle: CheckCircle2,
    loader: Loader2,
    logOut: LogOut,
    arrowLeft: ArrowLeft,
    shieldCheck: ShieldCheck,
  };

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

  /** Ruta de retorno sugerida según el perfil autenticado actual */
  readonly backLink = computed(() => (hasTiAdminGlobalRole(this.user()) ? '/ti' : '/rh'));
  readonly backLabel = computed(() =>
    hasTiAdminGlobalRole(this.user()) ? 'Volver a Administración TI' : 'Volver a Recursos Humanos'
  );

  readonly submitting = signal(false);
  readonly loggingOut = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  /** Controles de visibilidad individuales, ocultos por defecto */
  readonly showCurrentPassword = signal(false);
  readonly showNewPassword = signal(false);
  readonly showConfirmPassword = signal(false);

  readonly form = this.fb.nonNullable.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]],
  });

  /** Señales sincronizadas exclusivamente en memoria efímera del componente para reactividad bajo OnPush */
  private readonly currentValSig = signal('');
  private readonly newValSig = signal('');
  private readonly confirmValSig = signal('');

  readonly isNewPasswordTooShort = computed(() => {
    const val = this.newValSig();
    return val.length > 0 && val.trim().length < 8;
  });

  readonly isNewSameAsCurrent = computed(() => {
    const current = this.currentValSig();
    const next = this.newValSig();
    return current.length > 0 && next.length > 0 && current === next;
  });

  readonly isConfirmMismatch = computed(() => {
    const next = this.newValSig();
    const confirm = this.confirmValSig();
    return confirm.length > 0 && next !== confirm;
  });

  readonly canSubmit = computed(() => {
    if (this.submitting() || this.loggingOut()) {
      return false;
    }
    const current = this.currentValSig();
    const next = this.newValSig();
    const confirm = this.confirmValSig();

    if (!current || !next || !confirm) {
      return false;
    }
    if (next.trim().length < 8) {
      return false;
    }
    if (current === next) {
      return false;
    }
    if (next !== confirm) {
      return false;
    }
    return true;
  });

  constructor() {
    merge(
      this.form.controls.currentPassword.valueChanges,
      this.form.controls.newPassword.valueChanges,
      this.form.controls.confirmPassword.valueChanges
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.syncFormSignals();
      });
  }

  ngOnDestroy(): void {
    this.clearSensitiveFields();
  }

  toggleCurrentPasswordVisibility(): void {
    this.showCurrentPassword.update((v) => !v);
  }

  toggleNewPasswordVisibility(): void {
    this.showNewPassword.update((v) => !v);
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword.update((v) => !v);
  }

  /**
   * Limpia de inmediato las contraseñas en el formulario y en las señales efímeras,
   * y restablece los controles de visibilidad a oculto.
   */
  clearSensitiveFields(): void {
    this.form.reset({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    this.currentValSig.set('');
    this.newValSig.set('');
    this.confirmValSig.set('');
    this.showCurrentPassword.set(false);
    this.showNewPassword.set(false);
    this.showConfirmPassword.set(false);
  }

  async onSubmit(): Promise<void> {
    this.syncFormSignals();

    if (this.submitting() || this.loggingOut()) {
      return;
    }

    this.form.markAllAsTouched();

    if (!this.canSubmit()) {
      return;
    }

    const currentPassword = this.form.controls.currentPassword.value;
    const newPassword = this.form.controls.newPassword.value;

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    try {
      await this.authClient.changeOwnPassword(currentPassword, newPassword);

      // 1) Limpiar valores sensibles inmediatamente tras éxito
      this.clearSensitiveFields();

      // 2) Confirmar el cambio y registrar el aviso para la pantalla de login
      this.successMessage.set(PASSWORD_UPDATED_LOGIN_NOTICE);
      this.sessionStore.setPostLogoutNotice(PASSWORD_UPDATED_LOGIN_NOTICE);

      // 3) Limpiar inmediatamente la sesión y credenciales locales mediante el mecanismo existente
      //    (sin llamar a POST /auth/logout ni intentar refresh, pues el backend ya revocó las sesiones)
      this.sessionStore.clear();

      // 4) Redirigir a /login
      await this.router.navigate(['/login']);
    } catch (err: unknown) {
      await this.handleSubmitError(err);
    } finally {
      this.submitting.set(false);
    }
  }

  async onLogout(): Promise<void> {
    if (this.loggingOut() || this.submitting()) {
      return;
    }

    this.loggingOut.set(true);
    this.clearSensitiveFields();
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

  private syncFormSignals(): void {
    this.currentValSig.set(this.form.controls.currentPassword.value ?? '');
    this.newValSig.set(this.form.controls.newPassword.value ?? '');
    this.confirmValSig.set(this.form.controls.confirmPassword.value ?? '');
  }

  private async handleSubmitError(err: unknown): Promise<void> {
    const status = this.extractHttpStatus(err);
    const serverMessage = this.extractServerErrorMessage(err);

    if (status === 400) {
      this.errorMessage.set(
        serverMessage ||
          'La contraseña actual es incorrecta o los datos proporcionados no son válidos. Verifica e intenta nuevamente.'
      );
      return;
    }

    if (status === 401) {
      this.clearSensitiveFields();
      this.sessionStore.clear();
      this.sessionStore.setPostLogoutNotice(
        'Tu sesión expiró. Inicia sesión nuevamente para cambiar tu contraseña.'
      );
      await this.router.navigate(['/login'], {
        queryParams: { returnUrl: '/mi-cuenta/cambiar-password' },
      });
      return;
    }

    if (status === 403) {
      this.errorMessage.set(
        serverMessage || 'Tu cuenta no se encuentra activa para realizar esta operación.'
      );
      return;
    }

    if (status === 404) {
      this.errorMessage.set(
        serverMessage || 'No fue posible encontrar la cuenta autenticada.'
      );
      return;
    }

    if (status === 0 || (status !== null && status >= 500)) {
      this.errorMessage.set(
        'Ocurrió un error interno al procesar la solicitud. Intenta nuevamente en unos momentos.'
      );
      return;
    }

    this.errorMessage.set(
      'No fue posible actualizar la contraseña en este momento. Intenta nuevamente.'
    );
  }

  private extractHttpStatus(err: unknown): number | null {
    if (err instanceof HttpErrorResponse) {
      return err.status;
    }
    if (typeof err === 'object' && err !== null && 'status' in err) {
      const status = (err as { status?: unknown }).status;
      return typeof status === 'number' ? status : null;
    }
    return null;
  }

  private extractServerErrorMessage(err: unknown): string | null {
    if (err instanceof HttpErrorResponse) {
      const payload = err.error;
      if (typeof payload === 'object' && payload !== null && 'error' in payload) {
        const msg = (payload as { error?: unknown }).error;
        if (typeof msg === 'string' && msg.trim().length > 0) {
          return msg.trim();
        }
      }
    }
    return null;
  }
}
