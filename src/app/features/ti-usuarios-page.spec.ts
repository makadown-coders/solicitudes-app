import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TiUsuariosPageComponent } from './ti/usuarios/ti-usuarios-page.component';
import { environment } from '../../environments/environment';

describe('TiUsuariosPageComponent (TI-2D.4A)', () => {
  let fixture: ComponentFixture<TiUsuariosPageComponent>;
  let component: TiUsuariosPageComponent;
  let httpMock: HttpTestingController;
  const baseUrl = `${environment.apiUrl.replace(/\/+$/, '')}/ti`;

  const mockRoles = [
    { id: 'r1', code: 'ADMIN_TIC', description: 'Admin TI' },
    { id: 'r2', code: 'RECURSOS_HUMANOS', description: 'RH' },
  ];

  const mockUsersResponse = {
    items: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'admin@ejemplo.gob.mx',
        name: 'Admin TI',
        status: 'ACTIVE',
        persona_id: 1,
        nombre_completo: 'Admin TI',
        unidad_medica_id: null,
        unidad_medica: null,
        roles: [{ code: 'ADMIN_TIC', scope_type: 'GLOBAL', scope_id: '*' }],
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        email: 'operador@ejemplo.gob.mx',
        name: 'Operador',
        status: 'ACTIVE',
        persona_id: 2,
        nombre_completo: 'Operador Uno',
        unidad_medica_id: 10,
        unidad_medica: 'Hospital General',
        roles: [{ code: 'RECURSOS_HUMANOS', scope_type: 'CLUES', scope_id: 'BCIMB00001' }],
      },
    ],
    page: 1,
    pageSize: 20,
    total: 2,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TiUsuariosPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TiUsuariosPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);

    fixture.detectChanges();
    httpMock.expectOne(`${baseUrl}/roles`).flush(mockRoles);
    httpMock.expectOne((req) => req.url === `${baseUrl}/usuarios` && req.method === 'GET').flush(mockUsersResponse);
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('1 y 18. Carga listado sin regresiones y nunca invoca POST /api/ti/usuarios', () => {
    expect(component.usuarios().length).toBe(2);
    expect(component.rolesCatalog().length).toBe(2);
    httpMock.expectNone((req) => req.url === `${baseUrl}/usuarios` && req.method === 'POST');
  });

  it('2, 3 y 4. Cambio de estado ACTIVE -> SUSPENDED, reactivación y cancelación sin escritura', async () => {
    const user = component.usuarios()[1];
    component.openStatusModal(user);
    component.statusDraft.set('SUSPENDED');
    component.requestStatusSave();
    expect(component.statusConfirmStep()).toBeTrue();

    // Cancelación
    component.closeStatusModal();
    expect(component.statusModalUser()).toBeNull();
    httpMock.expectNone(`${baseUrl}/usuarios/${user.id}/status`);

    // Confirmación ACTIVE -> SUSPENDED
    component.openStatusModal(user);
    component.statusDraft.set('SUSPENDED');
    component.requestStatusSave();
    const p = component.submitStatusChange();
    const req = httpMock.expectOne(`${baseUrl}/usuarios/${user.id}/status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'SUSPENDED' });
    req.flush({ ok: true, id: user.id, status: 'SUSPENDED', revoked_sessions: 1 });
    await p;
    expect(component.usuarios()[1].status).toBe('SUSPENDED');

    // Reactivación a ACTIVE
    component.openStatusModal(component.usuarios()[1]);
    component.statusDraft.set('ACTIVE');
    component.requestStatusSave();
    const req2 = httpMock.expectOne(`${baseUrl}/usuarios/${user.id}/status`);
    req2.flush({ ok: true, id: user.id, status: 'ACTIVE', revoked_sessions: 0 });
    await fixture.whenStable();
    expect(component.usuarios()[1].status).toBe('ACTIVE');
  });

  it('5. Maneja HTTP 409 al intentar suspender al último ADMIN_TIC GLOBAL', async () => {
    const admin = component.usuarios()[0];
    component.openStatusModal(admin);
    component.statusDraft.set('SUSPENDED');
    component.requestStatusSave();
    const p = component.submitStatusChange();
    const req = httpMock.expectOne(`${baseUrl}/usuarios/${admin.id}/status`);
    req.flush({ ok: false, error: 'Último ADMIN_TIC GLOBAL activo' }, { status: 409, statusText: 'Conflict' });
    await p;
    expect(component.statusError()).toContain('Último ADMIN_TIC GLOBAL');
    expect(component.usuarios()[0].status).toBe('ACTIVE');
  });

  it('6, 7 y 8. Restablecimiento de contraseña, validación de coincidencia y limpieza de campos sensibles', async () => {
    const user = component.usuarios()[1];
    component.openPasswordModal(user);
    component.passwordDraft.set('ClaveSegura#2026');
    component.passwordConfirmDraft.set('OtraClave#2026');
    component.requestPasswordSave();
    expect(component.passwordError()).toContain('no coinciden');
    expect(component.passwordConfirmStep()).toBeFalse();

    component.passwordConfirmDraft.set('ClaveSegura#2026');
    component.requestPasswordSave();
    expect(component.passwordConfirmStep()).toBeTrue();

    const p = component.submitPasswordReset();
    const req = httpMock.expectOne(`${baseUrl}/usuarios/${user.id}/password`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ password: 'ClaveSegura#2026' });
    req.flush({ ok: true, id: user.id, revoked_sessions: 2 });
    await p;

    expect(component.passwordDraft()).toBe('');
    expect(component.passwordConfirmDraft()).toBe('');
    expect(component.passwordModalUser()).toBeNull();
  });

  it('9, 10, 11, 13, 14, 15 y 16. Administración de roles, CLUES real, duplicados, confirmación al retirar y cancelación', async () => {
    const user = component.usuarios()[1];
    component.openRolesModal(user);

    // Duplicado rechazado
    component.newRoleCode.set('RECURSOS_HUMANOS');
    component.onNewScopeTypeChange('CLUES');
    const uReq = httpMock.expectOne((r) => r.url === `${baseUrl}/unidades` && r.method === 'GET');
    uReq.flush({
      items: [{ id: 10, cluesimb: 'BCIMB00001', cluessa: 'BCSSA00001', nombre: 'Hospital General', municipio: 'Mexicali' }],
      page: 1,
      pageSize: 25,
      total: 1,
    });
    await fixture.whenStable();

    component.newRoleScopeId.set('BCIMB00001');
    component.addRoleAssignment();
    expect(component.rolesModalError()).toContain('ya existe');

    // Agregar GLOBAL
    component.onNewScopeTypeChange('GLOBAL');
    component.addRoleAssignment();
    expect(component.rolesDraft().length).toBe(2);

    // Retirar rol existente -> exige confirmación
    component.removeRoleAssignment(0);
    component.requestRolesSave();
    expect(component.rolesConfirmRemoveStep()).toBeTrue();

    // Guardar reemplazo completo
    const p = component.submitRolesUpdate();
    const req = httpMock.expectOne(`${baseUrl}/usuarios/${user.id}/roles`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      roles: [{ code: 'RECURSOS_HUMANOS', scope_type: 'GLOBAL', scope_id: '*' }],
    });
    req.flush({
      ok: true,
      id: user.id,
      roles: [{ code: 'RECURSOS_HUMANOS', scope_type: 'GLOBAL', scope_id: '*' }],
    });
    await p;
    expect(component.usuarios()[1].roles).toEqual([
      { code: 'RECURSOS_HUMANOS', scope_type: 'GLOBAL', scope_id: '*' },
    ]);
  });

  it('TI-2D.4A.1: Preserva ADMIN_TIC GLOBAL al agregar rol RH, bloquea catálogo incompleto, maneja 409 y descarta respuestas tardías', async () => {
    const admin = component.usuarios()[0];

    // 1. Preserva ADMIN_TIC GLOBAL al agregar RECURSOS_HUMANOS CLUES
    component.openRolesModal(admin);
    component.newRoleCode.set('RECURSOS_HUMANOS');
    component.onNewScopeTypeChange('CLUES');
    httpMock.expectOne((r) => r.url === `${baseUrl}/unidades` && r.method === 'GET').flush({
      items: [{ id: 10, cluesimb: 'BCIMB00001', cluessa: 'BCSSA00001', nombre: 'Hospital General', municipio: 'Mexicali' }],
      page: 1,
      pageSize: 25,
      total: 1,
    });
    await fixture.whenStable();
    component.newRoleScopeId.set('BCIMB00001');
    component.addRoleAssignment();
    expect(component.rolesDraft().length).toBe(2);

    const pSave = component.submitRolesUpdate();
    const putReq = httpMock.expectOne(`${baseUrl}/usuarios/${admin.id}/roles`);
    expect(putReq.request.body).toEqual({
      roles: [
        { code: 'ADMIN_TIC', scope_type: 'GLOBAL', scope_id: '*' },
        { code: 'RECURSOS_HUMANOS', scope_type: 'CLUES', scope_id: 'BCIMB00001' },
      ],
    });
    putReq.flush({
      ok: true,
      id: admin.id,
      roles: [
        { code: 'ADMIN_TIC', scope_type: 'GLOBAL', scope_id: '*' },
        { code: 'RECURSOS_HUMANOS', scope_type: 'CLUES', scope_id: 'BCIMB00001' },
      ],
    });
    await pSave;
    expect(component.usuarios()[0].roles.length).toBe(2);

    // 2. Error 409 conserva estado original
    component.openRolesModal(component.usuarios()[0]);
    component.removeRoleAssignment(0);
    component.requestRolesSave();
    expect(component.rolesConfirmRemoveStep()).toBeTrue();
    const p409 = component.submitRolesUpdate();
    httpMock
      .expectOne(`${baseUrl}/usuarios/${admin.id}/roles`)
      .flush({ ok: false, error: 'Último ADMIN_TIC GLOBAL' }, { status: 409, statusText: 'Conflict' });
    await p409;
    expect(component.rolesModalError()).toContain('Último ADMIN_TIC GLOBAL');
    expect(component.usuarios()[0].roles.length).toBe(2);
    component.closeRolesModal();

    // 3. Catálogo incompleto bloquea guardado
    component.rolesError.set('Error cargando catálogo');
    component.openRolesModal(component.usuarios()[0]);
    expect(component.rolesModalError()).toContain('No es posible administrar roles');
    component.requestRolesSave();
    httpMock.expectNone(`${baseUrl}/usuarios/${admin.id}/roles`);
    component.closeRolesModal();
    component.rolesError.set(null);

    // 4. Respuesta HTTP tardía no sobrescribe datos recientes y preserva filtros/paginación
    component.searchDraft.set('operador');
    component.onSearchSubmit();
    const req1 = httpMock.expectOne((r) => r.url === `${baseUrl}/usuarios` && r.params.get('q') === 'operador');

    component.searchDraft.set('admin');
    component.onSearchSubmit();
    const req2 = httpMock.expectOne((r) => r.url === `${baseUrl}/usuarios` && r.params.get('q') === 'admin');

    req2.flush({ ...mockUsersResponse, items: [mockUsersResponse.items[0]], total: 1 });
    req1.flush({ ...mockUsersResponse, items: [mockUsersResponse.items[1]], total: 1 });
    await Promise.resolve();
    await Promise.resolve();
    expect(component.usuarios().length).toBe(1);
    expect(component.usuarios()[0].email).toBe('admin@ejemplo.gob.mx');
    expect(component.appliedSearch()).toBe('admin');
  });

  it('TI-2D.4B: Alta de cuenta SSO vinculada a persona, validaciones, HTTP 201, HTTP 409 y limpieza de contraseñas', async () => {
    // 1. Apertura y búsqueda de personas activas
    component.openCreateModal();
    const pReq = httpMock.expectOne((r) => r.url === `${baseUrl}/personas` && r.method === 'GET');
    pReq.flush({
      items: [
        {
          id: 101,
          nombre_completo: 'Operador Nuevo',
          email_principal: 'Operador@Ejemplo.GOB.MX',
          unidad_medica_id: 10,
          unidad_medica: 'Hospital General',
        },
        {
          id: 102,
          nombre_completo: 'Sin Correo',
          email_principal: null,
          unidad_medica_id: null,
          unidad_medica: null,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 2,
    });
    await fixture.whenStable();
    expect(component.createPersonasOptions().length).toBe(2);

    // 2. Precarga editable de correo principal y nombre
    component.selectPersonaForCreate(component.createPersonasOptions()[0]);
    expect(component.createEmailDraft()).toBe('operador@ejemplo.gob.mx');
    expect(component.createNameDraft()).toBe('Operador Nuevo');

    // 3. Validación de contraseña corta y contraseñas diferentes
    component.createPasswordDraft.set('123');
    component.createPasswordConfirmDraft.set('123');
    await component.submitCreateUsuario();
    expect(component.createError()).toContain('8 caracteres');

    component.createPasswordDraft.set('ClaveSegura#2026');
    component.createPasswordConfirmDraft.set('OtraClave#2026');
    await component.submitCreateUsuario();
    expect(component.createError()).toContain('no coinciden');

    // 4. HTTP 409 conserva datos no sensibles
    component.createPasswordConfirmDraft.set('ClaveSegura#2026');
    const p409 = component.submitCreateUsuario();
    const post409 = httpMock.expectOne(`${baseUrl}/usuarios`);
    expect(post409.request.method).toBe('POST');
    expect(post409.request.body).toEqual({
      persona_id: 101,
      email: 'operador@ejemplo.gob.mx',
      name: 'Operador Nuevo',
      password: 'ClaveSegura#2026',
      status: 'ACTIVE',
    });
    expect('roles' in post409.request.body).toBeFalse();
    post409.flush({ ok: false, error: 'Persona ya vinculada' }, { status: 409, statusText: 'Conflict' });
    await p409;
    expect(component.createError()).toContain('Persona ya vinculada');
    expect(component.createEmailDraft()).toBe('operador@ejemplo.gob.mx');

    // 5. HTTP 201 cierra diálogo, limpia contraseñas, recarga listado e informa sin roles
    const p201 = component.submitCreateUsuario();
    const post201 = httpMock.expectOne(`${baseUrl}/usuarios`);
    post201.flush(
      {
        id: '33333333-3333-4333-8333-333333333333',
        email: 'operador@ejemplo.gob.mx',
        name: 'Operador Nuevo',
        status: 'ACTIVE',
        persona_id: 101,
      },
      { status: 201, statusText: 'Created' }
    );
    await Promise.resolve();
    await Promise.resolve();
    const reloadReq = httpMock.expectOne((r) => r.url === `${baseUrl}/usuarios` && r.method === 'GET');
    reloadReq.flush(mockUsersResponse);
    await p201;

    expect(component.createModalOpen()).toBeFalse();
    expect(component.createPasswordDraft()).toBe('');
    expect(component.createPasswordConfirmDraft()).toBe('');
    expect(component.actionSuccessMessage()).toContain('Todavía no tiene roles asignados');
    expect(component.lastCreatedUser()?.id).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('TI-2F.2: Creación de rol en catálogo, validaciones, HTTP 201, HTTP 409 y preservación de usuarios', async () => {
    // 1. Apertura y cancelación sin POST
    component.openCreateRoleModal();
    expect(component.createRoleModalOpen()).toBeTrue();
    component.closeCreateRoleModal();
    expect(component.createRoleModalOpen()).toBeFalse();
    httpMock.expectNone(`${baseUrl}/roles`);

    // 2. Validaciones de formato, descripción y duplicado anticipado
    component.openCreateRoleModal();
    component.createRoleCodeDraft.set('bad-code!');
    component.createRoleDescriptionDraft.set('Desc');
    await component.submitCreateRole();
    expect(component.createRoleError()).toContain('2 y 64 caracteres');

    component.createRoleCodeDraft.set('ADMIN_TIC');
    await component.submitCreateRole();
    expect(component.createRoleError()).toContain('ya existe o está reservado');

    component.createRoleCodeDraft.set('  ib_onco  ');
    component.createRoleDescriptionDraft.set('   ');
    await component.submitCreateRole();
    expect(component.createRoleError()).toContain('descripción es obligatoria');

    // 3. HTTP 409 conserva datos
    component.createRoleDescriptionDraft.set('  Operación del módulo IB-ONCO  ');
    const p409 = component.submitCreateRole();
    const post409 = httpMock.expectOne(`${baseUrl}/roles`);
    expect(post409.request.method).toBe('POST');
    expect(post409.request.body).toEqual({
      code: 'IB_ONCO',
      description: 'Operación del módulo IB-ONCO',
    });
    post409.flush({ ok: false, error: 'Rol duplicado' }, { status: 409, statusText: 'Conflict' });
    await p409;
    expect(component.createRoleError()).toContain('Rol duplicado');
    expect(component.createRoleCodeDraft()).toBe('  ib_onco  ');

    // 4. HTTP 201 cierra diálogo, refresca GET /api/ti/roles y conserva usuarios
    const usersBefore = component.usuarios().length;
    const p201 = component.submitCreateRole();
    const post201 = httpMock.expectOne(`${baseUrl}/roles`);
    post201.flush(
      { id: 'r3', code: 'IB_ONCO', description: 'Operación del módulo IB-ONCO' },
      { status: 201, statusText: 'Created' }
    );
    await Promise.resolve();
    await Promise.resolve();
    const getRoles = httpMock.expectOne(`${baseUrl}/roles`);
    getRoles.flush([...mockRoles, { id: 'r3', code: 'IB_ONCO', description: 'Operación del módulo IB-ONCO' }]);
    await p201;

    expect(component.createRoleModalOpen()).toBeFalse();
    expect(component.rolesCatalog().length).toBe(3);
    expect(component.usuarios().length).toBe(usersBefore);
    expect(component.actionSuccessMessage()).toContain('IB_ONCO');
  });

  it('TI-2F.4: ADMIN_TIC solo admite GLOBAL; los demás roles conservan GLOBAL y CLUES múltiples', async () => {
    const user = component.usuarios()[1];
    component.openRolesModal(user);

    // Al seleccionar ADMIN_TIC, normaliza alcance a GLOBAL
    component.onNewScopeTypeChange('CLUES');
    httpMock.expectOne((r) => r.url === `${baseUrl}/unidades` && r.method === 'GET').flush({
      items: [{ id: 10, cluesimb: 'BCIMB00001', cluessa: 'BCSSA00001', nombre: 'Hospital General', municipio: 'Mexicali' }],
      page: 1,
      pageSize: 25,
      total: 1,
    });
    await fixture.whenStable();

    component.onNewRoleCodeChange('ADMIN_TIC');
    expect(component.newRoleScopeType()).toBe('GLOBAL');
    expect(component.newRoleScopeId()).toBe('*');

    // Si se fuerza CLUES con ADMIN_TIC, addRoleAssignment lo rechaza
    component.newRoleScopeType.set('CLUES');
    component.newRoleScopeId.set('BCIMB00001');
    component.addRoleAssignment();
    expect(component.rolesModalError()).toContain('ADMIN_TIC solo admite alcance GLOBAL');

    // RECURSOS_HUMANOS admite GLOBAL y múltiples CLUES
    component.onNewRoleCodeChange('RECURSOS_HUMANOS');
    component.onNewScopeTypeChange('GLOBAL');
    component.addRoleAssignment();
    expect(component.rolesDraft().some((r) => r.code === 'RECURSOS_HUMANOS' && r.scope_type === 'GLOBAL')).toBeTrue();
  });
});
