
export interface UnidadMedica {
  id: number;
  cluessa: string | null;
  cluesimb: string | null;
  nombre_municipio: string | null;
  nombre_localidad: string | null;
  nombre_tipologia: string | null;
  es_segundo_nivel: boolean;
  nombre_de_unidad: string;
  tipo_unidad: string | null;
  alias_sas: string | null;
  direccion: string | null;
  latitud: number | null; // en la vista vienen numéricos
  longitud: number | null;
  estrato_unidad: string | null;
  nivel_atencion: string | null;
}
