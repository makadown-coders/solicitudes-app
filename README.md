# Solicitudes App (frontend) 🧾

Aplicación en Angular 17 para capturar solicitudes de artículos tipo todo-list, con búsqueda autocompletada desde una base de datos SQLite consultada desde un backend Express desplegado en Railway.

## 🚀 Características

- Captura dinámica de artículos (clave, descripción, unidad, cantidad).
- Búsqueda autocompletada por clave o descripción usando un backend Express + SQLite.
- Almacenamiento persistente con `localStorage` en el navegador.
- Botón "Agregar" habilitado solo cuando los datos son válidos.
- Eliminación individual de renglones capturados.
- Exportación a Excel.
- Uso de modales estilo Tailwind CSS para UX amigable.
- Estilizado institucional con Tailwind (`green-800`, `yellow-400`, etc).

## 🛠️ Stack Tecnológico

- Angular 17 (Standalone Components)
- Tailwind CSS 3.4.17
- Backend: Express.js + SQLite (desplegado en Railway)
- xlsx.js para exportar Excel

---

## 📦 Instalación local del frontend

```bash
git clone https://github.com/tu-usuario/solicitudes-frontend.git
cd solicitudes-frontend
npm install
```

### 🔧 Ejecutar en desarrollo

```bash
ng serve -o
```

---

## 🏗️ Compilación para producción

```bash
ng build --configuration production
```

Esto usará el archivo `environment.prod.ts` para apuntar al backend en Railway.

---

## ☁️ Deploy en Netlify

1. Crea un archivo `netlify.toml` en la raíz:

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

2. Realiza el build:

```bash
ng build --configuration production
```

3. conecta tu repo a Netlify vía GitHub.

---

## 🧠 Backend Express + SQLite (Railway)

El backend está desarrollado en Node.js usando Express, y consulta una base de datos SQLite local. Se encarga de exponer el endpoint:

```
GET /api/articulos?q=termino
```

Este endpoint retorna hasta 12 resultados coincidentes, junto con un conteo total.

### 📄 Variables de entorno

- `PORT=3000`
- `DB_PATH=./db/articulos.sqlite`

### 📦 Deploy en Railway

Sigue los pasos de la guía oficial:
👉 [https://docs.railway.app/guides/express](https://docs.railway.app/guides/express)

Railway proporciona una URL como:

```
https://solicitudes-backend.up.railway.app/api/articulos?q=paracetamol
```

---

## 🌐 Configuración de entornos en Angular

### 📁 `src/environments/environment.development.ts`

```ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000'
};
```

### 📁 `src/environments/environment.ts`

```ts
export const environment = {
  production: true,
  apiUrl: 'https://solicitudes-backend.up.railway.app'
};
```

Angular utiliza automáticamente el archivo correspondiente según si estás en desarrollo o producción.

---

## 🧠 Notas

- Ya no se utiliza sql.js en el frontend.
- La base de datos SQLite está protegida y solo es accedida desde el backend.
- Toda la comunicación ahora es a través de HTTP.

---

## 🧑 Autor

Desarrollado por Mario 🧑‍💻

---

## 📄 Licencia

MIT

