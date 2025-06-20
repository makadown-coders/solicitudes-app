import { Injectable } from '@angular/core';
import { ModoCapturaSolicitud } from '../shared/modo-captura-solicitud';
import { StorageVariables } from '../shared/storage-variables';

/**
 * Servicio de solicitud
 * Con este se manejará el estado de las solicitudes. 
 * - Saber si se captura solo Hospitales (2do nivel)
 * - Saber si se captura solo Unidades Médicas (1er nivel)
 * - Administra los nombres de las variables de localStorage que se usan
 */
@Injectable({providedIn: 'root'})
export class StorageSolicitudService {
    private modoCapturaSolicitud = ModoCapturaSolicitud.SEGUNDO_NIVEL;    

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
    }

    getArticulosSolicitadosFromLocalStorage(): string | null {
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

    
}