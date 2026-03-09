# Solicitudes / Abasto — Frontend (Angular) 🧭

[![Netlify Status](https://api.netlify.com/api/v1/badges/535335da-fd93-4921-a7b8-ec283ab42fda/deploy-status)](https://app.netlify.com/projects/imssb-bc/deploys)

Aplicación **Angular (standalone + signals, zoneless, OnPush)** para capturar y administrar **solicitudes de insumos** con soporte de **KIT**, **CPMs por unidad**, **existencias temporales** y **autocomplete enriquecido**. UI simple y funcional con **TailwindCSS**.

> Nota: Este frontend consume el backend descrito en el README del servidor (endpoints `/api`).

![Browser baseline](https://img.shields.io/badge/browser%20baseline-March%202025%2B-1f7a1f)
![Policy](https://img.shields.io/badge/policy-release%20date%20based-0b57d0)

## Browser compatibility

Esta app esta orientada a navegadores con versiones lanzadas desde **marzo de 2025** en adelante.

Para reducir ambiguedad, una referencia practica aproximada es:
- Chrome: **134+**
- Edge: **134+**
- Firefox: **136+**
- Safari: **18.4+**

La referencia por numero puede cambiar con el tiempo; el criterio oficial es siempre la **fecha de lanzamiento (marzo 2025+)**.

> No se garantiza soporte en sistemas operativos fuera de mantenimiento (por ejemplo, Windows 7/8/8.1), incluso si el navegador instalado abre la aplicación.

---

## ✨ Características clave

- **Arquitectura moderna**: Angular 21+, **standalone components**, **signals**, **ChangeDetectionStrategy.OnPush**, **zoneless**.
- **Solicitudes**:
  - Captura tipo todo-list.
  - **Autocomplete enriquecido** (muestra existencias por unidad y banderas `_enKit`, `_cpm`).
- **KIT modal (`app-kit-modal`)**:
  - Inputs: `cluesimb`, `tituloUnidad`, `mostrarUnidadEnTitulo`, `inventarioDisponible`, `existingClaves`, `defaultQtyNoCpm`.
  - Outputs: `addToSolicitud(ArticuloSolicitud[])`, `close()`.
  - **Filtro por KIT** (dropdown) cuando existen códigos disponibles.
  - **Columnas dinámicas** por toggles: **AZM/AZE/AZT**, **Exist. unidad**, **Cant. sugerida**.
  - **Meses de cobertura** para recalcular el reorden sugerido.
  - **Copiar/CSV** exportan **exactamente lo visible** (mismas columnas/orden).
  - Tooltip de **descripción (130 chars)** en la clave.
  - Botón **“Seleccionar con CPM”** cambia a **“Selec. cant. sug. > 0”** cuando está visible “Existencias de la unidad”.
  - **Reglas de cantidad** al agregar: usa **CPM > 0**, si no **`reordenSug`**, si no **`defaultQtyNoCpm`** (y **nunca 0**).
- **Servicios**:
  - `ExistenciasTempService`: `GET /existencias-temp/by-unidad?cluesimb=...`, `POST /existencias-temp/init`, `POST /existencias-temp/batch`; **cache diario en memoria** hasta medianoche local.
  - `CpmService`: estado **por unidad**; métodos:  
    `ensureForCluesimb(cluesimb)`, `cpmsFor(cluesimb)`, `cpmsForImport(cluesimb)`, `cpmsForKit(cluesimb, kitCodigo$)`,  
    `getCpmForClave(clave, cluesimb?)`, `isClaveInKit(clave, cluesimb?)`, `getKitCountFor(cluesimb)`, `getKitCodigosFor(cluesimb)`;  
    mantiene API **legacy** (`cpms$`) para compatibilidad.
  - `FeatureFlagsService`: `GET /solicitudes-config/effective`, `GET /solicitudes-config/allowlist-unidades`, `PATCH /solicitudes-config`.
  - `TrazabilidadService`: `GET /trazabilidad`, `GET /trazabilidad/all-factores-conversion`, `GET /factores/factor` (legacy).
- **Robustez**:
  - Getter `cluesimbActual` **defensivo** para evitar warnings de Angular.
  - **Bugs resueltos**:
    - Cantidades 0 al usar existencias por unidad → ahora respeta `defaultQtyNoCpm` y fuerza `≥ 1`.
    - Estado compartido entre rutas → **aislado por `cluesimb`**.

---

## 🧩 Estructura (extracto)

```
src/
  app/
    features/
      solicitudes/
        solicitudes.component.ts
        solicitudes.component.html
        kit-modal/
          kit-modal.component.ts
          kit-modal.component.html
        cpm-modal/
          cpm-modal.component.ts
          cpm-modal.component.html
      ... (otros módulos/tabs si aplica)
    services/
      existencias-temp.service.ts
      cpm.service.ts
      feature-flags.service.ts
      trazabilidad.service.ts
    models/
      ArticuloSolicitud.ts
      CpmUnionRow.ts
      CpmExpectedRow.ts
  environments/
    environment.ts        # usa NG_APP_API_URL (ver .env)
styles.css                # Tailwind, utilidades y estilos globales
```

---

## 🔌 Integraciones de backend usadas

- **Artículos (SQLite)**: `GET /api/articulos?q=...`
- **Artículos (mapa completo)**: `GET /api/articulos/all`
- **CPMs por unidad**: `GET /api/cpms/by-unidad?cluesimb=...`
- **CPMs esperados vs. unidad**: `GET /api/cpms/expected-vs?cluesimb=...`
- **Existencias temporales**: `GET /api/existencias-temp/by-unidad?cluesimb=...`
- **Trazabilidad**: `GET /api/trazabilidad?clave=...&cluesimb=...`
- **Factores de conversión**: `GET /api/trazabilidad/all-factores-conversion`, `GET /api/factores/factor?clave=...&clues=...`
- **Feature flags**: `GET /api/solicitudes-config/effective?cluesimb=...&nivel=...`
- **Allowlist de unidades**: `GET /api/solicitudes-config/allowlist-unidades`

> **`environment.apiUrl`** debe apuntar al host del backend (ver sección de entorno).

---

## ⚙️ Variables de entorno (frontend)

El proyecto usa **@ngx-env/builder** para cargar variables desde `.env` en tiempo de build.  
Decláralas con el prefijo **`NG_APP_`**.

Ejemplo `.env`:
```ini
# URL base del backend
NG_APP_API_URL=http://localhost:3000/api

# (Opcional) Telemetría o toggles de UI
NG_APP_APP_NAME=Solicitudes IMSS-B
NG_APP_ENABLE_KIT_MODAL=true
```

Asegúrate de tener el archivo de tipos (p. ej. `src/.env.d.ts`) si ya está configurado:
```ts
declare namespace NodeJS {
  interface ProcessEnv {
    NG_APP_API_URL: string;
    NG_APP_APP_NAME?: string;
    NG_APP_ENABLE_KIT_MODAL?: string;
  }
}
```

En `environment.ts` se expone como:
```ts
export const environment = {
  apiUrl: process.env.NG_APP_API_URL
};
```

---

## 🛠️ Requisitos previos

- Node.js 18+ (recomendado 20+)
- pnpm o npm (usa el que tengas configurado en el repo)
- Backend corriendo y accesible (ver `NG_APP_API_URL`)

---

## ▶️ Ejecución local

```bash
# instalar deps
npm install
# o pnpm install

# levantar en desarrollo
npm start
# o: ng serve --open
```

La app quedará disponible en `http://localhost:4200/` (por defecto).  
Verifica conectividad al backend (en `NG_APP_API_URL`).

---

## 🏗️ Build de producción

```bash
npm run build
# genera dist/ con assets estáticos
```

### Despliegue en Netlify (estático)

1. Construye el proyecto (o deja que Netlify lo haga con `npm run build`).
2. Directorio de publicación: `dist/<nombre-app>`.
3. Redirecciones SPA (archivo `netlify.toml`):
   ```toml
   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200
   ```
4. Configura variable `NG_APP_API_URL` en Netlify para apuntar al backend.

---

## 🧠 Uso en la UI (flujo básico)

1. **Selecciona la unidad** (`cluesimb`). El componente llama:
   - `cpmService.ensureForCluesimb(cluesimbActual)`
   - (opcional) `existenciasTempService.byUnidad(cluesimbActual)` para enriquecer autocomplete/KIT.
2. **Autocomplete** muestra:
   - Existencia de la unidad (si está disponible).
   - `_enKit` y `_cpm` para priorizar coincidencias útiles.
3. **Abrir KIT modal**:
   - Usa filtros y toggles para mostrar/ocultar **AZM/AZE/AZT**, **Exist. unidad**, **Cant. sugerida**.
   - Puedes filtrar por **código de KIT** si hay más de uno disponible.
   - Ajusta **meses de cobertura** para recalcular la **cantidad sugerida**.
   - Botón **“Seleccionar con CPM”** se convierte en **“Selec. cant. sug. > 0”** si está visible “Exist. unidad”.
   - **Copiar** o **CSV** → exportan **exactamente lo que ves**: mismas columnas y orden.
4. **Agregar al carrito/tabla**:
   - La cantidad se calcula con la regla: **CPM > reordenSug > defaultQtyNoCpm** (y se fuerza **≥ 1**).

---

## 🧱 Decisiones técnicas

- **Cache diario** hasta medianoche local para **existencias** (reduce latencia y carga del backend).
- **Estado por unidad (`cluesimb`)** en `CpmService` para aislar tabs/rutas y evitar “estado compartido fantasma”.
- **Compatibilidad**: se mantiene `cpms$` (legacy) para evitar refactors bruscos en componentes no migrados.
- **Precarga de factores de conversión** en `TrazabilidadService` para evitar latencia y múltiples llamadas al backend.

---

## ✅ Lista de verificación (QA)

- [ ] `cluesimbActual` definido antes de hacer llamadas (getter defensivo).
- [ ] Autocomplete muestra `_enKit` y `_cpm` correctamente.
- [ ] KIT modal:
  - [ ] Títulos y toggles renderizan columnas esperadas.
  - [ ] **Copiar/CSV** respetan columnas visibles.
  - [ ] Botón cambia a **“Selec. cant. sug. > 0”** si corresponde.
- [ ] Reglas de cantidad aplicadas (CPM > reordenSug > default; **≥ 1**).
- [ ] No aparecen cantidades 0 al agregar desde existencias por unidad.
- [ ] Cambiar de unidad **no** arrastra estado previo (aislado por `cluesimb`).

---

## 🧭 Roadmap corto

- Mejora de accesibilidad (foco y navegación con teclado en modal).
- Persistencia opcional de toggles del modal (localStorage).
- Filtros por AZM/AZE/AZT en dataset del modal.
- Vista de **trazabilidad** integrada (si el backend está disponible).

---

## 📌 Aviso

Esta aplicación es un **apoyo operativo** para captura y análisis local.  
**No sustituye** plataformas oficiales ni maneja datos personales sensibles.  
Úsese para **transparencia y eficiencia** mientras se consolidan procesos oficiales.

---

## 📋 Acerca de esta aplicación

Esta herramienta es un apoyo en piloto para capturar solicitudes de insumos médicos en **IMSS-Bienestar Baja California**.  
Facilita pedidos ordinarios y extraordinarios, con validaciones, precargas y exportación a Excel.  
**No reemplaza sistemas oficiales.**

| Rol | Nombre |
| --- | --- |
| **Coordinador Institucional del Proyecto** | Lic. Héctor Manuel Avelar Morales |
| **Referente Técnico-Operativo** *(Lineamientos de Abasto)* | Lic. Elia Del Carmen Rojas Villalas / Lic. Abril Núñez Madrid |
| **Diseño y Desarrollo Tecnológico** | Ing. Mario Arturo Serrano Flores |

<p align="center">© 2026 IMSS Bienestar – Baja California</p>


---

## 📄 Licencia

MIT
