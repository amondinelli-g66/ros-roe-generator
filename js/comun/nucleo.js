/* =============================================================================
 * js/comun/nucleo.js — cimientos del cliente de GEREO: namespace, backend y sesión.
 *
 * Este frontend es ESTÁTICO y se publica en GitHub Pages (URL FIJA). El backend
 * (FastAPI) corre en el PC de un analista y se expone por un túnel Cloudflare
 * (URL CAMBIANTE). Como viven en orígenes distintos:
 *   - La URL del backend se lee de ./config.json (el lanzador del PC la actualiza
 *     y la publica en este repo en cada arranque). En modo local (servido por el
 *     propio backend) se usa el mismo origen y NO se lee config.json.
 *   - La sesión viaja como `Authorization: Bearer <token>` (no cookies), para no
 *     depender de cookies de terceros entre dominios. El token se guarda en
 *     sessionStorage (por pestaña) y se borra al cerrar sesión.
 *
 * Orden: PRIMERO la autenticación. Nada del proyecto se muestra hasta que el
 * usuario inicia sesión con su cuenta @global66.com (Google Identity Services).
 * A los 10 min de inactividad: se cierra la sesión.
 *
 * Qué vive en ESTE archivo (antes: la primera mitad de app.js):
 *   - El ÚNICO namespace global del proyecto: `window.GEREO`. Todo lo que antes
 *     era una variable del closure compartido de app.js y hoy necesitan varios
 *     módulos se publica acá (api, token, descargarBlob, esc, análisis pendiente).
 *   - La sesión completa: login con Google, entrada/salida de la app, inactividad.
 *   - El REGISTRO de formularios por documento. Vive acá —y no en asistente.js,
 *     que es su único consumidor— por orden de carga: cada formulario se registra
 *     al cargarse y el asistente es el ÚLTIMO script, así que el registro tiene
 *     que existir antes que ellos.
 *   - Una única lectura de /config, memoizada, que se reparten los módulos (antes
 *     era un solo fetch dentro de initWizard que servía a los tres consumidores:
 *     asistente, formulario ROS y formulario ROE de Chile).
 *
 * Va en un archivo externo (no inline) para permitir una CSP estricta sin
 * 'unsafe-inline' en script-src.
 * ========================================================================== */
