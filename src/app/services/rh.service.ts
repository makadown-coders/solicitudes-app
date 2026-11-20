import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { RhAccessScope } from '../core/auth/rh-access.guard';

/**
 * Representa una unidad de trabajo autorizada devuelta por `GET /api/rh/unidades-autorizadas`.
 * Respeta exactamente el contrato de `RhService` en `solicitudes-backend`.
 */
export interface RhUnidadAutorizada {
  id: number;
  nombre: string;
  cluesimb: string | null;
}

/**
 * Respuesta real de `GET /api/rh/unidades-autorizadas`.
 */
export interface RhUnidadesAutorizadasResponse {
  scope: RhAccessScope;
  unidades: RhUnidadAutorizada[];
}

/**
 * Registro individual del padrón laboral devuelto por `GET /api/rh/unidades/:unidadId/personal`.
 * Respeta exactamente el contrato real de `RhService.listPersonalPorUnidad` en el backend.
 */
export interface RhPersonalUnidadItem {
  persona_id: number;
  nombre_completo: string;
  adscripcion_laboral_id: number;
  unidad_medica_id: number;
  matricula: string | null;
  puesto: string | null;
  turno: string | null;
  jornada: string | null;
  horario: string | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  activo: boolean;
}

/**
 * Respuesta paginada real de `GET /api/rh/unidades/:unidadId/personal`.
 */
