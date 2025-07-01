// src/app/shared/storage-variables.ts
 
export const enum StorageVariables {
    // Dashboard Abasto tab principal
    DASH_ABASTO_ACTIVE_TAB = 'dash_abasto_active_tab',
    // Dashboard Abasto tab Resumen
    DASH_ABASTO_RESUMEN_FECHA_INICIO = 'dash_abasto_resumen_fecha_inicio',
    DASH_ABASTO_RESUMEN_FECHA_FIN = 'dash_abasto_resumen_fecha_fin',
    DASH_ABASTO_RESUMEN_ANIOS = 'dash_abasto_resumen_anios',
    DASH_ABASTO_RESUMEN_ESTATUS = 'dash_abasto_resumen_estatus',
    DASH_ABASTO_RESUMEN_TIPOS_ENTREGA = 'dash_abasto_resumen_tipos_entrega',
    DASH_ABASTO_RESUMEN_COMPRAS = 'dash_abasto_resumen_compras',
    // Dashboard Abasto tab Proveedores y entregas
    DASH_ABASTO_PROV_FILTRO_PROVEEDOR = 'dash_abasto_prov_filtro_proveedor',
    DASH_ABASTO_PROV_FILTRO_UNIDAD = 'dash_abasto_prov_filtro_unidad',
    DASH_ABASTO_PROV_FILTRO_COMPRA = 'dash_abasto_prov_filtro_compra',
    DASH_ABASTO_PROV_FECHA_INICIO = 'dash_abasto_prov_fecha_inicio',
    DASH_ABASTO_PROV_FECHA_FIN = 'dash_abasto_prov_fecha_fin',
    // Dashboard Abasto tab Citas pendientes
    DASH_ABASTO_CITAS_FILTRO_TEXTO = 'dash_abasto_citas_filtro_texto',
    DASH_ABASTO_CITAS_FILTRO_UNIDAD = 'dash_abasto_citas_filtro_unidad',
    DASH_ABASTO_CITAS_FILTRO_COMPRA = 'dash_abasto_citas_filtro_compra',
    DASH_ABASTO_CITAS_FECHA_INICIO = 'dash_abasto_citas_fecha_inicio',
    DASH_ABASTO_CITAS_FECHA_FIN = 'dash_abasto_citas_fecha_fin',
    DASH_ABASTO_CITAS_INCLUIR_NULAS = 'dash_abasto_citas_incluir_nulas',
    // Dashboard Abasto tab Cumplimiento Claves
    DASH_ABASTO_INV_FILTRO_EJERCICIO = 'dash_abasto_inv_filtro_ejercicio',
    DASH_ABASTO_INV_FILTRO_TEXTO = 'dash_abasto_inv_filtro_texto',
    DASH_ABASTO_INV_FILTRO_UNIDAD = 'dash_abasto_inv_filtro_unidad',
    DASH_ABASTO_INV_FILTRO_COMPRAS = 'dash_abasto_inv_filtro_compras',
    // Dashboard Abasto tab Entregas pendientes
    DASH_ABASTO_RESUMENCITAS_FILTRO_COMPRA = 'dash_abasto_resumen_citas_filtro_compra',
    DASH_ABASTO_RESUMENCITAS_RANGO = 'dash_abasto_resumen_citas_rango',
    // POC Finanzas – Evaluación SMI/SG
    POC_FE_SMI_SG_SELECTED_CLUES = 'poc_finanzas_ev_smi_sg_selected_clues',      // Clues/hospital seleccionado
    POC_FE_SMI_SG_TAB = 'poc_finanzas_ev_smi_sg_tab_activo',          // Tab activo (SMI o SG)
    POC_FE_SMI_SG_EVALUACIONES_SMI = 'poc_finanzas_ev_smi_sg_evaluaciones_smi',    // Arreglo de Servicios SMI    
    POC_FE_SMI_SG_EVALUACIONES_SG = 'poc_finanzas_ev_smi_sg_evaluaciones_sg',      // Arreglo de Servicios SG    
    POC_FE_SMI_SG_EVALUACIONES = 'poc_finanzas_ev_smi_sg_evaluaciones', // // Evaluaciones capturadas de servicios SMI y SG por unidad
    // Solicitudes
    SOLICITUD_INVENTARIO = 'solicitud_inventario',
    SOLICITUD_ARTICULOS_SOLICITADOS_PRIMER_NIVEL = 'solicitud_articulos_solicitados_primer_nivel',
    SOLICITUD_ARTICULOS_SOLICITADOS_SEGUNDO_NIVEL = 'articulosSolicitados',
    SOLICITUD_DATOS_CLUES_PRIMER_NIVEL = 'solicitud_datos_clues_primer_nivel',
    SOLICITUD_DATOS_CLUES_SEGUNDO_NIVEL = 'datosClues',
    SOLICITUD_ACTIVE_TAB_PRIMER_NIVEL = 'solicitud_active_tab_primer_nivel',
    SOLICITUD_ACTIVE_TAB_SEGUNDO_NIVEL = 'activeTab',
    SOLICITUD_CPMS = 'cpms',
}
