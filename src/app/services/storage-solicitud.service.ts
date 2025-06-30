// src/app/services/storage-solicitud.service.ts
import { Injectable } from '@angular/core';
import { ModoCapturaSolicitud } from '../shared/modo-captura-solicitud';
import { StorageVariables } from '../shared/storage-variables';
import { BehaviorSubject, defer, delay, map, Observable, of, timer } from 'rxjs';
import { DatosClues } from '../models/datos-clues';
import { CPMS } from '../models/CPMS';
import * as LZString from 'lz-string';
import { Inventario } from '../models/Inventario';

/**
 * Servicio de solicitud
 * Con este se manejará el estado de las solicitudes. 
 * - Saber si se captura solo Hospitales (2do nivel)
 * - Saber si se captura solo Unidades Médicas (1er nivel)
 * - Administra los nombres de las variables de localStorage que se usan
 */
@Injectable({ providedIn: 'root' })
export class StorageSolicitudService {
    private modoCapturaSolicitud = ModoCapturaSolicitud.SEGUNDO_NIVEL;
    private nombreUnidadSubject = new BehaviorSubject<string>('');
    public nombreUnidad$ = this.nombreUnidadSubject.asObservable();

    constructor() { }

    getModoCapturaSolicitud(): ModoCapturaSolicitud {
        return this.modoCapturaSolicitud;
    }

    setModoCapturaSolicitud(modoCapturaSolicitud: ModoCapturaSolicitud) {
        this.modoCapturaSolicitud = modoCapturaSolicitud;
    }

    getDatosCluesFromLocalStorage(): string | null {
        if (this.modoCapturaSolicitud === ModoCapturaSolicitud.PRIMER_NIVEL) {
            return localStorage.getItem(StorageVariables.SOLICITUD_DATOS_CLUES_PRIMER_NIVEL);
        } else {
            return localStorage.getItem(StorageVariables.SOLICITUD_DATOS_CLUES_SEGUNDO_NIVEL);
        }
    }

    setDatosCluesInLocalStorage(clues: string) {
        if (this.modoCapturaSolicitud === ModoCapturaSolicitud.PRIMER_NIVEL) {
            localStorage.setItem(StorageVariables.SOLICITUD_DATOS_CLUES_PRIMER_NIVEL, clues);
        } else {
            localStorage.setItem(StorageVariables.SOLICITUD_DATOS_CLUES_SEGUNDO_NIVEL, clues);
        }
        this.emitirNombreUnidad();
    }

    getArticulosSolicitadosFromLocalStorage(): string | null {
        this.emitirNombreUnidad();
        if (this.modoCapturaSolicitud === ModoCapturaSolicitud.PRIMER_NIVEL) {
            return localStorage.getItem(StorageVariables.SOLICITUD_ARTICULOS_SOLICITADOS_PRIMER_NIVEL);
        } else {
            return localStorage.getItem(StorageVariables.SOLICITUD_ARTICULOS_SOLICITADOS_SEGUNDO_NIVEL);
        }
    }

    setArticulosSolicitadosInLocalStorage(clues: string) {
        if (this.modoCapturaSolicitud === ModoCapturaSolicitud.PRIMER_NIVEL) {
            localStorage.setItem(StorageVariables.SOLICITUD_ARTICULOS_SOLICITADOS_PRIMER_NIVEL, clues);
        } else {
            localStorage.setItem(StorageVariables.SOLICITUD_ARTICULOS_SOLICITADOS_SEGUNDO_NIVEL, clues);
        }
    }

    limpiarArticulosSolicitadosInLocalStorage() {
        if (this.modoCapturaSolicitud === ModoCapturaSolicitud.PRIMER_NIVEL) {
            localStorage.removeItem(StorageVariables.SOLICITUD_ARTICULOS_SOLICITADOS_PRIMER_NIVEL);
        } else {
            localStorage.removeItem(StorageVariables.SOLICITUD_ARTICULOS_SOLICITADOS_SEGUNDO_NIVEL);
        }
    }

    getActiveTabFromLocalStorage(): string | null {
        if (this.modoCapturaSolicitud === ModoCapturaSolicitud.PRIMER_NIVEL) {
            return localStorage.getItem(StorageVariables.SOLICITUD_ACTIVE_TAB_PRIMER_NIVEL);
        } else {
            return localStorage.getItem(StorageVariables.SOLICITUD_ACTIVE_TAB_SEGUNDO_NIVEL);
        }
    }

    setActiveTabInLocalStorage(clues: string) {
        if (this.modoCapturaSolicitud === ModoCapturaSolicitud.PRIMER_NIVEL) {
            localStorage.setItem(StorageVariables.SOLICITUD_ACTIVE_TAB_PRIMER_NIVEL, clues);
        } else {
            localStorage.setItem(StorageVariables.SOLICITUD_ACTIVE_TAB_SEGUNDO_NIVEL, clues);
        }
    }

    getCPMSFromLocalStorage(): CPMS[] {
        // obteniendo CPMS Serializado y comprimido para descomprimir y devolver
        // console.log('obteniendo CPMS Serializado y comprimido para descomprimir y devolver');
        const CPMScomprimido = localStorage.getItem(StorageVariables.SOLICITUD_CPMS);
        // console.log('CPMScomprimido (un pedazo)', CPMScomprimido?.substring(0, 10));
        if (CPMScomprimido) {
            // console.log('descomprimiendo CPMS');
            const raw = LZString.decompress(CPMScomprimido);
            // console.log('raw tamanio', raw.length);
            return raw ? JSON.parse(raw) : [];
        }
        return [];
    }

    getCPMSFromLocalStorage$(): Observable<CPMS[]> {
        return defer(() => {
            // El código dentro de defer solo se ejecuta cuando hay un suscriptor.
            // timer(0) crea un micro-task. Esto permite que el hilo principal se libere
            // y Angular pueda hacer su detección de cambios antes de que la descompresión bloquee.
            return timer(0).pipe(
                map(() => this.getCPMSFromLocalStorage()) // Llama a la función síncrona aquí
            );
        });
    }

    getInventarioFromLocalStorage(): Inventario[] {
        // obteniendo inventario Serializado y comprimido para descomprimir y devolver
        // console.log('obteniendo inventario Serializado y comprimido para descomprimir y devolver');
        const inventarioComprimido = localStorage.getItem(StorageVariables.SOLICITUD_INVENTARIO);
        // console.log('inventarioComprimido (un pedazo)', inventarioComprimido?.substring(0, 10));
        if (inventarioComprimido) {
            // console.log('descomprimiendo inventario');
            const raw = LZString.decompress(inventarioComprimido);
            // console.log('raw tamanio', raw.length);
            return raw ? JSON.parse(raw) : [];
        }
        return [];
    }

    private emitirNombreUnidad() {
        let nombreUnidad = '';
        const cluesStr = this.getDatosCluesFromLocalStorage();
        if (cluesStr) {
            const datosClues = JSON.parse(cluesStr) as DatosClues;
            nombreUnidad += datosClues.nombreHospital.split(' ') // Divide la cadena en palabras
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // Capitaliza cada palabra
                .join(' '); // Une las palabras en una sola cadena
            // nombreUnidad += '(' + datosClues.tipoInsumo + ')';
        }
        this.nombreUnidadSubject.next(nombreUnidad);
    }

}