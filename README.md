# GEREO — frontend (GitHub Pages)

Frontend **estático** del Generador de ROS y ROE. Se publica en **GitHub Pages**, por
lo que tiene una **URL fija** que el equipo usa para entrar (no cambia entre reinicios).

El procesamiento (consulta a la base de datos, reglas, IA, PDF/XLSX) ocurre en el
**backend** (FastAPI), que corre en el PC de un analista y se expone por un **túnel
Cloudflare**. La URL del backend **sí cambia** en cada arranque; por eso NO está
incrustada aquí: se lee de [`config.json`](config.json), que el lanzador del PC actualiza
y publica en cada arranque. Así, el usuario siempre entra por la misma URL de Pages y el
frontend descubre solo dónde está el backend.

```
Usuario → https://amondinelli-g66.github.io/ros-roe-generator/   (fijo, GitHub Pages)
                     │  lee config.json → backend actual
                     ▼
          https://xxxx.trycloudflare.com   (cambiante, túnel al PC)
                     │
                     ▼
             FastAPI + BD (VPN) en el PC anfitrión
```

El backend es el **repo hermano** `ros-roe-generator-backend/`, en la carpeta de al lado
(ver [`../ros-roe-generator-backend/README.md`](../ros-roe-generator-backend/README.md)).
En modo local ese mismo backend sirve estos archivos, montando `/css`, `/js` y `/assets`
por carpeta: cualquier archivo nuevo que agregues aquí se sirve sin tocar el backend.

## Estructura

Los archivos están organizados **por proceso** (documento × país), igual que el backend.
Cada proceso del proyecto —ROS y ROE para Argentina, Chile y Colombia— tiene su lugar
predecible, y lo compartido está separado de lo específico:

```
ros-roe-generator/
├── index.html            # una sola página: login, asistente, formularios y modal
├── config.json           # { "backend": "<url del túnel>" } — la publica el lanzador del PC
├── css/gereo.css         # TODO el estilo (el HTML no lleva CSS embebido)
├── assets/               # favicon.svg · global66-cs-logo.webp
├── js/
│   ├── comun/            # infraestructura, no sabe de países ni documentos
│   │   ├── select-ui.js  # lista desplegable propia para cada <select>
│   │   ├── nucleo.js     # namespace GEREO: backend, sesión, /config, registro de formularios
│   │   └── asistente.js  # el wizard país → documento → datos y el despacho
│   ├── ros/
│   │   ├── modal.js      # motor del modal de revisión + registro de esquemas
│   │   ├── formulario.js # formulario ROS estándar (sirve a Chile y a Colombia)
│   │   ├── chile/campos.js       # ===== campos del ROS de Chile =====
│   │   └── colombia/campos.js    # ===== campos del ROS de Colombia =====
│   └── roe/
│       └── chile/formulario.js   # ===== formulario del ROE de Chile =====
└── .nojekyll             # sitio estático puro (sin procesamiento Jekyll de Pages)
```

| Archivo | Qué es |
|---|---|
| `index.html` | La página: barra superior, login, asistente de 3 pasos, los dos formularios, el aviso de "servicio aún no disponible" y el cascarón del modal. Sin lógica: solo estructura y el orden de los `<script defer>`. |
| `css/gereo.css` | Hoja de estilos única (paleta Global66: navy + naranja). Va en un archivo porque la CSP del backend no permite estilos ni scripts inline. |
| `js/comun/nucleo.js` | Los cimientos: crea `window.GEREO`, resuelve la URL del backend, hace el login con Google, guarda la sesión (`Authorization: Bearer` en `sessionStorage`), controla la inactividad, memoiza la única llamada a `/config` y expone el **registro de formularios**. |
| `js/comun/asistente.js` | El wizard y nada más: el paso a paso, los botones de país/documento, el banner compartido y el **despacho** al formulario del documento elegido. No conoce ningún formulario en concreto. |
| `js/comun/select-ui.js` | Reemplaza la lista desplegable nativa de cada `<select>` por una propia (el menú del sistema no se puede estilar de forma consistente). El `<select>` original queda oculto como fuente de verdad del valor, así que `.value` y el evento `change` siguen funcionando igual. Se aplica también a los `<select>` que aparecen después (MutationObserver). |
| `js/ros/formulario.js` | El formulario ROS estándar: segmento B2B/B2C, ID, fechas, vinculados; envía a `/generar`, guarda el análisis y abre el modal; descarga el PDF editado contra `/generar-pdf-editado`. |
| `js/ros/modal.js` | El **motor** del modal de revisión/edición: arma los campos, valida formato en vivo y publica `window.RosModal`. No sabe qué campos tiene cada país. |
| `js/ros/<pais>/campos.js` | El **esquema de campos** de ese ROS: secciones, etiquetas, opciones y máximos. Espejo del `fields.py` y de la plantilla del backend. |
| `js/roe/chile/formulario.js` | Formulario propio del ROE de Chile (año + trimestre + sociedad) contra `/generar-roe-chile`; recibe los XLSX en base64 y dispara la descarga. |
| `config.json` | `{ "backend": "<url del túnel>" }`. **Lo actualiza el lanzador del PC** en cada arranque; no editar a mano salvo emergencia. |
| `.nojekyll` | Evita el procesamiento Jekyll de GitHub Pages (sitio estático puro). |

