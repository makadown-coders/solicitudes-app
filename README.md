# 📦 Solicitudes App – Frontend Angular

Aplicación desarrollada con Angular 17 + TailwindCSS para capturar, visualizar y exportar solicitudes de insumos hospitalarios en IMSS-Bienestar.

Incluye autocompletado, validaciones, persistencia local, dashboard analítico, y exportación avanzada a Excel basada en plantilla institucional.


![alt text](image.png)
![MIT License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ Características Principales

- 🧠 Captura guiada en 2 tabs: CLUES y SOLICITUD
- 🔎 Autocompletado inteligente de hospitales e insumos
- 💾 Guardado automático en `localStorage`, persistente al recargar
- 📊 Dashboard ejecutivo de citas con KPIs, filtros y gráficas (ng2-charts)
- 🧾 Exportación profesional a Excel (respetando plantilla)
- 🔍 Detalles por insumo, unidad, proveedor, fechas, cumplimiento, y más
- 📥 Exportación de citas por insumo o unidad
- 🔐 Validaciones visuales progresivas
- ❓ Ayuda contextual en cada sección

---

## ⚙️ Tecnologías utilizadas

- ✅ Angular 17 (Standalone Components + Signals)
- 🎨 TailwindCSS v3.4
- 📦 ExcelJS para manipulación avanzada de `.xlsx`
- 📊 ng2-charts (Chart.js) para gráficas dinámicas
- 💬 Lucide Icons
- 🧠 RxJS y almacenamiento con `localStorage`

---

## 📁 Estructura del Proyecto

```bash
/src 
├── app/
│   ├── layout/                  # Layout principal con tabs
│   ├── features/
│   │   ├── captura-clues/       # Tab 1 – Formulario de CLUES
│   │   ├── solicitudes/         # Tab 2 – Captura de artículos
│   │   ├── dashboard/           # Dashboard ejecutivo de citas
│   │   │   ├── resumen-citas/   # Tab 1 – Resumen con KPIs
│   │   │   ├── proveedores/     # Tab 2 – Proveedores y entregas
│   │   │   ├── cumplimiento/    # Tab 3 – Cumplimiento de claves
│   │   │   └── pendientes/      # Tab 4 – Entregas pendientes
│   ├── shared/
│   │   ├── periodo-picker/
│   │   ├── confirmacion-modal/
│   │   ├── nombrar-archivo-modal/
│   │   ├── nombre-mes.pipe.ts
│   │   ├── truncate-decimal.pipe.ts
│   │   └── periodo-fechas.service.ts
│   ├── services/
│   │   ├── articulos.service.ts
│   │   ├── citas.service.ts
│   │   └── excel.service.ts
````

---

## 📤 Exportación a Excel

Exporta usando una plantilla institucional ubicada en `/public/template.xlsx`.

| Celda  | Contenido exportado                         |
| ------ | ------------------------------------------- |
| `B4`   | Nombre del hospital                         |
| `D4`   | Tipos de insumo seleccionados               |
| `E5`   | Periodo (ej. 01-30 ABRIL 2025)              |
| `E8`   | Tipo de pedido (Ordinario / Extraordinario) |
| `E9`   | Responsable de la captura                   |
| `B14+` | Lista de artículos solicitados              |

También permite exportar:

* 📋 Todas las citas relacionadas a un insumo
* 🏥 Todas las órdenes pendientes por unidad
* 📅 Citas agrupadas por fecha, unidad, proveedor y tipo de entrega

---

## 🧪 Cómo ejecutar localmente

```bash
git clone https://github.com/makadown-coders/solicitudes-app.git
cd solicitudes-app
npm install
npm run dev  # o ng serve
```

---

## 📈 Justificación técnica: Netlify como plataforma de despliegue

**Netlify** permite deploys rápidos, gratuitos y seguros para frontend moderno, ideal para este proyecto:

| Criterio                        | Evaluación                           |
| ------------------------------- | ------------------------------------ |
| Frecuencia de uso               | 1 vez al mes por 15 unidades médicas |
| Peso de archivos `.xlsx`        | < 200 KB                             |
| Ancho de banda mensual estimado | ≈ 6 MB                               |
| Seguridad                       | HTTPS automático                     |
| Costo                           | \$0 pesos                            |
| Deploy automático desde GitHub  | ✅                                    |

---

## 📄 Licencia

MIT © 2025 Mario Arturo Serrano Flores
Consulta el archivo LICENSE para más información.

