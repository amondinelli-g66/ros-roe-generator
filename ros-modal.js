/* =============================================================================
 * ros-modal.js — modal de revisión/edición del ROS antes de descargar el PDF.
 *
 * Muestra TODOS los campos que van al PDF (esquema fijo por documento, espejo
 * exacto de core.paises.<pais>.ros.{ros_fields,fields}.construir_ros_doc y de
 * su plantilla Jinja2) como inputs editables, con validación de FORMATO en
 * vivo (no de contenido: eso lo decide el analista).
 *
 * API expuesta (usada por app.js):
 *   RosModal.abrir(doc, ctx, callbacks)
 *     doc: el ros_doc (se muta in-place con cada edición)
 *     ctx: {pais, tipoDocumento, customerId}
 *     callbacks: {onChange(doc), onDescargar(doc, ctx)}
 *   RosModal.cerrar()
 *   RosModal.setMensaje(texto, esError)
 *
 * No conoce sessionStorage ni el backend: eso lo maneja app.js vía los
 * callbacks. Construye el DOM con createElement (no innerHTML) porque los
 * valores vienen de la base de datos y pueden traer caracteres especiales.
 * ========================================================================== */
(function () {
  "use strict";

  var backdrop = document.getElementById("modal-backdrop");
  var modal = document.getElementById("modal-analisis");
  var body = document.getElementById("modal-body");
  var tagsEl = document.getElementById("modal-tags");
  var msgEl = document.getElementById("modal-msg");
  var btnCerrarX = document.getElementById("modal-cerrar");
  var btnCancelar = document.getElementById("modal-cancelar");
  var btnDescargar = document.getElementById("modal-descargar");

  var _doc = null, _ctx = null, _callbacks = {};

  // ------------------------------------------------------------------- //
  // Utilidades
  // ------------------------------------------------------------------- //
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      if (k === "class") e.className = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];   // solo para contenido fijo (no datos)
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  function obtener(doc, path) {
    var partes = path.split("."), cur = doc;
    for (var i = 0; i < partes.length; i++) {
      if (cur == null) return undefined;
      cur = cur[partes[i]];
    }
    return cur;
  }
  function asignar(doc, path, valor) {
    var partes = path.split("."), cur = doc;
    for (var i = 0; i < partes.length - 1; i++) {
      if (cur[partes[i]] == null || typeof cur[partes[i]] !== "object") cur[partes[i]] = {};
      cur = cur[partes[i]];
    }
    cur[partes[partes.length - 1]] = valor;
  }

  // ------------------------------------------------------------------- //
  // Validadores de FORMATO (no de contenido)
  // ------------------------------------------------------------------- //
  function limpiarRut(v) {
    var s = String(v || "").trim().toUpperCase().replace(/[.\-\s]/g, "");
    if (s.length < 2) return { cuerpo: "", dv: "" };
    return { cuerpo: s.slice(0, -1), dv: s.slice(-1) };
  }
  function dvModulo11(cuerpo) {
    var suma = 0, factor = 2;
    for (var i = cuerpo.length - 1; i >= 0; i--) {
      suma += parseInt(cuerpo.charAt(i), 10) * factor;
      factor = factor === 7 ? 2 : factor + 1;
    }
    var resto = 11 - (suma % 11);
    if (resto === 11) return "0";
    if (resto === 10) return "K";
    return String(resto);
  }
  function validarRut(v) {
    var p = limpiarRut(v);
    if (!/^\d+$/.test(p.cuerpo) || !p.dv) return false;
    return p.dv === dvModulo11(p.cuerpo);
  }
  function validarFecha(v, sep) {
    var re = sep === "-" ? /^(\d{2})-(\d{2})-(\d{4})$/ : /^(\d{2})\/(\d{2})\/(\d{4})$/;
    var m = re.exec(v);
    if (!m) return false;
    var d = +m[1], mo = +m[2];
    return d >= 1 && d <= 31 && mo >= 1 && mo <= 12;
  }
  function validarEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }
  function validarLista(v, maxPorLinea) {
    // El doc guarda las listas como array (una entrada por línea del textarea);
    // se valida siempre como array, no como string.
    if (!maxPorLinea) return true;
    var arr = Array.isArray(v) ? v : [];
    return arr.every(function (l) { return String(l).length <= maxPorLinea; });
  }

  // Avisos que son ruido de implementación (VPN, procedencia de la IA) y no le
  // sirven al analista para revisar el documento: se ocultan del modal (el
  // proyecto ya decidió no revelar procedencia de IA en el PDF; esto aplica
  // el mismo criterio acá).
  var ADVERTENCIAS_OCULTAS = [/^VPN:/, /^Textos narrativos redactados con IA/];
  function advertenciasVisibles(lista) {
    return (lista || []).filter(function (a) {
      return !ADVERTENCIAS_OCULTAS.some(function (re) { return re.test(a); });
    });
  }

  // ------------------------------------------------------------------- //
  // Esquema — Chile · ROS (espejo de ros_fields.py y ros_template.html)
  // ------------------------------------------------------------------- //
  var OPT_TRANSACCION_PUNTUAL = "Una transacción puntual realizada por el/los reportado(s)";
  var OPT_CONJUNTO_OPERACIONES = "Un conjunto de operaciones inusuales realizada por el/los reportado(s)";
  var OPT_GATILLO_NEGOCIOS = "Alerta informada por personal que se desempeña en los procesos de negocios";

  function identidadFieldsChile(prefix) {
    var esNatural = function (doc) { return obtener(doc, prefix + ".tipo_persona") === "Natural"; };
    var esJuridica = function (doc) { return obtener(doc, prefix + ".tipo_persona") === "Jurídica"; };
    var esNacional = function (doc) { return obtener(doc, prefix + ".tipo_identificacion") === "Nacional (RUN/RUT)"; };
    return [
      { path: prefix + ".esta_persona_es", label: "¿Esta persona es?", type: "select", options: ["Reportado", "Vinculado"] },
      { path: prefix + ".tipo_persona", label: "Tipo persona", type: "select", options: ["Natural", "Jurídica"] },
      { path: prefix + ".nombre_o_razon_social", label: "Nombre o razón social", type: "text", full: true },
      { path: prefix + ".apellido_paterno", label: "Apellido paterno", type: "text", showIf: esNatural },
      { path: prefix + ".apellido_materno", label: "Apellido materno", type: "text", showIf: esNatural },
      { path: prefix + ".tipo_identificacion", label: "Tipo identificación", type: "select", options: ["Nacional (RUN/RUT)", "Extranjera"] },
      {
        path: prefix + ".numero_id", label: "Número ID", type: "text",
        validate: function (v, doc) { return !v || !esNacional(doc) || validarRut(v); },
        errMsg: "No supera el dígito verificador (módulo 11). Revisa el RUT/RUN.",
      },
      { path: prefix + ".nacionalidad", label: "Nacionalidad", type: "text", showIf: esNatural },
      { path: prefix + ".pais_residencia", label: "País de residencia", type: "text", showIf: esNatural },
      { path: prefix + ".pais_constitucion", label: "País de constitución", type: "text", showIf: esJuridica },
      { path: prefix + ".pais_funcionamiento", label: "País de funcionamiento", type: "text", showIf: esJuridica },
      { grupoTitulo: "Dirección" },
      { path: prefix + ".direccion.tipo_direccion", label: "Tipo dirección", type: "select", options: ["Conocida", "Desconocida"] },
      { path: prefix + ".direccion.tipo_calle", label: "Tipo calle", type: "text" },
      { path: prefix + ".direccion.nombre_calle", label: "Nombre calle (MAYÚSCULAS)", type: "text", max: 50 },
      { path: prefix + ".direccion.numero", label: "N°", type: "text" },
      { path: prefix + ".direccion.complemento", label: "Complemento", type: "text" },
      { path: prefix + ".direccion.region", label: "Región", type: "text" },
      { path: prefix + ".direccion.comuna", label: "Comuna", type: "text" },
      { path: prefix + ".direccion.codigo_postal", label: "Código postal", type: "text" },
      {
        path: prefix + ".direccion.telefono", label: "Teléfono", type: "text",
        disabledIf: function (doc) { return !!obtener(doc, prefix + ".direccion.telefono_sin_info"); },
      },
      { path: prefix + ".direccion.telefono_sin_info", label: "Sin información (teléfono)", type: "checkbox", clears: prefix + ".direccion.telefono" },
      {
        path: prefix + ".direccion.movil", label: "Móvil", type: "text",
        disabledIf: function (doc) { return !!obtener(doc, prefix + ".direccion.movil_sin_info"); },
      },
      { path: prefix + ".direccion.movil_sin_info", label: "Sin información (móvil)", type: "checkbox", clears: prefix + ".direccion.movil" },
      {
        path: prefix + ".direccion.email", label: "Email", type: "text",
        disabledIf: function (doc) { return !!obtener(doc, prefix + ".direccion.email_sin_info"); },
        validate: function (v) { return !v || validarEmail(v); }, errMsg: "Formato de email inválido.",
      },
      { path: prefix + ".direccion.email_sin_info", label: "Sin información (email)", type: "checkbox", clears: prefix + ".direccion.email" },
      { grupoTitulo: "Antecedentes" },
      { path: prefix + ".actividad_economica", label: "Actividad económica (una por línea)", type: "list", full: true },
      { path: prefix + ".informacion_adicional_actividad", label: "Información adicional de la actividad", type: "textarea", max: 4000, full: true },
    ];
  }

  function schemaChile() {
    return [
      {
        titulo: "Paso 1 — Antecedentes de la(s) operación(es) sospechosa(s)",
        campos: [
          { path: "paso1.tipo_reporte", label: "Tipo de reporte", type: "select", options: ["Lavado de Activos", "Financiamiento del Terrorismo", "Ambos"] },
          { path: "paso1.vinculado_reporte_anterior", label: "¿Vinculado a un reporte anterior?", type: "select", options: ["Sí", "No"] },
          {
            path: "paso1.referencia_ultimo_ros", label: "Referencia último ROS", type: "text", full: true,
            showIf: function (doc) { return obtener(doc, "paso1.vinculado_reporte_anterior") === "Sí"; },
          },
          { path: "paso1.reporte_corresponde_a", label: "El reporte corresponde a", type: "select", full: true,
            options: [OPT_TRANSACCION_PUNTUAL, OPT_CONJUNTO_OPERACIONES] },
          { path: "paso1.fecha_puntual", label: "Fecha (DD/MM/AAAA)", type: "text",
            validate: function (v) { return !v || validarFecha(v, "/"); }, errMsg: "Formato esperado: DD/MM/AAAA.",
            showIf: function (doc) { return obtener(doc, "paso1.reporte_corresponde_a") === OPT_TRANSACCION_PUNTUAL; } },
          { path: "paso1.desde", label: "Desde (DD/MM/AAAA)", type: "text",
            validate: function (v) { return !v || validarFecha(v, "/"); }, errMsg: "Formato esperado: DD/MM/AAAA.",
            showIf: function (doc) { return obtener(doc, "paso1.reporte_corresponde_a") === OPT_CONJUNTO_OPERACIONES; } },
          { path: "paso1.hasta", label: "Hasta (DD/MM/AAAA)", type: "text",
            validate: function (v) { return !v || validarFecha(v, "/"); }, errMsg: "Formato esperado: DD/MM/AAAA.",
            showIf: function (doc) { return obtener(doc, "paso1.reporte_corresponde_a") === OPT_CONJUNTO_OPERACIONES; } },
          { path: "paso1.cantidad_operaciones", label: "Cantidad de operaciones", type: "text",
            validate: function (v) { return !v || /^\d+$/.test(String(v)); }, errMsg: "Solo dígitos.",
            showIf: function (doc) { return obtener(doc, "paso1.reporte_corresponde_a") === OPT_CONJUNTO_OPERACIONES; } },
          { path: "paso1.monto", label: "Monto (CLP, entero sin puntos ni comas)", type: "text",
            validate: function (v) { return !v || /^\d+$/.test(String(v)); }, errMsg: "Solo dígitos, sin puntos ni comas." },
          { path: "paso1.productos", label: "Productos financieros/no financieros utilizados (uno por línea)", type: "list", full: true },
          { path: "paso1.texto_1", label: "1.- Descripción de los hechos en orden cronológico", type: "textarea", min: 250, max: 1000, full: true },
          { path: "paso1.texto_2", label: "2.- Qué se consideró sospechoso para enviar el ROS", type: "textarea", min: 250, max: 500, full: true },
          { path: "paso1.gatillo_alerta", label: "¿Cómo se originó la alerta?", type: "select", full: true,
            options: ["Alerta automática del sistema informático de cumplimiento", OPT_GATILLO_NEGOCIOS, "Prensa/medios de comunicación", "Otro"] },
          { path: "paso1.gatillo_alerta_otro", label: "Indique cuál (Otro)", type: "text", full: true,
            showIf: function (doc) { return obtener(doc, "paso1.gatillo_alerta") === "Otro"; } },
          { path: "paso1.periodo_analisis_desde", label: "Período de análisis — Desde (DD/MM/AAAA)", type: "text",
            validate: function (v) { return !v || validarFecha(v, "/"); }, errMsg: "Formato esperado: DD/MM/AAAA." },
          { path: "paso1.periodo_analisis_hasta", label: "Hasta (DD/MM/AAAA)", type: "text",
            validate: function (v) { return !v || validarFecha(v, "/"); }, errMsg: "Formato esperado: DD/MM/AAAA." },
        ],
      },
      { titulo: "Paso 2 — Identificación del(los) reportado(s)", campos: identidadFieldsChile("paso2") },
      { titulo: "Vinculados — Personas vinculadas al reportado", vinculados: true },
      {
        titulo: "Paso 3 — Adjuntar archivos en formato digital",
        campos: [
          { path: "paso3.descripcion", label: "Descripción", type: "text", max: 40, full: true },
          { path: "paso3.tipo_producto", label: "Tipo Producto", type: "text" },
        ],
      },
      { titulo: "Anexo A — Señales de alerta evaluadas", reglas: true },
    ];
  }

  // ------------------------------------------------------------------- //
  // Esquema — Colombia · ROS (espejo de fields.py y ros_colombia_template.html)
  // ------------------------------------------------------------------- //
  function schemaColombia(doc) {
    var secciones = [
      {
        titulo: "1 — Información general del reporte",
        campos: [
          { path: "info_general.numero_reporte", label: "Número de reporte", type: "text" },
          { path: "info_general.clase_reporte", label: "Clase de reporte", type: "select",
            options: ["Reporte inicial", "Corrección a reporte anterior", "Adición a reporte anterior"] },
        ],
      },
    ];

    if (obtener(doc, "persona_juridica.aplica")) {
      secciones.push({
        titulo: "2 — Persona jurídica",
        campos: [
          { path: "persona_juridica.tipo_identificacion", label: "Tipo identificación", type: "select",
            options: ["NIT", "Sociedad extranjera sin NIT en Colombia"] },
          { path: "persona_juridica.numero_identificacion", label: "Nro. identificación", type: "text" },
          { path: "persona_juridica.razon_social", label: "Razón social", type: "text", full: true },
          { path: "persona_juridica.rol", label: "Rol en la operación", type: "text", full: true },
          { grupoTitulo: "Representante legal" },
          { path: "persona_juridica.representante.nombre", label: "Nombre", type: "text" },
          { path: "persona_juridica.representante.primer_apellido", label: "Primer apellido", type: "text" },
          { path: "persona_juridica.representante.segundo_apellido", label: "Segundo apellido", type: "text" },
          { path: "persona_juridica.representante.tipo_identificacion", label: "Tipo identificación", type: "text" },
          { path: "persona_juridica.representante.numero_identificacion", label: "Nro. identificación", type: "text" },
          { path: "persona_juridica.representante.pep", label: "Representante legal PEP", type: "select", options: ["SI", "NO"] },
        ],
      });
    } else {
      secciones.push({ titulo: "2 — Persona jurídica", avisoFijo: obtener(doc, "persona_juridica.mensaje") });
    }

    if (obtener(doc, "persona_natural.aplica")) {
      secciones.push({
        titulo: "3 — Persona natural",
        campos: [
          { path: "persona_natural.tipo_identificacion", label: "Tipo identificación", type: "text" },
          { path: "persona_natural.identificacion", label: "Identificación", type: "text" },
          { path: "persona_natural.nombres", label: "Nombres", type: "text", full: true },
          { path: "persona_natural.primer_apellido", label: "Primer apellido", type: "text" },
          { path: "persona_natural.segundo_apellido", label: "Segundo apellido", type: "text" },
          { path: "persona_natural.entidad", label: "Entidad", type: "text" },
          { path: "persona_natural.rol", label: "Rol en la operación", type: "text" },
          { path: "persona_natural.pep", label: "Persona PEP", type: "select", options: ["SI", "NO"] },
        ],
      });
    } else {
      secciones.push({ titulo: "3 — Persona natural", avisoFijo: obtener(doc, "persona_natural.mensaje") });
    }

    secciones.push({
      titulo: "4 — Detalle",
      campos: [
        { path: "detalle.periodo_desde", label: "Período de análisis — Desde (DD-MM-AAAA)", type: "text",
          validate: function (v) { return !v || validarFecha(v, "-"); }, errMsg: "Formato esperado: DD-MM-AAAA." },
        { path: "detalle.periodo_hasta", label: "Hasta (DD-MM-AAAA)", type: "text",
          validate: function (v) { return !v || validarFecha(v, "-"); }, errMsg: "Formato esperado: DD-MM-AAAA." },
        { path: "detalle.descripcion", label: "Descripción de la operación sospechosa", type: "textarea", full: true },
        { path: "detalle.tematica", label: "Temática (delito fuente)", type: "text" },
        { path: "detalle.senales_alerta", label: "Señales de alerta (una por línea, máx. 200 caracteres cada una)", type: "list", full: true,
          validate: function (v) { return validarLista(v, 200); }, errMsg: "Cada línea debe tener 200 caracteres o menos." },
        { path: "detalle.valor_transaccion", label: "Valor de la transacción (sin puntos ni comas)", type: "text",
          validate: function (v) { return !v || /^\d+$/.test(String(v)); }, errMsg: "Solo dígitos, sin puntos ni comas." },
        { path: "detalle.moneda", label: "Moneda", type: "text" },
        { path: "detalle.notifico_autoridad", label: "¿Notificó a otra autoridad?", type: "checkbox" },
        { path: "detalle.personas_solicitadas", label: "¿Las personas fueron solicitadas por alguna entidad competente?", type: "checkbox" },
        { path: "detalle.documentos_soporte", label: "¿Documentos de soporte de la operación sospechosa?", type: "checkbox" },
      ],
    });

    secciones.push({ titulo: "Anexo A — Señales de alerta evaluadas", reglas: true });
    return secciones;
  }

  // ------------------------------------------------------------------- //
  // Render genérico de un campo
  // ------------------------------------------------------------------- //
  function evaluarCampo(campo, doc) {
    var valor = obtener(doc, campo.path);
    if (campo.validate) return !!campo.validate(valor == null ? "" : valor, doc);
    if (campo.type === "textarea" || campo.type === "text") {
      var s = String(valor == null ? "" : valor);
      if (campo.min && s.length > 0 && s.length < campo.min) return false;
      if (campo.max && s.length > campo.max) return false;
    }
    return true;
  }

  function actualizarVisibilidad(wrapper, campo, doc) {
    if (campo.showIf) wrapper.hidden = !campo.showIf(doc);
    var input = wrapper.querySelector("input,textarea,select");
    if (input && campo.disabledIf) input.disabled = !!campo.disabledIf(doc);
  }

  function crearCampo(campo, doc, ctx) {
    var esCheckbox = campo.type === "checkbox";
    var wrapper = el("div", { class: "campo" + (campo.full ? " full" : "") + (esCheckbox ? " campo-check" : "") });
    var label = el("label", { for: "f_" + campo.path, text: campo.label });
    var input;
    var valorActual = obtener(doc, campo.path);

    if (campo.type === "select") {
      input = el("select", { id: "f_" + campo.path });
      (campo.options || []).forEach(function (op) {
        input.appendChild(el("option", { value: op, text: op }));
      });
      input.value = valorActual || "";
    } else if (campo.type === "textarea" || campo.type === "list") {
      input = el("textarea", { id: "f_" + campo.path, rows: campo.type === "list" ? 3 : 5 });
      input.value = campo.type === "list" ? (Array.isArray(valorActual) ? valorActual.join("\n") : "") : (valorActual || "");
      if (campo.max) {
        label.appendChild(el("span", { class: "contador", text: "(" + input.value.length + " / " + (campo.min ? campo.min + "–" : "") + campo.max + ")" }));
      }
    } else if (esCheckbox) {
      input = el("input", { type: "checkbox", id: "f_" + campo.path });
      input.checked = !!valorActual;
    } else {
      input = el("input", { type: "text", id: "f_" + campo.path });
      input.value = valorActual == null ? "" : valorActual;
    }

    var err = el("div", { class: "campo-err", text: campo.errMsg || "Formato inválido." });
    if (esCheckbox) {
      wrapper.appendChild(input);
      wrapper.appendChild(label);
    } else {
      wrapper.appendChild(label);
      wrapper.appendChild(input);
    }
    wrapper.appendChild(err);

    function onCambio() {
      var v;
      if (campo.type === "checkbox") v = input.checked;
      else if (campo.type === "list") v = input.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
      else v = input.value;
      asignar(doc, campo.path, v);

      if (campo.clears && input.checked) {
        asignar(doc, campo.clears, "");
        var otro = body.querySelector('[id="f_' + campo.clears + '"]');
        if (otro) otro.value = "";
      }
      if (campo.max && campo.type !== "checkbox" && campo.type !== "select") {
        var contador = label.querySelector(".contador");
        if (contador) contador.textContent = "(" + input.value.length + " / " + (campo.min ? campo.min + "–" : "") + campo.max + ")";
      }

      var ok = evaluarCampo(campo, doc);
      wrapper.classList.toggle("invalid", !ok);

      revisarCondicionales(doc);
      actualizarBotonDescargar();
      if (_callbacks.onChange) _callbacks.onChange(doc);
    }

    input.addEventListener(campo.type === "select" || campo.type === "checkbox" ? "change" : "input", onCambio);

    if (!evaluarCampo(campo, doc)) wrapper.classList.add("invalid");
    actualizarVisibilidad(wrapper, campo, doc);
    wrapper.dataset.campoPath = campo.path;
    return wrapper;
  }

  var _camposRenderizados = [];   // [{wrapper, campo}] de la vista actual, para revisar condicionales

  function revisarCondicionales(doc) {
    _camposRenderizados.forEach(function (item) { actualizarVisibilidad(item.wrapper, item.campo, doc); });
  }

  function actualizarBotonDescargar() {
    var invalidos = body.querySelectorAll(".campo.invalid").length;
    btnDescargar.disabled = invalidos > 0;
  }

  // ------------------------------------------------------------------- //
  // Render de secciones (identidad reutilizable, vinculados, reglas)
  // ------------------------------------------------------------------- //
  function renderCampos(contenedor, campos, doc) {
    var grid = el("div", { class: "campos-grid" });
    campos.forEach(function (campo) {
      if (campo.grupoTitulo) {
        contenedor.appendChild(grid);
        contenedor.appendChild(el("div", { class: "grupo-titulo", text: campo.grupoTitulo }));
        grid = el("div", { class: "campos-grid" });
        return;
      }
      var wrapper = crearCampo(campo, doc, _ctx);
      _camposRenderizados.push({ wrapper: wrapper, campo: campo });
      grid.appendChild(wrapper);
    });
    contenedor.appendChild(grid);
  }

  function renderVinculados(contenedor, doc) {
    var lista = doc.vinculados || [];
    if (!lista.length) {
      contenedor.appendChild(el("div", { class: "aviso-fijo", text: "No se ingresaron vinculados para este reporte." }));
      return;
    }
    lista.forEach(function (v, i) {
      var card = el("div", { class: "vinc-card" });
      var head = el("div", { class: "vinc-titulo" });
      head.appendChild(el("strong", { text: "Vinculado " + (i + 1) }));
      head.appendChild(el("span", { class: "pill2", text: "ID: " + v.customer_id }));
      card.appendChild(head);
      if (!v.encontrado) {
        card.appendChild(el("div", { class: "aviso-fijo",
          text: "No se encontró este ID en la base de datos; no se pudo completar su identidad." }));
      } else {
        renderCampos(card, identidadFieldsChile("vinculados." + i), doc);
      }
      contenedor.appendChild(card);
    });
  }

  function renderReglas(contenedor, doc) {
    var reglas = doc.reglas || [];
    var gatilladas = reglas.filter(function (r) { return r.gatillada; }).length;
    var card = el("div", { class: "reglas-card" });
    var det = el("details");
    var resumen = el("summary", { text: "Ver detalle " });
    resumen.appendChild(el("span", { class: "reglas-conteo" + (gatilladas ? " hay" : ""),
      text: gatilladas + " / " + reglas.length + " gatilladas" }));
    det.appendChild(resumen);
    reglas.forEach(function (r) {
      var linea = el("div", { class: "r" + (r.gatillada ? " on" : "") });
      linea.appendChild(el("span", { class: "punto " + (r.gatillada ? "si" : "no") }));
      linea.appendChild(document.createTextNode(r.titulo + (r.detalle ? " — " + r.detalle : "")));
      det.appendChild(linea);
    });
    card.appendChild(det);
    contenedor.appendChild(card);
  }

  // ------------------------------------------------------------------- //
  // Construcción del cuerpo del modal
  // ------------------------------------------------------------------- //
  // "Paso 1 — Antecedentes..." -> <h3><span class="seccion-badge">Paso 1</span>Antecedentes...</h3>
  function crearTituloSeccion(texto) {
    var h3 = el("h3", { class: "seccion-titulo" });
    var idx = texto.indexOf(" — ");
    if (idx === -1) {
      h3.textContent = texto;
      return h3;
    }
    h3.appendChild(el("span", { class: "seccion-badge", text: texto.slice(0, idx) }));
    h3.appendChild(document.createTextNode(texto.slice(idx + 3)));
    return h3;
  }

  function construirCuerpo(doc, ctx) {
    body.innerHTML = "";
    _camposRenderizados = [];
    var esquema = ctx.pais === "Colombia" ? schemaColombia(doc) : schemaChile();

    advertenciasVisibles(doc.meta && doc.meta.advertencias).forEach(function (a) {
      body.appendChild(el("div", { class: "aviso-fijo", text: a }));
    });

    esquema.forEach(function (seccion) {
      body.appendChild(crearTituloSeccion(seccion.titulo));
      if (seccion.avisoFijo !== undefined) {
        body.appendChild(el("div", { class: "aviso-fijo", text: seccion.avisoFijo }));
      } else if (seccion.vinculados) {
        renderVinculados(body, doc);
      } else if (seccion.reglas) {
        renderReglas(body, doc);
      } else {
        renderCampos(body, seccion.campos, doc);
      }
    });

    revisarCondicionales(doc);
    actualizarBotonDescargar();
  }

  // ------------------------------------------------------------------- //
  // Abrir / cerrar
  // ------------------------------------------------------------------- //
  function bloquearScrollFondo(bloquear) {
    document.documentElement.style.overflow = bloquear ? "hidden" : "";
    document.body.style.overflow = bloquear ? "hidden" : "";
  }

  function abrir(doc, ctx, callbacks) {
    _doc = doc; _ctx = ctx; _callbacks = callbacks || {};
    tagsEl.innerHTML = "";
    [ctx.tipoDocumento || "ROS", ctx.pais || ""].forEach(function (t) {
      if (t) tagsEl.appendChild(el("span", { class: "pill2", text: t }));
    });
    setMensaje("");
    construirCuerpo(doc, ctx);
    backdrop.className = "show";
    modal.className = "show";
    bloquearScrollFondo(true);
    document.addEventListener("keydown", onEscape);
  }

  function cerrar() {
    backdrop.className = "";
    modal.className = "";
    bloquearScrollFondo(false);
    document.removeEventListener("keydown", onEscape);
  }

  function onEscape(e) { if (e.key === "Escape") cerrar(); }

  function setMensaje(texto, esError) {
    msgEl.textContent = texto || "";
    msgEl.className = esError ? "err" : "";
  }

  btnCerrarX.addEventListener("click", cerrar);
  btnCancelar.addEventListener("click", cerrar);
  backdrop.addEventListener("click", cerrar);
  btnDescargar.addEventListener("click", function () {
    if (btnDescargar.disabled || !_doc || !_callbacks.onDescargar) return;
    _callbacks.onDescargar(_doc, _ctx);
  });

  window.RosModal = { abrir: abrir, cerrar: cerrar, setMensaje: setMensaje };
})();
