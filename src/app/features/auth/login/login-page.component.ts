import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  Mail,
  LucideAngularModule,
} from 'lucide-angular';
import { AuthClient } from '../../../core/auth/auth-client.service';
import { SessionStore } from '../../../core/auth/session-store.service';
import { TokenStore } from '../../../core/auth/token-store.service';

/**
 * Valida y normaliza un parámetro `returnUrl` para garantizar que únicamente
 * permita destinos internos autorizados de los módulos administrativos (`/rh`, `/ti` y sus subrutas).
 *
 * Rechaza:
 * - Valores vacíos o que no comiencen con `/`.
 * - Rutas relativas a protocolo (`//evil.com`).
 * - Rutas con barras invertidas (`\`) o caracteres de control.
 * - URLs absolutas o esquemas codificados (`http:`, `https:`, `javascript:`).
 * - `/login` o cualquier ruta fuera de los árboles `/rh` y `/ti`.
 */
export function resolveSafeAdminReturnUrl(rawReturnUrl: string | null | undefined): string {
  if (!rawReturnUrl || typeof rawReturnUrl !== 'string') {
    return '/rh';
  }

  const trimmed = rawReturnUrl.trim();
  if (!trimmed) {
    return '/rh';
  }

  // Rechazar barras invertidas, caracteres de control o intentos de codificar esquemas/barras dobles
  if (
    trimmed.includes('\\') ||
    /[\u0000-\u001f\u007f]/.test(trimmed) ||
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//')
  ) {
    return '/rh';
  }

  try {
    const decoded = decodeURIComponent(trimmed);
    if (
      decoded.includes('\\') ||
      !decoded.startsWith('/') ||
      decoded.startsWith('//') ||
      /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(decoded)
    ) {
      return '/rh';
    }
  } catch {
    return '/rh';
  }

  try {
    const parsed = new URL(trimmed, 'http://localhost');
    if (parsed.origin !== 'http://localhost') {
      return '/rh';
    }

    const pathname = parsed.pathname;
    const isAllowedAdminPath =
      pathname === '/rh' ||
      pathname.startsWith('/rh/') ||
      pathname === '/ti' ||
      pathname.startsWith('/ti/');

    if (!isAllowedAdminPath) {
      return '/rh';
    }

    return `${pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/rh';
  }
}

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login-page.component.html',
})
export class LoginPageComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authClient = inject(AuthClient);
  private readonly sessionStore = inject(SessionStore);
  private readonly tokenStore = inject(TokenStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** Iconos Lucide utilizados en la vista */
  readonly icons = {
    mail: Mail,
    lock: Lock,
    eye: Eye,
    eyeOff: EyeOff,
    logIn: LogIn,
    alertCircle: AlertCircle,
    loader: Loader2,
  };

  readonly submitting = signal(false);
  readonly verifyingExistingSession = signal(false);
  readonly showPassword = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly sessionRecoveryWarning = signal<string | null>(null);

  /**
   * Indica si la sesión actual ya está confirmada por el backend (`SessionStore.isHydrated` + `user`).
   * Nunca se considera confirmada únicamente por tener un token en `TokenStore`.
   */
  readonly hasConfirmedSession = computed(
    () => this.sessionStore.hydrated() && this.sessionStore.user() !== null
  );

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  ngOnInit(): void {
    // 1) Si la sesión ya está confirmada en memoria por el backend, redirigir al destino permitido
    if (this.sessionStore.isHydrated && this.sessionStore.currentUser !== null) {
      void this.router.navigateByUrl(this.getSafeReturnUrl());
      return;
    }

    // 2) Si venimos redirigidos desde el guard por un fallo temporal de red al consultar /auth/me,
    //    mostrar aviso claro sin provocar un bucle automático /login -> /rh -> /login.
    if (this.sessionStore.error()) {
      this.sessionRecoveryWarning.set(
        'No fue posible verificar tu sesión actual por un problema temporal de conexión. Puedes reintentar continuar o iniciar sesión nuevamente.'
      );
    }
  }

  /**
   * Obtiene el destino interno sanitizado a partir de `returnUrl` (fallback `/rh`).
   */
  getSafeReturnUrl(): string {
    const raw = this.route.snapshot.queryParamMap.get('returnUrl');
    return resolveSafeAdminReturnUrl(raw);
  }

  togglePasswordVisibility(): void {
    this.showPassword.update(v => !v);
  }

  /**
   * Permite al usuario reintentar manualmente la verificación de una sesión persistida
   * cuando ocurrió un fallo temporal de conectividad, sin disparar redirecciones automáticas en bucle.
   */
  async retrySessionVerification(): Promise<void> {
    if (this.verifyingExistingSession() || this.submitting()) {
      return;
    }

    if (!this.tokenStore.access && !this.tokenStore.refresh) {
      this.sessionRecoveryWarning.set(null);
      return;
    }

    this.verifyingExistingSession.set(true);
    this.errorMessage.set(null);
    this.sessionRecoveryWarning.set(null);

    try {
      if (!this.tokenStore.hasValidAccessToken() && this.tokenStore.refresh) {
        await this.authClient.refresh();
      }
      if (!this.sessionStore.isHydrated || !this.sessionStore.currentUser) {
        await this.authClient.me();
      }
      if (this.sessionStore.isHydrated && this.sessionStore.currentUser !== null) {
        await this.router.navigateByUrl(this.getSafeReturnUrl());
      }
    } catch (err: unknown) {
      if (this.isInvalidCredentialsOrSessionError(err)) {
        this.sessionRecoveryWarning.set(null);
        this.errorMessage.set('La sesión anterior expiró. Ingresa tus credenciales para continuar.');
      } else {
        this.sessionRecoveryWarning.set(
          'Sigue sin haber conexión con el servidor para verificar la sesión. Intenta de nuevo en unos momentos.'
        );
      }
    } finally {
      this.verifyingExistingSession.set(false);
    }
  }

  /**
   * Envía las credenciales de acceso y, tras respuesta exitosa del backend,
   * navega al destino interno permitido.
   */
  async onSubmit(): Promise<void> {
    if (this.submitting()) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const email = this.form.controls.email.value.trim();
    const password = this.form.controls.password.value;

    if (!email || !password) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.sessionRecoveryWarning.set(null);

    try {
      await this.authClient.login(email, password);
      const targetUrl = this.getSafeReturnUrl();
      await this.router.navigateByUrl(targetUrl);
    } catch (err: unknown) {
      this.errorMessage.set(this.mapLoginErrorToUserMessage(err));
    } finally {
      this.submitting.set(false);
    }
  }

  /**
   * Distingue errores de credenciales inválidas (400/401) frente a errores de conectividad
   * o indisponibilidad temporal del servidor (status 0 / 5xx), sin exponer payloads internos.
   */
  private mapLoginErrorToUserMessage(err: unknown): string {
    if (this.isInvalidCredentialsOrSessionError(err)) {
      return 'Correo electrónico o contraseña incorrectos. Verifica tus datos e intenta nuevamente.';
    }

    if (this.isConnectivityOrServerError(err)) {
      return 'No fue posible conectar con el servidor de autenticación. Verifica tu conexión e intenta de nuevo.';
    }

    return 'No se pudo completar el inicio de sesión en este momento. Intenta nuevamente.';
  }

  private isInvalidCredentialsOrSessionError(err: unknown): boolean {
    const status = this.extractHttpStatus(err);
    return status === 400 || status === 401;
  }

  private isConnectivityOrServerError(err: unknown): boolean {
    const status = this.extractHttpStatus(err);
    return status === 0 || (status !== null && status >= 500);
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
}
