import { Injectable, signal } from '@angular/core';

const ACCESS_TOKEN_KEY = 'imssb.auth.access';
const REFRESH_TOKEN_KEY = 'imssb.auth.refresh';

/**
 * Margen de seguridad (en segundos) para considerar próximo a expirar un access token
 * y evitar enviar peticiones que venzan en tránsito.
 */
const DEFAULT_EXPIRY_SKEW_SECONDS = 15;

interface JwtExpClaims {
  exp?: unknown;
}

/**
 * Almacén reactivo de tokens de autenticación (access y refresh).
 *
 * NOTA DE SEGURIDAD:
 * - La persistencia en localStorage bajo las claves históricas `imssb.auth.access` e
 *   `imssb.auth.refresh` es una medida provisional de compatibilidad.
 * - La decodificación del payload JWT realizada aquí sirve EXCLUSIVAMENTE para
 *   consultar el claim `exp` y optimizar el flujo de sesión en el cliente.
 * - Decodificar un JWT en el navegador NUNCA equivale a verificar su firma criptográfica,
 *   autenticidad ni autorización; dicha responsabilidad recae siempre en el backend.
 */
@Injectable({ providedIn: 'root' })
export class TokenStore {
  private readonly accessSig = signal<string | null>(this.readStorage(ACCESS_TOKEN_KEY));
  private readonly refreshSig = signal<string | null>(this.readStorage(REFRESH_TOKEN_KEY));

  /** Señales de solo lectura para consumidores reactivos */
  readonly accessToken = this.accessSig.asReadonly();
  readonly refreshToken = this.refreshSig.asReadonly();

  /** Obtiene el access token actual (o null si no existe) */
  get access(): string | null {
    return this.accessSig();
  }

  /** Obtiene el refresh token actual (o null si no existe) */
  get refresh(): string | null {
    return this.refreshSig();
  }

  /**
   * Guarda o actualiza ambos tokens en memoria (Signals) y en localStorage.
   * Si algún valor es null, undefined o cadena vacía, elimina la clave correspondiente.
   */
  set(access?: string | null, refresh?: string | null): void {
    const normalizedAccess = this.normalizeToken(access);
    const normalizedRefresh = this.normalizeToken(refresh);

    this.accessSig.set(normalizedAccess);
    this.writeStorage(ACCESS_TOKEN_KEY, normalizedAccess);

    this.refreshSig.set(normalizedRefresh);
    this.writeStorage(REFRESH_TOKEN_KEY, normalizedRefresh);
  }

  /**
   * Limpia ambos tokens tanto en memoria como en localStorage.
   */
  clear(): void {
    this.set(null, null);
  }

  /**
   * Devuelve el tiempo restante de vigencia del access token en segundos.
   * Si el token no existe, está malformado, no tiene un `exp` numérico válido
   * o ya expiró, devuelve 0.
   */
  getAccessRemainingSeconds(): number {
    const expSeconds = this.extractExpSeconds(this.accessSig());
    if (expSeconds === null) {
      return 0;
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    const remaining = expSeconds - nowSeconds;
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Indica si existe un access token sintácticamente válido cuyo tiempo restante
   * de vigencia supera el margen de tolerancia (`skewSeconds`, por defecto 15s).
   *
   * Esta validación es únicamente para control de flujo de sesión en cliente y
   * no sustituye la verificación criptográfica del servidor.
   */
  hasValidAccessToken(skewSeconds: number = DEFAULT_EXPIRY_SKEW_SECONDS): boolean {
    const safeSkew = Number.isFinite(skewSeconds) && skewSeconds >= 0 ? skewSeconds : DEFAULT_EXPIRY_SKEW_SECONDS;
    return this.getAccessRemainingSeconds() > safeSkew;
  }

  private normalizeToken(value?: string | null): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private readStorage(key: string): string | null {
    try {
      if (typeof localStorage === 'undefined') {
        return null;
      }
      return this.normalizeToken(localStorage.getItem(key));
    } catch {
      return null;
    }
  }

  private writeStorage(key: string, value: string | null): void {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      if (value !== null) {
        localStorage.setItem(key, value);
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      // Ignorar errores de cuota o modo privado sin exponer tokens en consola
    }
  }

  /**
   * Extrae defensivamente el claim numérico `exp` (segundos Unix) de un JWT.
   * Retorna `null` si el token está ausente, no tiene 3 segmentos, tiene base64url
   * inválido, no es un objeto JSON o carece de un `exp` numérico finito.
   */
  private extractExpSeconds(token: string | null): number | null {
    if (!token) {
      return null;
    }

    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) {
      return null;
    }

    const decodedJson = this.decodeBase64Url(parts[1]);
    if (!decodedJson) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(decodedJson);
      if (typeof parsed !== 'object' || parsed === null) {
        return null;
      }
      const exp = (parsed as JwtExpClaims).exp;
      if (typeof exp !== 'number' || !Number.isFinite(exp) || exp <= 0) {
        return null;
      }
      return exp;
    } catch {
      return null;
    }
  }

  /**
   * Decodifica un segmento Base64URL a UTF-8 de manera segura sin dependencias externas.
   */
  private decodeBase64Url(segment: string): string | null {
    try {
      if (typeof atob !== 'function') {
        return null;
      }
      const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
      const padLength = (4 - (base64.length % 4)) % 4;
      const padded = base64 + '='.repeat(padLength);
      const binary = atob(padded);

      if (typeof TextDecoder !== 'undefined') {
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      }

      return binary;
    } catch {
      return null;
    }
  }
}
