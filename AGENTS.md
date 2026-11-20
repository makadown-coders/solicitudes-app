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
- Las órdenes se consultan bajo demanda. “Cobertura proyectada” puede incluir saldos pendientes y nunca equivale a existencia disponible.
- La demanda histórica usa el periodo seleccionado; la vigencia operativa usa una ventana fija de 14 días desde la última solicitud. Riesgo y estado operativo son dimensiones distintas.

## Validación

- Ejecutar `npm run build` después de cambios funcionales.
- No actualizar dependencias ni contratos HTTP sin justificarlo y coordinarlo con el backend.
- Preservar cambios locales ajenos; no hacer commit ni push salvo solicitud explícita.

## Convención institucional de paginación

- Los listados paginados deben mostrar los controles en el orden exacto: **Primero | Anterior | Selector de página | Siguiente | Último**.
- El control central debe permitir navegar directamente a una página válida mediante un `<select>` accesible (o entrada numérica validada) que muestre página actual y total, navegando inmediatamente al cambiar.
- Todos los controles deben ser funcionales: **Primero** navega a página `1`, **Anterior** a `page - 1`, **Selector** a cualquier entero `1..totalPages`, **Siguiente** a `page + 1` y **Último** a `totalPages`.
- Deshabilitar **Primero** y **Anterior** en la primera página; deshabilitar **Siguiente** y **Último** en la última página (y cuando `total <= pageSize` o `total === 0`).
- Mostrar el número de página actual, el total de páginas calculado desde `total` y `pageSize` reales, y el total de registros cuando esté disponible.
- Aplicar filtros y búsquedas antes de paginar; reiniciar siempre a página `1` al cambiar filtros o búsqueda.
- Descartar respuestas HTTP obsoletas por secuencia y conservar accesibilidad por teclado y etiquetas claras.
- El `<select>` tradicional es válido aquí por tratarse de una secuencia numérica discreta; no sustituir el autocompletado de unidades por un dropdown tradicional.
- No introducir controles inoperantes ni variantes distintas sin justificación funcional. No exigir paginación en conjuntos pequeños que no la requieran.

## Convención institucional de controles interactivos

- Todo control accionable (botones, enlaces, opciones de menú, pestañas, filas clicables y elementos seleccionables) debe comunicar interactividad mediante `cursor-pointer`, estados `hover` y `focus-visible` claros.
- Los controles deshabilitados deben diferenciarse visualmente (`disabled:cursor-not-allowed disabled:opacity-50`) sin sugerir que pueden activarse.
- No aplicar `cursor-pointer` a texto estático ni a elementos sin acción; usar semántica HTML correcta (`<button>`, `<a>`, `<select>`, `role="menu"` / `role="combobox"`).
- No depender exclusivamente del cursor o del color para comunicar acciones y mantener indicadores de foco accesibles por teclado.

## Convención institucional de responsividad

- Las interfaces deben adaptarse a escritorio, tablet y móvil sin desbordamientos horizontales involuntarios ni botones/etiquetas recortados.
- En pantallas grandes conservar tablas legibles y compactas (agrupando acciones secundarias en un menú cuando haya demasiadas acciones por fila); en pantallas pequeñas (`< md`) ofrecer tarjetas o vistas adaptativas.
- Si se requiere desplazamiento horizontal en una tabla, debe ser intencional, visible y usable sin ocultar permanentemente la columna de acciones.
- Los diálogos deben respetar el alto y ancho disponibles (`max-h-[92vh]`, scroll interno) y mantener filtros y paginación accesibles en resoluciones desde 375 px hasta 1440 px.

## Convención institucional de menús flotantes y overlays

- Los menús flotantes deben renderizarse fuera de contenedores con `overflow` (mediante `position: fixed` o CDK Overlay) para permanecer visibles dentro del viewport sin recorte ni barras de desplazamiento adicionales.
- Deben anclarse visualmente a su control disparador, reposicionarse ante bordes inferiores/derechos y cerrarse ante `Escape`, clic fuera, selección de acción o desplazamiento.
- Mantener un único menú activo a la vez, navegación accesible por teclado y restitución de foco al botón disparador cuando corresponda.
- No intentar resolver problemas de clipping aumentando únicamente `z-index`.

## Convención de filtros responsivos

- Los filtros deben reorganizarse verticalmente en móvil y tablet (p. ej. `grid-cols-1 md:grid-cols-12`) sin campos comprimidos ni scroll horizontal de página.
- Preferir búsqueda textual dinámica con debounce (250–350 ms) y botón de limpieza rápida, sin exigir un botón «Buscar» para consultas textuales ordinarias.

## Convención institucional de búsqueda y autocompletado

- Para catálogos extensos, utilizar búsqueda dinámica conforme el usuario escribe (combobox/autocompletado) en lugar de dropdowns tradicionales.
- Buscar por nombre y por identificadores relevantes del dominio; para unidades institucionales, permitir búsqueda por **nombre** y **CLUESIMB** sin excluir unidades administrativas ni `OFICINA CENTRAL` (`CLUESIMB: N/A`).
- Actualizar coincidencias de forma inmediata (búsqueda parcial, insensible a mayúsculas/minúsculas y con normalización de espacios/acentos cuando corresponda), sin exigir botón «Buscar» ni presionar Enter.
- Mostrar un número razonable de coincidencias, ofrecer navegación por teclado (`ArrowDown`, `ArrowUp`, `Enter`, `Escape`) y estados claros de carga, vacío y error.
- Mantener sincronizada la opción seleccionada e invalidar inmediatamente el identificador previo si el usuario modifica el texto; nunca enviar texto libre cuando se requiere un ID válido.
- Usar debounce y descarte de respuestas obsoletas para búsquedas remotas; evitar llamadas HTTP por pulsación si el catálogo ya está disponible localmente.
- Reservar `<select>` tradicionales únicamente para conjuntos pequeños, estables y delimitados (p. ej. filtros de estado).