export interface RhPersonalUnidadPagedResponse {
  unidad: RhUnidadAutorizada;
  items: RhPersonalUnidadItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface RhPersonalListParams {
  q?: string | null;
  page?: number;
  pageSize?: number;
}

export type RhPersonaCandidataSituacion =
  | 'DISPONIBLE_DIRECTORIO'
  | 'YA_ADSCRITA_EN_UNIDAD'
  | 'REQUIERE_VALIDACION_OTRA_ADSCRIPCION';

/**
 * Persona candidata devuelta por `GET /api/rh/unidades/:unidadId/personas-candidatas`.
 * Respeta el contrato de `RhService.listPersonasCandidatasPorUnidad` en `solicitudes-backend`.
 */
export interface RhPersonaCandidataItem {
  persona_id: number;
  nombre_completo: string;
  cargo_directorio: string | null;
  unidad_medica_id_directorio: number | null;
  unidad_medica_directorio: string | null;
  coincide_unidad_directorio: boolean;
  tiene_adscripcion_rh_en_unidad: boolean;
  tiene_adscripcion_rh_activa_en_otra_unidad: boolean;
  requiere_validacion_previa: boolean;
  situacion_rh: RhPersonaCandidataSituacion;
}

/**
 * Respuesta paginada real de `GET /api/rh/unidades/:unidadId/personas-candidatas`.
 */
export interface RhPersonasCandidatasPagedResponse {
  unidad: RhUnidadAutorizada;
  items: RhPersonaCandidataItem[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * Payload estricto aceptado por `POST /api/rh/unidades/:unidadId/adscripciones`.
 */
export interface RhCreateAdscripcionPayload {
  persona_id: number;
  matricula: string | null;
  puesto: string | null;
  turno: string | null;
  jornada: string | null;
  horario: string | null;
  vigente_desde: string;
  vigente_hasta: string | null;
}

/**
 * Respuesta real (`201 Created`) de `POST /api/rh/unidades/:unidadId/adscripciones`.
 */
export interface RhCreateAdscripcionResponse {
  adscripcion_laboral_id: number;
  persona_id: number;
  nombre_completo: string;
  unidad: RhUnidadAutorizada;
  unidad_medica_id: number;
  matricula: string | null;
  puesto: string | null;
  turno: string | null;
  jornada: string | null;
  horario: string | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  activo: boolean;
}

/**
 * Sección `personal` del contrato real de `GET /api/rh/unidades/:unidadId/personal/:adscripcionId`.
 */
export interface RhTrabajadorFichaPersonal {
  persona_id: number;
  nombre_completo: string;
  nombres: string | null;
  apellidos: string | null;
  tiene_rfc: boolean;
  rfc_masked: string | null;
  tiene_curp: boolean;
  curp_masked: string | null;
  activo: boolean;
}

/**
 * Sección `laboral` del contrato real de `GET /api/rh/unidades/:unidadId/personal/:adscripcionId`.
 */
export interface RhTrabajadorFichaLaboral {
  adscripcion_laboral_id: number;
  unidad_medica_id: number;
  matricula: string | null;
  puesto: string | null;
  turno: string | null;
  jornada: string | null;
  horario: string | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  activo: boolean;
  observaciones: string | null;
}

/**
 * Sección `permisos` del contrato real de `GET /api/rh/unidades/:unidadId/personal/:adscripcionId`.
 */
export interface RhTrabajadorFichaPermisos {
  puede_editar_laboral: boolean;
  puede_revelar_sensibles: boolean;
  puede_editar_identificacion: boolean;
}

/**
 * Respuesta completa (`200 OK`) de `GET /api/rh/unidades/:unidadId/personal/:adscripcionId`.
 */
export interface RhTrabajadorFichaResponse {
  unidad: RhUnidadAutorizada;
  personal: RhTrabajadorFichaPersonal;
  laboral: RhTrabajadorFichaLaboral;
  permisos: RhTrabajadorFichaPermisos;
}

/**
 * Payload parcial aceptado por `PATCH /api/rh/unidades/:unidadId/personal/:adscripcionId/laboral`.
 * Solo se incluyen las propiedades efectivamente modificadas por el operador.
 */
export interface RhUpdateAdscripcionLaboralPayload {
  matricula?: string | null;
  puesto?: string | null;
  turno?: string | null;
  jornada?: string | null;
  horario?: string | null;
  vigente_desde?: string;
  vigente_hasta?: string | null;
  activo?: boolean;
  observaciones?: string | null;
}

/**
 * Respuesta real (`200 OK`) de `PATCH /api/rh/unidades/:unidadId/personal/:adscripcionId/laboral`.
 */
export interface RhUpdateAdscripcionLaboralResponse {
  unidad: RhUnidadAutorizada;
  laboral: RhTrabajadorFichaLaboral;
  campos_modificados: string[];
}

/**
 * Respuesta real (`200 OK`) de `POST /api/rh/unidades/:unidadId/personal/:adscripcionId/revelar-identificadores`.
 * Los valores devueltos son exclusivamente para visualización temporal en la ficha activa
 * y nunca deben persistirse en estado compartido o almacenamiento del navegador.
 */
export interface RhRevealIdentificadoresResponse {
  persona_id: number;
  rfc: string | null;
  curp: string | null;
}

/**
 * Payload parcial aceptado por `PATCH /api/rh/unidades/:unidadId/personal/:adscripcionId/identificacion`.
 * Solo se incluyen las propiedades efectivamente modificadas por el operador.
 */
export interface RhUpdatePersonaIdentificacionPayload {
  nombres?: string | null;
  apellidos?: string | null;
  nombre_completo?: string;
  rfc?: string | null;
  curp?: string | null;
}

/**
 * Respuesta real (`200 OK`) de `PATCH /api/rh/unidades/:unidadId/personal/:adscripcionId/identificacion`.
 * Siempre devuelve `rfc_masked` y `curp_masked` en `personal` (nunca los valores completos).
 */
export interface RhUpdatePersonaIdentificacionResponse {
  unidad: RhUnidadAutorizada;
  personal: RhTrabajadorFichaPersonal;
  campos_modificados: string[];
}

/**
 * Estado de vinculación laboral RH del empleado autenticado (`GET /api/rh/mi-contexto`).
 */
export type RhMiContextoEstadoVinculacion =
  | 'ADSCRIPCION_VIGENTE'
  | 'ADSCRIPCION_HISTORICA'
  | 'ADSCRIPCION_FUTURA'
  | 'PENDIENTE_ADSCRIPCION_RH';

/**
 * Estado de vigencia calculado por el backend para una adscripción laboral propia.
 */
export type RhAdscripcionEstadoVigencia = 'VIGENTE' | 'HISTORICA' | 'FUTURA';

/**
 * Datos personales propios enmascarados devueltos por `GET /api/rh/mi-contexto`.
 * Nunca incluye RFC ni CURP completos.
 */
export interface RhMiContextoPersona {
  persona_id: number;
  nombre_completo: string;
  nombres: string | null;
  apellidos: string | null;
  tiene_rfc: boolean;
  rfc_masked: string | null;
  tiene_curp: boolean;
  curp_masked: string | null;
}

/**
 * Unidad de referencia o adscripción principal devuelta por `GET /api/rh/mi-contexto`.
 */
export interface RhMiContextoUnidadReferencia {
  id: number;
  nombre: string;
  cluesimb: string | null;
  origen: 'ADSCRIPCION_RH' | 'DIRECTORIO';
}

/**
 * Registro de adscripción laboral propio devuelto por `GET /api/rh/mi-contexto`.
 */
export interface RhMiContextoAdscripcionPropia {
  adscripcion_laboral_id: number;
  unidad_medica_id: number;
  unidad: RhUnidadAutorizada;
  matricula: string | null;
  puesto: string | null;
  turno: string | null;
  jornada: string | null;
  horario: string | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  activo: boolean;
  es_vigente: boolean;
  estado_vigencia: RhAdscripcionEstadoVigencia;
  observaciones: string | null;
}

/**
 * Permisos fijos del entorno de autogestión (`/rh`) devueltos por `GET /api/rh/mi-contexto`.
 */
export interface RhMiContextoPermisos {
  puede_ver_perfil_propio: true;
  puede_administrar_personal_desde_autogestion: false;
  puede_revelar_identificadores_desde_autogestion: false;
  puede_editar_identificacion_desde_autogestion: false;
}

/**
 * Respuesta real (`200 OK`) de `GET /api/rh/mi-contexto`.
 */
export interface RhMiContextoResponse {
  modo: 'EMPLEADO';
  persona: RhMiContextoPersona;
  unidad_referencia: RhMiContextoUnidadReferencia | null;
  estado_vinculacion_rh: RhMiContextoEstadoVinculacion;
  adscripciones: RhMiContextoAdscripcionPropia[];
  permisos: RhMiContextoPermisos;
}

/**
 * Filtro de estado aceptado por `GET /api/rh/personas`.
 */
export type RhPersonasEstadoFilter = 'activas' | 'inactivas' | 'todas';

/**
 * DTO administrativo de persona devuelto por `POST /api/rh/personas` y `PATCH /api/rh/personas/:personaId/estado`.
 */
export interface RhPersonaAdminDto {
  persona_id: number;
  nombre_completo: string;
  nombres: string | null;
  apellidos: string | null;
  cargo: string | null;
  correo_principal: string | null;
  unidad_medica_id: number | null;
  tiene_rfc: boolean;
  rfc_masked: string | null;
  tiene_curp: boolean;
  curp_masked: string | null;
  activo: boolean;
  fecha_baja: string | null;
  fecha_ingreso?: string | null;
}

/**
 * Registro del padrón institucional devuelto por `GET /api/rh/personas`.
 */
export interface RhPersonasPadronItem extends RhPersonaAdminDto {
  unidad_medica_nombre: string | null;
  unidad_medica_cluesimb: string | null;
  tiene_cuenta_activa: boolean;
}

/**
 * Respuesta paginada de `GET /api/rh/personas`.
 */
export interface RhPersonasPadronPagedResponse {
  items: RhPersonasPadronItem[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * Parámetros de consulta aceptados por `GET /api/rh/personas`.
 */
export interface RhPersonasPadronListParams {
  q?: string | null;
  estado?: RhPersonasEstadoFilter;
  unidadId?: number | null;
  page?: number;
  pageSize?: number;
}

/**
 * Payload permitido por `POST /api/rh/personas`.
 */
export interface RhCreatePersonaPayload {
  nombres: string;
  apellidos: string;
  rfc?: string | null;
  curp?: string | null;
  cargo?: string | null;
  correo_principal?: string | null;
  unidad_medica_id?: number | null;
  fecha_ingreso?: string | null;
}

/**
 * Respuesta de `PATCH /api/rh/personas/:personaId/estado`.
 */
export interface RhUpdatePersonaEstadoResponse {
  persona: RhPersonaAdminDto;
  estado_anterior: boolean;
  estado_nuevo: boolean;
  idempotente: boolean;
  campos_modificados: string[];
}

/**
 * Payload parcial permitido por `PATCH /api/rh/personas/:personaId/general`.
 */
export interface RhUpdatePersonaGeneralPayload {
  nombres?: string;
  apellidos?: string;
  cargo?: string | null;
  correo_principal?: string | null;
  unidad_medica_id?: number | null;
  curp?: string | null;
  rfc?: string | null;
  fecha_ingreso?: string | null;
}

/**
 * Respuesta de `PATCH /api/rh/personas/:personaId/general`.
 */
export interface RhUpdatePersonaGeneralResponse {
  persona: RhPersonaAdminDto;
  idempotente: boolean;
  campos_modificados: string[];
}

/**
 * Estado de vigencia calculado por backend para una comisión laboral.
 */
export type RhComisionEstadoVigencia = 'VIGENTE' | 'FUTURA' | 'CONCLUIDA';

/**
 * Filtro de estado aceptado por `GET /api/rh/personas/:personaId/comisiones`.
 */
export type RhComisionesEstadoFilter = 'todas' | 'vigentes' | 'futuras' | 'concluidas';

/**
 * DTO de comisión laboral devuelto por el backend RH.
 */
export interface RhComisionLaboralDto {
  id: number;
  persona_id: number;
  adscripcion_origen_id: number | null;
  sin_adscripcion_formal_origen: boolean;
  unidad_destino_id: number | null;
  unidad_destino_nombre: string | null;
  unidad_destino_cluesimb: string | null;
  area_destino_texto: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  motivo: string | null;
  oficio_referencia: string | null;
  observaciones: string | null;
  activo: boolean;
  estado_vigencia: RhComisionEstadoVigencia;
}

/**
 * Respuesta paginada de `GET /api/rh/personas/:personaId/comisiones`.
 */
export interface RhComisionesListResponse {
  persona_id: number;
  items: RhComisionLaboralDto[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * Parámetros de consulta aceptados por `GET /api/rh/personas/:personaId/comisiones`.
 */
export interface RhComisionesListParams {
  estado?: RhComisionesEstadoFilter;
  page?: number;
  pageSize?: number;
}

/**
 * Payload permitido por `POST /api/rh/personas/:personaId/comisiones`.
 */
export interface RhCreateComisionPayload {
  adscripcion_origen_id?: number | null;
  unidad_destino_id?: number | null;
  area_destino_texto?: string | null;
  fecha_inicio: string;
  fecha_fin?: string | null;
  motivo?: string | null;
  oficio_referencia?: string | null;
  observaciones?: string | null;
}

/**
 * Payload permitido por `PATCH /api/rh/personas/:personaId/comisiones/:comisionId/concluir`.
 */
export interface RhConcluirComisionPayload {
  fecha_fin?: string | null;
  observaciones?: string | null;
}

/**
 * Respuesta de `PATCH /api/rh/personas/:personaId/comisiones/:comisionId/concluir`.
 */
export interface RhConcluirComisionResponse {
  comision: RhComisionLaboralDto;
  idempotente: boolean;
}

const ALLOWED_CREATE_COMISION_KEYS: ReadonlyArray<keyof RhCreateComisionPayload> = [
  'adscripcion_origen_id',
  'unidad_destino_id',
  'area_destino_texto',
  'fecha_inicio',
  'fecha_fin',
  'motivo',
  'oficio_referencia',
  'observaciones',
];

const ALLOWED_CONCLUIR_COMISION_KEYS: ReadonlyArray<keyof RhConcluirComisionPayload> = [
  'fecha_fin',
  'observaciones',
];

/**
 * Estado administrativo de un registro vacacional.
 */
export type RhVacacionEstado = 'REGISTRADO' | 'ANULADO';

/**
 * Filtro de estado aceptado por `GET /api/rh/personas/:personaId/vacaciones`.
 */
export type RhVacacionesEstadoFilter = 'todos' | 'registrados' | 'anulados';

/**
 * DTO de registro vacacional devuelto por el backend RH.
 */
export interface RhVacacionRegistroDto {
  id: number;
  persona_id: number;
  adscripcion_id: number | null;
  anio_ciclo: number;
  periodo_referencia: string;
  fecha_inicio: string;
  fecha_fin: string;
  dias_registrados: number;
  documento_referencia: string | null;
  observaciones: string | null;
  estado: RhVacacionEstado;
  motivo_anulacion: string | null;
  anulado_en: string | null;
  creado_en: string;
  actualizado_en: string;
}

/**
 * Respuesta paginada de `GET /api/rh/personas/:personaId/vacaciones`.
 */
export interface RhVacacionesListResponse {
  persona_id: number;
  items: RhVacacionRegistroDto[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * Parámetros de consulta aceptados por `GET /api/rh/personas/:personaId/vacaciones`.
 */
export interface RhVacacionesListParams {
  anio_ciclo?: number | null;
  estado?: RhVacacionesEstadoFilter;
  page?: number;
  pageSize?: number;
}

/**
 * Payload permitido por `POST /api/rh/personas/:personaId/vacaciones`.
 */
export interface RhCreateVacacionPayload {
  adscripcion_id?: number | null;
  anio_ciclo: number;
  periodo_referencia: string;
  fecha_inicio: string;
  fecha_fin: string;
  dias_registrados: number;
  documento_referencia?: string | null;
  observaciones?: string | null;
}

/**
 * Respuesta de `POST /api/rh/personas/:personaId/vacaciones`.
 */
export interface RhCreateVacacionResponse {
  registro: RhVacacionRegistroDto;
  tiene_superposicion: boolean;
  registros_superpuestos_ids: number[];
}

/**
 * Payload permitido por `PATCH /api/rh/personas/:personaId/vacaciones/:registroId/anular`.
 */
export interface RhAnularVacacionPayload {
  motivo_anulacion: string;
}

/**
 * Respuesta de `PATCH /api/rh/personas/:personaId/vacaciones/:registroId/anular`.
 */
export interface RhAnularVacacionResponse {
  registro: RhVacacionRegistroDto;
  idempotente: boolean;
}

const ALLOWED_CREATE_VACACION_KEYS: ReadonlyArray<keyof RhCreateVacacionPayload> = [
  'adscripcion_id',
  'anio_ciclo',
  'periodo_referencia',
  'fecha_inicio',
  'fecha_fin',
  'dias_registrados',
  'documento_referencia',
  'observaciones',
];

const ALLOWED_ANULAR_VACACION_KEYS: ReadonlyArray<keyof RhAnularVacacionPayload> = [
  'motivo_anulacion',
];

/**
 * Estado de vigencia calculado por backend para una adscripción laboral por persona.
 */
export type RhAdscripcionPersonaEstadoVigencia = 'VIGENTE' | 'FUTURA' | 'HISTORICA';

/**
 * Filtro de estado aceptado por `GET /api/rh/personas/:personaId/adscripciones`.
 */
export type RhAdscripcionesPersonaEstadoFilter = 'todas' | 'vigentes' | 'futuras' | 'historicas';

/**
 * DTO de adscripción laboral por persona devuelto por `GET /api/rh/personas/:personaId/adscripciones`.
 */
export interface RhAdscripcionPersonaDto {
  adscripcion_laboral_id: number;
  persona_id: number;
  unidad_medica_id: number;
  unidad_nombre: string | null;
  unidad_cluesimb: string | null;
  matricula: string | null;
  puesto: string | null;
  turno: string | null;
  jornada: string | null;
  horario: string | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  activo: boolean;
  estado_vigencia: RhAdscripcionPersonaEstadoVigencia;
  observaciones: string | null;
}

/**
 * Respuesta paginada de `GET /api/rh/personas/:personaId/adscripciones`.
 */
export interface RhAdscripcionesPersonaListResponse {
  persona_id: number;
  items: RhAdscripcionPersonaDto[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * Parámetros de consulta aceptados por `GET /api/rh/personas/:personaId/adscripciones`.
 */
export interface RhAdscripcionesPersonaListParams {
  estado?: RhAdscripcionesPersonaEstadoFilter;
  page?: number;
  pageSize?: number;
}

const ALLOWED_PATCH_LABORAL_KEYS: ReadonlyArray<keyof RhUpdateAdscripcionLaboralPayload> = [
  'matricula',
  'puesto',
  'turno',
  'jornada',
  'horario',
  'vigente_desde',
  'vigente_hasta',
  'activo',
  'observaciones',
];

const ALLOWED_PATCH_IDENTIFICACION_KEYS: ReadonlyArray<keyof RhUpdatePersonaIdentificacionPayload> = [
  'nombres',
  'apellidos',
  'nombre_completo',
  'rfc',
  'curp',
];

const ALLOWED_CREATE_PERSONA_KEYS: ReadonlyArray<keyof RhCreatePersonaPayload> = [
  'nombres',
  'apellidos',
  'rfc',
  'curp',
  'cargo',
  'correo_principal',
  'unidad_medica_id',
  'fecha_ingreso',
];

const ALLOWED_UPDATE_PERSONA_GENERAL_KEYS: ReadonlyArray<keyof RhUpdatePersonaGeneralPayload> = [
  'nombres',
  'apellidos',
  'cargo',
  'correo_principal',
  'unidad_medica_id',
  'curp',
  'rfc',
  'fecha_ingreso',
];

@Injectable({ providedIn: 'root' })
export class RhService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl.replace(/\/+$/, '')}/rh`;

  /**
   * Consulta el universo de unidades de trabajo autorizadas para el operador actual
   * (`GET /api/rh/unidades-autorizadas`).
   * El header `Authorization: Bearer` es adjuntado automáticamente por `authInterceptor`.
   */
  async obtenerUnidadesAutorizadas(): Promise<RhUnidadesAutorizadasResponse> {
    return await firstValueFrom(
      this.http.get<RhUnidadesAutorizadasResponse>(`${this.baseUrl}/unidades-autorizadas`)
    );
  }

  /**
   * Consulta paginada de solo lectura del padrón laboral de una unidad autorizada
   * (`GET /api/rh/unidades/:unidadId/personal`).
   */
  async listarPersonalUnidad(
    unidadId: number,
    params: RhPersonalListParams = {}
  ): Promise<RhPersonalUnidadPagedResponse> {
    let httpParams = new HttpParams();

    const q = typeof params.q === 'string' ? params.q.trim() : '';
    if (q) {
      httpParams = httpParams.set('q', q);
    }

    if (params.page != null) {
      httpParams = httpParams.set('page', String(params.page));
    }

    if (params.pageSize != null) {
      httpParams = httpParams.set('pageSize', String(params.pageSize));
    }

    return await firstValueFrom(
      this.http.get<RhPersonalUnidadPagedResponse>(
        `${this.baseUrl}/unidades/${unidadId}/personal`,
        { params: httpParams }
      )
    );
  }

  /**
   * Consulta paginada de personas activas del directorio candidatas para vincularse
   * a la unidad autorizada (`GET /api/rh/unidades/:unidadId/personas-candidatas`).
   */
  async buscarPersonasCandidatasUnidad(
    unidadId: number,
    params: RhPersonalListParams = {}
  ): Promise<RhPersonasCandidatasPagedResponse> {
    let httpParams = new HttpParams();

    const q = typeof params.q === 'string' ? params.q.trim() : '';
    if (q) {
      httpParams = httpParams.set('q', q);
    }

    if (params.page != null) {
      httpParams = httpParams.set('page', String(params.page));
    }

    if (params.pageSize != null) {
      httpParams = httpParams.set('pageSize', String(params.pageSize));
    }

    return await firstValueFrom(
      this.http.get<RhPersonasCandidatasPagedResponse>(
        `${this.baseUrl}/unidades/${unidadId}/personas-candidatas`,
        { params: httpParams }
      )
    );
  }

  /**
   * Registra una adscripción laboral RH para una persona existente del directorio
   * dentro de la unidad autorizada (`POST /api/rh/unidades/:unidadId/adscripciones`).
   * Construye explícitamente el cuerpo con las 8 propiedades permitidas por el backend.
   */
  async crearAdscripcionUnidad(
    unidadId: number,
    payload: RhCreateAdscripcionPayload
  ): Promise<RhCreateAdscripcionResponse> {
    const strictBody: RhCreateAdscripcionPayload = {
      persona_id: Number(payload.persona_id),
      matricula: payload.matricula,
      puesto: payload.puesto,
      turno: payload.turno,
      jornada: payload.jornada,
      horario: payload.horario,
      vigente_desde: payload.vigente_desde,
      vigente_hasta: payload.vigente_hasta,
    };

    return await firstValueFrom(
      this.http.post<RhCreateAdscripcionResponse>(
        `${this.baseUrl}/unidades/${unidadId}/adscripciones`,
        strictBody
      )
    );
  }

  /**
   * Consulta protegida de solo lectura de la ficha individual de un trabajador adscrito
   * (`GET /api/rh/unidades/:unidadId/personal/:adscripcionId`).
   */
  async obtenerFichaPersonalUnidad(
    unidadId: number,
    adscripcionId: number
  ): Promise<RhTrabajadorFichaResponse> {
    return await firstValueFrom(
      this.http.get<RhTrabajadorFichaResponse>(
        `${this.baseUrl}/unidades/${unidadId}/personal/${adscripcionId}`
      )
    );
  }

  /**
   * Actualización parcial y auditada de la información laboral de una adscripción existente
   * (`PATCH /api/rh/unidades/:unidadId/personal/:adscripcionId/laboral`).
   * Filtra el cuerpo exclusivamente a las llaves permitidas que fueron provistas en `payload`.
   */
  async actualizarLaboralAdscripcionUnidad(
    unidadId: number,
    adscripcionId: number,
    payload: RhUpdateAdscripcionLaboralPayload
  ): Promise<RhUpdateAdscripcionLaboralResponse> {
    const cleanPatch: Record<string, unknown> = {};
    for (const key of ALLOWED_PATCH_LABORAL_KEYS) {
      if (Object.prototype.hasOwnProperty.call(payload, key) && payload[key] !== undefined) {
        cleanPatch[key] = payload[key];
      }
    }

    return await firstValueFrom(
      this.http.patch<RhUpdateAdscripcionLaboralResponse>(
        `${this.baseUrl}/unidades/${unidadId}/personal/${adscripcionId}/laboral`,
        cleanPatch
      )
    );
  }

  /**
   * Solicita explícitamente la revelación temporal y auditada de RFC y CURP completos
   * (`POST /api/rh/unidades/:unidadId/personal/:adscripcionId/revelar-identificadores`).
   * Envía estrictamente un cuerpo JSON vacío `{}` sin parámetros en query string,
   * y no persiste ni almacena en caché el resultado dentro del servicio.
   */
  async revelarIdentificadoresUnidad(
    unidadId: number,
    adscripcionId: number
  ): Promise<RhRevealIdentificadoresResponse> {
    const emptyBody: Record<string, never> = {};
    return await firstValueFrom(
      this.http.post<RhRevealIdentificadoresResponse>(
        `${this.baseUrl}/unidades/${unidadId}/personal/${adscripcionId}/revelar-identificadores`,
        emptyBody
      )
    );
  }

  /**
   * Actualización parcial, autorizada y auditada de la identificación personal de un trabajador
   * (`PATCH /api/rh/unidades/:unidadId/personal/:adscripcionId/identificacion`).
   * Filtra estrictamente el cuerpo a las 5 llaves permitidas (`nombres`, `apellidos`, `nombre_completo`,
   * `rfc`, `curp`) que fueron provistas explícitamente en `patch`, sin caché ni almacenamiento.
   */
  async actualizarIdentificacionPersonalUnidad(
    unidadId: number,
    adscripcionId: number,
    patch: RhUpdatePersonaIdentificacionPayload
  ): Promise<RhUpdatePersonaIdentificacionResponse> {
    const cleanPatch: Record<string, unknown> = {};
    for (const key of ALLOWED_PATCH_IDENTIFICACION_KEYS) {
      if (Object.prototype.hasOwnProperty.call(patch, key) && patch[key] !== undefined) {
        cleanPatch[key] = patch[key];
      }
    }

    return await firstValueFrom(
      this.http.patch<RhUpdatePersonaIdentificacionResponse>(
        `${this.baseUrl}/unidades/${unidadId}/personal/${adscripcionId}/identificacion`,
        cleanPatch
      )
    );
  }

  /**
   * Consulta el contexto individual de autogestión del empleado autenticado
   * (`GET /api/rh/mi-contexto`).
   *
   * - No envía parámetros de consulta, `persona_id` ni `unidadId`.
   * - La identidad se resuelve exclusivamente en el backend a partir del token autenticado.
   * - No persiste ni almacena en caché el resultado dentro del servicio.
   */
  async obtenerMiContextoRh(): Promise<RhMiContextoResponse> {
    return await firstValueFrom(
      this.http.get<RhMiContextoResponse>(`${this.baseUrl}/mi-contexto`)
    );
  }

  /**
   * Consulta paginada del padrón institucional de personas (`GET /api/rh/personas`).
   * Exclusivo para `RECURSOS_HUMANOS GLOBAL`.
   */
  async listarPersonasPadron(
    params: RhPersonasPadronListParams = {}
  ): Promise<RhPersonasPadronPagedResponse> {
    let httpParams = new HttpParams();

    const q = typeof params.q === 'string' ? params.q.trim() : '';
    if (q) {
      httpParams = httpParams.set('q', q);
    }

    if (params.estado) {
      httpParams = httpParams.set('estado', params.estado);
    }

    if (params.unidadId != null) {
      httpParams = httpParams.set('unidadId', String(params.unidadId));
    }

    if (params.page != null) {
      httpParams = httpParams.set('page', String(params.page));
    }

    if (params.pageSize != null) {
      httpParams = httpParams.set('pageSize', String(params.pageSize));
    }

    return await firstValueFrom(
      this.http.get<RhPersonasPadronPagedResponse>(`${this.baseUrl}/personas`, {
        params: httpParams,
      })
    );
  }

  /**
   * Alta administrativa de una persona institucional en el padrón (`POST /api/rh/personas`).
   * Filtra estrictamente a las 7 propiedades permitidas por el backend.
   */
  async crearPersonaInstitucional(
    payload: RhCreatePersonaPayload
  ): Promise<RhPersonaAdminDto> {
    const cleanBody: Record<string, unknown> = {};
    for (const key of ALLOWED_CREATE_PERSONA_KEYS) {
      if (Object.prototype.hasOwnProperty.call(payload, key) && payload[key] !== undefined) {
        cleanBody[key] = payload[key];
      }
    }

    return await firstValueFrom(
      this.http.post<RhPersonaAdminDto>(`${this.baseUrl}/personas`, cleanBody)
    );
  }

  /**
   * Cambio controlado de estado administrativo (`activo`) de una persona
   * (`PATCH /api/rh/personas/:personaId/estado`).
   */
  async actualizarEstadoPersona(
    personaId: number,
    activo: boolean
  ): Promise<RhUpdatePersonaEstadoResponse> {
    return await firstValueFrom(
      this.http.patch<RhUpdatePersonaEstadoResponse>(
        `${this.baseUrl}/personas/${personaId}/estado`,
        { activo: Boolean(activo) }
      )
    );
  }

  /**
   * Edición parcial de datos generales del directorio institucional de una persona
   * (`PATCH /api/rh/personas/:personaId/general`).
   * Filtra estrictamente el cuerpo a `cargo`, `correo_principal` y `unidad_medica_id`.
   */
  async actualizarDatosGeneralesPersona(
    personaId: number,
    patch: RhUpdatePersonaGeneralPayload
  ): Promise<RhUpdatePersonaGeneralResponse> {
    const cleanPatch: Record<string, unknown> = {};
    for (const key of ALLOWED_UPDATE_PERSONA_GENERAL_KEYS) {
      if (Object.prototype.hasOwnProperty.call(patch, key) && patch[key] !== undefined) {
        cleanPatch[key] = patch[key];
      }
    }

    return await firstValueFrom(
      this.http.patch<RhUpdatePersonaGeneralResponse>(
        `${this.baseUrl}/personas/${personaId}/general`,
        cleanPatch
      )
    );
  }

  /**
   * Consulta paginada del historial de comisiones laborales de una persona
   * (`GET /api/rh/personas/:personaId/comisiones`).
   */
  async listComisionesPorPersona(
    personaId: number,
    params: RhComisionesListParams = {}
  ): Promise<RhComisionesListResponse> {
    let httpParams = new HttpParams();
    if (params.estado) {
      httpParams = httpParams.set('estado', params.estado);
    }
    if (params.page && params.page > 0) {
      httpParams = httpParams.set('page', String(params.page));
    }
    if (params.pageSize && params.pageSize > 0) {
      httpParams = httpParams.set('pageSize', String(params.pageSize));
    }

    return await firstValueFrom(
      this.http.get<RhComisionesListResponse>(
        `${this.baseUrl}/personas/${personaId}/comisiones`,
        { params: httpParams }
      )
    );
  }

  /**
   * Registro de una nueva comisión laboral para una persona
   * (`POST /api/rh/personas/:personaId/comisiones`).
   * Filtra estrictamente el cuerpo a las propiedades permitidas por el backend.
   */
  async crearComisionPersona(
    personaId: number,
    payload: RhCreateComisionPayload
  ): Promise<RhComisionLaboralDto> {
    const cleanBody: Record<string, unknown> = {};
    for (const key of ALLOWED_CREATE_COMISION_KEYS) {
      if (Object.prototype.hasOwnProperty.call(payload, key) && payload[key] !== undefined) {
        cleanBody[key] = payload[key];
      }
    }

    return await firstValueFrom(
      this.http.post<RhComisionLaboralDto>(
        `${this.baseUrl}/personas/${personaId}/comisiones`,
        cleanBody
      )
    );
  }

  /**
   * Conclusión administrativa controlada e idempotente de una comisión laboral
   * (`PATCH /api/rh/personas/:personaId/comisiones/:comisionId/concluir`).
   * Filtra estrictamente el cuerpo a `fecha_fin` y `observaciones`.
   */
  async concluirComisionPersona(
    personaId: number,
    comisionId: number,
    payload: RhConcluirComisionPayload = {}
  ): Promise<RhConcluirComisionResponse> {
    const cleanBody: Record<string, unknown> = {};
    for (const key of ALLOWED_CONCLUIR_COMISION_KEYS) {
      if (Object.prototype.hasOwnProperty.call(payload, key) && payload[key] !== undefined) {
        cleanBody[key] = payload[key];
      }
    }

    return await firstValueFrom(
      this.http.patch<RhConcluirComisionResponse>(
        `${this.baseUrl}/personas/${personaId}/comisiones/${comisionId}/concluir`,
        cleanBody
      )
    );
  }

  /**
   * Consulta paginada del historial/kardex de registros vacacionales de una persona
   * (`GET /api/rh/personas/:personaId/vacaciones`).
   */
  async listVacacionesPorPersona(
    personaId: number,
    params: RhVacacionesListParams = {}
  ): Promise<RhVacacionesListResponse> {
    let httpParams = new HttpParams();
    if (params.anio_ciclo != null && Number.isInteger(params.anio_ciclo)) {
      httpParams = httpParams.set('anio_ciclo', String(params.anio_ciclo));
    }
    if (params.estado) {
      httpParams = httpParams.set('estado', params.estado);
    }
    if (params.page && params.page > 0) {
      httpParams = httpParams.set('page', String(params.page));
    }
    if (params.pageSize && params.pageSize > 0) {
      httpParams = httpParams.set('pageSize', String(params.pageSize));
    }

    return await firstValueFrom(
      this.http.get<RhVacacionesListResponse>(
        `${this.baseUrl}/personas/${personaId}/vacaciones`,
        { params: httpParams }
      )
    );
  }

  /**
   * Registro administrativo de un periodo vacacional para una persona
   * (`POST /api/rh/personas/:personaId/vacaciones`).
   */
  async crearVacacionPersona(
    personaId: number,
    payload: RhCreateVacacionPayload
  ): Promise<RhCreateVacacionResponse> {
    const cleanBody: Record<string, unknown> = {};
    for (const key of ALLOWED_CREATE_VACACION_KEYS) {
      if (Object.prototype.hasOwnProperty.call(payload, key) && payload[key] !== undefined) {
        cleanBody[key] = payload[key];
      }
    }

    return await firstValueFrom(
      this.http.post<RhCreateVacacionResponse>(
        `${this.baseUrl}/personas/${personaId}/vacaciones`,
        cleanBody
      )
    );
  }

  /**
   * Anulación lógica e idempotente de un registro vacacional
   * (`PATCH /api/rh/personas/:personaId/vacaciones/:registroId/anular`).
   */
  async anularVacacionPersona(
    personaId: number,
    registroId: number,
    payload: RhAnularVacacionPayload
  ): Promise<RhAnularVacacionResponse> {
    const cleanBody: Record<string, unknown> = {};
    for (const key of ALLOWED_ANULAR_VACACION_KEYS) {
      if (Object.prototype.hasOwnProperty.call(payload, key) && payload[key] !== undefined) {
        cleanBody[key] = payload[key];
      }
    }

    return await firstValueFrom(
      this.http.patch<RhAnularVacacionResponse>(
        `${this.baseUrl}/personas/${personaId}/vacaciones/${registroId}/anular`,
        cleanBody
      )
    );
  }

  /**
   * Consulta paginada de las adscripciones laborales oficiales de una persona
   * (`GET /api/rh/personas/:personaId/adscripciones`).
   */
  async listAdscripcionesPorPersona(
    personaId: number,
    params: RhAdscripcionesPersonaListParams = {}
  ): Promise<RhAdscripcionesPersonaListResponse> {
    let httpParams = new HttpParams();
    if (params.estado) {
      httpParams = httpParams.set('estado', params.estado);
    }
    if (params.page && params.page > 0) {
      httpParams = httpParams.set('page', String(params.page));
    }
    if (params.pageSize && params.pageSize > 0) {
      httpParams = httpParams.set('pageSize', String(params.pageSize));
    }

    return await firstValueFrom(
      this.http.get<RhAdscripcionesPersonaListResponse>(
        `${this.baseUrl}/personas/${personaId}/adscripciones`,
        { params: httpParams }
      )
    );
  }
}
