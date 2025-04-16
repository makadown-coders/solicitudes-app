# Solicitudes App 🧾

Aplicación en Angular 17 para capturar solicitudes de artículos tipo todo-list, con búsqueda autocompletada desde una base de datos SQLite consultada desde un backend Express desplegado en Railway.

## 🚀 Características

- Captura dinámica de artículos (clave, descripción, unidad, cantidad).
- Búsqueda autocompletada por clave o descripción usando un backend Express + SQLite.
- Almacenamiento persistente con `localStorage` en el navegador.
- Botón "Agregar" habilitado solo cuando los datos son válidos.
- Eliminación individual de renglones capturados.
- Modo edición por renglón: solo permite editar cantidad.
- Exportación a Excel con confirmación del nombre de archivo.
- Uso de modales personalizados con Tailwind CSS.
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
[build]
  publish = "dist/solicitudes-frontend"
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

3. Sube la carpeta `dist/solicitudes-frontend` a Netlify o conecta tu repo vía GitHub.

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

### 📁 `src/environments/environment.ts`

```ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api'
};
```

### 📁 `src/environments/environment.prod.ts`

```ts
export const environment = {
  production: true,
  apiUrl: 'https://solicitudes-backend.up.railway.app/api'
};
```

Angular utiliza automáticamente el archivo correspondiente según si estás en desarrollo o producción.

---

## 🧩 shared/

Este folder contiene componentes reutilizables para mostrar modales personalizados con estilos Tailwind CSS.

### 📁 `NombrarArchivoModalComponent`

🧠 Modal para que el usuario nombre un archivo antes de exportar.

#### 📦 Importación:
```ts
import { NombrarArchivoModalComponent } from './shared/nombrar-archivo-modal/nombrar-archivo-modal.component';
```

#### 🧬 Uso:
```html
<app-nombrar-archivo-modal
  [(nombreArchivo)]="nombreArchivo"
  (aceptar)="confirmarExportacion()"
  (cancelarCerrar)="modalPedirNombreArchivo = false"
/>
```

- `[(nombreArchivo)]`: binding bidireccional para el nombre ingresado
- `(aceptar)`: se emite cuando el usuario confirma
- `(cancelarCerrar)`: se emite al cancelar o cerrar

### 📁 `ConfirmacionModalComponent`

🧠 Modal reutilizable para confirmaciones, alertas o mensajes informativos.

#### 📦 Importación:
```ts
import { ConfirmacionModalComponent } from './shared/confirmacion-modal/confirmacion-modal.component';
```

#### 🧬 Uso:
```html
<app-confirmacion-modal
  [titulo]="modalTitulo"
  [mensaje]="modalMensaje"
  [textoCancelar]="modalCancelarTexto"
  [textoConfirmar]="modalConfirmarTexto"
  [soloInfo]="modalSoloInfo"
  (confirmar)="modalAceptar()"
  (cancelar)="cerrarModal()"
/>
```

- `titulo`: Título del modal
- `mensaje`: Cuerpo del mensaje
- `textoCancelar`: Texto personalizado del botón cancelar
- `textoConfirmar`: Texto personalizado del botón confirmar
- `soloInfo`: true = solo botón de aceptar
- `(confirmar)`: Emitido al hacer clic en aceptar
- `(cancelar)`: Emitido al cancelar

### 🧠 Notas Generales sobre `/shared`
- Todos los modales son componentes `standalone`
- Se usan estilos institucionales (verde IMSS, dorado, etc.)
- No se usa SweetAlert, todo está hecho con Tailwind y lógica Angular

---

## 🧑 Autor

Desarrollado por Mario 🧑‍💻

Para uso institucional en solicitudes de insumos y abasto.

---

## 📄 Licencia

MIT

