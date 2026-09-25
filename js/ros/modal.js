/* =============================================================================
 * js/ros/modal.js — modal de revisión/edición del ROS antes de descargar el PDF.
 *
 * Muestra TODOS los campos que van al PDF como inputs editables, con validación
 * de FORMATO en vivo (no de contenido: eso lo decide el analista). Este archivo
 * es el MOTOR y el cascarón: no sabe qué campos tiene cada país. El esquema de
 * campos de cada documento vive en su propio archivo (js/ros/<pais>/campos.js) y
 * se REGISTRA acá con la clave "<pais>|<tipo de documento>"; antes había un
 * ternario `ctx.pais === "Colombia" ? … : …` escrito a mano en construirCuerpo.
 *
 * API expuesta (usada por js/ros/formulario.js):
 *   RosModal.abrir(doc, ctx, callbacks)
 *     doc: el ros_doc (se muta in-place con cada edición)
 *     ctx: {pais, tipoDocumento, customerId}
 *     callbacks: {onChange(doc), onDescargar(doc, ctx)}
 *   RosModal.cerrar()
 *   RosModal.setMensaje(texto, esError)
 *
 * API para los archivos de campos (se cargan DESPUÉS de este):
 *   RosModal.registrarEsquema("Chile|ROS", fn)   fn(doc, ctx) -> [secciones]
 *   RosModal.obtener(doc, "ruta.al.campo")       lectura por ruta con puntos
 *   RosModal.validadores                         validarRut, validarFecha, …
 *
 * No conoce sessionStorage ni el backend: eso lo maneja el formulario ROS vía los
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
  // Viven acá (y se publican en RosModal.validadores) porque los usan los
  // esquemas de campos de cada país, que están en archivos aparte.
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
  // Registro de esquemas de campos por documento
  // ------------------------------------------------------------------- //
  // Cada js/ros/<pais>/campos.js se registra a sí mismo al cargarse:
  //   RosModal.registrarEsquema("Chile|ROS", schemaChile);
  // La función recibe (doc, ctx) y devuelve el array de secciones. Recibe el doc
  // porque hay esquemas que dependen de su contenido (Colombia decide si muestra
  // la sección de persona jurídica o natural según lo que trajo el backend).
  var ESQUEMAS = {};

  function registrarEsquema(clave, fn) {
    if (!clave || typeof fn !== "function") return;
    ESQUEMAS[clave] = fn;
  }

  function claveEsquema(ctx) {
    // El tipo de documento puede no venir en la respuesta del backend; este modal
    // siempre asumió ROS (mismo criterio que las etiquetas del encabezado).
    return (ctx && ctx.pais ? ctx.pais : "") + "|" + ((ctx && ctx.tipoDocumento) || "ROS");
  }

  // ------------------------------------------------------------------- //
  // Render genérico de un campo
  // ------------------------------------------------------------------- //
  // Un campo "requerido" vacío es inválido SIEMPRE (lo decida o no un
  // `validate` de formato); un campo no requerido y vacío nunca dispara sus
  // validadores de formato (no tiene sentido exigir formato a algo que el
  // analista todavía no completó).
  function campoVacio(campo, valor) {
    if (campo.type === "bloques" || campo.type === "list") {
      return !Array.isArray(valor) || valor.length === 0;
    }
    return valor == null || String(valor).trim() === "";
  }

  function evaluarCampo(campo, doc) {
    var valor = obtener(doc, campo.path);
    // requiredTrue: checkbox que DEBE quedar tildado (p. ej. "el reportado es
    // cliente"), no alcanza con que tenga algún valor.
    if (campo.requiredTrue) return !!valor;
    var vacio = campoVacio(campo, valor);
    if (vacio) return !campo.required;
    if (campo.validate) return !!campo.validate(valor, doc);
    if (campo.type === "bloques") {
      var arr = Array.isArray(valor) ? valor : [];
      if (!campo.maxPorBloque) return true;
      return arr.every(function (l) { return String(l).length <= campo.maxPorBloque; });
    }
    if (campo.type === "textarea" || campo.type === "text") {
      var s = String(valor);
      if (campo.min && s.length < campo.min) return false;
      if (campo.max && s.length > campo.max) return false;
    }
    return true;
  }

  // Mensaje del campo-err: "obligatorio" tiene prioridad sobre el mensaje de
  // formato (campo.errMsg), porque si está vacío no tiene sentido decir "mal
  // formado" — el problema es que falta.
  function mensajeError(campo, doc) {
    var valor = obtener(doc, campo.path);
    if (campo.requiredTrue && !valor) return "Este campo es obligatorio.";
    if (campo.required && campoVacio(campo, valor)) return "Este campo es obligatorio.";
    return campo.errMsg || "Formato inválido.";
  }

  function actualizarVisibilidad(wrapper, campo, doc) {
    if (campo.showIf) {
      var visible = campo.showIf(doc);
      // reservaEspacio: el campo ocupa SIEMPRE su celda del grid (aunque no
      // aplique), en vez de colapsar y correr al campo siguiente a su lugar.
      // Se usa cuando el campo condicional comparte fila con otro fijo (p. ej.
      // "Tipo de instrumento" al lado de "Exteriorización...") y el resto del
      // formulario necesita que esa fila de abajo no se mueva según el valor.
      if (campo.reservaEspacio) {
        wrapper.hidden = false;
        wrapper.classList.toggle("campo-invisible", !visible);
      } else {
        wrapper.hidden = !visible;
      }
    }
    var input = wrapper.querySelector("input,textarea,select");
    if (input && campo.disabledIf) input.disabled = !!campo.disabledIf(doc);
  }

  // A diferencia de actualizarVisibilidad (que corre para CUALQUIER entrada
  // rastreada, incluidos títulos de grupo/sección), esto solo aplica a campos
  // reales con su propio .campo-err — los de tipo "bloques" arman su propio
  // mensaje de error y no participan acá.
  function actualizarValidez(wrapper, campo, doc) {
    if (!campo || !campo.path || campo.type === "bloques") return;
    var ok = evaluarCampo(campo, doc);
    wrapper.classList.toggle("invalid", !ok);
    var err = wrapper.querySelector(".campo-err");
    if (err) err.textContent = mensajeError(campo, doc);
  }

  // Un campo oculto (el suyo propio o el de una sección/grupo ancestro) no
  // debe bloquear la descarga aunque esté marcado inválido: dejó de aplicar.
  // Se camina por los ancestros en vez de mirar el layout (offsetParent)
  // porque esto puede correr ANTES de que el modal se muestre en pantalla.
  function estaOculto(elemento) {
    for (var n = elemento; n && n !== body; n = n.parentElement) {
      if (n.hidden) return true;
      if (n.classList && n.classList.contains("campo-invisible")) return true;
    }
    return false;
  }

  function crearCampo(campo, doc, ctx) {
    var esCheckbox = campo.type === "checkbox";
    var wrapper = el("div", { class: "campo" + (campo.full ? " full" : "") + (esCheckbox ? " campo-check" : "") });
    var esObligatorio = campo.required || campo.requiredTrue;
    var label = el("label", { for: "f_" + campo.path, text: campo.label });
    if (esObligatorio) label.appendChild(el("span", { class: "req-marca", text: " *" }));
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

    var err = el("div", { class: "campo-err", text: mensajeError(campo, doc) });
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

      // Hook del esquema del país (no del modal): un campo puede derivar el
      // valor de OTRO (p. ej. "Monto en letras" a partir de "Monto en pesos").
      // Corre ANTES de revisarCondicionales para que el campo derivado quede
      // validado con su valor nuevo, no con el anterior.
      if (campo.alCambiar) campo.alCambiar(doc, ctx);

      actualizarValidez(wrapper, campo, doc);

      revisarCondicionales(doc);
      actualizarBotonDescargar();
      if (_callbacks.onChange) _callbacks.onChange(doc);
    }

    input.addEventListener(campo.type === "select" || campo.type === "checkbox" ? "change" : "input", onCambio);

    actualizarValidez(wrapper, campo, doc);
    actualizarVisibilidad(wrapper, campo, doc);
    wrapper.dataset.campoPath = campo.path;
    return wrapper;
  }

  // Campo de bloques repetibles (p. ej. señales de alerta): un bloque por alerta,
  // tal cual se ve en el PDF, con botón "quitar" por bloque y "agregar" al final.
  function crearCampoBloques(campo, doc) {
    var wrapper = el("div", { class: "campo full" });
    var label = el("label", { text: campo.label });
    var lista = el("div", { class: "bloques-lista" });
    var btnAgregar = el("button", { type: "button", class: "btn-bloque-agregar", text: "+ Agregar alerta" });
    var err = el("div", { class: "campo-err",
      text: "Cada alerta debe tener " + campo.maxPorBloque + " caracteres o menos." });
    wrapper.appendChild(label);
    wrapper.appendChild(lista);
    wrapper.appendChild(btnAgregar);
    wrapper.appendChild(err);

    function valorActual() {
      var v = obtener(doc, campo.path);
      return Array.isArray(v) ? v.slice() : [];
    }

    function guardar(arr) {
      asignar(doc, campo.path, arr);
      wrapper.classList.toggle("invalid", !evaluarCampo(campo, doc));
      actualizarBotonDescargar();
      if (_callbacks.onChange) _callbacks.onChange(doc);
    }

    function renderBloques() {
      lista.innerHTML = "";
      var arr = valorActual();
      var paraMostrar = arr.length ? arr : [""];   // al menos un bloque para poder escribir
      paraMostrar.forEach(function (texto, idx) {
        var bloque = el("div", { class: "bloque-alerta" + (texto.length > campo.maxPorBloque ? " invalid" : "") });
        var ta = el("textarea", { rows: 2 });
        ta.value = texto;
        var pie = el("div", { class: "bloque-pie" });
        var contador = el("span", { class: "bloque-contador", text: texto.length + " / " + campo.maxPorBloque });
        var btnQuitar = el("button", { type: "button", class: "btn-bloque-quitar", text: "✕ Quitar" });

        ta.addEventListener("input", function () {
          var actuales = valorActual();
          while (actuales.length <= idx) actuales.push("");
          actuales[idx] = ta.value;
          contador.textContent = ta.value.length + " / " + campo.maxPorBloque;
          bloque.classList.toggle("invalid", ta.value.length > campo.maxPorBloque);
          guardar(actuales);
        });
        btnQuitar.addEventListener("click", function () {
          var actuales = valorActual();
          actuales.splice(idx, 1);
          guardar(actuales);
          renderBloques();
        });

        pie.appendChild(contador);
        pie.appendChild(btnQuitar);
        bloque.appendChild(ta);
        bloque.appendChild(pie);
        lista.appendChild(bloque);
      });
    }

    btnAgregar.addEventListener("click", function () {
      var actuales = valorActual();
      actuales.push("");
      guardar(actuales);
      renderBloques();
      var areas = lista.querySelectorAll("textarea");
      if (areas.length) areas[areas.length - 1].focus();
    });

    renderBloques();
    if (!evaluarCampo(campo, doc)) wrapper.classList.add("invalid");
    return wrapper;
  }

  // Campo de SUBGRUPOS repetibles con tope: un bloque de campos por elemento
  // (p. ej. los lugares donde se producen los hechos del ROS de Argentina, que
  // el formulario oficial repite con los sufijos 1, 2 y 3). Se muestra el
  // primero y un botón va revelando los siguientes hasta `campo.max`; una vez
  // alcanzado el tope, el mismo botón revela el campo de texto libre
  // (`campo.extra`) donde va el resto.
  function crearCampoSubgrupos(campo, doc, ctx) {
    var wrapper = el("div", { class: "campo full" });
    var lista = el("div");
    var btnAgregar = el("button", {
      type: "button", class: "btn-bloque-agregar",
      text: campo.textoAgregar || "+ Agregar",
    });
    wrapper.appendChild(lista);
    wrapper.appendChild(btnAgregar);

    var items = obtener(doc, campo.path);
    if (!Array.isArray(items)) items = [];
    var max = Math.min(campo.max || items.length, items.length);

    function tieneDatos(item) {
      return Object.keys(item || {}).some(function (k) {
        if (k === "orden" || k === "etiqueta") return false;
        var v = item[k];
        return v !== "" && v !== false && v != null;
      });
    }

    // Arranca mostrando los que ya traen datos del backend (al menos uno).
    var visibles = 1;
    items.forEach(function (item, i) {
      if (tieneDatos(item)) visibles = Math.max(visibles, i + 1);
    });
    var extraVisible = !!(campo.extra && obtener(doc, campo.extra.path));

    // Al quitar un ítem repetido (o el campo extra) se limpian sus datos: si
    // el analista se arrepiente y lo vuelve a agregar, arranca en blanco en
    // vez de reaparecer con lo que había escrito antes.
    function limpiarItem(indice) {
      campo.subcampos.forEach(function (sub) {
        asignar(doc, campo.path + "." + indice + "." + sub.campo, sub.type === "checkbox" ? false : "");
      });
    }

    function avisarCambio() {
      revisarCondicionales(doc);
      actualizarBotonDescargar();
      if (_callbacks.onChange) _callbacks.onChange(doc);
    }

    function render() {
      lista.innerHTML = "";
      // Se quitan EN SITIO los campos del render anterior (no se reasigna el
      // array: otros puntos del modal guardan la referencia).
      for (var k = _camposRenderizados.length - 1; k >= 0; k--) {
        var r = _camposRenderizados[k];
        if (r.deSubgrupo && r.duenio === campo.path) _camposRenderizados.splice(k, 1);
      }
      items.slice(0, visibles).forEach(function (item, i) {
        var titulo = el("div", {
          class: "grupo-titulo",
          text: item.etiqueta || (campo.etiquetaBase || "") + " " + (i + 1),
        });
        // Solo el ÚLTIMO ítem visible se puede quitar (no tiene sentido dejar
        // un hueco en medio de la secuencia 1/2/3), y nunca el primero: es la
        // base obligatoria del grupo.
        if (i > 0 && i === visibles - 1) {
          var fila = el("div", { class: "grupo-titulo-row" });
          fila.appendChild(titulo);
          var btnQuitarItem = el("button", {
            type: "button", class: "btn-bloque-quitar", text: "✕ Quitar",
          });
          btnQuitarItem.addEventListener("click", function () {
            limpiarItem(visibles - 1);
            visibles -= 1;
            render();
            avisarCambio();
          });
          fila.appendChild(btnQuitarItem);
          lista.appendChild(fila);
        } else {
          lista.appendChild(titulo);
        }
        var grid = el("div", { class: "campos-grid" });
        campo.subcampos.forEach(function (sub) {
          var def = Object.assign({}, sub, { path: campo.path + "." + i + "." + sub.campo });
          // El showIf de un subcampo mira OTRO campo del MISMO ítem (p. ej.
          // "provincia_otro" según "provincia" de esa misma operación), así
          // que recibe (doc, rutaBaseDelItem) en vez de solo (doc) — signature
          // distinta a la de un showIf normal, exclusiva de subgrupos.
          if (sub.showIf) {
            def.showIf = (function (subShowIf, rutaItem) {
              return function (d) { return subShowIf(d, rutaItem); };
            })(sub.showIf, campo.path + "." + i);
          }
          var w = crearCampo(def, doc, ctx);
          _camposRenderizados.push({
            wrapper: w, campo: def, deSubgrupo: true, duenio: campo.path,
          });
          grid.appendChild(w);
        });
        lista.appendChild(grid);
      });
      if (extraVisible && campo.extra) {
        var wExtra = crearCampo(
          Object.assign({}, campo.extra, { full: true }), doc, ctx
        );
        _camposRenderizados.push({
          wrapper: wExtra, campo: campo.extra, deSubgrupo: true, duenio: campo.path,
        });
        lista.appendChild(wExtra);
        var btnQuitarExtra = el("button", {
          type: "button", class: "btn-bloque-quitar", text: "✕ Quitar",
        });
        btnQuitarExtra.addEventListener("click", function () {
          asignar(doc, campo.extra.path, "");
          extraVisible = false;
          render();
          avisarCambio();
        });
        lista.appendChild(btnQuitarExtra);
      }
      var tope = visibles >= max;
      btnAgregar.hidden = tope && extraVisible;
      btnAgregar.textContent = tope
        ? (campo.textoExtra || "+ Agregar más")
        : (campo.textoAgregar || "+ Agregar");
    }

    btnAgregar.addEventListener("click", function () {
      if (visibles < max) visibles += 1;
      else extraVisible = true;
      render();
      avisarCambio();
    });

    render();
    return wrapper;
  }

  var _camposRenderizados = [];   // [{wrapper, campo}] de la vista actual, para revisar condicionales

  function revisarCondicionales(doc) {
    // Corre para TODOS los campos rastreados (no solo el que cambió): un campo
    // puede volverse obligatorio/opcional u ocultarse por OTRO campo distinto
    // del suyo (p. ej. "tipo_instrumento" según "exteriorización_voluntaria").
    _camposRenderizados.forEach(function (item) {
      actualizarVisibilidad(item.wrapper, item.campo, doc);
      actualizarValidez(item.wrapper, item.campo, doc);
    });
  }

  function actualizarBotonDescargar() {
    // Un campo oculto (el suyo o el de una sección/grupo que dejó de aplicar)
    // no debe bloquear la descarga aunque haya quedado marcado inválido.
    var invalidos = Array.prototype.filter.call(
      body.querySelectorAll(".campo.invalid"),
      function (w) { return !estaOculto(w); }
    ).length;
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
        var titulo = el("div", { class: "grupo-titulo", text: campo.grupoTitulo });
        if (campo.showIf) _camposRenderizados.push({ wrapper: titulo, campo: campo });
        contenedor.appendChild(titulo);
        grid = el("div", { class: "campos-grid" });
        return;
      }
      if (campo.type === "bloques") {
        contenedor.appendChild(grid);
        var wrapperBloques = crearCampoBloques(campo, doc);
        _camposRenderizados.push({ wrapper: wrapperBloques, campo: campo });
        contenedor.appendChild(wrapperBloques);
        grid = el("div", { class: "campos-grid" });
        return;
      }
      if (campo.type === "subgrupos") {
        contenedor.appendChild(grid);
        contenedor.appendChild(crearCampoSubgrupos(campo, doc, _ctx));
        grid = el("div", { class: "campos-grid" });
        return;
      }
      var wrapper = crearCampo(campo, doc, _ctx);
      _camposRenderizados.push({ wrapper: wrapper, campo: campo });
      grid.appendChild(wrapper);
    });
    contenedor.appendChild(grid);
  }

  // Los campos de cada vinculado son los mismos que los del reportado, y eso lo
  // sabe el esquema del país, no el motor: la sección los aporta en
  // `camposPorVinculado(prefijo)` (antes se llamaba directo a
  // identidadFieldsChile, que ahora vive en js/ros/chile/campos.js).
  function renderVinculados(contenedor, doc, seccion) {
    var lista = doc.vinculados || [];
    var camposPorVinculado = seccion && seccion.camposPorVinculado;
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
      } else if (typeof camposPorVinculado !== "function") {
        // Fallo de cableado del esquema: mejor decirlo que mostrar la tarjeta vacía.
        card.appendChild(el("div", { class: "aviso-fijo",
          text: "El esquema de este documento no define los campos de los vinculados." }));
      } else {
        renderCampos(card, camposPorVinculado("vinculados." + i), doc);
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
    var clave = claveEsquema(ctx);
    var fabrica = ESQUEMAS[clave];

    // Sin esquema registrado NO se puede revisar el documento: se dice en pantalla
    // (con la clave que se buscó) y se bloquea la descarga, para que nunca quede
    // un modal en blanco con el botón "Descargar PDF" habilitado.
    if (!fabrica) {
      body.appendChild(el("div", { class: "aviso-fijo",
        text: "No hay un esquema de campos registrado para «" + clave + "», así que no se " +
          "puede revisar ni descargar este documento. Avisa al equipo técnico: falta " +
          "cargar el archivo de campos de este país en index.html." }));
      btnDescargar.disabled = true;
      return;
    }

    var esquema = fabrica(doc, ctx) || [];

    advertenciasVisibles(doc.meta && doc.meta.advertencias).forEach(function (a) {
      body.appendChild(el("div", { class: "aviso-fijo", text: a }));
    });

    esquema.forEach(function (seccion) {
      // Una sección con showIf (p. ej. "Delito precedente", que solo aplica si
      // el analista marcó que conoce uno) se arma en una envoltura aparte para
      // poder ocultarla ENTERA — título incluido — cuando deja de aplicar.
      var envoltura = seccion.showIf ? el("div") : null;
      var destino = envoltura || body;
      destino.appendChild(crearTituloSeccion(seccion.titulo));
      if (seccion.avisoFijo !== undefined) {
        destino.appendChild(el("div", { class: "aviso-fijo", text: seccion.avisoFijo }));
      } else if (seccion.vinculados) {
        renderVinculados(destino, doc, seccion);
      } else if (seccion.reglas) {
        renderReglas(destino, doc);
      } else {
        renderCampos(destino, seccion.campos, doc);
      }
      if (envoltura) {
        body.appendChild(envoltura);
        _camposRenderizados.push({ wrapper: envoltura, campo: seccion });
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

  window.RosModal = {
    // API pública de siempre (la usa js/ros/formulario.js).
    abrir: abrir, cerrar: cerrar, setMensaje: setMensaje,
    // Extensión para los archivos de campos de cada país.
    registrarEsquema: registrarEsquema,
    obtener: obtener,
    validadores: {
      limpiarRut: limpiarRut, dvModulo11: dvModulo11, validarRut: validarRut,
      validarFecha: validarFecha, validarEmail: validarEmail, validarLista: validarLista,
    },
  };
})();
