import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RhOrganigramaAdminComponent } from './rh-organigrama-admin.component';

const MOCK_PUESTOS = [
  { id: 1, version_id: 1, puesto_padre_id: null, denominacion: 'Coordinador Estatal IMSS-Bienestar', codigo_nivel: 'K11', nivel_jerarquico: 1, siglas_area: 'UPECE', orden_visual: 1, observaciones: null, activo: true },
  { id: 2, version_id: 1, puesto_padre_id: 1, denominacion: 'Jefe de Servicios Administrativos y Finanzas', codigo_nivel: 'M11', nivel_jerarquico: 2, siglas_area: 'SAF', orden_visual: 1, observaciones: null, activo: true },
  { id: 3, version_id: 1, puesto_padre_id: 2, denominacion: 'Departamento de Tecnologías de la Información', codigo_nivel: 'CF80003', nivel_jerarquico: 3, siglas_area: 'SAF', orden_visual: 1, observaciones: null, activo: true },
];

describe('RhOrganigramaAdminComponent (RH-ORG-04)', () => {
  let fixture: ComponentFixture<RhOrganigramaAdminComponent>;
  let component: RhOrganigramaAdminComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RhOrganigramaAdminComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(RhOrganigramaAdminComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('renderiza el árbol organizacional y conserva contexto de ancestros al buscar', async () => {
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url.endsWith('/api/rh/organigrama/puestos')).flush({
      version: { id: 1, clave: 'ORG-COORDINACION-ESTATAL', nombre: 'Estructura organizacional de Coordinación Estatal', estado: 'VIGENTE' },
      items: MOCK_PUESTOS,
    });
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    expect(component.items().length).toBe(3);
    component.searchQuery.set('Tecnologías');
    fixture.detectChanges();

    const visible = component.visibleNodes();
    expect(visible.length).toBe(3); // incluye ancestros 1 y 2 + coincidencia 3
    expect(visible[2].matchesSearch).toBeTrue();
  });
});
