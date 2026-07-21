/* =============================================================================
 * app.js — cliente del Generador de ROS y ROE.
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
 * Va en un archivo externo (no inline) para permitir una CSP estricta sin
 * 'unsafe-inline' en script-src.
 * ========================================================================== */
(function () {
  "use strict";

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
    document.title = "Acceso · Global66";
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
    document.title = "Generador de ROS y ROE";
    var em = $("user-email");
    if (em) em.textContent = user && user.email ? user.email : "";
    soloVista("app");
    sesionActiva = true;
    if (!wizardListo) { initWizard(); wizardListo = true; }
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
  // Asistente país → tipo → formulario (requiere sesión)
  // --------------------------------------------------------------------- //
  function initWizard() {
    var banner = $("banner");
    var paisSel = null, tipoSel = null;
    // Fuente de verdad de disponibilidad: backend (/config -> core.documentos).
    var DISPONIBLES = new Set();
    // Documentos que admiten vinculados (Colombia reporta un único ID -> sin vinculados).
    var USA_VINC = new Set();
    // Qué formulario muestra cada documento: "ros" (estándar) o "roe-chile", etc.
    var FORMULARIOS = {};
    // Meses de cada trimestre (para el selector del ROE de Chile).
    var MESES_TRIM = {
      "1": "enero, febrero y marzo", "2": "abril, mayo y junio",
      "3": "julio, agosto y septiembre", "4": "octubre, noviembre y diciembre",
    };
    var viewPais = $("view-pais"), viewTipo = $("view-tipo"), viewForm = $("view-form");

    function limpiarBanner() { banner.className = "banner"; banner.innerHTML = ""; }

    function mostrarVista(v) {
      [viewPais, viewTipo, viewForm].forEach(function (x) { x.hidden = true; });
      v.hidden = false;
      window.scrollTo(0, 0);
    }

    document.querySelectorAll("[data-pais]").forEach(function (b) {
      b.addEventListener("click", function () {
        paisSel = b.dataset.pais; tipoSel = null;
        $("ctx-pais-tipo").textContent = paisSel;
        mostrarVista(viewTipo);
      });
    });

    document.querySelectorAll("[data-tipo]").forEach(function (b) {
      b.addEventListener("click", function () {
        tipoSel = b.dataset.tipo;
        $("ctx-pais-form").textContent = paisSel;
        $("ctx-tipo-form").textContent = tipoSel;
        var clave = paisSel + "|" + tipoSel;
        var disponible = DISPONIBLES.has(clave);
        var formulario = FORMULARIOS[clave] || "ros";
        var esRoeChile = disponible && formulario === "roe-chile";
        var esRosStd = disponible && !esRoeChile;

        $("form-disponible").hidden = !esRosStd;
        $("form-roe-chile").hidden = !esRoeChile;
        $("form-no-disponible").hidden = disponible;   // no-disponible solo si NO hay generador

        if (esRosStd) {
          $("pais").value = paisSel;
          $("tipo_documento").value = tipoSel;
          // Vinculados solo para documentos que los admiten (no en Colombia).
          var usaVinc = USA_VINC.has(clave);
          $("vinc-zona").hidden = !usaVinc;
          if (!usaVinc) {   // limpiar por si venía de un documento que sí los usa
            $("vinculados").value = "";
            $("vinc-box").hidden = true;
            $("btn-add-vinc").hidden = false;
          }
        } else if (esRoeChile) {
          resetRoe();   // deja el formulario ROE limpio al entrar
        } else {
          $("no-disp-doc").textContent = tipoSel;
          $("no-disp-pais").textContent = paisSel;
        }
        limpiarBanner();
        mostrarVista(viewForm);
      });
    });

    document.querySelectorAll(".back").forEach(function (b) {
      b.addEventListener("click", function () {
        banner.className = "banner";
        if (b.dataset.target === "pais") { paisSel = null; tipoSel = null; mostrarVista(viewPais); }
        else if (b.dataset.target === "tipo") { tipoSel = null; mostrarVista(viewTipo); }
      });
    });

    var form = $("form");
    var btn = $("btn");
    var btnAddVinc = $("btn-add-vinc"), btnDelVinc = $("btn-del-vinc");
    var vincBox = $("vinc-box"), vincTa = $("vinculados");
    var vincCount = $("vinc-count"), vincMaxEl = $("vinc-max");
    var vincMax = 15;

    api("/config").then(function (r) {
      if (manejar401(r)) throw new Error("401");
      return r.json();
    }).then(function (cfg) {
      if (cfg && Number.isInteger(cfg.vinculados_max)) {
        vincMax = cfg.vinculados_max; vincMaxEl.textContent = vincMax; actualizarConteoVinc();
      }
      if (cfg && Array.isArray(cfg.documentos)) {
        DISPONIBLES = new Set(cfg.documentos.filter(function (d) { return d.disponible; })
          .map(function (d) { return d.pais + "|" + d.tipo; }));
        USA_VINC = new Set(cfg.documentos.filter(function (d) { return d.usa_vinculados; })
          .map(function (d) { return d.pais + "|" + d.tipo; }));
        FORMULARIOS = {};
        cfg.documentos.forEach(function (d) {
          FORMULARIOS[d.pais + "|" + d.tipo] = d.formulario || "ros";
        });
      }
    }).catch(function () {});

    function idsVinculados() {
      var crudos = vincTa.value.split(/[\s,;]+/).map(function (s) { return s.trim(); }).filter(Boolean);
      return Array.from(new Set(crudos));
    }
    function actualizarConteoVinc() {
      var n = idsVinculados().length;
      var txt = n ? "(" + n + " ingresado" + (n === 1 ? "" : "s") + ")" : "";
      if (n > vincMax) txt += " — supera el máximo, se usarán los primeros " + vincMax;
      vincCount.textContent = txt;
      vincCount.classList.toggle("over", n > vincMax);
    }
    btnAddVinc.addEventListener("click", function () {
      vincBox.hidden = false; btnAddVinc.hidden = true; vincTa.focus();
    });
    btnDelVinc.addEventListener("click", function () {
      vincTa.value = ""; vincBox.hidden = true; btnAddVinc.hidden = false; actualizarConteoVinc();
    });
    vincTa.addEventListener("input", actualizarConteoVinc);
    // Al editar cualquier campo del formulario ROS, borra el mensaje de éxito/error
    // previo (p. ej. tras generar un PDF y luego cambiar un dato).
    form.addEventListener("input", limpiarBanner);

    function mostrarBanner(tipo, titulo, mensaje, reglas) {
      banner.className = "banner show " + tipo;
      var html = "<strong>" + titulo + "</strong>" + (mensaje || "");
      if (reglas && reglas.length) {
        html += '<div class="reglas">';
        reglas.forEach(function (r) {
          if (r.gatillada) html += '<div class="r"><span class="on">● ' + r.titulo + "</span> — " + (r.detalle || "") + "</div>";
        });
        html += "</div>";
      }
      banner.innerHTML = html;
    }

    function nombreArchivo(resp, fallback) {
      var cd = resp.headers.get("content-disposition") || "";
      var m = cd.match(/filename="?([^";]+)"?/);
      return m ? m[1] : fallback;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.customer_id.value.trim() || !form.fecha_inicio.value.trim()) {
        mostrarBanner("error", "Faltan datos", " Ingresa al menos el ID de cliente y la fecha de inicio.");
        return;
      }
      banner.className = "banner";
      btn.disabled = true;
      btn.textContent = "Generando… (consultando la base de datos)";
      api("/generar", { method: "POST", body: new FormData(form) })
        .then(function (resp) {
          if (manejar401(resp)) throw new Error("401");
          var ct = resp.headers.get("content-type") || "";
          if (ct.indexOf("application/pdf") !== -1) {
            return resp.blob().then(function (blob) {
              var url = URL.createObjectURL(blob);
              var a = document.createElement("a");
              a.href = url;
              a.download = nombreArchivo(resp, "ROS_" + form.customer_id.value + ".pdf");
              document.body.appendChild(a); a.click(); a.remove();
              URL.revokeObjectURL(url);
              mostrarBanner("ok", "Documento generado", " El PDF se descargó correctamente.");
            });
          }
          return resp.json().then(function (data) {
            var esDet = data.es_detencion;
            mostrarBanner(esDet ? "info" : "error",
              (esDet ? "Proceso detenido" : "No se pudo generar el documento") + " (" + (data.estado || "") + ")",
              " " + (data.mensaje || ""), data.reglas);
          });
        })
        .catch(function (err) {
          if (String(err && err.message) !== "401") {
            mostrarBanner("error", "Error de comunicación", " No se pudo contactar al servidor: " + err);
          }
        })
        .then(function () {
          btn.disabled = false;
          btn.textContent = "Generar y descargar PDF";
        });
    });

    // ------------------------------------------------------------------- //
    // ROE de Chile: año + trimestre + sociedad -> hasta 2 archivos XLSX
    // ------------------------------------------------------------------- //
    var formRoe = $("form-roe"), roeAnio = $("roe-anio"), roeTrim = $("roe-trimestre");
    var roeSocs = $("roe-socs"), roeSocInput = $("roe-sociedad"), btnRoe = $("btn-roe");
    var roeTrimHint = $("roe-trim-hint");
    var ROE_TRIM_HINT_BASE = "Pasa el mouse sobre el selector para ver los meses de cada trimestre.";

    function roeCompleto() {
      return /^\d{4}$/.test((roeAnio.value || "").trim())
        && ["1", "2", "3", "4"].indexOf(roeTrim.value) !== -1
        && !!roeSocInput.value;
    }
    function actualizarRoeBtn() { if (btnRoe) btnRoe.disabled = !roeCompleto(); }

    function resetRoe() {
      if (!formRoe) return;
      formRoe.reset();
      roeSocInput.value = "";
      roeSocs.querySelectorAll(".soc").forEach(function (x) { x.classList.remove("sel"); });
      roeTrimHint.textContent = ROE_TRIM_HINT_BASE;
      roeTrim.removeAttribute("title");
      btnRoe.disabled = true;
    }

    // Decodifica cada XLSX (base64) y dispara su descarga. Devuelve los nombres.
    function descargarXLSX(archivos) {
      var nombres = [];
      archivos.forEach(function (a) {
        try {
          var bin = atob(a.contenido_b64 || "");
          var bytes = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          var blob = new Blob([bytes],
            { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
          var url = URL.createObjectURL(blob);
          var el = document.createElement("a");
          el.href = url; el.download = a.nombre || "ROE.xlsx";
          document.body.appendChild(el); el.click(); el.remove();
          URL.revokeObjectURL(url);
          nombres.push(a.nombre || "ROE.xlsx");
        } catch (e) { /* ignora un archivo corrupto y sigue con el resto */ }
      });
      return nombres;
    }

    function initRoeChile() {
      if (!formRoe) return;
      // Cambiar cualquier campo borra el mensaje previo y recalcula si el botón se habilita.
      roeAnio.addEventListener("input", function () { limpiarBanner(); actualizarRoeBtn(); });
      roeTrim.addEventListener("change", function () {
        var meses = MESES_TRIM[roeTrim.value];
        if (meses) {
          roeTrimHint.textContent = "Trimestre " + roeTrim.value + ": " + meses + ".";
          roeTrim.title = meses;
        } else {
          roeTrimHint.textContent = ROE_TRIM_HINT_BASE;
          roeTrim.removeAttribute("title");
        }
        limpiarBanner(); actualizarRoeBtn();
      });
      roeSocs.querySelectorAll(".soc").forEach(function (bt) {
        bt.addEventListener("click", function () {
          roeSocs.querySelectorAll(".soc").forEach(function (x) { x.classList.remove("sel"); });
          bt.classList.add("sel");
          roeSocInput.value = bt.dataset.soc;
          limpiarBanner(); actualizarRoeBtn();
        });
      });

      formRoe.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!roeCompleto()) { actualizarRoeBtn(); return; }
        limpiarBanner();
        btnRoe.disabled = true;
        btnRoe.textContent = "Generando ROE…";
        api("/generar-roe-chile", { method: "POST", body: new FormData(formRoe) })
          .then(function (resp) {
            if (manejar401(resp)) throw new Error("401");
            return resp.json().catch(function () { return {}; }).then(function (data) {
              return { ok: resp.ok, data: data };
            });
          })
          .then(function (res) {
            var d = res.data || {};
            if (res.ok && d.estado === "OK" && d.archivos && d.archivos.length) {
              var nombres = descargarXLSX(d.archivos);
              mostrarBanner("ok", "ROE generado",
                " Se " + (nombres.length > 1 ? "descargaron los archivos" : "descargó el archivo")
                + ": " + nombres.join(", ") + ".");
            } else if (d.estado === "FALTAN_CARTOLAS") {
              mostrarBanner("error", "No se puede generar el ROE todavía", " " + (d.mensaje || ""));
            } else {
              mostrarBanner("error", "No se pudo generar el ROE", " " + (d.mensaje || "Inténtalo de nuevo."));
            }
          })
          .catch(function (err) {
            if (String(err && err.message) !== "401")
              mostrarBanner("error", "Error de comunicación", " No se pudo contactar al servidor: " + err);
          })
          .then(function () {
            btnRoe.textContent = "Generar ROE";
            actualizarRoeBtn();
          });
      });
    }
    initRoeChile();
  }

  // --------------------------------------------------------------------- //
  // Wire-up de botones fuera del wizard
  // --------------------------------------------------------------------- //
  document.addEventListener("DOMContentLoaded", function () {
    var bl = $("btn-logout");
    if (bl) bl.addEventListener("click", function () { cerrarSesion(false); });
    var br = $("btn-relogin");
    if (br) br.addEventListener("click", function () { location.reload(); });
    resolverBackend(iniciar);
  });
})();
