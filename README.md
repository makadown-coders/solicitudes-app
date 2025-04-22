# 📦 Solicitudes App – Frontend Angular

Aplicación desarrollada con Angular 17 + TailwindCSS para capturar solicitudes de insumos hospitalarios de IMSS-Bienestar.  
Incluye autocompletado, validación progresiva, persistencia con `localStorage` y exportación avanzada a Excel con plantilla institucional.
![alt text](image.png)
![MIT License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ Características

- 🧠 Captura guiada en dos tabs: CLUES y SOLICITUD
- 🔎 Autocompletado inteligente para insumos y hospitales
- 🧾 Exportación profesional a Excel (respetando estilos del template)
- 💾 Guardado automático en `localStorage` (resiliente al F5)
- 📅 Selector de periodo con rango personalizado
- 🔐 Validaciones visuales y restricciones controladas
- ❓ Guía contextual rápida para cada sección

---

## ⚙️ Tecnologías utilizadas

- ✅ Angular 17 con componentes standalone
- 🎨 TailwindCSS v3.4
- 📦 ExcelJS para manipulación avanzada de archivos `.xlsx`
- 💡 RxJS, signals y `localStorage`
- 💬 Lucide para íconos modernos

---

## 📁 Estructura del proyecto

```bash
/src 
├── app/ 
│ ├── layout/ # Componente contenedor de tabs 
│ ├── features/ 
│ │ ├── captura-clues/ # Tab 1: Selección de hospital, tipo de insumo, periodo, responsable 
│ │ ├── solicitudes/ # Tab 2: Lista de artículos, validaciones, exportación 
│ │ └── tabla-articulos/ # componente en tab 2. Tabla de artículos solicitados
│ ├── shared/ 
│ │ ├── periodo-picker/ # Componente para seleccionar un rango de fechas 
│ │ ├── confirmacion-modal/ # Modal de confirmación
│ │ ├── nombrar-archivo-modal/ # Modal para nombrar archivo exportado 
│ │ ├── nombre-mes.pipe  # ayudador para nombres de mes
│ │ └── periodo-fechas.service # apoyo para validaciones y formatos de seleccion de fechas
│ ├── services/ 
│ │ ├── articulos.service.ts 
│ │ └── excel.service.ts
```


---

## 📤 Exportación a Excel

La información capturada se exporta a un archivo basado en una plantilla visual institucional (`/public/template.xlsx`).

| Celda | Contenido exportado                                |
|-------|-----------------------------------------------------|
| `B4`  | Nombre del hospital                                 |
| `D4`  | Tipos de insumo seleccionados (ej. Medicamento...)  |
| `E5`  | Periodo (ej. 01-30 ABRIL 2025)                      |
| `E8`  | Tipo de pedido (Ordinario / Extraordinario)         |
| `E9`  | Responsable de la captura                           |
| `B14+`| Lista de artículos solicitados                      |

---

## 💾 Persistencia

La aplicación guarda automáticamente en `localStorage`:

- 🏥 Hospital seleccionado (incluyendo nombre y claves CLUES)
- ✅ Tipos de insumo marcados
- 📆 Periodo (fecha de inicio y fin)
- 🔄 Tipo de pedido
- 🧑 Responsable de captura
- 📋 Lista completa de artículos ingresados

---

## 🧪 Cómo ejecutar localmente

```bash
git clone https://github.com/makadown-coders/solicitudes-app.git
cd solicitudes-app
npm install
npm run dev  # o ng serve
```
---

## 📄 Licencia

MIT © 2025 Mario Arturo Serrano Flores
Consulta el archivo LICENSE para más información.


## 📘 Justificación Técnica: Uso de Netlify como plataforma de despliegue 

### 🧩 ¿Qué es Netlify?

**Netlify** es una plataforma de despliegue especializada en aplicaciones frontend modernas (Angular, React, Vue, etc.). Ofrece hosting estático rápido, seguro y con HTTPS automático sin necesidad de servidores backend.

---

### ✅ Razones para elegir Netlify en este proyecto

| Criterio                              | Evaluación                                                             |
|---------------------------------------|------------------------------------------------------------------------|
| 🧾 **Frecuencia de uso**              | Aproximadamente **1 vez al mes por 15 unidades médicas**, con posibilidad de otras 15 extraordinarias |
| 📦 **Peso de archivo generado (.xlsx)** | Menor a **200 KB por solicitud**                                      |
| 💡 **Ancho de banda mensual estimado**| ≈ 6 MB (muy por debajo del límite gratuito de 100 GB)                |
| 🔒 **Seguridad**                      | HTTPS automático con Let’s Encrypt incluido                          |
| 🌐 **Dominio personalizado**          | Posibilidad de usar `.gob.mx` institucional si se requiere            |
| 💸 **Costo**                          | **$0 pesos mensuales** — completamente dentro del plan gratuito       |
| ⚙️ **Facilidad de mantenimiento**     | Deploys automáticos vía GitHub con cada push                         |
| 🚀 **Tiempo de carga**                | Ultra rápido, gracias a su red CDN global                             |

---

### 📈 Escenarios previstos

| Escenario | ¿Netlify sigue siendo viable? |
|-----------|-------------------------------|
| Uso moderado (<50 descargas/mes) | ✅ Sí |
| Usuarios institucionales en navegador web moderno | ✅ Sí |
| Necesidad de autoguardado sin backend | ✅ Sí (via localStorage) |
| Carga masiva o almacenamiento de archivos históricos | ⚠️ Considerar alternativa como Firebase o AWS S3 |

---

### 🛑 Lo que **no** es Netlify (y no se necesita aquí)

- No es un backend (Express, SQL, etc.) → ya resuelto en Railway
- No es una base de datos → no es necesaria en esta etapa
- No tiene almacenamiento persistente de archivos → pero la app solo genera archivos para descarga inmediata

---

### 📍 Conclusión

**Netlify es una opción técnica, económica y operativa ideal** para el despliegue actual de *Solicitudes App*.

Permite:

- Asegurar tiempos de carga rápidos y experiencia fluida
- Mantener costos operativos nulos
- Evitar infraestructuras complejas
- Escalar fácilmente si llegara a necesitarse

---

✅ Recomendación: seguir usando Netlify como plataforma principal hasta que el volumen de uso supere los **10,000 usuarios únicos o 5 GB/mes de transferencia activa**, lo cual está muy lejos del contexto actual.

---

