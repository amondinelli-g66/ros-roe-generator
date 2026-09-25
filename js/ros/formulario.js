/* =============================================================================
 * js/ros/formulario.js — formulario ROS estándar (#form-disponible).
 *
 * Es el formulario que sirve por igual a Chile y a Colombia: misma UI (tipo de
 * cliente, ID, fechas, vinculados) y el backend decide qué documento arma. Por
 * eso se registra bajo las dos claves de documento MÁS su id de formulario
 * ("ros"), que es la clave por defecto para cualquier país nuevo que reutilice
 * esta pantalla (el backend lo informa en /config -> documentos[].formulario).
 *
 * Qué hace:
 *   - Botones de segmento B2B/B2C: gatillan qué consulta se hace en la BD.
 *   - Vinculados (mostrar/ocultar, conteo y máximo que informa el backend).
 *   - Envío a /generar y guardado del análisis (ros_doc) en sessionStorage.
 *   - Apertura del modal de revisión (window.RosModal) y descarga del PDF
 *     editado contra /generar-pdf-editado.
 *
 * No conoce el asistente: pide el banner por GEREO.mostrarBanner y recibe el
 * documento elegido en reset(ctx).
 * ========================================================================== */
(function () {
  "use strict";

  var GEREO = window.GEREO;
  var $ = GEREO.$;
  // Estos sí se pueden capturar al cargar: nucleo.js ya se ejecutó.
  var api = GEREO.api;
  var manejar401 = GEREO.manejar401;
  var descargarBlob = GEREO.descargarBlob;
  var guardarAnalisis = GEREO.guardarAnalisis;
  var leerAnalisis = GEREO.leerAnalisis;
  var borrarAnalisis = GEREO.borrarAnalisis;
  // El banner, en cambio, lo publica asistente.js, que se carga DESPUÉS de este
  // archivo: se llama siempre por el namespace (GEREO.mostrarBanner(...)), nunca
  // se guarda en una variable local acá arriba.

  // ------------------------------------------------------------------- //
  // Segmento (B2B/B2C): gatilla qué consulta se hace en la BD para el ID de
  // CLIENTE (persona jurídica o natural). Solo se puede tener uno
  // seleccionado; el resto del formulario ya está visible desde el inicio
  // (no depende de elegir segmento primero).
  // ------------------------------------------------------------------- //
  var segEls = document.querySelectorAll("[data-segmento]");
  var segInput = $("segmento");

  function resetSegmento() {
    segEls.forEach(function (x) {
      x.classList.remove("sel", "no-admitido");
      x.removeAttribute("aria-disabled");
      x.title = "";
    });
    segInput.value = "";
  }

  // Documentos que solo admiten un segmento (lo declara el backend en
  // /config -> documentos[].segmento_fijo; hoy, el ROS de Argentina con B2C):
  // ese queda seleccionado y el otro se muestra apagado y no responde. El
  // pipeline igual rechaza el segmento no admitido, así que esto es ayuda
  // visual, no la única defensa.
  function aplicarSegmentoFijo(segmento) {
    segEls.forEach(function (x) {
      var admitido = x.dataset.segmento === segmento;
      x.classList.toggle("sel", admitido);
      x.classList.toggle("no-admitido", !admitido);
      if (!admitido) {
        x.setAttribute("aria-disabled", "true");
        x.title = "Este documento cubre por ahora solo clientes " + segmento + ".";
      }
    });
    segInput.value = segmento;
  }

  function segmentoBloqueado() {
    return segInput.value && document.querySelector(".seg.no-admitido") !== null;
  }

  var form = $("form");
  var btn = $("btn");
  var btnVerAnalisis = $("btn-ver-analisis");
  var btnAddVinc = $("btn-add-vinc"), btnDelVinc = $("btn-del-vinc");
  var vincBox = $("vinc-box"), vincTa = $("vinculados");
  var vincCount = $("vinc-count"), vincMaxEl = $("vinc-max");
  var vincMax = 15;

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

  function nombreArchivo(resp, fallback) {
    var cd = resp.headers.get("content-disposition") || "";
    var m = cd.match(/filename="?([^";]+)"?/);
    return m ? m[1] : fallback;
  }

  // Abre el modal con un análisis ya calculado (recién llegado del backend o
  // recuperado de sessionStorage): NO vuelve a consultar la BD ni la IA.
  function abrirModalConAnalisis(analisis) {
    var ctx = { pais: analisis.pais, tipoDocumento: analisis.tipo_documento, customerId: analisis.customer_id };
    window.RosModal.abrir(analisis.ros_doc, ctx, {
      onChange: function (doc) {
        analisis.ros_doc = doc;
        guardarAnalisis(analisis);
      },
      onDescargar: function (doc, ctxDescarga) {
        window.RosModal.setMensaje("Generando PDF…");
        api("/generar-pdf-editado", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pais: ctxDescarga.pais, tipo_documento: ctxDescarga.tipoDocumento,
            customer_id: ctxDescarga.customerId, ros_doc: doc,
          }),
        })
          .then(function (resp) {
            if (manejar401(resp)) throw new Error("401");
            var ct = resp.headers.get("content-type") || "";
            if (ct.indexOf("application/pdf") !== -1) {
              return resp.blob().then(function (blob) {
                descargarBlob(blob, nombreArchivo(resp, ctxDescarga.tipoDocumento + "_" + ctxDescarga.customerId + ".pdf"));
                window.RosModal.setMensaje("PDF descargado correctamente.");
              });
            }
            return resp.json().then(function (data) {
              window.RosModal.setMensaje(data.mensaje || "No se pudo generar el PDF.", true);
            });
          })
          .catch(function (err) {
            if (String(err && err.message) !== "401") {
              window.RosModal.setMensaje("No se pudo contactar al servidor: " + err, true);
            }
          });
      },
    });
  }

  // ------------------------------------------------------------------- //
  // Cableado de una sola vez (lo llama el asistente al iniciar la sesión)
  // ------------------------------------------------------------------- //
  function init() {
    // Máximo de vinculados: lo informa el backend. La promesa de /config está
    // memoizada en nucleo.js, así que esto NO agrega una llamada extra.
    GEREO.configuracion().then(function (cfg) {
      if (cfg && Number.isInteger(cfg.vinculados_max)) {
        vincMax = cfg.vinculados_max; vincMaxEl.textContent = vincMax; actualizarConteoVinc();
      }
    }).catch(function () {});

    segEls.forEach(function (b) {
      b.addEventListener("click", function () {
        // Con el segmento fijo por documento, los botones no se pueden cambiar.
        if (segmentoBloqueado()) return;
        segEls.forEach(function (x) { x.classList.remove("sel"); });
        b.classList.add("sel");
        segInput.value = b.dataset.segmento;
        GEREO.limpiarBanner();
        borrarAnalisis();
        $("btn-ver-analisis").hidden = true;
      });
    });

    btnAddVinc.addEventListener("click", function () {
      vincBox.hidden = false; btnAddVinc.hidden = true; vincTa.focus();
    });
    btnDelVinc.addEventListener("click", function () {
      vincTa.value = ""; vincBox.hidden = true; btnAddVinc.hidden = false; actualizarConteoVinc();
    });
    vincTa.addEventListener("input", actualizarConteoVinc);
    // Al editar cualquier campo del formulario ROS, borra el mensaje de éxito/error
    // previo Y el análisis ya calculado (corresponde a otros datos): "Ver
    // información" desaparece hasta volver a presionar "Iniciar análisis".
    form.addEventListener("input", function () {
      GEREO.limpiarBanner();
      borrarAnalisis();
      btnVerAnalisis.hidden = true;
    });

    btnVerAnalisis.addEventListener("click", function () {
      var analisis = leerAnalisis();
      if (analisis) abrirModalConAnalisis(analisis);
    });

    // Al cargar la vista, si ya había un análisis guardado (p. ej. se cerró el
    // modal y no se tocó el formulario), deja "Ver información" visible.
    if (leerAnalisis()) btnVerAnalisis.hidden = false;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.segmento.value) {
        GEREO.mostrarBanner("error", "Faltan datos", " Selecciona el tipo de cliente (B2B o B2C).");
        return;
      }
      if (!form.customer_id.value.trim() || !form.fecha_inicio.value.trim()) {
        GEREO.mostrarBanner("error", "Faltan datos", " Ingresa al menos el ID de cliente y la fecha de inicio.");
        return;
      }
      GEREO.ocultarBanner();
      btnVerAnalisis.hidden = true;
      borrarAnalisis();
      btn.disabled = true;
      btn.textContent = "Analizando… (consultando la base de datos)";
      api("/generar", { method: "POST", body: new FormData(form) })
        .then(function (resp) {
          if (manejar401(resp)) throw new Error("401");
          return resp.json().then(function (data) { return { ok: resp.ok, data: data }; });
        })
        .then(function (res) {
          var data = res.data;
          if (res.ok && data.estado === "OK" && data.ros_doc) {
            guardarAnalisis(data);
            btnVerAnalisis.hidden = false;
            GEREO.mostrarBanner("ok", "Análisis listo",
              " Revisa y edita la información antes de descargar el PDF. Puedes cerrar esta "
              + "ventana y volver a abrirla con «Ver información».");
            abrirModalConAnalisis(data);
            return;
          }
          var esDet = data.es_detencion;
          GEREO.mostrarBanner(esDet ? "info" : "error",
            (esDet ? "Proceso detenido" : "No se pudo generar el documento") + " (" + (data.estado || "") + ")",
            " " + (data.mensaje || ""), data.reglas);
        })
        .catch(function (err) {
          if (String(err && err.message) !== "401") {
            GEREO.mostrarBanner("error", "Error de comunicación", " No se pudo contactar al servidor: " + err);
          }
        })
        .then(function () {
          btn.disabled = false;
          btn.textContent = "Iniciar análisis";
        });
    });
  }

  // ------------------------------------------------------------------- //
  // Reset al entrar al documento (lo llama el asistente)
  // ------------------------------------------------------------------- //
  function reset(ctx) {
    // Los datos del cliente/fechas son de OTRO documento (p. ej. se venía de
    // Colombia y se entra a Chile, o viceversa): siempre se parte en blanco.
    $("customer_id").value = "";
    $("fecha_inicio").value = "";
    $("fecha_fin").value = "";
    $("pais").value = ctx.pais;
    $("tipo_documento").value = ctx.tipo;
    // Vinculados solo para documentos que los admiten (no en Colombia).
    $("vinc-zona").hidden = !ctx.usaVinculados;
    $("vinculados").value = "";
    $("vinc-box").hidden = true;
    $("btn-add-vinc").hidden = false;
    resetSegmento();   // el tipo de cliente (B2B/B2C) es de OTRO documento
    if (ctx.segmentoFijo) aplicarSegmentoFijo(ctx.segmentoFijo);
  }

  // ------------------------------------------------------------------- //
  // Registro
  // ------------------------------------------------------------------- //
  var DEF = { contenedor: "form-disponible", init: init, reset: reset };
  // "ros" es el id de formulario que informa el backend: funciona como clave por
  // defecto para cualquier documento que use esta misma pantalla.
  GEREO.registrarFormulario("ros", DEF);
  GEREO.registrarFormulario("Chile|ROS", DEF);
  GEREO.registrarFormulario("Colombia|ROS", DEF);
  GEREO.registrarFormulario("Argentina|ROS", DEF);
})();
