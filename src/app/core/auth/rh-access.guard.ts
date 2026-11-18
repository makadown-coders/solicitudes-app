import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { UserProfile } from './auth.models';
import { SessionStore } from './session-store.service';

export type RhAccessScope = 'GLOBAL' | 'CLUES';

export interface RhResolvedRoleContext {
  scope: RhAccessScope;
  clues: string[];
  grantedBy: 'RECURSOS_HUMANOS' | 'ADMIN_TIC';
  badgeLabel: 'RECURSOS_HUMANOS GLOBAL' | 'RECURSOS_HUMANOS CLUES' | 'ADMIN_TIC GLOBAL';
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Resuelve el alcance efectivo de Recursos Humanos a partir del perfil en `SessionStore`
 * siguiendo exactamente el contrato de `requireRhAccess` del backend:
 * - `{ code: 'RECURSOS_HUMANOS', scope: 'GLOBAL', id: null }` -> GLOBAL (RECURSOS_HUMANOS GLOBAL).
 * - `{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }` -> GLOBAL (ADMIN_TIC GLOBAL).
 * - `{ code: 'RECURSOS_HUMANOS', scope: 'CLUES', id: '<CLUES>' }` (con id no vacío y distinto de '*') -> CLUES.
 * - Si coexisten `RECURSOS_HUMANOS GLOBAL` y `RECURSOS_HUMANOS CLUES`, prevalece `GLOBAL`.
 * - Otros roles (`ABASTO`, `WISHLIST`, `IB_ONCO`, `ADMIN_TIC CLUES`, etc.) no conceden acceso.
 */
export function resolveRhRoleContext(
  user: UserProfile | null | undefined
): RhResolvedRoleContext | null {
  if (!user || !Array.isArray(user.roles)) {
    return null;
  }

  let hasRhGlobal = false;
  let hasAdminTicGlobal = false;
  const cluesSet = new Set<string>();

  for (const r of user.roles) {
    if (!isPlainObject(r)) continue;
    const code = typeof r['code'] === 'string' ? r['code'].trim().toUpperCase() : '';
    const scope = typeof r['scope'] === 'string' ? r['scope'].trim().toUpperCase() : '';
    const id = r['id'];

    if (code === 'RECURSOS_HUMANOS' && scope === 'GLOBAL' && id === null) {
      hasRhGlobal = true;
    } else if (code === 'ADMIN_TIC' && scope === 'GLOBAL' && id === null) {
      hasAdminTicGlobal = true;
    } else if (code === 'RECURSOS_HUMANOS' && scope === 'CLUES' && typeof id === 'string') {
      const norm = id.trim().toUpperCase();
      if (norm && norm !== '*') {
        cluesSet.add(norm);
      }
    }
  }

  if (hasRhGlobal) {
    return {
      scope: 'GLOBAL',
      clues: [],
      grantedBy: 'RECURSOS_HUMANOS',
      badgeLabel: 'RECURSOS_HUMANOS GLOBAL',
    };
  }

  if (hasAdminTicGlobal) {
    return {
      scope: 'GLOBAL',
      clues: [],
      grantedBy: 'ADMIN_TIC',
      badgeLabel: 'ADMIN_TIC GLOBAL',
    };
  }

  if (cluesSet.size > 0) {
    return {
      scope: 'CLUES',
      clues: Array.from(cluesSet).sort(),
      grantedBy: 'RECURSOS_HUMANOS',
      badgeLabel: 'RECURSOS_HUMANOS CLUES',
    };
  }

  return null;
}

export function hasRhAccessRole(user: UserProfile | null | undefined): boolean {
  return resolveRhRoleContext(user) !== null;
}

/**
 * Guard funcional (`CanActivateFn`) para proteger la navegación hacia `/rh-admin`.
 *
 * - Debe ejecutarse después de `authGuard` (`canActivate: [authGuard, rhAccessGuard]`).
 * - Considera la hidratación asíncrona de la sesión: si `SessionStore` aún no está hidratado,
 *   espera a `session.hydrate()` antes de evaluar los roles para no rechazar prematuramente al usuario.
 * - Si no existe sesión confirmada tras hidratar, redirige a `/login?returnUrl=/rh-admin`.
 * - Si el usuario está autenticado pero carece de `RECURSOS_HUMANOS` (`GLOBAL` o `CLUES`) y de
 *   `ADMIN_TIC GLOBAL`, deniega la navegación redirigiendo hacia `/home` sin destruir su sesión.
 */
export const rhAccessGuard: CanActivateFn = async (_route, state): Promise<boolean | UrlTree> => {
  const session = inject(SessionStore);
  const router = inject(Router);

  if (!session.isHydrated || !session.currentUser) {
    await session.hydrate();
  }

  if (!session.isHydrated || !session.currentUser) {
    return router.createUrlTree(['/login'], {
      queryParams: { returnUrl: state.url || '/rh-admin' },
    });
  }

  if (!hasRhAccessRole(session.currentUser)) {
    return router.createUrlTree(['/home']);
  }

  return true;
};