## Cómo se agrega un proceso (los dos registros)

Todo el diseño se apoya en **dos registros**. Son la razón por la que agregar un proceso
—Argentina · ROS, el ROE de Colombia— es **crear un archivo y registrarlo**, sin tocar
el código compartido:

```js
// 1. El FORMULARIO de un documento (lo consume el asistente)
GEREO.registrarFormulario("Chile|ROS", { contenedor: "form-disponible", init: …, reset: … });

// 2. Los CAMPOS de un documento (los consume el modal de revisión)
RosModal.registrarEsquema("Colombia|ROS", function (doc, ctx) { return [ …secciones… ]; });
```

La clave es siempre `"<País>|<DOCUMENTO>"`. Con eso:

- **El asistente** (`asistente.js`) no tiene ningún `if/else` con nombres de países: al
  elegir un documento busca su clave en el registro, muestra el contenedor que declara la
  definición y le pide `reset(ctx)`. Si el proceso reutiliza el formulario ROS estándar, ni
  hace falta registrar su clave: el backend informa `formulario: "ros"` en `/config` y el
  asistente lo despacha ahí (por eso `js/ros/formulario.js` se registra también bajo la
  clave `"ros"`).
- **El modal** (`modal.js`) no tiene ningún ternario `pais === "Colombia" ? … : …`: busca el
  esquema de la clave y lo renderiza. El motor y el cascarón son siempre los mismos.
- **Qué está disponible NO se decide acá.** La fuente de verdad es el backend: `/config`
  devuelve la matriz de los 6 procesos (disponible, qué formulario usar, si admite
  vinculados). Si el backend declara disponible un proceso, aparece en la interfaz sin
  tocar este repo.

Los módulos comparten un **único objeto global**, `window.GEREO` (más `window.RosModal`,
que conserva su API pública histórica). Nada de variables globales sueltas.

### El orden de los `<script defer>` importa

Está comentado en `index.html` y conviene respetarlo, porque cada archivo se registra al
cargarse:

1. `js/comun/select-ui.js` — su observer debe estar activo antes de que alguien cree un `<select>`.
2. `js/comun/nucleo.js` — crea `window.GEREO` y el registro de formularios.
3. `js/ros/modal.js` — crea `window.RosModal` y el registro de esquemas.
4. `js/ros/chile/campos.js`, `js/ros/colombia/campos.js` — se registran en `RosModal`.
5. `js/ros/formulario.js`, `js/roe/chile/formulario.js` — se registran en `GEREO`.
6. `js/comun/asistente.js` — **el último**: cuando corre, todo está registrado, y es quien
   despacha al formulario del documento elegido.

Todos llevan `defer`, así que se ejecutan en ese orden, con el DOM ya parseado y antes del
`DOMContentLoaded` en el que `nucleo.js` arranca la sesión.

## Cómo se conecta con el backend

- El frontend detecta que está en `*.github.io` y lee `config.json` para saber la URL del
  backend. En modo local (servido por el propio backend) usa el mismo origen y no lee
  `config.json`.
- La sesión viaja como `Authorization: Bearer <token>` (no cookies), por lo que funciona
  entre dominios sin depender de cookies de terceros. El token vive en `sessionStorage`
  (por pestaña) y se borra al cerrar sesión.
- El login con Google ocurre en ESTA página (origen fijo), así que el *Origen de
  JavaScript autorizado* en Google Cloud Console se registra **una sola vez**.
- Si el backend está apagado o el `config.json` todavía no tiene una URL válida, la
  pantalla de login lo dice ("el servidor aún no está disponible") en vez de fallar en
  silencio.

## Requisitos en Google Cloud Console (una vez)

En el cliente OAuth, agregar como **Origen de JavaScript autorizado**:

```
https://amondinelli-g66.github.io
```

(el origen es el dominio, sin la ruta del repo). Con esto el login deja de necesitar
re-registro cada vez que cambia la URL del túnel.

## Publicación

Este directorio es un repositorio propio (`amondinelli-g66/ros-roe-generator`; el backend
es `ros-roe-generator-backend`). **Settings → Pages** está configurado con la rama `main` y
la carpeta raíz, y GitHub sirve el sitio en
`https://amondinelli-g66.github.io/ros-roe-generator/`.

Publicar un cambio es, por lo tanto, **`git push` a `main`**: Pages se actualiza solo
(tarda ~1 min). Antes de publicar, prueba los cambios con el servidor local del backend
(`deploy\local.cmd`), que sirve estos mismos archivos en `http://127.0.0.1:8001`.

> El backend autoriza el **dominio** `https://amondinelli-g66.github.io` (sin la ruta), así que
> este mismo origen sirve para futuras automatizaciones publicadas como otros repos de proyecto
> bajo la misma cuenta.
