# Contexto de trabajo: solicitudes-app

## Propósito y stack

- Frontend Angular standalone con TypeScript, Signals y Tailwind/utilidades CSS.
- La API base se obtiene de `src/environments/environment*`.
- El shell principal de abasto vive en `src/app/features/dashboard-abasto` y sus rutas hijas en `src/app/app.routes.ts`.

## Convenciones del proyecto

- Mantener mensajes visibles en español y los identificadores de dominio existentes (`CLUES`, `CPM`, clave CNIS, homólogos).
- Preferir componentes standalone, `ChangeDetectionStrategy.OnPush`, `inject()` y Signals, siguiendo los módulos recientes.
- Diseñar primero para móvil/tablet sin degradar escritorio. Las tablas densas deben tener una alternativa en cards o bloques expandibles.
- El proyecto es exclusivamente light mode. No introducir clases `dark:*`, selectores de tema oscuro ni persistencia de tema.
- Reutilizar los servicios bajo `src/app/services`; no consultar endpoints directamente desde componentes.
- No asumir que datos analíticos son fuente de verdad. Mostrar fecha de corte y leyendas de alcance cuando corresponda.

## Radar de solicitudes

- `radar-global` es la versión histórica y debe conservarse mientras se valida V2.
- `radar-global-v2` es el Radar de demanda y cobertura. Su grano es unidad médica + clave + periodo.
- “Sin solicitud observada” no equivale a “la unidad no lo necesita”. Conservar esa redacción prudente.
- El frontend presenta filtros, paginación y evidencia; los cruces de CPM, solicitudes, existencias y homólogos pertenecen al backend.
- La cobertura en CPM es `existencia / CPM`; los días estimados son `(existencia / CPM) * 30` cuando el CPM es mensual.

## Validación

- Ejecutar `npm run build` después de cambios funcionales.
- No actualizar dependencias ni contratos HTTP sin justificarlo y coordinarlo con el backend.
- Preservar cambios locales ajenos; no hacer commit ni push salvo solicitud explícita.
