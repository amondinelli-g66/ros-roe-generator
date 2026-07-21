# Generador ROS/ROE — frontend (GitHub Pages)

Frontend **estático** del Generador de ROS y ROE. Se publica en **GitHub Pages**, por
lo que tiene una **URL fija** que el equipo usa para entrar (no cambia entre reinicios).

El procesamiento (consulta a la base de datos, reglas, IA, PDF) ocurre en el **backend**
(FastAPI), que corre en el PC de un analista y se expone por un **túnel Cloudflare**. La
URL del backend **sí cambia** en cada arranque; por eso NO está incrustada aquí: se lee
de [`config.json`](config.json), que el lanzador del PC actualiza y publica en cada
arranque. Así, el usuario siempre entra por la misma URL de Pages y el frontend
descubre solo dónde está el backend.

```
Usuario → https://amondinelli-g66.github.io/<repo>/   (fijo, GitHub Pages)
                     │  lee config.json → backend actual
                     ▼
          https://xxxx.trycloudflare.com   (cambiante, túnel al PC)
                     │
                     ▼
             FastAPI + BD (VPN) en el PC anfitrión
```

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | Página única (login + asistente país→documento→formulario). |
| `app.js` | Cliente: login con Google, sesión por token `Bearer`, llamadas a la API. |
| `config.json` | `{ "backend": "<url del túnel>" }`. **Lo actualiza el lanzador del PC**; no editar a mano salvo emergencia. |
| `global66-cs-logo.webp` | Logo. |
| `.nojekyll` | Evita el procesamiento Jekyll de GitHub Pages (sitio estático puro). |

## Cómo se conecta con el backend

- El frontend detecta que está en `*.github.io` y lee `config.json` para saber la URL del
  backend. En modo local (servido por el propio backend) usa el mismo origen.
- La sesión viaja como `Authorization: Bearer <token>` (no cookies), por lo que funciona
  entre dominios sin depender de cookies de terceros.
- El login con Google ocurre en ESTA página (origen fijo), así que el *Origen de
  JavaScript autorizado* en Google Cloud Console se registra **una sola vez**.

## Requisitos en Google Cloud Console (una vez)

En el cliente OAuth, agregar como **Origen de JavaScript autorizado**:

```
https://amondinelli-g66.github.io
```

(el origen es el dominio, sin la ruta del repo). Con esto el login deja de necesitar
re-registro cada vez que cambia la URL del túnel.

## Publicación

Este directorio es un repositorio propio. Para publicarlo:

1. Crear un repo público en GitHub (p. ej. `ros-roe-web`).
2. `git remote add origin <url>` y `git push -u origin main`.
3. En **Settings → Pages**, elegir la rama `main` / carpeta raíz. GitHub sirve el sitio en
   `https://amondinelli-g66.github.io/<repo>/`.
