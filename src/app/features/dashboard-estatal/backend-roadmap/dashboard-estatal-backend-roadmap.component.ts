import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface RoadmapEndpoint {
  method: 'GET';
  path: string;
  title: string;
  value: string;
  fields: string[];
}

@Component({
  selector: 'app-dashboard-estatal-backend-roadmap',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-estatal-backend-roadmap.component.html',
})
export class DashboardEstatalBackendRoadmapComponent {
  readonly indicators = [
    'Cobertura en días y meses por clave',
    'Brecha neta contra CPM x3',
    '% de cobertura contra necesidad trimestral',
    'Claves con CPM y existencia en cero',
    'Órdenes pendientes por antigüedad',
    'Valor estimado de faltante o sobreabasto',
    'Distribución de riesgos por jurisdicción',
    'Claves con existencia positiva y CPM cero',
  ];

  readonly endpoints: RoadmapEndpoint[] = [
    {
      method: 'GET',
      path: '/dashboard-estatal/resumen-general',
      title: 'Resumen general',
      value: 'KPIs superiores del dashboard y distribución estatal de riesgos.',
      fields: [
        'claves_analizadas',
        'claves_faltante_critico',
        'piezas_faltantes_estimadas',
        'claves_sobreabasto_alto',
        'piezas_sobreabasto_estimadas',
      ],
    },
    {
      method: 'GET',
      path: '/dashboard-estatal/detalle-clave',
      title: 'Detalle por clave',
      value: 'Explica por qué una clave está en riesgo y dónde se concentra.',
      fields: [
        'resumen_estatal',
        'desglose_jurisdiccion',
        'desglose_unidad',
        'ordenes_pendientes',
        'movimientos_recientes',
      ],
    },
    {
      method: 'GET',
      path: '/dashboard-estatal/riesgos',
      title: 'Explorador de riesgos',
      value: 'Tabla paginada y filtrable para salir del top 10.',
      fields: [
        'riesgo_faltante',
        'riesgo_sobreabasto',
        'jurisdiccion',
        'existencia_cero',
        'cpm_mayor_cero',
      ],
    },
  ];
}