(function () {
  "use strict";

  // Namespace único del proyecto. Se crea acá porque nucleo.js es el primer
  // script propio en ejecutarse (después de select-ui.js, que no lo usa).
  var GEREO = window.GEREO = window.GEREO || {};

  var $ = function (id) { return document.getElementById(id); };
  var elLogin = $("view-login");
  var elApp = $("app");
  var elExpired = $("view-expired");
  var elTopbar = $("topbar");
  var elLoginMsg = $("login-msg");

  var idleMs = 600000;         // se ajusta con idle_seconds del backend
  var idleTimer = null;
  var lastPing = 0;
  var sesionActiva = false;
  var wizardListo = false;

  // --------------------------------------------------------------------- //
  // Backend + token de sesión
  // --------------------------------------------------------------------- //
  var API_BASE = "";                 // "" = mismo origen (modo local)
  var TOKEN_KEY = "g66_token";

  function getToken() { try { return sessionStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } }
  function setToken(t) { try { sessionStorage.setItem(TOKEN_KEY, t || ""); } catch (e) {} }
  function clearToken() { try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  // Análisis ROS ya calculado (ros_doc), pendiente de revisar/descargar. Se
  // guarda por pestaña (mismo mecanismo que el token); "Ver información" lo
  // vuelve a mostrar sin llamar de nuevo al backend.
  var ANALISIS_KEY = "g66_ros_analisis";
  function guardarAnalisis(obj) { try { sessionStorage.setItem(ANALISIS_KEY, JSON.stringify(obj)); } catch (e) {} }
  function leerAnalisis() {
    try {
      var raw = sessionStorage.getItem(ANALISIS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function borrarAnalisis() { try { sessionStorage.removeItem(ANALISIS_KEY); } catch (e) {} }

  function descargarBlob(blob, nombre) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // Escapa texto para insertarlo con seguridad como HTML (listas del banner).
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // fetch a la API: antepone la base del backend y agrega el token si lo hay.
  function api(path, opts) {
    opts = opts || {};
    var headers = opts.headers || {};
    var tok = getToken();
    if (tok) headers["Authorization"] = "Bearer " + tok;
    opts.headers = headers;
    return fetch(API_BASE + path, opts);
  }

  // Resuelve la URL del backend antes de arrancar. Solo en GitHub Pages se lee
  // config.json (lo publica el lanzador del PC). En cualquier otro origen (modo
  // local servido por el backend) se usa el mismo origen.
  function resolverBackend(cb) {
    if (!/\.github\.io$/i.test(location.hostname)) { cb(); return; }
    fetch("./config.json?t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (c) {
        API_BASE = (c && c.backend ? String(c.backend) : "").replace(/\/+$/, "");
        cb();
      })
      .catch(function () { API_BASE = ""; cb(); });
  }

  // --------------------------------------------------------------------- //
  // /config del backend: UNA sola llamada, repartida entre módulos
  // --------------------------------------------------------------------- //
  // Antes era un único fetch dentro de initWizard cuyo `.then` repartía la
  // respuesta a tres destinos (máximo de vinculados del formulario ROS,
  // disponibilidad/formulario de cada documento del asistente, y la fecha de
  // referencia del ROE de Chile). Al partir el código en módulos, cada uno pide
  // su parte: se memoiza la promesa para NO multiplicar la llamada HTTP ni la
  // comprobación de 401 (idénticas a las originales).
  var _configPromesa = null;
  function configuracion() {
    if (!_configPromesa) {
      _configPromesa = api("/config").then(function (r) {
        if (manejar401(r)) throw new Error("401");
        return r.json();
      });
    }
    return _configPromesa;
  }

  // --------------------------------------------------------------------- //
  // Registro de formularios por documento
  // --------------------------------------------------------------------- //
  // Cada formulario se registra a sí mismo con una definición:
  //   {
  //     contenedor: "<id del div que lo envuelve en index.html>",
  //     init:  function ()     -> cableado de una sola vez (listeners, /config)
  //     reset: function (ctx)  -> deja el formulario en blanco para el documento
  //                               elegido; ctx = {pais, tipo, clave, usaVinculados}
  //   }
  // Un mismo formulario puede registrarse bajo varias claves: el ROS estándar
  // sirve por igual a "Chile|ROS" y "Colombia|ROS" (misma UI, el backend decide),
  // y además bajo su id de formulario ("ros") como clave por defecto.
  var FORM_POR_CLAVE = {};   // clave -> definición
  var FORM_DEFS = [];        // definiciones ÚNICAS, en orden de registro

  function registrarFormulario(clave, def) {
    if (!clave || !def) return;
    FORM_POR_CLAVE[clave] = def;
    // Se desduplica por identidad: init() debe correr una sola vez aunque la
    // misma definición esté registrada bajo tres claves.
    if (FORM_DEFS.indexOf(def) === -1) FORM_DEFS.push(def);
  }
  function formularioRegistrado(clave) { return FORM_POR_CLAVE[clave] || null; }
  function formulariosRegistrados() { return FORM_DEFS.slice(); }

  // --------------------------------------------------------------------- //
  // Utilidades de vista
  // --------------------------------------------------------------------- //
  function soloVista(cual) {
    elLogin.hidden = cual !== "login";
    elApp.hidden = cual !== "app";
    elExpired.hidden = cual !== "expired";
    // El logo de la esquina aparece en todo momento MENOS al iniciar sesión
    // (login) o cuando la sesión expiró (hay que volver a iniciar sesión).
    elTopbar.hidden = cual !== "app";
    window.scrollTo(0, 0);
  }

  function mostrarLoginMsg(txt) {
    elLoginMsg.textContent = txt;
    elLoginMsg.hidden = false;
  }

  // --------------------------------------------------------------------- //
  // Arranque: consulta el estado de sesión
  // --------------------------------------------------------------------- //
  function iniciar() {
    if (API_BASE === "" && /\.github\.io$/i.test(location.hostname)) {
      // En Pages sin backend configurado todavía (config.json vacío).
      soloVista("login");
      mostrarLoginMsg("El servidor aún no está disponible. Pide a la persona " +
        "que hospeda el servicio que lo encienda en su PC e inténtalo de nuevo.");
      return;
    }
    api("/auth/status", { headers: { "Accept": "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (st) {
        if (st && st.idle_seconds) idleMs = st.idle_seconds * 1000;
        if (st && st.authenticated) {
          entrarApp(st.user || {});
        } else {
          prepararLogin(st || {});
        }
      })
      .catch(function () {
        // Backend apagado / túnel caído / red.
        soloVista("login");
        mostrarLoginMsg("No se pudo contactar al servidor. Verifica que el " +
          "servicio esté encendido en el PC anfitrión e inténtalo de nuevo.");
      });
  }

  // --------------------------------------------------------------------- //
  // Login con Google
  // --------------------------------------------------------------------- //
  function prepararLogin(st) {
    soloVista("login");
    document.title = "Acceso · GEREO";
    if (st.auth_enabled === false) { entrarApp({ email: "dev@local" }); return; }
    if (!st.ready) {
      mostrarLoginMsg("La autenticación aún no está configurada en el servidor " +
        "(falta GOOGLE_CLIENT_ID y/o SESSION_SECRET en .env). Consulta el README.");
      return;
    }
    var intentos = 0;
    (function initGIS() {
      if (!(window.google && google.accounts && google.accounts.id)) {
        if (intentos++ > 60) {
          mostrarLoginMsg("No se pudo cargar el inicio de sesión de Google. " +
            "Revisa tu conexión y recarga la página.");
          return;
        }
        setTimeout(initGIS, 100);
        return;
      }
      google.accounts.id.initialize({
        client_id: st.client_id,
        callback: onCredential,
        nonce: st.nonce,
        auto_select: false,
        cancel_on_tap_outside: true,
        itp_support: true,
      });
      google.accounts.id.renderButton($("g-btn"), {
        theme: "outline", size: "large", type: "standard",
        text: "signin_with", shape: "rectangular", logo_alignment: "left", width: 300,
      });
    })();
  }

  function onCredential(resp) {
    var credential = resp && resp.credential;
    if (!credential) { mostrarLoginMsg("No se recibió la credencial de Google."); return; }
    api("/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: credential }),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        return { ok: r.ok, data: data };
      });
    }).then(function (res) {
      if (res.ok && res.data && res.data.ok) {
        if (res.data.session_token) setToken(res.data.session_token);
        location.reload();   // recarga limpia -> /auth/status confirma y entra a la app
      } else {
        mostrarLoginMsg((res.data && res.data.mensaje) || "No se pudo iniciar sesión.");
      }
    }).catch(function () {
      mostrarLoginMsg("Error de comunicación al iniciar sesión.");
    });
  }

  // --------------------------------------------------------------------- //
  // Entrar a la app (autenticado)
  // --------------------------------------------------------------------- //
  function entrarApp(user) {
    document.title = "GEREO · Generador de ROS y ROE";
    var em = $("user-email");
    if (em) em.textContent = user && user.email ? user.email : "";
    soloVista("app");
    sesionActiva = true;
    // El asistente se inicializa UNA sola vez y solo con la sesión ya activa
    // (antes: initWizard() en este mismo punto, con el mismo flag). Ahora vive en
    // asistente.js, el último script en cargarse: cuando esto corre —siempre
    // dentro de una promesa disparada desde DOMContentLoaded— ya está definido.
    if (!wizardListo) {
      if (typeof GEREO.iniciarAsistente === "function") {
        GEREO.iniciarAsistente();
        wizardListo = true;
      } else {
        // Fallo de cableado (falta el <script> del asistente): que se vea en la
        // consola en vez de quedar con una app muda.
        console.error("GEREO: no se encontró GEREO.iniciarAsistente. " +
          "Revisa que index.html cargue js/comun/asistente.js al final de la lista.");
      }
    }
    iniciarInactividad();
  }

  function cerrarSesion(expirada) {
    sesionActiva = false;
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    api("/auth/logout", { method: "POST" }).catch(function () {});
    clearToken();
    if (expirada) {
      soloVista("expired");
    } else {
      location.reload();
    }
  }

  // --------------------------------------------------------------------- //
  // Inactividad (10 min) + keepalive de la sesión del backend
  // --------------------------------------------------------------------- //
  function iniciarInactividad() {
    ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"].forEach(function (ev) {
      document.addEventListener(ev, marcarActividad, { passive: true });
    });
    reprogramar();
  }

  function reprogramar() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { cerrarSesion(true); }, idleMs);
  }

  function marcarActividad() {
    if (!sesionActiva) return;
    reprogramar();
    // Mantener viva la sesión del backend ante actividad real (con throttle).
    var ahora = Date.now();
    if (ahora - lastPing > idleMs / 3) {
      lastPing = ahora;
      api("/ping").then(function (r) {
        if (r.status === 401) cerrarSesion(true);
      }).catch(function () {});
    }
  }

  function manejar401(resp) {
    if (resp && resp.status === 401) { cerrarSesion(true); return true; }
    return false;
  }

  // --------------------------------------------------------------------- //
  // Superficie pública: lo que necesitan los demás módulos
  // --------------------------------------------------------------------- //
  GEREO.$ = $;
  GEREO.api = api;
  GEREO.getToken = getToken;
  GEREO.manejar401 = manejar401;
  GEREO.descargarBlob = descargarBlob;
  GEREO.esc = esc;
  GEREO.guardarAnalisis = guardarAnalisis;
  GEREO.leerAnalisis = leerAnalisis;
  GEREO.borrarAnalisis = borrarAnalisis;
  GEREO.configuracion = configuracion;
  GEREO.registrarFormulario = registrarFormulario;
  GEREO.formularioRegistrado = formularioRegistrado;
  GEREO.formulariosRegistrados = formulariosRegistrados;

  // --------------------------------------------------------------------- //
  // Wire-up de botones fuera del wizard
  // --------------------------------------------------------------------- //
  // Los scripts llevan `defer`: todos se ejecutan (y por lo tanto todos los
  // formularios y esquemas quedan registrados) ANTES de que dispare este
  // DOMContentLoaded, así que el arranque puede vivir acá sin depender de que
  // nucleo.js sea el último archivo de la lista.
  document.addEventListener("DOMContentLoaded", function () {
    var bl = $("btn-logout");
    if (bl) bl.addEventListener("click", function () { cerrarSesion(false); });
    var br = $("btn-relogin");
    if (br) br.addEventListener("click", function () { location.reload(); });
    resolverBackend(iniciar);
  });
})();
