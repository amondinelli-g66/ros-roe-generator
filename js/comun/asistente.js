/* =============================================================================
 * js/comun/asistente.js — el asistente país → documento → datos.
 *
 * Es el "wizard" de la app y NADA más: no conoce ningún formulario en concreto.
 *   - El paso a paso (stepper) y la navegación entre las tres vistas.
 *   - Los botones de país y de documento.
 *   - El banner de resultado, que es único y compartido: por eso lo publica para
 *     que lo usen los formularios (GEREO.mostrarBanner / limpiarBanner /
 *     ocultarBanner).
 *   - El DESPACHO: al elegir un documento busca su formulario en el registro
 *     (GEREO.registrarFormulario, en nucleo.js), muestra su contenedor y le pide
 *     reset(ctx). Antes esto era un `if/else` con los ids form-disponible /
 *     form-roe-chile escritos a mano dentro del mismo archivo.
 *
 * Es el ÚLTIMO script de la lista en index.html: cuando se ejecuta, todos los
 * formularios ya se registraron. Se inicializa una sola vez y solo con la sesión
 * activa: lo llama nucleo.js (entrarApp -> GEREO.iniciarAsistente), igual que
 * antes hacía con initWizard().
 * ========================================================================== */
(function () {
  "use strict";

  var GEREO = window.GEREO;
  var $ = GEREO.$;

  var banner = $("banner");
  var viewPais = $("view-pais"), viewTipo = $("view-tipo"), viewForm = $("view-form");

  var paisSel = null, tipoSel = null;
  // Fuente de verdad de disponibilidad: backend (/config -> core.documentos).
  var DISPONIBLES = new Set();
  // Documentos que admiten vinculados (Colombia reporta un único ID -> sin vinculados).
  var USA_VINC = new Set();
  // Documentos que admiten UN solo segmento (p. ej. Argentina · ROS: solo B2C).
  // Lo declara el backend en /config -> documentos[].segmento_fijo, para no
  // hardcodear países acá.
  var SEGMENTO_FIJO = {};
  // Qué formulario muestra cada documento: "ros" (estándar) o "roe-chile", etc.
  var FORMULARIOS = {};
  // Formulario cuando el backend no dice otra cosa: espejo exacto del
  // `FORMULARIOS[clave] || "ros"` que había en app.js.
  var FORMULARIO_POR_DEFECTO = "ros";

  // ------------------------------------------------------------------- //
  // Banner de resultado (compartido con los formularios)
  // ------------------------------------------------------------------- //
  function limpiarBanner() { banner.className = "banner"; banner.innerHTML = ""; }

  // Solo lo oculta, SIN borrar su contenido. Es lo que hacían literalmente dos
  // puntos del código original (`banner.className = "banner"`): al volver a un
  // paso del stepper y al empezar un análisis ROS.
  function ocultarBanner() { banner.className = "banner"; }

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

  function mostrarVista(v) {
    [viewPais, viewTipo, viewForm].forEach(function (x) { x.hidden = true; });
    v.hidden = false;
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------- //
  // Paso a paso (país → documento → datos): resume la selección hecha en
  // cada paso y permite volver a uno ya completado con un clic (los pasos
  // futuros no son clicables).
  // ------------------------------------------------------------------- //
  var STEP_ORDER = ["pais", "tipo", "form"];
  var STEP_LABELS_BASE = { pais: "País", tipo: "Documento", form: "Datos" };
  var stepEls = {
    pais: document.querySelector('.step[data-step="pais"]'),
    tipo: document.querySelector('.step[data-step="tipo"]'),
    form: document.querySelector('.step[data-step="form"]'),
  };
  var stepLineEls = [
    document.querySelector('.step-line[data-line="0"]'),
    document.querySelector('.step-line[data-line="1"]'),
  ];

  function actualizarStepper(actual) {
    var idxActual = STEP_ORDER.indexOf(actual);
    STEP_ORDER.forEach(function (key, i) {
      var el = stepEls[key];
      if (!el) return;
      el.classList.remove("done", "active", "todo");
      var etiqueta = el.querySelector(".step-label");
      if (i < idxActual) {
        el.classList.add("done");
        etiqueta.textContent = (key === "pais" ? paisSel : key === "tipo" ? tipoSel : null) || STEP_LABELS_BASE[key];
      } else if (i === idxActual) {
        el.classList.add("active");
        etiqueta.textContent = STEP_LABELS_BASE[key];
      } else {
        el.classList.add("todo");
        etiqueta.textContent = STEP_LABELS_BASE[key];
      }
    });
    stepLineEls.forEach(function (line, i) { if (line) line.classList.toggle("done", i < idxActual); });
  }

  // ------------------------------------------------------------------- //
  // Despacho: qué formulario le corresponde al documento elegido
  // ------------------------------------------------------------------- //
  // Dos niveles de búsqueda en el registro, en este orden:
  //   1) la clave exacta del documento ("Chile|ROS", "Chile|ROE", …);
  //   2) el id de formulario que informa el backend en /config
  //      (documentos[].formulario), con "ros" por defecto.
  // El segundo nivel es el que conserva el comportamiento original: un país
  // nuevo que reutilice el formulario ROS estándar funciona en cuanto el backend
  // lo declara disponible, sin tener que registrar su clave acá.
  function buscarFormulario(clave) {
    return GEREO.formularioRegistrado(clave)
      || GEREO.formularioRegistrado(FORMULARIOS[clave] || FORMULARIO_POR_DEFECTO)
      || GEREO.formularioRegistrado(FORMULARIO_POR_DEFECTO);
  }

  function ocultarFormularios() {
    GEREO.formulariosRegistrados().forEach(function (def) {
      var cont = def.contenedor ? $(def.contenedor) : null;
      if (cont) cont.hidden = true;
    });
  }

  // ------------------------------------------------------------------- //
  // Inicialización (una sola vez, con la sesión ya activa)
  // ------------------------------------------------------------------- //
  function iniciarAsistente() {
    actualizarStepper("pais");   // estado inicial: paso 1 activo, 2 y 3 pendientes

    Object.keys(stepEls).forEach(function (key) {
      var el = stepEls[key];
      if (!el) return;
      el.addEventListener("click", function () {
        if (!el.classList.contains("done")) return;
        ocultarBanner();
        if (key === "pais") { paisSel = null; tipoSel = null; mostrarVista(viewPais); actualizarStepper("pais"); }
        else if (key === "tipo") { tipoSel = null; mostrarVista(viewTipo); actualizarStepper("tipo"); }
      });
    });

    document.querySelectorAll("[data-pais]").forEach(function (b) {
      b.addEventListener("click", function () {
        paisSel = b.dataset.pais; tipoSel = null;
        mostrarVista(viewTipo);
        actualizarStepper("tipo");
      });
    });

    document.querySelectorAll("[data-tipo]").forEach(function (b) {
      b.addEventListener("click", function () {
        tipoSel = b.dataset.tipo;
        var clave = paisSel + "|" + tipoSel;
        var disponible = DISPONIBLES.has(clave);
        var def = disponible ? buscarFormulario(clave) : null;

        ocultarFormularios();
        // no-disponible solo si NO hay generador (o si el documento está
        // disponible pero ningún formulario quedó registrado para él: eso sería
        // un fallo de carga, y es mejor que se vea).
        $("form-no-disponible").hidden = disponible && !!def;

        // Un análisis guardado corresponde a la combinación país/tipo anterior:
        // ya no aplica al cambiar de documento. #btn-ver-analisis es del
        // formulario ROS, pero se apaga desde acá —igual que antes— porque el
        // cambio de documento invalida cualquier análisis pendiente.
        GEREO.borrarAnalisis();
        $("btn-ver-analisis").hidden = true;

        if (def) {
          var cont = def.contenedor ? $(def.contenedor) : null;
          if (cont) cont.hidden = false;
          // El formulario se deja en blanco: los datos que tuviera son de OTRO
          // documento. usaVinculados viaja en el contexto porque sale de /config
          // (lo lee el asistente) pero lo aplica el formulario.
          if (def.reset) {
            def.reset({
              pais: paisSel, tipo: tipoSel, clave: clave,
              usaVinculados: USA_VINC.has(clave),
              segmentoFijo: SEGMENTO_FIJO[clave] || null,
            });
          }
        } else {
          $("no-disp-doc").textContent = tipoSel;
          $("no-disp-pais").textContent = paisSel;
          if (disponible) {
            console.error("GEREO: el backend declara disponible " + clave +
              " pero no hay formulario registrado para ese documento.");
          }
        }
        limpiarBanner();
        mostrarVista(viewForm);
        actualizarStepper("form");
      });
    });

    // Disponibilidad y formulario de cada documento: los informa el backend.
    // La llamada a /config está memoizada en nucleo.js — los formularios piden
    // la misma promesa para su parte, así que sigue habiendo un solo request.
    GEREO.configuracion().then(function (cfg) {
      if (cfg && Array.isArray(cfg.documentos)) {
        DISPONIBLES = new Set(cfg.documentos.filter(function (d) { return d.disponible; })
          .map(function (d) { return d.pais + "|" + d.tipo; }));
        USA_VINC = new Set(cfg.documentos.filter(function (d) { return d.usa_vinculados; })
          .map(function (d) { return d.pais + "|" + d.tipo; }));
        FORMULARIOS = {};
        SEGMENTO_FIJO = {};
        cfg.documentos.forEach(function (d) {
          FORMULARIOS[d.pais + "|" + d.tipo] = d.formulario || "ros";
          if (d.segmento_fijo) SEGMENTO_FIJO[d.pais + "|" + d.tipo] = d.segmento_fijo;
        });
      }
    }).catch(function () {});

    // Cableado de una sola vez de cada formulario (antes: todo seguido dentro de
    // initWizard). Se recorre la lista de definiciones ÚNICAS, así que el ROS
    // estándar se inicializa una vez aunque esté registrado bajo tres claves.
    GEREO.formulariosRegistrados().forEach(function (def) {
      if (def.init) def.init();
    });
  }

  // ------------------------------------------------------------------- //
  // Superficie pública
  // ------------------------------------------------------------------- //
  GEREO.iniciarAsistente = iniciarAsistente;
  GEREO.mostrarBanner = mostrarBanner;
  GEREO.limpiarBanner = limpiarBanner;
  GEREO.ocultarBanner = ocultarBanner;
})();
