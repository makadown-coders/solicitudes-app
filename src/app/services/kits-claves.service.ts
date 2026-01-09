import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { map, Observable } from "rxjs";
import { environment } from "../../environments/environment";
import { KitClave, ListClavesResponse, KitClaveResponse } from "../models/KitClave";
import { KitClaveCreateDto } from "../models/KitClaveCreateDto";

@Injectable({ providedIn: 'root' })
export class KitsClavesService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/kits`;

  listByKit(kitId: number): Observable<KitClave[]> {
    return this.http.get<ListClavesResponse>(`${this.baseUrl}/${kitId}/claves`).pipe(
      map(res => res.rows)
    );
  }

  listByCodigo(codigo: string): Observable<KitClave[]> {
    return this.http.get<ListClavesResponse>(`${this.baseUrl}/${codigo}/clavesByCodigo`).pipe(
      map(res => res.rows)
    );
  }

  addClave(kitId: number, dto: KitClaveCreateDto): Observable<KitClave> {
    return this.http.post<KitClaveResponse>(`${this.baseUrl}/${kitId}/claves`, dto).pipe(
      map(res => res.clave)
    );
  }

  deleteClave(kitId: number, id: number) {
    return this.http.delete<{ ok: boolean }>(`${this.baseUrl}/${kitId}/claves/${id}`);
  }
}