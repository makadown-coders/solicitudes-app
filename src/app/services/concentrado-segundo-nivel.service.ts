import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export type ModalidadNecesidades = 'MES_CALENDARIO' | 'ULTIMOS_30_DIAS';
export type FuenteSas = 'AZM' | 'AZT' | 'AZE' | 'HOSPITAL';
export type VentanaSas = { fuente: FuenteSas; desde: string; hasta: string };
export type UnidadSegundoNivel = { clues: string; nombre: string; municipio: string; jurisdiccion: string };
type Cabecera = { id: string; clues: string; fecha: string; periodo: string | null; tipo: string };
export type InformeSegundoNivel = {
  corte: string; desde: string; hasta: string; unidades: UnidadSegundoNivel[]; unidadesPorValidar: string[];
  filas: (UnidadSegundoNivel & { clave: string; descripcion: string; cantidad: number; solicitudIds: string[];
    surtido: number; cubierto: number; pendiente: number; excedente: number; cobertura: number | null; relacion: number | null;
    ultimaSalida: string | null;
    origenes: { fuente: FuenteSas; nombre: string; surtido: number; ultimaSalida: string }[] })[];
  ventanas: VentanaSas[];
  almacenesPorValidar: FuenteSas[];
  incidencias: { origenNoElegible: number; destinoNoElegible: number; mismaUnidad: number; datosInvalidos: number };
  incluidas: Cabecera[]; excluidas: (Cabecera & { equivalenteA: string })[]; sinDetalle: Cabecera[];
  enriquecimientoExcel: {
    sustituciones: { clues: string; original: string; sustituta: string; factor: number | null;
      equivalente: number | null; potencial: number | null; estado: string }[];
    grupos: { clave: string; ambigua: boolean; grupos: { numero: number; nombre: string }[] }[];
    clasificacion: { clave: string; tipo: string; medicamento: boolean; ambigua: boolean;
      grupos: { numero: number; nombre: string }[] }[];
  } | null;
};

@Injectable({ providedIn: 'root' })
export class ConcentradoSegundoNivelService {
  private readonly http = inject(HttpClient);

  analizar(consulta: { modalidad: ModalidadNecesidades; mes?: string; desde?: string; ventanas: VentanaSas[] }) {
    return firstValueFrom(this.http.post<InformeSegundoNivel>(
      environment.apiUrl + '/solicitudes/segundo-nivel/concentrado-necesidades', consulta,
    ));
  }
}
