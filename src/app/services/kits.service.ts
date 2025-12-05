import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
    ImportOneResponse,
    Kit,
    KitCreateDto,
    KitResponse,
    KitUpdateDto,
    ListKitsResponse
} from '../models';
import { KitsClavesService } from './kits-claves.service';

@Injectable({ providedIn: 'root' })
export class KitsService {
    private http = inject(HttpClient);
    private baseUrl = `${environment.apiUrl}/kits`;

    list(search?: string): Observable<Kit[]> {
        let params = new HttpParams();
        if (search && search.trim()) {
            params = params.set('search', search.trim());
        }
        return this.http.get<ListKitsResponse>(this.baseUrl, { params })
            .pipe(
                map(res => res.rows)
            );
    }

    create(dto: KitCreateDto): Observable<Kit> {
        return this.http.post<KitResponse>(this.baseUrl, dto).pipe(
            map(res => res.kit)
        );
    }

    update(id: number, dto: KitUpdateDto): Observable<Kit> {
        return this.http.put<KitResponse>(`${this.baseUrl}/${id}`, dto)
            .pipe(map(res => res.kit)
            );
    }

    delete(id: number) {
        return this.http.delete<{ ok: boolean }>(`${this.baseUrl}/${id}`);
    }

    importOne(payload: { codigo: string; claves: string[] }) {
        return this.http.post<ImportOneResponse>(
            `${this.baseUrl}/import-one`,
            payload
        );
    }

    syncKitFromExcel(payload: { codigo: string; claves: string[] }) {
        const kitsClavesService = new KitsClavesService();
        
        return kitsClavesService.listByCodigo(payload.codigo).pipe(
            map(existingClaves => {
                const existingSet = new Set(existingClaves.map(c => c.clave));
                const newClaves = payload.claves.filter(c => !existingSet.has(c));
                return newClaves;
            })
        );
    }
}
