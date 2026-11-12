import { inject, Injectable, Injector, signal } from '@angular/core';
import { UserProfile } from './auth.models';
import { AuthClient } from './auth-client.service';
import { TokenStore } from './token-store.service';

/**
 * Almacén reactivo del estado de sesión del usuario autenticado.
 *
 * Responsabilidades:
 * - Exponer señales de solo lectura para `user`, `loading` y `error`.
 * - Mantener un contador monotónico de época de sesión (`sessionEpoch`) para invalidar
 *   respuestas asíncronas obsoletas (p. ej. un `/auth/refresh` o `/auth/me` iniciado antes
 *   de un `logout()` o de un cambio de usuario).
 * - Coordinar la hidratación del perfil con `AuthClient` sin crear ciclos de inyección
 *   en la construcción de servicios.
 *
 * Nota de seguridad:
 * - La simple presencia de un token en `localStorage` NO implica que la sesión esté
 *   verificada; `user` permanece en `null` hasta que `login()`, `refresh()` o `hydrate()`
 *   reciben confirmación del backend.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly tokens = inject(TokenStore);
  private readonly injector = inject(Injector);

  private readonly userSig = signal<UserProfile | null>(null);
  private readonly loadingSig = signal<boolean>(false);
  private readonly errorSig = signal<string | null>(null);
  private readonly hydratedSig = signal<boolean>(false);

  /**
   * Contador monotónico que se incrementa en cada `clear()`, `logout()` o nuevo `login()`.
   * Permite descartar respuestas HTTP tardías pertenecientes a una sesión anterior.
   */
  private epochCounter = 0;

  /** Señal pública de solo lectura con el perfil del usuario autenticado */
  readonly user = this.userSig.asReadonly();

  /** Señal pública de solo lectura que indica si se está hidratando/validando el perfil */
  readonly loading = this.loadingSig.asReadonly();

  /** Señal pública de solo lectura con el último error de sesión (si existe) */
  readonly error = this.errorSig.asReadonly();

  /** Señal pública de solo lectura que indica si el perfil ya fue confirmado por el backend en la sesión activa */
  readonly hydrated = this.hydratedSig.asReadonly();

  /** Devuelve sincrónicamente el perfil del usuario actual (o `null`) */
  get currentUser(): UserProfile | null {
    return this.userSig();
  }

  /** Indica sincrónicamente si el perfil actual ya fue confirmado por el backend */
  get isHydrated(): boolean {
    return this.hydratedSig();
  }

  /** Época actual de la sesión para control de concurrencia en operaciones asíncronas */
  get currentEpoch(): number {
    return this.epochCounter;
  }

  /**
   * Incrementa la época de sesión, invalidando cualquier operación asíncrona previa en vuelo.
   */
  bumpEpoch(): number {
    this.epochCounter += 1;
    return this.epochCounter;
  }

  /**
   * Establece el perfil del usuario autenticado (p. ej. tras `login`, `refresh` o `me`).
   */
  setUser(profile: UserProfile | null): void {
    this.userSig.set(profile);
    this.hydratedSig.set(profile !== null);
    if (profile !== null) {
      this.errorSig.set(null);
    }
  }

  /** Actualiza el estado de carga de sesión */
  setLoading(isLoading: boolean): void {
    this.loadingSig.set(isLoading);
  }

  /** Registra o limpia un mensaje de error de sesión */
  setError(message: string | null): void {
    this.errorSig.set(message);
  }

  /**
   * Hidrata el perfil del usuario invocando `GET /api/auth/me` a través de `AuthClient`.
   *
   * - Si no hay tokens almacenados, limpia el estado de usuario sin llamar a la red.
   * - Si el usuario ya fue hidratado en la sesión activa y `force` es `false`, no repite la llamada.
   * - Si existen llamadas simultáneas a `hydrate()`, reutiliza la petición en vuelo de `AuthClient.me()`.
   */
  async hydrate(force = false): Promise<UserProfile | null> {
    if (!this.tokens.access && !this.tokens.refresh) {
      this.userSig.set(null);
      this.hydratedSig.set(false);
      return null;
    }

    if (!force && this.hydratedSig() && this.userSig() !== null) {
      return this.userSig();
    }

    const authClient = this.injector.get(AuthClient);
    try {
      await authClient.hydrateSession(force);
      return this.userSig();
    } catch {
      return null;
    }
  }

  /**
   * Limpia completamente la sesión local (perfil, banderas de estado y tokens en `TokenStore`)
   * e incrementa la época de sesión para impedir que respuestas HTTP tardías restauren datos.
   */
  clear(): void {
    this.bumpEpoch();
    this.userSig.set(null);
    this.hydratedSig.set(false);
    this.loadingSig.set(false);
    this.errorSig.set(null);
    this.tokens.clear();
  }
}
