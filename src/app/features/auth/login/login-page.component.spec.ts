import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { AuthClient } from '../../../core/auth/auth-client.service';
import { LoginResponse, UserProfile } from '../../../core/auth/auth.models';
import { SessionStore } from '../../../core/auth/session-store.service';
import { TokenStore } from '../../../core/auth/token-store.service';
import { LoginPageComponent, resolveSafeAdminReturnUrl } from './login-page.component';

function buildJwtWithExp(expSeconds: number): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub: 'u-1', exp: expSeconds }));
  return `${header}.${payload}.sig`;
}

describe('LoginPageComponent (Microintervención 4)', () => {
  let fixture: ComponentFixture<LoginPageComponent>;
  let component: LoginPageComponent;
  let tokenStore: TokenStore;
  let sessionStore: SessionStore;
  let authClientSpy: jasmine.SpyObj<AuthClient>;
  let routerSpy: jasmine.SpyObj<Router>;
  let currentReturnUrl: string | null;

  const mockUser: UserProfile = {
    id: 'u-1',
    email: 'admin@imssbienestar.gob.mx',
    name: 'Admin RH',
    roles: [{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }],
  };

  beforeEach(async () => {
    localStorage.clear();
    currentReturnUrl = null;

    authClientSpy = jasmine.createSpyObj<AuthClient>('AuthClient', ['login', 'refresh', 'me', 'logout']);
    routerSpy = jasmine.createSpyObj<Router>('Router', ['navigateByUrl', 'navigate']);
    routerSpy.navigateByUrl.and.resolveTo(true);
    routerSpy.navigate.and.resolveTo(true);

    await TestBed.configureTestingModule({
      imports: [LoginPageComponent],
      providers: [
        TokenStore,
        SessionStore,
        { provide: AuthClient, useValue: authClientSpy },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            get snapshot() {
              return {
                queryParamMap: convertToParamMap(
                  currentReturnUrl !== null ? { returnUrl: currentReturnUrl } : {}
                ),
              };
            },
          },
        },
      ],
    }).compileComponents();

    tokenStore = TestBed.inject(TokenStore);
    sessionStore = TestBed.inject(SessionStore);
  });

  afterEach(() => {
    localStorage.clear();
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(LoginPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('1. Formulario con campos vacíos: no envía solicitud de login', async () => {
    createComponent();

    await component.onSubmit();
    fixture.detectChanges();

    expect(authClientSpy.login).not.toHaveBeenCalled();
    expect(routerSpy.navigateByUrl).not.toHaveBeenCalled();
  });

  it('2. Correo inválido: muestra mensaje de validación y no envía login', async () => {
    createComponent();

    component.form.controls.email.setValue('correo-invalido');
    component.form.controls.password.setValue('secreto123');
    await component.onSubmit();
    fixture.detectChanges();

    expect(authClientSpy.login).not.toHaveBeenCalled();
    const errorEl = fixture.nativeElement.querySelector('#login-email-error') as HTMLElement | null;
    expect(errorEl).not.toBeNull();
    expect(errorEl?.textContent).toContain('formato válido');
  });

  it('3. Login correcto: invoca AuthClient.login y navega al destino permitido (/rh por defecto)', async () => {
    createComponent();

    authClientSpy.login.and.callFake(async (email: string) => {
      const res: LoginResponse = {
        access_token: 'at-1',
        refresh_token: 'rt-1',
        user: { ...mockUser, email },
      };
      tokenStore.set(res.access_token, res.refresh_token);
      sessionStore.setUser(res.user);
      return res;
    });

    component.form.controls.email.setValue('admin@imssbienestar.gob.mx');
    component.form.controls.password.setValue('Password123!');
    await component.onSubmit();

    expect(authClientSpy.login).toHaveBeenCalledOnceWith('admin@imssbienestar.gob.mx', 'Password123!');
    expect(routerSpy.navigateByUrl).toHaveBeenCalledOnceWith('/rh');
  });

  it('4. Login con credenciales incorrectas (401): presenta mensaje de credenciales y no navega', async () => {
    createComponent();

    authClientSpy.login.and.rejectWith(
      new HttpErrorResponse({ status: 401, statusText: 'Unauthorized', error: { error: 'Invalid credentials' } })
    );

    component.form.controls.email.setValue('admin@imssbienestar.gob.mx');
    component.form.controls.password.setValue('incorrecta');
    await component.onSubmit();
    fixture.detectChanges();

    expect(routerSpy.navigateByUrl).not.toHaveBeenCalled();
    expect(component.errorMessage()).toContain('Correo electrónico o contraseña incorrectos');
  });

  it('5. Error de red (status 0): presenta mensaje de conectividad distinto al de credenciales incorrectas', async () => {
    createComponent();

    authClientSpy.login.and.rejectWith(
      new HttpErrorResponse({ status: 0, statusText: 'Unknown Error' })
    );

    component.form.controls.email.setValue('admin@imssbienestar.gob.mx');
    component.form.controls.password.setValue('Password123!');
    await component.onSubmit();
    fixture.detectChanges();

    expect(routerSpy.navigateByUrl).not.toHaveBeenCalled();
    expect(component.errorMessage()).toContain('No fue posible conectar con el servidor');
    expect(component.errorMessage()).not.toContain('contraseña incorrectos');
  });

  it('6. Doble clic en iniciar sesión mientras está en vuelo: no genera dos solicitudes', async () => {
    createComponent();

    let resolveLogin!: (value: LoginResponse) => void;
    authClientSpy.login.and.returnValue(
      new Promise<LoginResponse>(resolve => {
        resolveLogin = resolve;
      })
    );

    component.form.controls.email.setValue('admin@imssbienestar.gob.mx');
    component.form.controls.password.setValue('Password123!');

    const firstAttempt = component.onSubmit();
    const secondAttempt = component.onSubmit();

    expect(authClientSpy.login).toHaveBeenCalledTimes(1);

    resolveLogin({
      access_token: 'at-1',
      refresh_token: 'rt-1',
      user: mockUser,
    });

    await Promise.all([firstAttempt, secondAttempt]);
    expect(authClientSpy.login).toHaveBeenCalledTimes(1);
  });

  it('7. returnUrl externo (absoluto, //, backslash o codificado): es rechazado y usa fallback /rh', () => {
    expect(resolveSafeAdminReturnUrl('https://sitio-externo.com/rh')).toBe('/rh');
    expect(resolveSafeAdminReturnUrl('//sitio-externo.com/rh')).toBe('/rh');
    expect(resolveSafeAdminReturnUrl('/\\sitio-externo.com')).toBe('/rh');
    expect(resolveSafeAdminReturnUrl('%2F%2Fsitio-externo.com')).toBe('/rh');
    expect(resolveSafeAdminReturnUrl('javascript:alert(1)')).toBe('/rh');
    expect(resolveSafeAdminReturnUrl('/dashboard-abasto')).toBe('/rh');
  });

  it('8. returnUrl=/login: es rechazado y utiliza destino seguro /rh', async () => {
    currentReturnUrl = '/login?returnUrl=/rh';
    createComponent();

    authClientSpy.login.and.resolveTo({
      access_token: 'at-1',
      refresh_token: 'rt-1',
      user: mockUser,
    });

    component.form.controls.email.setValue('admin@imssbienestar.gob.mx');
    component.form.controls.password.setValue('Password123!');
    await component.onSubmit();

    expect(routerSpy.navigateByUrl).toHaveBeenCalledOnceWith('/rh');
  });

  it('9. returnUrl=/rh/asistencias y returnUrl=/ti/usuarios: se conservan como destinos internos válidos', async () => {
    expect(resolveSafeAdminReturnUrl('/ti')).toBe('/ti');
    expect(resolveSafeAdminReturnUrl('/ti/usuarios?page=2')).toBe('/ti/usuarios?page=2');
    expect(resolveSafeAdminReturnUrl('/ti/personas')).toBe('/ti/personas');

    currentReturnUrl = '/rh/asistencias?periodo=2026-11';
    createComponent();

    authClientSpy.login.and.resolveTo({
      access_token: 'at-1',
      refresh_token: 'rt-1',
      user: mockUser,
    });

    component.form.controls.email.setValue('admin@imssbienestar.gob.mx');
    component.form.controls.password.setValue('Password123!');
    await component.onSubmit();

    expect(routerSpy.navigateByUrl).toHaveBeenCalledOnceWith('/rh/asistencias?periodo=2026-11');
  });

  it('10. Tokens persistidos sin sesión hidratada: NO provocan redirección automática en ngOnInit', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 600;
    tokenStore.set(buildJwtWithExp(futureExp), 'rt-persistido');
    // SessionStore sigue sin hidratar (isHydrated === false)
    expect(sessionStore.isHydrated).toBeFalse();

    createComponent();

    expect(routerSpy.navigateByUrl).not.toHaveBeenCalled();
  });

  it('11. Fallo temporal de hidratación previo: muestra advertencia comprensible y NO genera bucle automático', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 600;
    tokenStore.set(buildJwtWithExp(futureExp), 'rt-persistido');
    sessionStore.setError('Http failure response for /api/auth/me: 0 Unknown Error');

    createComponent();

    expect(routerSpy.navigateByUrl).not.toHaveBeenCalled();
    expect(component.sessionRecoveryWarning()).toContain('problema temporal de conexión');
    expect(component.errorMessage()).toBeNull();
  });
});
