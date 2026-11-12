import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthClient } from '../../core/auth/auth-client.service';
import { UserProfile } from '../../core/auth/auth.models';
import { SessionStore } from '../../core/auth/session-store.service';
import { TokenStore } from '../../core/auth/token-store.service';
import { RhShellComponent } from './rh-shell.component';

describe('RhShellComponent (Microintervención 4)', () => {
  let fixture: ComponentFixture<RhShellComponent>;
  let component: RhShellComponent;
  let sessionStore: SessionStore;
  let tokenStore: TokenStore;
  let authClientSpy: jasmine.SpyObj<AuthClient>;
  let router: Router;

  const mockUser: UserProfile = {
    id: 'user-rh-1',
    email: 'rh.coord@imssbienestar.gob.mx',
    name: 'Coordinación Estatal RH',
    roles: [{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }],
  };

  beforeEach(async () => {
    localStorage.clear();
    authClientSpy = jasmine.createSpyObj<AuthClient>('AuthClient', ['logout']);

    await TestBed.configureTestingModule({
      imports: [RhShellComponent],
      providers: [
        provideRouter([]),
        TokenStore,
        SessionStore,
        { provide: AuthClient, useValue: authClientSpy },
      ],
    }).compileComponents();

    tokenStore = TestBed.inject(TokenStore);
    sessionStore = TestBed.inject(SessionStore);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);

    fixture = TestBed.createComponent(RhShellComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('12. El shell muestra correctamente el nombre y correo del usuario autenticado y el estado vacío discreto', () => {
    sessionStore.setUser(mockUser);
    fixture.detectChanges();

    const nameEl = fixture.nativeElement.querySelector('#rh-shell-user-name') as HTMLElement | null;
    const emailEl = fixture.nativeElement.querySelector('#rh-shell-user-email') as HTMLElement | null;
    const textContent = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(nameEl?.textContent?.trim()).toBe('Coordinación Estatal RH');
    expect(emailEl?.textContent?.trim()).toBe('rh.coord@imssbienestar.gob.mx');
    expect(textContent).toContain('Recursos Humanos');
    expect(textContent).toContain('Panel de Recursos Humanos');
    expect(textContent).toContain(
      'Este espacio concentrará progresivamente las herramientas administrativas autorizadas.'
    );
  });

  it('13. El shell ejecuta AuthClient.logout() y navega hacia /login', async () => {
    tokenStore.set('at-1', 'rt-1');
    sessionStore.setUser(mockUser);
    fixture.detectChanges();

    authClientSpy.logout.and.callFake(async () => {
      sessionStore.clear();
    });

    await component.onLogout();

    expect(authClientSpy.logout).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledOnceWith(['/login']);
  });

  it('14. Un logout antiguo cuya petición remota termina después de iniciar una sesión nueva NO produce navegación tardía a /login', async () => {
    tokenStore.set('at-old', 'rt-old');
    sessionStore.setUser(mockUser);
    fixture.detectChanges();

    let resolveRemoteLogout!: () => void;
    authClientSpy.logout.and.callFake(() => {
      // Simula el comportamiento real de AuthClient.logout():
      // 1) Limpia sincrónicamente la sesión (incrementa epoch en +1)
      sessionStore.clear();
      // 2) Espera la revocación HTTP remota
      return new Promise<void>(resolve => {
        resolveRemoteLogout = resolve;
      });
    });

    const logoutPromise = component.onLogout();
    expect(component.loggingOut()).toBeTrue();

    // Mientras el logout HTTP sigue pendiente, otro flujo inicia una nueva sesión (incrementa epoch otra vez)
    sessionStore.clear();
    tokenStore.set('at-new', 'rt-new');
    sessionStore.setUser({
      id: 'user-rh-2',
      email: 'nuevo@imssbienestar.gob.mx',
      name: 'Nuevo Usuario RH',
      roles: [],
    });

    // Finaliza tardíamente la promesa del logout anterior
    resolveRemoteLogout();
    await logoutPromise;

    // Resultado requerido: No debe navegar a /login ni interrumpir la nueva sesión
    expect(router.navigate).not.toHaveBeenCalled();
    expect(sessionStore.currentUser?.email).toBe('nuevo@imssbienestar.gob.mx');
  });
});
