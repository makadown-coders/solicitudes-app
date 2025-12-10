# Solicitudes / Abasto — Frontend (Angular)

Frontend Angular (standalone, signals, zoneless) para capturar solicitudes de insumos y monitorear abasto en IMSS-Bienestar Baja California. Incluye tableros, carga masiva de archivos operativos y utilidades de administración (KITs y CPMs).

---

## 📌 Qué hay en esta versión
- **Captura guiada de solicitudes** en dos pasos (CLUES ➜ Solicitud) con ayudas contextuales y controles para limitar claves al KIT o refrescar CPMs/existencias.  
- **Tableros de abasto** con pestañas para resumen, existencias (CPM), citas completadas/pendientes y RDLs, con recarga manual y cacheo local.  
- **Carga masiva** de movimientos (entradas/salidas/traspasos) y de inventario inicial, con barra de progreso y opciones para reemplazar datos por año.  
- **Administración de KITs y CPMs**: edición de CPM por unidad, gestión de KITs y carga masiva de kits desde Excel.  
- **Utilidades adicionales**: precargas/exportación a Excel, filtros por nivel (Primer/Segundo), avisos sobre alcance de datos y modal de “Acerca de”.

---

## 🧭 Rutas principales
- `/home`: portada IMSS-Bienestar.  
- `/solicitudes` y `/solicitud-unidad`: flujo principal CLUES ➜ Solicitud con tabs, ayuda contextual y modales de guía/aviso.  
- `/solicitudv1`: versión previa del capturador.  
- `/dashboard-abasto`: tablero con pestañas Resumen, Existencias (CPM), Citas completadas/pendientes y RDLs, con opción de refrescar datos.  
- `/carga-masiva-movimientos`: carga de entradas, salidas y traspasos.  
- `/carga-masiva-existencias`: carga masiva de existencias por archivo.  
- `/carga-masiva-citas`: importación de citas para KPIs.  
- `/cpm-config`: edición de CPM por unidad.  
- `/admin-kits` y `/carga-masiva-kits`: administración y carga masiva de kits.  
- `/solicitudes-config`: configuración general de solicitudes.

---

## 🧩 Arquitectura y stack
- **Angular 19** con componentes standalone y ChangeDetectionStrategy.OnPush.  
- **Tailwind CSS 4** para estilos utilitarios.  
- **ng2-charts + amCharts 5** para visualizaciones en el tablero de abasto.  
- **Signals y servicios** para cachear CPMs, existencias y datos de citas/inventario.

Estructura (extracto):
```
src/
  app/
    layout/               # Tabs CLUES/Solicitud y modales de guía/avisos
    features/
      dashboard-abasto/   # Tablero con pestañas y KPIs
      solicitudes/        # Captura e importación de artículos
      carga-masiva/       # Carga de movimientos, inventario, citas
      kits/               # Admin y carga masiva de kits
      cpm-editor/         # Configuración de CPM por unidad
      solicitudes-config/ # Ajustes de captura
    services/             # Inventario, citas, dashboard, etc.
    shared/               # Componentes comunes (kit modal, loader, toasts)
```

---

## 🔌 API/backends esperados
- Artículos/compendio, existencias por unidad y CPMs accesibles desde el backend (`/api/...`).
- Endpoints para cargas masivas (movimientos, existencias, citas) y administración de kits/CPMs.
- En producción el `apiUrl` apunta a `https://minor-flossy-imssb-737587a4.koyeb.app/api`; en desarrollo se usa `http://localhost:3000/api`.

---

## ⚙️ Variables y entorno
Configura la URL del backend en `src/environments/environment*.ts` o via `NG_APP_API_URL` si usas un builder/env loader externo.

---

## 🛠️ Requisitos
- Node.js 18+ (recomendado 20+)
- npm (o pnpm)
- Backend accesible en la URL configurada

---

## ▶️ Desarrollo local
```bash
npm install
npm start     # ng serve
```
La app se sirve en `http://localhost:4200/`.

---

## 🏗️ Build de producción
```bash
npm run build
```
Genera `dist/` listo para desplegar en hosting estático (ej. Netlify usando `dist/<app-name>` y redirección SPA a `index.html`).

---

## 📌 Avisos y crédito
- Datos de CPM/existencias se muestran como cortes informativos, no como inventario en tiempo real.  
- Herramienta en piloto: no sustituye sistemas institucionales oficiales.  
- Créditos y año actual visibles en el modal “Acerca de”.

MIT
