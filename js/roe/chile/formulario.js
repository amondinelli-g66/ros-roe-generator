/* =============================================================================
 * js/roe/chile/formulario.js — formulario del ROE de Chile (#form-roe-chile).
 *
 * Documento distinto al ROS y con pantalla propia: año + trimestre + sociedad ->
 * hasta 2 archivos XLSX que llegan en base64 desde /generar-roe-chile.
 *
 * Reglas de período (espejo de core.paises.chile.roe.pipeline): solo se ofrecen
 * los trimestres que YA terminaron y que no son anteriores al piso del servicio
 * (anio_min + trimestre_min). La referencia de fecha la entrega el backend en
 * /config -> roe_chile, para no depender del reloj del navegador.
 *
 * Se registra bajo su id de formulario ("roe-chile", que es lo que informa el
 * backend en /config -> documentos[].formulario) y bajo la clave del documento
 * ("Chile|ROE").
 * ========================================================================== */
(function () {
  "use strict";

  var GEREO = window.GEREO;
  var $ = GEREO.$;
  var api = GEREO.api;
  var manejar401 = GEREO.manejar401;
  var esc = GEREO.esc;
  // El banner lo publica asistente.js, que se carga DESPUÉS de este archivo: se
  // llama por el namespace en tiempo de ejecución, nunca se captura acá arriba.

  // Meses y nombre de cada trimestre (para el selector del ROE de Chile).
  var MESES_TRIM = {
    "1": "enero, febrero y marzo", "2": "abril, mayo y junio",
    "3": "julio, agosto y septiembre", "4": "octubre, noviembre y diciembre",
  };
  var TRIM_LABEL = {
    "1": "Primer Trimestre", "2": "Segundo Trimestre",
    "3": "Tercer Trimestre", "4": "Cuarto Trimestre",
  };
  // Referencia de fecha del servidor (la entrega /config): año/trimestre actual +
  // piso del período (anio_min + trimestre_min, hoy 2.º trimestre de 2026).
  var ROE_CFG = { anio_min: 2026, trimestre_min: 2, anio_actual: null, trimestre_actual: null };

  var formRoe = $("form-roe"), roeAnio = $("roe-anio"), roeTrim = $("roe-trimestre");
  var roeSocs = $("roe-socs"), roeSocInput = $("roe-sociedad"), btnRoe = $("btn-roe");
  var roeTrimHint = $("roe-trim-hint");
  var ROE_TRIM_HINT_BASE = "Pasa el mouse sobre una opción para ver sus meses.";

  // Años elegibles (del más reciente al más antiguo): los que tienen al menos un
  // trimestre seleccionable hoy (espejo de core.paises.chile.roe.pipeline).
  function aniosSeleccionables() {
    if (!ROE_CFG.anio_actual) return [];
    var out = [];
    for (var y = ROE_CFG.anio_actual; y >= ROE_CFG.anio_min; y--) {
      if (trimestresSeleccionables(y).length) out.push(y);
    }
    return out;
  }
  // Trimestres del año que YA terminaron (hoy en uno estrictamente posterior) y que
  // no son anteriores al piso (anio_min, trimestre_min).
  function trimestresSeleccionables(anio) {
    anio = parseInt(anio, 10);
    if (!ROE_CFG.anio_actual || !anio || anio < ROE_CFG.anio_min) return [];
    var tmin = ROE_CFG.trimestre_min || 1;
    var out = [];
    for (var t = 1; t <= 4; t++) {
      if (anio === ROE_CFG.anio_min && t < tmin) continue;   // antes del piso
      var terminado = (anio < ROE_CFG.anio_actual) ||
                      (anio === ROE_CFG.anio_actual && t < ROE_CFG.trimestre_actual);
      if (terminado) out.push(t);
    }
    return out;
  }

  function poblarAnios() {
    if (!roeAnio) return;
    var html = '<option value="">Selecciona un año…</option>';
    aniosSeleccionables().forEach(function (y) {
      html += '<option value="' + y + '">' + y + '</option>';
    });
    roeAnio.innerHTML = html;
    poblarTrimestres();
  }

  // El trimestre depende del año: solo se ofrecen los que ya terminaron.
  function poblarTrimestres() {
    if (!roeTrim) return;
    var trims = trimestresSeleccionables(roeAnio.value);
    var html = '<option value="">' +
      (roeAnio.value ? "Selecciona un trimestre…" : "Selecciona primero el año…") + "</option>";
    trims.forEach(function (t) {
      html += '<option value="' + t + '" title="' + MESES_TRIM[t] + '">' + TRIM_LABEL[t] + "</option>";
    });
    roeTrim.innerHTML = html;
    roeTrim.disabled = trims.length === 0;
    roeTrimHint.textContent = ROE_TRIM_HINT_BASE;
    roeTrim.removeAttribute("title");
  }

  function roeCompleto() {
    return !!roeAnio.value
      && ["1", "2", "3", "4"].indexOf(roeTrim.value) !== -1
      && !!roeSocInput.value;
  }
  function actualizarRoeBtn() { if (btnRoe) btnRoe.disabled = !roeCompleto(); }

  function resetRoe() {
    if (!formRoe) return;
    if (roeAnio.options.length) roeAnio.selectedIndex = 0;   // vuelve al placeholder
    poblarTrimestres();                                      // trimestre: deshabilitado
    roeSocInput.value = "";
    roeSocs.querySelectorAll(".soc").forEach(function (x) { x.classList.remove("sel"); });
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
    roeAnio.addEventListener("change", function () {
      poblarTrimestres();      // los trimestres válidos dependen del año elegido
      GEREO.limpiarBanner(); actualizarRoeBtn();
    });
    roeTrim.addEventListener("change", function () {
      var meses = MESES_TRIM[roeTrim.value];
      if (meses) {
        roeTrimHint.textContent = TRIM_LABEL[roeTrim.value] + ": " + meses + ".";
        roeTrim.title = meses;
      } else {
        roeTrimHint.textContent = ROE_TRIM_HINT_BASE;
        roeTrim.removeAttribute("title");
      }
      GEREO.limpiarBanner(); actualizarRoeBtn();
    });
    roeSocs.querySelectorAll(".soc").forEach(function (bt) {
      bt.addEventListener("click", function () {
        roeSocs.querySelectorAll(".soc").forEach(function (x) { x.classList.remove("sel"); });
        bt.classList.add("sel");
        roeSocInput.value = bt.dataset.soc;
        GEREO.limpiarBanner(); actualizarRoeBtn();
      });
    });

    formRoe.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!roeCompleto()) { actualizarRoeBtn(); return; }
      GEREO.limpiarBanner();
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
            var aviso = "";
            if (d.no_consultados_bd && d.no_consultados_bd.length) {
              aviso = '<ul class="faltantes">' +
                d.no_consultados_bd.map(function (grupo) {
                  return "<li>" + esc(grupo.mes) + ":<ul>" +
                    (grupo.operaciones || []).map(function (x) {
                      return "<li>" + esc(x) + "</li>";
                    }).join("") + "</ul></li>";
                }).join("") +
                "</ul>";
            }
            GEREO.mostrarBanner("ok", "ROE generado",
              " Se " + (nombres.length > 1 ? "descargaron los archivos" : "descargó el archivo")
              + ": " + esc(nombres.join(", ")) + "." + aviso);
          } else if (d.estado === "ROE_NEGATIVO") {
            var avisoNeg = "";
            if (d.advertencias && d.advertencias.length) {
              avisoNeg = '<ul class="faltantes">' +
                d.advertencias.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") +
                "</ul>";
            }
            GEREO.mostrarBanner("warn", "Corresponde un ROE Negativo",
              " " + esc(d.mensaje || ("Para " + (d.sociedad || "la sociedad") + " no se registraron "
              + "operaciones en efectivo sobre USD 10.000 en el período. Debes declarar un "
              + "ROE Negativo en la UAF.")) + avisoNeg);
          } else if (d.estado === "FALTAN_CARTOLAS") {
            // Encabezado con sociedad y año + lista de las cartolas faltantes por mes.
            var lista = "";
            if (d.faltantes && d.faltantes.length) {
              lista = '<ul class="faltantes">' +
                d.faltantes.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") +
                "</ul>";
            }
            GEREO.mostrarBanner("error", "No se puede generar el ROE todavía",
              " " + esc(d.mensaje || "") + lista);
          } else {
            GEREO.mostrarBanner("error", "No se pudo generar el ROE", " " + (d.mensaje || "Inténtalo de nuevo."));
          }
        })
        .catch(function (err) {
          if (String(err && err.message) !== "401")
            GEREO.mostrarBanner("error", "Error de comunicación", " No se pudo contactar al servidor: " + err);
        })
        .then(function () {
          btnRoe.textContent = "Generar ROE";
          actualizarRoeBtn();
        });
    });
  }

  // ------------------------------------------------------------------- //
  // Cableado de una sola vez (lo llama el asistente al iniciar la sesión)
  // ------------------------------------------------------------------- //
  function init() {
    // Fecha de referencia del servidor: sin ella no hay años que ofrecer. La
    // promesa de /config está memoizada en nucleo.js (una sola llamada HTTP).
    GEREO.configuracion().then(function (cfg) {
      if (cfg && cfg.roe_chile) {
        ROE_CFG = cfg.roe_chile;
        poblarAnios();   // con la fecha del servidor, arma el selector de años del ROE
      }
    }).catch(function () {});
    initRoeChile();
  }

  // ------------------------------------------------------------------- //
  // Registro
  // ------------------------------------------------------------------- //
  var DEF = {
    contenedor: "form-roe-chile",
    init: init,
    reset: resetRoe,   // deja el formulario ROE limpio al entrar
  };
  GEREO.registrarFormulario("roe-chile", DEF);   // id de formulario que informa /config
  GEREO.registrarFormulario("Chile|ROE", DEF);   // clave del documento
})();
