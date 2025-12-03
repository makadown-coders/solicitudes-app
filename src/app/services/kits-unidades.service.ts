import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { map, Observable } from "rxjs";
import { environment } from "../../environments/environment";
import { UnidadAsignada, ListUnidadesResponse } from "../models/UnidadAsignada";

@Injectable({ providedIn: 'root' })
export class KitsUnidadesService {
    private http = inject(HttpClient);
    private baseUrl = `${environment.apiUrl}/kits`;

    getUnidadesByKit(kitId: number): Observable<UnidadAsignada[]> {
        return this.http.get<ListUnidadesResponse>(`${this.baseUrl}/${kitId}/unidades`).pipe(
            map(res => res.rows)
        );
    }

    /**
     * Guarda asignaciones de unidades para un kit.
     * El backend espera { cluesimb: string[] }
     */
    saveUnidadesByKit(kitId: number, cluesimb: string[]) {
        return this.http.put<{ ok: boolean }>(`${this.baseUrl}/${kitId}/unidades`, { cluesimb });
    }
}