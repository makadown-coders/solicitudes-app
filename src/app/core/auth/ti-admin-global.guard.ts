import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { UserProfile } from './auth.models';
import { SessionStore } from './session-store.service';

/**
 * Evalúa si el perfil de sesión del usuario autenticado posee exactamente
 * la asignación global requerida para el módulo de Administración TI:
 * `{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }`.
 *
 * Respeta el contrato del JWT y de `GET /api/auth/me` (`scope` / `id`),
 * sin aceptar alcances parciales (`CLUES`, `DEPTO`, `UNIDAD`), ni comodines
 * distintos de `null`, ni otros códigos de rol (`RECURSOS_HUMANOS`, `OPER_TIC`, etc.).
 */
export function hasTiAdminGlobalRole(user: UserProfile | null | undefined): boolean {
  if (!user || !Array.isArray(user.roles)) {
    return false;
  }

  return user.roles.some(
    role =>
      typeof role === 'object' &&
      role !== null &&
      role.code === 'ADMIN_TIC' &&
      role.scope === 'GLOBAL' &&
      role.id === null
  );
}

/**
 * Guard funcional (`CanActivateFn`) que exige que la sesión ya autenticada e hidratada
 * por `authGuard` cuente con el rol estricto `{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }`.
 *
 * Debe ejecutarse después de `authGuard` (`canActivate: [authGuard, tiAdminGlobalGuard]`).
 * - Si no existe sesión hidratada, redirige a `/login`.
 * - Si el usuario está autenticado pero carece de `ADMIN_TIC GLOBAL`, deniega la navegación
 *   redirigiendo hacia `/home` (sin borrar su sesión válida para otros módulos como `/rh`).
 */
export const tiAdminGlobalGuard: CanActivateFn = (_route, state): boolean | UrlTree => {
  const session = inject(SessionStore);
  const router = inject(Router);

  if (!session.isHydrated || !session.currentUser) {
    return router.createUrlTree(['/login'], {
      queryParams: { returnUrl: state.url || '/ti' },
    });
  }

  if (!hasTiAdminGlobalRole(session.currentUser)) {
    return router.createUrlTree(['/home']);
  }

  return true;
};
