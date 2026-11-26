import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionStore } from '../../../core/auth/session-store.service';
import {
  RhAsistenciaEstadoControl,
  RhPersonaAdminDto,
  RhService,
} from '../../../services/rh.service';
import {
  RhAsistenciaConciliacion2026Service,
} from './rh-asistencia-conciliacion-2026.service';
import { RhMigracionAsistencias2026Component } from './rh-migracion-asistencias-2026.component';

function makePersona(id: number, nombre: string): RhPersonaAdminDto {
  return {
    persona_id: id,
    nombre_completo: nombre,
    nombres: null,
    apellidos: null,
    cargo: 'PUESTO',
    correo_principal: null,
    unidad_medica_id: 10,
    tiene_rfc: false,
    rfc_masked: null,
    tiene_curp: false,
    curp_masked: null,
    activo: true,
    fecha_baja: null,
    fecha_ingreso: '2024-01-01',
  };
}

describe('RH-ASIS-05A | Conciliación histórica 2026', () => {
  let service: RhAsistenciaConciliacion2026Service;

  const sampleMatrix: unknown[][] = [
    ['PUESTO', 'NOMBRE', 'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'],
    ['DEPTO PERSONAL', 'ACEVEDO DE LA PEÑA JOSE LUIS', 'X', 'X', '', '', '', '', '', '', '', '', '', ''],
    ['OFICINA', 'GÓMEZ GARCÍA ANDRÉS', 'X', '', '', '', '', '', '', '', '', '', '', ''],
    ['OFICINA', 'PEREZ LOPEZ JUAN', 'X', '', '', '', '', '', '', '', '', '', '', ''],
    ['PLANEACION', 'LEDEZMA ROBLES KARLA SOFIA', 'X', '', '', '', '', '', '', '', '', '', '', ''],
    ['OFICINA', 'TRABAJADOR INEXISTENTE', 'X', '', '', '', '', '', '', '', '', '', '', ''],
    ['ATENCION MEDICA', 'VACANTE', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['AUXILIAR', 'AMBRIZ PUENTE KEVIN', 'INICIO DE LABORES 16 DE AGOSTO', '', '', '', '', '', '', 'X', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['BAJAS', 'NOMBRE', 'OBSERVACIONES'],
    ['ATENCION MEDICA', 'URREA AYON JAIME RAMIRO', 'HASTA JUNIO'],
  ];

  const catalogo: RhPersonaAdminDto[] = [
    makePersona(1, 'ACEVEDO DE LA PEÑA JOSE LUIS'),
    makePersona(2, 'GOMEZ GARCIA ANDRES'), // sin acentos
    makePersona(3, 'PEREZ LOPEZ JUAN'), // homónimo 1
    makePersona(4, 'PEREZ LOPEZ JUAN'), // homónimo 2
    makePersona(5, 'LEDEZMA FLORES KARLA SOFIA'), // apellido discrepante
    makePersona(6, 'AMBRIZ PUENTE KEVIN'),
  ];

  beforeEach(() => {
    service = new RhAsistenciaConciliacion2026Service();
  });

  it('parsea Excel, omite VACANTE, conserva anotaciones y no convierte vacíos en incumplimiento', () => {
    const filas = service.parseExcelMatrix(sampleMatrix, 'Hoja1');
    expect(filas.length).toBe(8); // 7 en ACTIVOS + 1 en BAJAS

    const vacante = filas.find((f) => f.nombreOriginal === 'VACANTE')!;
    expect(vacante.esVacante).toBeTrue();
    expect(vacante.estadoIdentidad).toBe('EXCLUIDA_RH');

    const ambriz = filas.find((f) => f.nombreOriginal === 'AMBRIZ PUENTE KEVIN')!;
    expect(ambriz.meses[0].tipo).toBe('ANOTACION');
    expect(ambriz.meses[0].aprobado).toBeFalse();
    expect(ambriz.meses[7].tipo).toBe('MARCA_X');
    expect(ambriz.meses[7].aprobado).toBeTrue();
    expect(ambriz.meses[1].tipo).toBe('VACIO');
    expect(ambriz.meses[1].aprobado).toBeFalse();

    const baja = filas.find((f) => f.bloque === 'BAJAS')!;
    expect(baja.observacionBloqueBaja).toBe('HASTA JUNIO');
  });

  it('rechaza archivo equivocado sin encabezados esperados', () => {
    expect(() => service.parseExcelMatrix([['COL1', 'COL2'], ['A', 'B']], 'Hoja1')).toThrowError(
      /Archivo incompatible/
    );
  });

  it('concilia nombres idénticos, con acentos, homónimos, apellidos discrepantes y no encontrados', () => {
    const filas = service
      .parseExcelMatrix(sampleMatrix, 'Hoja1')
      .map((f) => service.matchRowAgainstPersonas(f, catalogo));

    const exact = filas.find((f) => f.nombreOriginal === 'ACEVEDO DE LA PEÑA JOSE LUIS')!;
    expect(exact.estadoIdentidad).toBe('COINCIDENCIA_SUGERIDA');
    expect(exact.candidatosSugeridos[0].persona_id).toBe(1);

    const acentos = filas.find((f) => f.nombreOriginal === 'GÓMEZ GARCÍA ANDRÉS')!;
    expect(acentos.estadoIdentidad).toBe('COINCIDENCIA_SUGERIDA');
    expect(acentos.candidatosSugeridos[0].persona_id).toBe(2);

    const homonimo = filas.find((f) => f.nombreOriginal === 'PEREZ LOPEZ JUAN')!;
    expect(homonimo.estadoIdentidad).toBe('COINCIDENCIA_AMBIGUA');
    expect(homonimo.personaConfirmada).toBeNull(); // nunca autoseleccionada

    const discrepante = filas.find((f) => f.nombreOriginal === 'LEDEZMA ROBLES KARLA SOFIA')!;
    expect(discrepante.estadoIdentidad).toBe('COINCIDENCIA_AMBIGUA');

    const noEncontrado = filas.find((f) => f.nombreOriginal === 'TRABAJADOR INEXISTENTE')!;
    expect(noEncontrado.estadoIdentidad).toBe('SIN_COINCIDENCIA');
  });

  it('detecta conflictos con registros existentes en BD y permite exportar/reanudar JSON', () => {
    const filas = service.parseExcelMatrix(sampleMatrix, 'Hoja1');
    filas[0].estadoIdentidad = 'CONFIRMADA_MANUAL';
    filas[0].personaConfirmada = catalogo[0];

    const existingMap = new Map<string, RhAsistenciaEstadoControl>([['1:1', 'RECIBIDA']]);
    const evaluated = service.recalculateConflictsAndDuplicates(filas, existingMap);

    expect(evaluated[0].meses[0].tieneConflictoBd).toBeTrue();
    expect(evaluated[0].meses[1].tieneConflictoBd).toBeFalse();

    const summary = service.buildPreviewSummary(evaluated);
    expect(summary.personasConciliadas).toBe(1);
    expect(summary.conflictosConBd).toBe(1);

    const exported = service.buildExportPayload('CONTROL.xlsx', 'hash123', evaluated);
    const resumed = service.applyImportedJson(
      service.parseExcelMatrix(sampleMatrix, 'Hoja1'),
      'hash123',
      JSON.stringify(exported),
      catalogo
    );
    expect(resumed.hashCoincide).toBeTrue();
    expect(resumed.filas[0].personaConfirmada?.persona_id).toBe(1);
  });

  it('bloquea acceso a usuarios que no sean RECURSOS_HUMANOS GLOBAL y no realiza escrituras', async () => {
    const rhServiceMock = jasmine.createSpyObj<RhService>('RhService', [
      'obtenerUnidadesAutorizadas',
      'listarPersonasPadron',
      'getAsistenciaSeguimiento',
      'confirmarRecepcionAsistencia',
      'actualizarEstadoAsistencia',
    ]);

    const sessionMock = {
      user: signal({
        id: 'u1',
        email: 'clues@test.local',
        roles: [{ code: 'RECURSOS_HUMANOS', scope: 'CLUES', id: 'BCIMB00001' }],
      }),
    };

    await TestBed.configureTestingModule({
      imports: [RhMigracionAsistencias2026Component],
      providers: [
        provideRouter([]),
        { provide: RhService, useValue: rhServiceMock },
        { provide: SessionStore, useValue: sessionMock },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(RhMigracionAsistencias2026Component);
    fixture.detectChanges();

    expect(fixture.componentInstance.isRhGlobal()).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('Acceso denegado');
    expect(rhServiceMock.confirmarRecepcionAsistencia).not.toHaveBeenCalled();
    expect(rhServiceMock.actualizarEstadoAsistencia).not.toHaveBeenCalled();
  });

  it('recorre todas las páginas de padrón y controles mensuales para detectar conflictos en página 2', async () => {
    const rhServiceMock = jasmine.createSpyObj<RhService>('RhService', [
      'obtenerUnidadesAutorizadas',
      'listarPersonasPadron',
      'getAsistenciaSeguimiento',
    ]);
    rhServiceMock.obtenerUnidadesAutorizadas.and.resolveTo({ scope: 'GLOBAL', unidades: [] });
    rhServiceMock.listarPersonasPadron.and.callFake(async (params: any) => {
      if (params.page === 1) {
        return { items: [makePersona(1, 'UNO')], page: 1, pageSize: 100, total: 2 } as any;
      }
      return { items: [makePersona(2, 'DOS')], page: 2, pageSize: 100, total: 2 } as any;
    });
    rhServiceMock.getAsistenciaSeguimiento.and.callFake(async (params: any) => {
      if (params.mes === 1 && params.page === 1) {
        return { anio: 2026, mes: 1, unidad_medica_id: null, items: [{ persona_id: 1, tiene_registro_control: false, estado_control: null }], resumen: {} as any, page: 1, pageSize: 100, total: 2 } as any;
      }
      if (params.mes === 1 && params.page === 2) {
        return { anio: 2026, mes: 1, unidad_medica_id: null, items: [{ persona_id: 2, tiene_registro_control: true, estado_control: 'RECIBIDA' }], resumen: {} as any, page: 2, pageSize: 100, total: 2 } as any;
      }
      return { anio: 2026, mes: params.mes, unidad_medica_id: null, items: [], resumen: {} as any, page: 1, pageSize: 100, total: 0 } as any;
    });

    const sessionMock = {
      user: signal({
        id: 'u-global',
        email: 'rh@test.local',
        roles: [{ code: 'RECURSOS_HUMANOS', scope: 'GLOBAL', id: null }],
      }),
    };

    await TestBed.configureTestingModule({
      imports: [RhMigracionAsistencias2026Component],
      providers: [
        provideRouter([]),
        { provide: RhService, useValue: rhServiceMock },
        { provide: SessionStore, useValue: sessionMock },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(RhMigracionAsistencias2026Component);
    fixture.detectChanges();
    await fixture.whenStable();

    const comp = fixture.componentInstance;
    expect(comp.catalogsReady()).toBeTrue();
    expect(comp.personasCatalogo().length).toBe(2);
    expect(comp.existingByPersonaMes().get('2:1')).toBe('RECIBIDA');
  });

  it('rechaza confirmación silenciosa en JSON alterado y no aprueba meses sin X original', () => {
    const filas = service.parseExcelMatrix(sampleMatrix, 'Hoja1');
    const alteredJson = JSON.stringify({
      version: 'RH-ASIS-05A-v1',
      anio: 2026,
      archivo_nombre: 'CONTROL.xlsx',
      archivo_hash: 'hash123',
      exportado_en: '2026-11-24T00:00:00Z',
      filas: [
        {
          rowKey: filas[0].rowKey,
          sheetName: 'Hoja1',
          rowNumber: filas[0].rowNumber,
          nombreOriginal: 'OTRA PERSONA ALTERADA',
          estadoIdentidad: 'CONFIRMADA_MANUAL',
          personaIdConfirmado: 1,
          unidadMedicaId: 10,
          mesesAprobados: [1, 3], // mes 3 está vacío en Excel
          notasRevision: '',
        },
      ],
    });

    const res = service.applyImportedJson(filas, 'hash123', alteredJson, catalogo);
    expect(res.filas[0].estadoIdentidad).toBe('COINCIDENCIA_AMBIGUA');
    expect(res.filas[0].personaConfirmada).toBeNull();
  });
});
