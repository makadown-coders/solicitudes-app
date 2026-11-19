export type VertienteProgramatica = 'APS' | 'PROGRAMAS_PREVENTIVOS';
export type EvidenciaClasificacion = 'REGISTRADA' | 'INFERIDA' | 'MIXTA';
export type ModalidadNecesidades = 'MES_CALENDARIO' | 'ULTIMOS_30_DIAS';
export type AtribucionSas = 'EXCLUSIVA' | 'COMPARTIDA';
export type ZonaSas = 'AZM' | 'AZT' | 'AZE';

export interface VentanaSasProgramas {
  zona: ZonaSas;
  desde: string;
  hasta: string;
  almacenId?: number;
}

export interface AbastoProgramasFiltros {
  modalidad: ModalidadNecesidades;
  mes: string;
  desde: string;
  jurisdiccion: string;
  municipio: string;
  clues: string;
  vertiente: VertienteProgramatica;
  programa: string;
  ventanasSas: VentanaSasProgramas[];
  page: number;
  pageSize: number;
}

export interface AbastoProgramasNecesidadRow {
  jurisdiccion: string;
  municipio: string;
  unidad: string;
  clues: string;
  vertiente: VertienteProgramatica;
  programa: string | null;
  programaNombre: string | null;
  clave: string;
  descripcion: string | null;
  cantidad: number;
  evidencia: EvidenciaClasificacion;
  solicitudes: number;
  surtidoSas: number | null;
  pendiente: number | null;
  excedente: number | null;
  cobertura: number | null;
  relacionSurtidoSolicitado: number | null;
  atribucionSas: AtribucionSas;
}

export interface AbastoProgramasNecesidadesResponse {
  mode: 'necesidades-abasto-programas';
  periodo: { modalidad: ModalidadNecesidades; mes: string; desde: string; hasta: string; corte: string };
  filtros: Omit<AbastoProgramasFiltros, 'page' | 'pageSize' | 'desde' | 'mes' | 'ventanasSas'>;
  resumen: {
    unidadesSolicitantes: number;
    clavesDistintas: number;
    cantidadTotal: number;
    cantidadRegistrada: number;
    cantidadInferida: number;
    totalHistoricoGeneral: number;
    cantidadProgramaticaGeneral: number;
    cantidadFueraAnalisisProgramatico: number;
    necesidadAtribuible: number;
    surtidoAtribuido: number;
    pendienteAtribuible: number;
    excedenteAtribuible: number;
    coberturaOperativa: number | null;
    relacionSurtidoSolicitado: number | null;
    casosCompartidos: number;
  };
  calidad: {
    cantidadClaveRegistrada: number;
    cantidadAmbigua: number;
    cantidadSinCoincidencia: number;
    diferenciasContexto: number;
    cantidadesInvalidasSas: number;
    salidasSinNecesidad: number;
    cantidadSalidasSinNecesidad: number;
  };
  ventanasSas: VentanaSasProgramas[];
  almacenes: Array<{ id: number; nombre: string; zona: ZonaSas }>;
  compartidas: Array<{
    clues: string;
    clave: string;
    necesidadTotal: number;
    surtidoSas: number;
    cantidadNoClasificada: number;
    destinos: Array<{
      vertiente: VertienteProgramatica;
      programa: string | null;
      programaNombre: string | null;
      cantidad: number;
    }>;
  }>;
  distribucionProgramas: Array<{ codigo: string; nombre: string; cantidad: number; claves: number; unidades: number }>;
  catalogos: {
    jurisdicciones: string[];
    municipios: string[];
    unidades: Array<{ clues: string; unidad: string; municipio: string; jurisdiccion: string }>;
    programas: Array<{ codigo: string; nombre: string }>;
  };
  page: number;
  pageSize: number;
  total: number;
  data: AbastoProgramasNecesidadRow[];
}
