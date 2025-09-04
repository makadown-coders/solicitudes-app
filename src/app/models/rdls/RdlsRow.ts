/**
 * Interface para las filas del RDLS (En dashboard abasto)
 */
export interface RdlsRow {
  no: number;
  clave: string;
  descripcion: string;
  tipo: string;
  grupo_terapeutico: string;
  piezas: number;

  AZM: number; AZE: number; AZT: number;
  totalAlmacenes: number;

  HGTK: number; HMIT: number; HGTZOE: number; HGT: number; HGPR: number;
  HGM: number; HMIM: number; UNEME: number; HGSF: number; HGE: number;
  totalHospitales: number;

  CPM_HGTK: number; CPM_HMIT: number; CPM_HGTZOE: number; CPM_HGT: number; CPM_HGPR: number;
  CPM_HGM: number; CPM_HMIM: number; CPM_UNEME: number; CPM_HGSF: number; CPM_HGE: number;
  TOTAL_CPM_TIJUANA: number;
  TOTAL_CPM_MEXICALI: number;
  TOTAL_CPM_ENSENADA: number;
}
