
import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { EffectiveFlags, Nivel, UpsertFlagPayload } from '../models/feature-flags.model';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { UnidadAllow } from '../models/UnidadAllow';

@Injectable({ providedIn: 'root' })
export class FeatureFlagsService {
    private http = inject(HttpClient);
    private base = environment.apiUrl + '/solicitudes-config';

    async getEffective(params: { cluesimb?: string; nivel?: Nivel }): Promise<EffectiveFlags> {
        let httpParams = new HttpParams();
        if (params.cluesimb) httpParams = httpParams.set('cluesimb', params.cluesimb);
        if (params.nivel) httpParams = httpParams.set('nivel', params.nivel);
        const res = await firstValueFrom(
            this.http.get<{ ok: boolean; flags: EffectiveFlags }>(`${this.base}/effective`, { params: httpParams })
        );
        return res.flags || {
            SOLO_CPMS: undefined,
            BUSCAR_EXISTENCIA_EN_CLUES: undefined,
            APLICAR_ENCUESTAS: undefined,
            APLICAR_EQUIVALENCIAS: undefined,
            CLUES_EXISTENCIAS_ALLOWLIST: undefined
        };
    }

    async patchFlags(payload: UpsertFlagPayload[] | UpsertFlagPayload): Promise<void> {
        await firstValueFrom(this.http.patch<{ ok: boolean }>(this.base, payload));
    }

    async getAllowlistUnidades(q?: string): Promise<UnidadAllow[]> {
        let httpParams = new HttpParams();
        if (q) httpParams = httpParams.set('q', q);
        const res = await firstValueFrom(
            this.http.get<{ ok: boolean; rows: UnidadAllow[] }>(`${this.base}/allowlist-unidades`,
                { params: httpParams, observe: 'body' }
            )
        );
        return res.rows || [];
    }

    /**
     * Devuelve TODAS las unidades de la allowlist
     */
    async getAllowlistUnidadesAll(): Promise<UnidadAllow[]> {
        const res = await firstValueFrom(
            this.http.get<{ ok: boolean; rows: UnidadAllow[] }>(
                `${this.base}/allowlist-unidades`,
                { observe: 'body' }
            )
        );
        // Por si el backend no ordena: ordenamos por alias y nombre
        return (res.rows || []).slice().sort((a, b) =>
            (a.alias_dash || '').localeCompare(b.alias_dash || '')
            || (a.nombre || '').localeCompare(b.nombre || '')
        );
    }
}