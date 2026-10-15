# GEREO — frontend

Frontend **estático** del Generador de ROS y ROE (HTML/CSS/JS puro, sin build). En
producción lo sirve un contenedor **nginx** en AWS, detrás del **mismo balanceador** que
el backend, en **https://gereo.global66.com**.

El procesamiento (consulta a la base de datos, reglas, IA, PDF/XLSX) ocurre en el
**backend** (FastAPI). Como ambos comparten origen, el frontend llama a la API con rutas
relativas: no hay URL de backend que configurar ni CORS.

```
navegador ─HTTPS─> ALB (gereo.global66.com) ─┬─ /config /generar* /auth/* /api/v1/* ... ─> backend (FastAPI)
                                             └─ todo lo demás ─────────────────────────> este frontend (nginx)
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
├── css/gereo.css         # TODO el estilo (el HTML no lleva CSS embebido)
├── assets/               # favicon.svg · global66-cs-logo.webp
├── js/
│   ├── comun/            # infraestructura, no sabe de países ni documentos
│   │   ├── select-ui.js  # lista desplegable propia para cada <select>
│   │   ├── nucleo.js     # namespace GEREO: backend, sesión, /config, registro de formularios
│   │   └── asistente.js  # el wizard país → documento → datos y el despacho
│   ├── ros/
│   │   ├── modal.js      # motor del modal de revisión + registro de esquemas
│   │   ├── formulario.js # formulario ROS estándar (Chile, Colombia y Argentina)
│   │   ├── chile/campos.js       # ===== campos del ROS de Chile =====
│   │   ├── colombia/campos.js    # ===== campos del ROS de Colombia =====
│   │   └── argentina/campos.js   # ===== campos del ROS de Argentina =====
│   └── roe/
│       └── chile/formulario.js   # ===== formulario del ROE de Chile =====
├── nginx.conf            # servidor de la imagen de producción
└── Dockerfile            # imagen nginx para ECS Fargate
```

| Archivo | Qué es |
|---|---|
| `index.html` | La página: barra superior, login, asistente de 3 pasos, los dos formularios, el aviso de "servicio aún no disponible" y el cascarón del modal. Sin lógica: solo estructura y el orden de los `<script defer>`. |
| `css/gereo.css` | Hoja de estilos única (paleta Global66: navy + naranja). Va en un archivo porque la CSP del backend no permite estilos ni scripts inline. |
| `js/comun/nucleo.js` | Los cimientos: crea `window.GEREO`, envuelve las llamadas a la API, hace el login con Google, guarda la sesión (`Authorization: Bearer` en `sessionStorage`), controla la inactividad, memoiza la única llamada a `/config` y expone el **registro de formularios**. |
| `js/comun/asistente.js` | El wizard y nada más: el paso a paso, los botones de país/documento, el banner compartido y el **despacho** al formulario del documento elegido. No conoce ningún formulario en concreto. |
| `js/comun/select-ui.js` | Reemplaza la lista desplegable nativa de cada `<select>` por una propia (el menú del sistema no se puede estilar de forma consistente). El `<select>` original queda oculto como fuente de verdad del valor, así que `.value` y el evento `change` siguen funcionando igual. Se aplica también a los `<select>` que aparecen después (MutationObserver). |
| `js/ros/formulario.js` | El formulario ROS estándar: segmento B2B/B2C, ID, fechas, vinculados; envía a `/generar`, guarda el análisis y abre el modal; descarga el PDF editado contra `/generar-pdf-editado`. |
| `js/ros/modal.js` | El **motor** del modal de revisión/edición: arma los campos, valida formato en vivo y publica `window.RosModal`. No sabe qué campos tiene cada país. |
| `js/ros/<pais>/campos.js` | El **esquema de campos** de ese ROS: secciones, etiquetas, opciones y máximos. Espejo del `fields.py` y de la plantilla del backend. |
| `js/roe/chile/formulario.js` | Formulario propio del ROE de Chile (año + trimestre + sociedad) contra `/generar-roe-chile`; recibe los XLSX en base64 y dispara la descarga. |
| `nginx.conf` · `Dockerfile` | La imagen de producción: nginx sin privilegios en el puerto 8080 con los estáticos tal cual están en el repo. |

## Cómo se agrega un proceso (los dos registros)

Todo el diseño se apoya en **dos registros**. Son la razón por la que agregar un proceso
—el ROE de Colombia, el ROE de Argentina— es **crear un archivo y registrarlo**, sin
tocar el código compartido. El ROS de Argentina se sumó así: reutiliza tal cual el
formulario estándar (`js/ros/formulario.js`) y solo aporta su
`js/ros/argentina/campos.js`.

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
4. `js/ros/chile/campos.js`, `js/ros/colombia/campos.js`, `js/ros/argentina/campos.js` —
   se registran en `RosModal`.
5. `js/ros/formulario.js`, `js/roe/chile/formulario.js` — se registran en `GEREO`.
6. `js/comun/asistente.js` — **el último**: cuando corre, todo está registrado, y es quien
   despacha al formulario del documento elegido.

Todos llevan `defer`, así que se ejecutan en ese orden, con el DOM ya parseado y antes del
`DOMContentLoaded` en el que `nucleo.js` arranca la sesión.

## Cómo se conecta con el backend

- Siempre en el **mismo origen**: en producción, el balanceador manda las rutas de la API
  al backend y el resto a este frontend; en local, el propio backend sirve estos archivos.
  Las llamadas a la API son rutas relativas (`GEREO.api("/config")`).
- La sesión viaja como `Authorization: Bearer <token>`. El token vive en `sessionStorage`
  (por pestaña) y se borra al cerrar sesión.
- Si el backend no responde, la pantalla de login lo dice ("no se pudo contactar al
  servidor") en vez de fallar en silencio.

## Requisitos en Google Cloud Console (una vez)

En el cliente OAuth, agregar como **Origen de JavaScript autorizado** el de producción
(el origen es el dominio, sin ruta):

```
https://gereo.global66.com
```

## Publicación

Este directorio es un repositorio propio (`amondinelli-g66/ros-roe-generator`; el backend
es `ros-roe-generator-backend`). Se trabaja en `dev` y se prueba con el servidor local del
backend (`deploy\pruebas\Gereo-local.cmd`), que sirve estos mismos archivos en
`http://127.0.0.1:8001`.

Para pasar un cambio a producción (no hay rama `main`: se publica `dev`), desde el repo
`iac-gereo`: `./publicar.sh frontend` (o `todo`). Arma un zip de `dev` con `git archive`, CodeBuild
construye la imagen con el [`Dockerfile`](Dockerfile) y el servicio se redespliega sin
corte. Detalle en el README de `iac-gereo`.
