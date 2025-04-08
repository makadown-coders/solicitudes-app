# Solicitudes App 🧾

Aplicación en Angular 17 para capturar solicitudes de artículos tipo todo-list, con búsqueda autocompletada desde una base de datos SQLite embebida en el navegador.

## 🚀 Características

- Captura dinámica de artículos (clave, descripción, unidad, cantidad).
- Búsqueda autocompletada por clave o descripción usando SQLite (sql.js).
- Almacenamiento persistente con `localStorage`.
- Botón "Agregar" habilitado solo cuando los datos son válidos.
- Eliminación individual de renglones capturados.
- Exportación a Excel.
- Uso de modales estilo Tailwind CSS para UX amigable.
- Estilizado institucional con Tailwind (`green-800`, `yellow-400`, etc).

## 🛠️ Stack Tecnológico

- Angular 17 (Standalone Components)
- Tailwind CSS 3.4.17
- SQLite vía `sql.js` desde CDN
- xlsx.js para exportar Excel

---

## 📦 Instalación local

```bash
git clone https://github.com/tu-usuario/solicitudes-app.git
cd solicitudes-app
npm install
```

## 🔧 Compilar en desarrollo

```bash
ng serve -o
```

## 🏗️ Compilación para producción

```bash
ng build --configuration production
```

## 📁 Estructura esperada para producción

- `public/sqljs/sql-wasm.wasm`: Archivo WASM requerido por sql.js
- `public/data/articulos.sqlite`: Base de datos de solo lectura

Puedes obtener el `.wasm` así:

```bash
mkdir -p public/sqljs
curl -o public/sqljs/sql-wasm.wasm https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-wasm.wasm
```

---

## ☁️ Deploy en Netlify

1. Crea un archivo `netlify.toml` en la raíz:

```toml
[build]
  publish = "dist/solicitudes-app"
  command = "npm run build"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

2. Realiza el build:

```bash
ng build --configuration production
```

3. Sube la carpeta `/dist/solicitudes-app` a Netlify o conecta tu repo vía GitHub.

---

## 📦 Notas sobre sql.js

Usamos `sql.js` **vía CDN ESM** para evitar errores de build por dependencias Node.js (`fs`, `path`, `crypto`).  
Importación dinámica en el componente:

```ts
// @ts-ignore
const SQLModule = await import('https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-wasm.mjs');
const initSqlJs = SQLModule.default;
```

---

## 🧠 Créditos

Desarrollado por Mario 🧑‍💻  

---





