import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RhPadronInstitucionalComponent } from './rh-padron-institucional.component';

describe('RhPadronInstitucionalComponent — alta con fecha_ingreso (RH-4A.7D)', () => {
  let fixture: ComponentFixture<RhPadronInstitucionalComponent>;
  let component: RhPadronInstitucionalComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RhPadronInstitucionalComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(RhPadronInstitucionalComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    // Carga inicial del padrón
    const initReq = httpMock.expectOne((r) => r.url.endsWith('/api/rh/personas') && r.method === 'GET');
    initReq.flush({ items: [], page: 1, pageSize: 20, total: 0 });
    await new Promise((r) => setTimeout(r, 0));
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('muestra el control Fecha de ingreso institucional y envía fecha_ingreso en alta cuando se captura', async () => {
    component.openCreateDialog();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('#rh-padron-create-fecha-ingreso') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.min).toBe('1940-01-01');
    expect(input.max).toBe('2100-12-31');

    component.draftNombres.set('Laura');
    component.draftApellidos.set('Mendoza');
    component.draftFechaIngreso.set('2021-05-01');

    const submitPromise = component.onSubmitCreatePersona();
    const postReq = httpMock.expectOne((r) => r.url.endsWith('/api/rh/personas') && r.method === 'POST');
    expect(postReq.request.body.fecha_ingreso).toBe('2021-05-01');
    postReq.flush({
      persona_id: 950,
      nombre_completo: 'Laura Mendoza',
      nombres: 'Laura',
      apellidos: 'Mendoza',
      cargo: null,
      correo_principal: null,
      unidad_medica_id: null,
      tiene_rfc: false,
      rfc_masked: null,
      tiene_curp: false,
      curp_masked: null,
      activo: true,
      fecha_baja: null,
      fecha_ingreso: '2021-05-01',
    });

    await new Promise((r) => setTimeout(r, 0));
    const reloadReq = httpMock.expectOne((r) => r.url.endsWith('/api/rh/personas') && r.method === 'GET');
    reloadReq.flush({ items: [], page: 1, pageSize: 20, total: 0 });
    await submitPromise;
    expect(component.draftFechaIngreso()).toBe('');
  });

  it('omite fecha_ingreso cuando se deja vacío y limpia el campo al cancelar', async () => {
    component.openCreateDialog();
    component.draftFechaIngreso.set('2020-01-15');
    component.closeCreateDialog();
    expect(component.draftFechaIngreso()).toBe('');

    component.openCreateDialog();
    component.draftNombres.set('Pedro');
    component.draftApellidos.set('Castro');
    expect(component.draftFechaIngreso()).toBe('');

    const submitPromise = component.onSubmitCreatePersona();
    const postReq = httpMock.expectOne((r) => r.url.endsWith('/api/rh/personas') && r.method === 'POST');
    expect('fecha_ingreso' in postReq.request.body).toBeFalse();
    postReq.flush({
      persona_id: 951,
      nombre_completo: 'Pedro Castro',
      nombres: 'Pedro',
      apellidos: 'Castro',
      cargo: null,
      correo_principal: null,
      unidad_medica_id: null,
      tiene_rfc: false,
      rfc_masked: null,
      tiene_curp: false,
      curp_masked: null,
      activo: true,
      fecha_baja: null,
      fecha_ingreso: null,
    });

    await new Promise((r) => setTimeout(r, 0));
    const reloadReq = httpMock.expectOne((r) => r.url.endsWith('/api/rh/personas') && r.method === 'GET');
    reloadReq.flush({ items: [], page: 1, pageSize: 20, total: 0 });
    await submitPromise;
  });
});
