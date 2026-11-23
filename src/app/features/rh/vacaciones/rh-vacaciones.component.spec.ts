import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RhPersonasPadronItem } from '../../../services/rh.service';
import { RhVacacionesComponent } from './rh-vacaciones.component';

const personaSinAdscripcionNiCuenta: RhPersonasPadronItem = {
  persona_id: 501,
  nombre_completo: 'CARLOS MENDEZ PEREZ',
  nombres: 'CARLOS',
  apellidos: 'MENDEZ PEREZ',
  cargo: 'ANALISTA',
  correo_principal: null,
  unidad_medica_id: 177,
  unidad_medica_nombre: 'OFICINA CENTRAL',
  unidad_medica_cluesimb: 'BCIMS000484',
  tiene_rfc: false,
  rfc_masked: null,
  tiene_curp: false,
  curp_masked: null,
  activo: true,
  fecha_baja: null,
  fecha_ingreso: null,
  tiene_cuenta_activa: false,
};

describe('RhVacacionesComponent (RH-UX-VAC-05)', () => {
  let fixture: ComponentFixture<RhVacacionesComponent>;
  let component: RhVacacionesComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RhVacacionesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(RhVacacionesComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    component.persona = personaSinAdscripcionNiCuenta;
    component.canManage = true;
  });

  afterEach(() => {
    for (const req of httpMock.match((r) => r.url.endsWith('/api/rh/vacaciones/periodos'))) {
      req.flush({ items: [] });
    }
    httpMock.verify();
  });

  it('muestra únicamente la interfaz simplificada del kardex institucional sin pestañas ni formulario antiguo', () => {
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('app-rh-vacaciones-kardex-panel')).not.toBeNull();
    expect(el.querySelector('#rh-vac-tab-historico')).toBeNull();
    expect(el.textContent).not.toContain('Historial por rango (anterior)');
    expect(el.textContent).not.toContain('Registrar periodo vacacional');
  });

  it('emite closed al pulsar el botón Cerrar', () => {
    fixture.detectChanges();
    const closedSpy = spyOn(component.closed, 'emit');
    component.onClose();
    expect(closedSpy).toHaveBeenCalled();
  });
});
