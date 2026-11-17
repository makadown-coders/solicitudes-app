import { Location } from '@angular/common';
import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { routes } from '../../../app.routes';
import { AuthClient } from '../../../core/auth/auth-client.service';
import { authGuard } from '../../../core/auth/auth.guard';
import { authInterceptor } from '../../../core/auth/auth.interceptor';
import { UserProfile } from '../../../core/auth/auth.models';
import { SessionStore } from '../../../core/auth/session-store.service';
import { TokenStore } from '../../../core/auth/token-store.service';
import { TiUsuariosService } from '../../../services/ti-usuarios.service';
import { LoginPageComponent } from '../login/login-page.component';
import {
  ChangePasswordPageComponent,
  PASSWORD_UPDATED_LOGIN_NOTICE,
} from './change-password-page.component';

function buildJwtWithExp(expSeconds: number, sub = 'u-test-1'): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub, exp: expSeconds }));
  return `${header}.${payload}.sig`;
}

describe('Autoservicio de cambio de contraseña (TI-2H.2)', () => {
  let fixture: ComponentFixture<ChangePasswordPageComponent>;
  let component: ChangePasswordPageComponent;
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let tokenStore: TokenStore;
  let sessionStore: SessionStore;
  let authClient: AuthClient;
  let tiUsuariosService: TiUsuariosService;
  let router: Router;
  let location: Location;

  const apiBase = environment.apiUrl.replace(/\/+$/, '');
  const authBase = `${apiBase}/auth`;
  const tiBase = `${apiBase}/ti`;

  const nonAdminUser: UserProfile = {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'operador@imssbienestar.gob.mx',
    name: 'Operador RH',
    roles: [{ code: 'RECURSOS_HUMANOS', scope: 'CLUES', id: 'BCIMB000001' }],
  };

  const adminTicUser: UserProfile = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'admin.ti@imssbienestar.gob.mx',
    name: 'Carlos Admin TIC',
    roles: [{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }],
  };

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ChangePasswordPageComponent, LoginPageComponent],
      providers: [
        provideRouter(routes),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        TokenStore,
        SessionStore,
        AuthClient,
        TiUsuariosService,
      ],
    }).compileComponents();

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    tokenStore = TestBed.inject(TokenStore);
    sessionStore = TestBed.inject(SessionStore);
    authClient = TestBed.inject(AuthClient);
    tiUsuariosService = TestBed.inject(TiUsuariosService);
    router = TestBed.inject(Router);
    location = TestBed.inject(Location);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  function setupAuthenticatedSession(user: UserProfile = nonAdminUser): string {
    const validToken = buildJwtWithExp(Math.floor(Date.now() / 1000) + 600, user.id);
    tokenStore.set(validToken, 'rt-active-1');
    sessionStore.setUser(user);
    return validToken;
  }

  function createComponent(): void {
    fixture = TestBed.createComponent(ChangePasswordPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('1. Usuario autenticado puede acceder a /mi-cuenta/cambiar-password (protegido solo con authGuard, sin tiAdminGlobalGuard)', async () => {
    // Sin sesión redirige a /login?returnUrl=%2Fmi-cuenta%2Fcambiar-password
    await router.navigateByUrl('/mi-cuenta/cambiar-password');
    expect(location.path()).toBe('/login?returnUrl=%2Fmi-cuenta%2Fcambiar-password');

    // Con sesión confirmada de usuario sin ADMIN_TIC accede a la ruta
    setupAuthenticatedSession(nonAdminUser);
    const navigated = await router.navigateByUrl('/mi-cuenta/cambiar-password');
    expect(navigated).toBeTrue();
    expect(location.path()).toBe('/mi-cuenta/cambiar-password');

    const miCuentaRoute = routes.find((r) => r.path === 'mi-cuenta');
    expect(miCuentaRoute?.canActivate).toEqual([authGuard]);
  });

  it('2, 8, 9, 10, 11, 12 y 16. Usuario sin ADMIN_TIC cambia su contraseña con payload exacto, Bearer adjunto, limpia sesión sin refresh y redirige a /login con confirmación', async () => {
    const validToken = setupAuthenticatedSession(nonAdminUser);
    createComponent();

    component.form.controls.currentPassword.setValue('ClaveAnterior#1');
    component.form.controls.newPassword.setValue('ClaveNuevaSegura#2');
    component.form.controls.confirmPassword.setValue('ClaveNuevaSegura#2');
    fixture.detectChanges();

    expect(component.canSubmit()).toBeTrue();

    const submitPromise = component.onSubmit();
    const req = httpMock.expectOne(`${authBase}/me/password`);

    // 8. Método PUT y payload exacto sin identificadores adicionales
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      current_password: 'ClaveAnterior#1',
      new_password: 'ClaveNuevaSegura#2',
    });
    expect(Object.keys(req.request.body).sort()).toEqual(['current_password', 'new_password']);
    expect('user_id' in req.request.body).toBeFalse();
    expect('persona_id' in req.request.body).toBeFalse();
    expect('email' in req.request.body).toBeFalse();
    expect('roles' in req.request.body).toBeFalse();

    // 9. Authorization Bearer adjunto por authInterceptor
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${validToken}`);

    req.flush({ ok: true, revoked_sessions: 2 });
    await submitPromise;

    // 16. No se produce refresh ni llamada HTTP a /auth/logout tras el éxito
    httpMock.expectNone(`${authBase}/refresh`);
    httpMock.expectNone(`${authBase}/logout`);

    // 10. Limpia sesión local y campos sensibles
    expect(tokenStore.access).toBeNull();
    expect(tokenStore.refresh).toBeNull();
    expect(sessionStore.currentUser).toBeNull();
    expect(sessionStore.isHydrated).toBeFalse();
    expect(component.form.controls.currentPassword.value).toBe('');
    expect(component.form.controls.newPassword.value).toBe('');
    expect(component.form.controls.confirmPassword.value).toBe('');

    // 11. Redirige a /login
    expect(location.path()).toBe('/login');

    // 12. Al montar LoginPageComponent se presenta el mensaje de confirmación requerido
    const loginFixture = TestBed.createComponent(LoginPageComponent);
    loginFixture.detectChanges();
    expect(loginFixture.componentInstance.successMessage()).toBe(PASSWORD_UPDATED_LOGIN_NOTICE);
    const alertEl = loginFixture.nativeElement.querySelector('#login-success-alert') as HTMLElement | null;
    expect(alertEl).not.toBeNull();
    expect(alertEl?.textContent).toContain('Contraseña actualizada. Inicia sesión con tu nueva contraseña');
  });

  it('3. Usuario ADMIN_TIC también puede utilizar el formulario para cambiar su propia contraseña', async () => {
    const validToken = setupAuthenticatedSession(adminTicUser);
    createComponent();

    expect(component.backLink()).toBe('/ti');

    component.form.controls.currentPassword.setValue('AdminActual#2026');
    component.form.controls.newPassword.setValue('AdminNueva#2026');
    component.form.controls.confirmPassword.setValue('AdminNueva#2026');
    fixture.detectChanges();

    const submitPromise = component.onSubmit();
    const req = httpMock.expectOne(`${authBase}/me/password`);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${validToken}`);
    expect(req.request.body).toEqual({
      current_password: 'AdminActual#2026',
      new_password: 'AdminNueva#2026',
    });
    req.flush({ ok: true, revoked_sessions: 1 });
    await submitPromise;

    expect(tokenStore.access).toBeNull();
    expect(location.path()).toBe('/login');
  });

  it('4, 5 y 6. Validaciones de campos obligatorios, nueva contraseña menor a 8 caracteres, igual a la actual y confirmación diferente', async () => {
    setupAuthenticatedSession(nonAdminUser);
    createComponent();

    const submitBtn = fixture.nativeElement.querySelector(
      '#change-password-submit-btn'
    ) as HTMLButtonElement;

    // 4. Campos obligatorios (vacíos inicialmente) -> botón deshabilitado
    expect(component.canSubmit()).toBeFalse();
    expect(submitBtn.disabled).toBeTrue();
    await component.onSubmit();
    httpMock.expectNone(`${authBase}/me/password`);

    // 5. Nueva contraseña menor a 8 caracteres (o solo espacios) -> deshabilitado
    component.form.controls.currentPassword.setValue('ClaveActual#1');
    component.form.controls.newPassword.setValue('1234567');
    component.form.controls.confirmPassword.setValue('1234567');
    component.form.controls.newPassword.markAsTouched();
    fixture.detectChanges();

    expect(component.isNewPasswordTooShort()).toBeTrue();
    expect(component.canSubmit()).toBeFalse();
    expect(submitBtn.disabled).toBeTrue();
    expect(fixture.nativeElement.querySelector('#new-password-error')?.textContent).toContain(
      '8 caracteres'
    );

    // 6. Confirmación diferente -> deshabilitado
    component.form.controls.newPassword.setValue('ClaveValida#2026');
    component.form.controls.confirmPassword.setValue('OtraClaveDistinta#2026');
    component.form.controls.confirmPassword.markAsTouched();
    fixture.detectChanges();

    expect(component.isConfirmMismatch()).toBeTrue();
    expect(component.canSubmit()).toBeFalse();
    expect(submitBtn.disabled).toBeTrue();
    expect(fixture.nativeElement.querySelector('#confirm-password-error')?.textContent).toContain(
      'no coincide'
    );

    // Nueva contraseña igual a la actual -> deshabilitado
    component.form.controls.newPassword.setValue('ClaveActual#1');
    component.form.controls.confirmPassword.setValue('ClaveActual#1');
    fixture.detectChanges();

    expect(component.isNewSameAsCurrent()).toBeTrue();
    expect(component.canSubmit()).toBeFalse();
    expect(submitBtn.disabled).toBeTrue();
  });

  it('7. Botón deshabilitado mientras se envía la solicitud y controles para mostrar/ocultar contraseñas ocultos por defecto', async () => {
    setupAuthenticatedSession(nonAdminUser);
    createComponent();

    const currentInput = fixture.nativeElement.querySelector('#current-password-input') as HTMLInputElement;
    const newInput = fixture.nativeElement.querySelector('#new-password-input') as HTMLInputElement;
    const confirmInput = fixture.nativeElement.querySelector('#confirm-password-input') as HTMLInputElement;

    // Por defecto todos son type="password"
    expect(currentInput.type).toBe('password');
    expect(newInput.type).toBe('password');
    expect(confirmInput.type).toBe('password');

    // Alternar visibilidad
    component.toggleCurrentPasswordVisibility();
    component.toggleNewPasswordVisibility();
    component.toggleConfirmPasswordVisibility();
    fixture.detectChanges();
    expect(currentInput.type).toBe('text');
    expect(newInput.type).toBe('text');
    expect(confirmInput.type).toBe('text');

    component.form.controls.currentPassword.setValue('ClaveActual#1');
    component.form.controls.newPassword.setValue('ClaveNueva#2026');
    component.form.controls.confirmPassword.setValue('ClaveNueva#2026');
    fixture.detectChanges();

    const p1 = component.onSubmit();
    fixture.detectChanges();

    const submitBtn = fixture.nativeElement.querySelector(
      '#change-password-submit-btn'
    ) as HTMLButtonElement;
    expect(component.submitting()).toBeTrue();
    expect(component.canSubmit()).toBeFalse();
    expect(submitBtn.disabled).toBeTrue();

    // Un segundo clic mientras está en vuelo no dispara otra petición
    const p2 = component.onSubmit();
    const reqs = httpMock.match(`${authBase}/me/password`);
    expect(reqs.length).toBe(1);

    reqs[0].flush({ ok: true, revoked_sessions: 1 });
    await Promise.all([p1, p2]);
  });

  it('9 y 18. El interceptor adjunta Authorization Bearer a PUT /auth/me/password, pero NO a otros métodos en /auth/me/password ni a login, refresh, logout o rutas públicas', async () => {
    const validToken = setupAuthenticatedSession(nonAdminUser);

    // GET o POST sobre /auth/me/password NO deben recibir Bearer
    const pGet = firstValueFrom(http.get(`${authBase}/me/password`));
    const pPost = firstValueFrom(http.post(`${authBase}/me/password`, {}));
    const pPublic = firstValueFrom(http.get(`${apiBase}/radar-abasto/v2/resumen`));

    const reqGet = httpMock.expectOne(
      (r) => r.url === `${authBase}/me/password` && r.method === 'GET'
    );
    const reqPost = httpMock.expectOne(
      (r) => r.url === `${authBase}/me/password` && r.method === 'POST'
    );
    const reqPub = httpMock.expectOne(`${apiBase}/radar-abasto/v2/resumen`);

    expect(reqGet.request.headers.has('Authorization')).toBeFalse();
    expect(reqPost.request.headers.has('Authorization')).toBeFalse();
    expect(reqPub.request.headers.has('Authorization')).toBeFalse();

    reqGet.flush({});
    reqPost.flush({});
    reqPub.flush({});
    await Promise.all([pGet, pPost, pPublic]);

    // PUT /auth/me/password SÍ recibe Bearer
    const pPut = authClient.changeOwnPassword('Actual123!', 'Nueva1234!');
    const reqPut = httpMock.expectOne(
      (r) => r.url === `${authBase}/me/password` && r.method === 'PUT'
    );
    expect(reqPut.request.headers.get('Authorization')).toBe(`Bearer ${validToken}`);
    reqPut.flush({ ok: true, revoked_sessions: 1 });
    await pPut;
  });

  it('13. HTTP 400 (contraseña actual incorrecta): muestra error comprensible, mantiene el formulario disponible para corregir y NO cierra la sesión', async () => {
    const validToken = setupAuthenticatedSession(nonAdminUser);
    createComponent();

    component.form.controls.currentPassword.setValue('ClaveIncorrecta#1');
    component.form.controls.newPassword.setValue('ClaveNueva#2026');
    component.form.controls.confirmPassword.setValue('ClaveNueva#2026');
    fixture.detectChanges();

    const submitPromise = component.onSubmit();
    const req = httpMock.expectOne(`${authBase}/me/password`);
    req.flush(
      { error: 'La contraseña actual es incorrecta' },
      { status: 400, statusText: 'Bad Request' }
    );
    await submitPromise;
    fixture.detectChanges();

    expect(component.errorMessage()).toBe('La contraseña actual es incorrecta');
    expect(component.successMessage()).toBeNull();
    // La sesión sigue activa
    expect(tokenStore.access).toBe(validToken);
    expect(sessionStore.currentUser).toEqual(nonAdminUser);
    // El formulario conserva las nuevas contraseñas para permitir corregir la contraseña actual
    expect(component.form.controls.newPassword.value).toBe('ClaveNueva#2026');
    expect(component.form.controls.confirmPassword.value).toBe('ClaveNueva#2026');
  });

  it('14. HTTP 401 en PUT /auth/me/password: conserva el flujo de refresh del interceptor (o limpia sesión y redirige a /login si el refresh falla)', async () => {
    setupAuthenticatedSession(nonAdminUser);
    tokenStore.set('expired-access-token', 'revoked-refresh-token');
    createComponent();

    component.form.controls.currentPassword.setValue('ClaveActual#1');
    component.form.controls.newPassword.setValue('ClaveNueva#2026');
    component.form.controls.confirmPassword.setValue('ClaveNueva#2026');
    fixture.detectChanges();

    const submitPromise = component.onSubmit();

    // Primer intento recibe 401 -> authInterceptor dispara POST /auth/refresh
    const initialReq = httpMock.expectOne(`${authBase}/me/password`);
    initialReq.flush({ error: 'Invalid/expired token' }, { status: 401, statusText: 'Unauthorized' });

    const refreshReq = httpMock.expectOne(`${authBase}/refresh`);
    refreshReq.flush({ error: 'expired refresh' }, { status: 401, statusText: 'Unauthorized' });

    await submitPromise;

    expect(tokenStore.access).toBeNull();
    expect(tokenStore.refresh).toBeNull();
    expect(sessionStore.currentUser).toBeNull();
    expect(location.path()).toContain('/login');
  });

  it('15. HTTP 403 y HTTP 500 muestran errores controlados sin cerrar la sesión', async () => {
    const validToken = setupAuthenticatedSession(nonAdminUser);
    createComponent();

    component.form.controls.currentPassword.setValue('ClaveActual#1');
    component.form.controls.newPassword.setValue('ClaveNueva#2026');
    component.form.controls.confirmPassword.setValue('ClaveNueva#2026');
    fixture.detectChanges();

    // Caso 403
    const p403 = component.onSubmit();
    const req403 = httpMock.expectOne(`${authBase}/me/password`);
    req403.flush(
      { error: 'La cuenta no se encuentra activa' },
      { status: 403, statusText: 'Forbidden' }
    );
    await p403;
    expect(component.errorMessage()).toContain('La cuenta no se encuentra activa');
    expect(tokenStore.access).toBe(validToken);

    // Caso 500
    const p500 = component.onSubmit();
    const req500 = httpMock.expectOne(`${authBase}/me/password`);
    req500.flush(
      { error: 'Internal server error' },
      { status: 500, statusText: 'Internal Server Error' }
    );
    await p500;
    expect(component.errorMessage()).toContain('error interno');
    expect(tokenStore.access).toBe(validToken);
  });

  it('17. El cambio de contraseña administrativo (TiUsuariosService.restablecerContrasena -> PUT /api/ti/usuarios/:id/password) permanece intacto', async () => {
    const validToken = setupAuthenticatedSession(adminTicUser);

    const pAdminReset = tiUsuariosService.restablecerContrasena(
      '33333333-3333-4333-8333-333333333333',
      'NuevaClaveAdmin#2026'
    );
    const reqAdmin = httpMock.expectOne(
      `${tiBase}/usuarios/33333333-3333-4333-8333-333333333333/password`
    );
    expect(reqAdmin.request.method).toBe('PUT');
    expect(reqAdmin.request.headers.get('Authorization')).toBe(`Bearer ${validToken}`);
    expect(reqAdmin.request.body).toEqual({ password: 'NuevaClaveAdmin#2026' });

    reqAdmin.flush({
      ok: true,
      id: '33333333-3333-4333-8333-333333333333',
      revoked_sessions: 1,
    });

    const res = await pAdminReset;
    expect(res).toEqual({
      ok: true,
      id: '33333333-3333-4333-8333-333333333333',
      revoked_sessions: 1,
    });
  });
});
