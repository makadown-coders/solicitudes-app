const DIAS_SEMANA_LARGOS_ES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;

const DIAS_SEMANA_CORTOS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;

const MESES_LARGOS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

const MESES_CORTOS_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const;

const ISO_DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIsoDateUtc(iso: string): { year: number; month: number; day: number; dow: number } | null {
  const clean = (iso ?? '').trim();
  const match = ISO_DATE_ONLY_REGEX.exec(clean);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(dt.getTime()) ||
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() + 1 !== month ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day, dow: dt.getUTCDay() };
}

/**
 * Formatea una fecha DATE ISO (`YYYY-MM-DD`) en español largo sin desplazamiento de zona horaria:
 * Ej. `2026-10-07` → `Miércoles 7 de octubre de 2026`
 */
export function formatFechaVacacionLargaEs(iso: string): string {
  const parsed = parseIsoDateUtc(iso);
  if (!parsed) {
    return (iso ?? '').trim();
  }
  const dow = DIAS_SEMANA_LARGOS_ES[parsed.dow];
  const mes = MESES_LARGOS_ES[parsed.month - 1];
  return `${dow} ${parsed.day} de ${mes} de ${parsed.year}`;
}

/**
 * Formatea una fecha DATE ISO (`YYYY-MM-DD`) en español compacto sin desplazamiento de zona horaria:
 * Ej. `2026-10-07` → `Mié 07-oct-2026`
 */
export function formatFechaVacacionCortaEs(iso: string): string {
  const parsed = parseIsoDateUtc(iso);
  if (!parsed) {
    return (iso ?? '').trim();
  }
  const dow = DIAS_SEMANA_CORTOS_ES[parsed.dow];
  const mes = MESES_CORTOS_ES[parsed.month - 1];
  const dd = String(parsed.day).padStart(2, '0');
  return `${dow} ${dd}-${mes}-${parsed.year}`;
}

/**
 * Ordena cronológicamente un arreglo de fechas por su cadena ISO `YYYY-MM-DD`.
 */
export function sortFechasVacacionCronologico<T extends { fecha: string }>(
  items: readonly T[]
): T[] {
  return [...items].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/**
 * Obtiene la fecha local actual en Baja California (`America/Tijuana`) como `YYYY-MM-DD`
 * sin desplazamientos de zona horaria UTC.
 */
export function getFechaLocalBajaCaliforniaIso(now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Tijuana',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) {
      return `${y}-${m}-${d}`;
    }
  } catch {
    // Fallback a fecha local del navegador
  }
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface RhPeriodoRangoMinimo {
  id: number;
  anio: number;
  numero_periodo: number;
  fecha_inicio: string;
  fecha_fin: string;
}

/**
 * Selecciona automáticamente el periodo institucional cuyo rango `[fecha_inicio, fecha_fin]`
 * incluye `fechaLocalIso` (por defecto la fecha local actual de Baja California),
 * sin depender de IDs ni del orden del arreglo.
 */
export function selectPeriodoVigentePorFecha<T extends RhPeriodoRangoMinimo>(
  periodos: readonly T[],
  fechaLocalIso: string = getFechaLocalBajaCaliforniaIso()
): { periodo: T | null; cubreFechaActual: boolean } {
  if (!periodos || periodos.length === 0) {
    return { periodo: null, cubreFechaActual: false };
  }

  const vigente = periodos.find(
    (p) => p.fecha_inicio <= fechaLocalIso && fechaLocalIso <= p.fecha_fin
  );
  if (vigente) {
    return { periodo: vigente, cubreFechaActual: true };
  }

  const sorted = [...periodos].sort((a, b) => {
    if (b.anio !== a.anio) {
      return b.anio - a.anio;
    }
    return b.numero_periodo - a.numero_periodo;
  });
  return { periodo: sorted[0] ?? null, cubreFechaActual: false };
}
