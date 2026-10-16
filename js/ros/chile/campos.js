/* =============================================================================
 * js/ros/chile/campos.js — esquema de campos del ROS de Chile.
 *
 * Espejo exacto de core.paises.chile.ros.fields.construir_ros_doc y
 * de su plantilla Jinja2 (fields.py + ros_template.html): el orden, las
 * etiquetas, las opciones de cada desplegable y los máximos son los que espera
 * el formulario de la UAF. Si allá cambia un campo, cambia acá.
 *
 * Solo DESCRIBE campos: el render, la validación en vivo y el modal son de
 * js/ros/modal.js. Se registra a sí mismo con la clave del documento, así que
 * basta con cargarlo en index.html para que el modal lo encuentre.
 * ========================================================================== */
(function () {
  "use strict";

  var RosModal = window.RosModal;
  var obtener = RosModal.obtener;
  var validarRut = RosModal.validadores.validarRut;
  var validarFecha = RosModal.validadores.validarFecha;
  var validarEmail = RosModal.validadores.validarEmail;

  // Textos largos que se repiten entre la opción del desplegable y las
  // condiciones showIf: se comparan por igualdad exacta, así que van en constantes.
  var OPT_TRANSACCION_PUNTUAL = "Una transacción puntual realizada por el/los reportado(s)";
  var OPT_CONJUNTO_OPERACIONES = "Un conjunto de operaciones inusuales realizada por el/los reportado(s)";
  var OPT_GATILLO_NEGOCIOS = "Alerta informada por personal que se desempeña en los procesos de negocios";

  // Listas del Portal de Entidades Reportantes de la UAF (generadas desde el
  // backend: js/ros/chile/catalogos_uaf.js). Las opcionales llevan "" primero.
  var CAT = window.CATALOGOS_UAF_CL;
  var conVacio = function (lista) { return [""].concat(lista); };
  var soloDigitos = function (v) { return !v || /^\d+$/.test(String(v)); };
  // Teléfono/móvil del portal: solo dígitos, máximo 12.
  var esTelefonoUAF = function (v) { return !v || /^[0-9]{1,12}$/.test(v); };

  // Los mismos campos de identidad sirven para el reportado (paso2) y para cada
  // vinculado (vinculados.<i>): por eso reciben el prefijo de la ruta.
  function identidadFieldsChile(prefix) {
    var esNatural = function (doc) { return obtener(doc, prefix + ".tipo_persona") === "Natural"; };
    var esJuridica = function (doc) { return obtener(doc, prefix + ".tipo_persona") === "Jurídica"; };
    var dirConocida = function (doc) { return obtener(doc, prefix + ".direccion.tipo_direccion") !== "Desconocida"; };
    var esNacional = function (doc) { return obtener(doc, prefix + ".tipo_identificacion") === "Nacional (RUN o RUT)"; };
    return [
      { path: prefix + ".esta_persona_es", label: "¿Esta persona es?", type: "select", options: ["Reportado", "Vinculado"], required: true },
      // Campos emergentes del formulario UAF: la base no tiene el dato de CÓMO se
      // vincula esta persona con el reportado, así que los completa el analista.
      {
        path: prefix + ".tipo_vinculado", label: "Tipo vinculado", type: "select",
        options: CAT.tiposVinculacion, required: true,
        showIf: function (doc) { return obtener(doc, prefix + ".esta_persona_es") === "Vinculado"; },
        validate: function (v, doc) { return v !== "Familiar" || !esJuridica(doc); },
        errMsg: "Una persona jurídica no puede ser vinculado Familiar.",
      },
      { path: prefix + ".tipo_persona", label: "Tipo persona", type: "select", options: ["Natural", "Jurídica"], required: true },
      { path: prefix + ".nombre_o_razon_social", label: "Nombre o razón social", type: "text", full: true, max: 100, required: true },
      { path: prefix + ".apellido_paterno", label: "Apellido paterno", type: "text", max: 40, showIf: esNatural, required: true },
      { path: prefix + ".apellido_materno", label: "Apellido materno", type: "text", max: 40, showIf: esNatural },
      { path: prefix + ".tipo_identificacion", label: "Tipo identificación", type: "select", options: ["Nacional (RUN o RUT)", "Extranjera"], required: true },
      {
        // El portal pide el RUT en dos casillas (número y DV, K mayúscula) y la
        // identificación extranjera en un campo numérico (solo dígitos).
        path: prefix + ".numero_id", label: "Número ID (RUT con guion y DV; extranjera: solo dígitos)", type: "text", max: 20, required: true,
        validate: function (v, doc) { return esNacional(doc) ? validarRut(v) : /^\d+$/.test(String(v)); },
        errMsg: "RUT: debe superar el dígito verificador (módulo 11). Extranjera: solo dígitos.",
      },
      { path: prefix + ".nacionalidad", label: "Nacionalidad", type: "select", options: conVacio(CAT.paises), showIf: esNatural, required: true },
      { path: prefix + ".pais_residencia", label: "País residencia", type: "select", options: conVacio(CAT.paises), showIf: esNatural },
      { path: prefix + ".pais_constitucion", label: "País constitución", type: "select", options: conVacio(CAT.paises), showIf: esJuridica, required: true },
      { path: prefix + ".pais_funcionamiento", label: "País funcionamiento", type: "select", options: conVacio(CAT.paises), showIf: esJuridica },
      { grupoTitulo: "Dirección" },
      {
        path: prefix + ".direccion.tipo_direccion", label: "Tipo dirección", type: "select", options: ["Conocida", "Desconocida"],
        validate: function (v, doc) { return v !== "Desconocida" || obtener(doc, prefix + ".esta_persona_es") !== "Reportado"; },
        errMsg: "El reportado no puede tener una dirección desconocida.",
      },
      { path: prefix + ".direccion.tipo_calle", label: "Tipo calle", type: "select", options: conVacio(CAT.tiposCalle), required: true, showIf: dirConocida },
      { path: prefix + ".direccion.nombre_calle", label: "Nombre calle (MAYÚSCULAS)", type: "text", max: 50, required: true, showIf: dirConocida },
      { path: prefix + ".direccion.numero", label: "N°", type: "text", max: 10, required: true, showIf: dirConocida },
      { path: prefix + ".direccion.complemento", label: "Complemento", type: "text", max: 50, showIf: dirConocida },
      { path: prefix + ".direccion.region", label: "Región", type: "select", options: conVacio(CAT.regiones), required: true, showIf: dirConocida },
      {
        // El portal carga las comunas de la región elegida.
        path: prefix + ".direccion.comuna", label: "Comuna", type: "select", required: true, showIf: dirConocida,
        options: function (doc) { return conVacio(CAT.comunasPorRegion[obtener(doc, prefix + ".direccion.region")] || []); },
      },
      { path: prefix + ".direccion.codigo_postal", label: "Código postal", type: "text", max: 15 },
      {
        path: prefix + ".direccion.telefono", label: "Teléfono (solo dígitos)", type: "text", max: 12,
        disabledIf: function (doc) { return !!obtener(doc, prefix + ".direccion.telefono_sin_info"); },
        validate: esTelefonoUAF, errMsg: "Solo dígitos, máximo 12.",
      },
      { path: prefix + ".direccion.telefono_sin_info", label: "Sin información (teléfono)", type: "checkbox", clears: prefix + ".direccion.telefono" },
      {
        path: prefix + ".direccion.movil", label: "Móvil (solo dígitos)", type: "text", max: 12,
        disabledIf: function (doc) { return !!obtener(doc, prefix + ".direccion.movil_sin_info"); },
        validate: esTelefonoUAF, errMsg: "Solo dígitos, máximo 12.",
      },
      { path: prefix + ".direccion.movil_sin_info", label: "Sin información (móvil)", type: "checkbox", clears: prefix + ".direccion.movil" },
      {
        path: prefix + ".direccion.email", label: "Email", type: "text", max: 50,
        disabledIf: function (doc) { return !!obtener(doc, prefix + ".direccion.email_sin_info"); },
        validate: function (v) { return !v || validarEmail(v); }, errMsg: "Formato de email inválido.",
      },
      { path: prefix + ".direccion.email_sin_info", label: "Sin información (email)", type: "checkbox", clears: prefix + ".direccion.email" },
      { grupoTitulo: "Antecedentes" },
      {
        // Obligatoria en el portal: al menos una, con el texto exacto de su listado.
        path: prefix + ".actividad_economica", label: "Actividad económica (una por línea, texto exacto del listado UAF)", type: "list", full: true, required: true,
        validate: function (v) { return v.every(function (a) { return CAT.actividades.indexOf(a) >= 0; }); },
        errMsg: "Elige al menos una actividad del listado UAF: " + CAT.actividades.join(" · "),
      },
      { path: prefix + ".informacion_adicional_actividad", label: "Información adicional de la actividad", type: "textarea", max: 500, full: true, required: true },
    ];
  }

  function schemaChile() {
    return [
      {
        titulo: "Paso 1 — Antecedentes de la(s) operación(es) sospechosa(s)",
        campos: [
          { path: "paso1.tipo_reporte", label: "Tipo de reporte", type: "select", options: conVacio(CAT.tiposReporte), required: true },
          { path: "paso1.vinculado_reporte_anterior", label: "¿Vinculado a un reporte anterior?", type: "select", options: ["", "Sí", "No"], required: true },
          {
            path: "paso1.referencia_ultimo_ros", label: "Número del reporte anterior", type: "text", full: true, max: 50, required: true,
            showIf: function (doc) { return obtener(doc, "paso1.vinculado_reporte_anterior") === "Sí"; },
          },
          { path: "paso1.reporte_corresponde_a", label: "El reporte corresponde a", type: "select", full: true,
            options: ["", OPT_TRANSACCION_PUNTUAL, OPT_CONJUNTO_OPERACIONES], required: true },
          { path: "paso1.fecha_puntual", label: "Fecha (DD-MM-AAAA)", type: "text",
            validate: function (v) { return !v || validarFecha(v, "-"); }, errMsg: "Formato esperado: DD-MM-AAAA.",
            showIf: function (doc) { return obtener(doc, "paso1.reporte_corresponde_a") === OPT_TRANSACCION_PUNTUAL; } },
          { path: "paso1.desde", label: "Desde (DD-MM-AAAA)", type: "text",
            validate: function (v) { return !v || validarFecha(v, "-"); }, errMsg: "Formato esperado: DD-MM-AAAA.",
            showIf: function (doc) { return obtener(doc, "paso1.reporte_corresponde_a") === OPT_CONJUNTO_OPERACIONES; } },
          { path: "paso1.hasta", label: "Hasta (DD-MM-AAAA)", type: "text",
            validate: function (v) { return !v || validarFecha(v, "-"); }, errMsg: "Formato esperado: DD-MM-AAAA.",
            showIf: function (doc) { return obtener(doc, "paso1.reporte_corresponde_a") === OPT_CONJUNTO_OPERACIONES; } },
          { path: "paso1.cantidad_operaciones", label: "Cantidad de operaciones", type: "text", max: 40, required: true,
            validate: function (v) { return /^\d+$/.test(String(v)) && Number(v) > 1; }, errMsg: "Solo dígitos, mayor que 1.",
            showIf: function (doc) { return obtener(doc, "paso1.reporte_corresponde_a") === OPT_CONJUNTO_OPERACIONES; } },
          { path: "paso1.monto", label: "Monto (CLP, entero sin puntos ni comas)", type: "text", max: 40, required: true,
            validate: soloDigitos, errMsg: "Solo dígitos, sin puntos ni comas." },
          { path: "paso1.productos", label: "Productos financieros/no financieros utilizados (uno por línea, texto exacto del listado UAF)", type: "list", full: true, required: true,
            validate: function (v) { return v.every(function (p) { return CAT.productos.indexOf(p) >= 0; }); },
            errMsg: "Cada línea debe ser un producto del listado UAF: " + CAT.productos.join(" · ") },
          { path: "paso1.otro_producto", label: "Indique el otro tipo de operación o producto", type: "text", full: true, max: 40, required: true,
            showIf: function (doc) { return (obtener(doc, "paso1.productos") || []).indexOf(CAT.productos[CAT.productos.length - 1]) >= 0; } },
          { path: "paso1.texto_1", label: "1.- Descripción de los hechos en orden cronológico", type: "textarea", min: 250, max: 5000, full: true, required: true },
          { path: "paso1.texto_2", label: "2.- Qué se consideró sospechoso para enviar el ROS", type: "textarea", min: 250, max: 2000, full: true, required: true },
          // ¿Qué/Quién gatilló la alerta? En el portal UAF son casillas: se pueden marcar varias.
          { path: "paso1.gatillo_sistema", label: "Alerta automática del sistema informático de cumplimiento", type: "checkbox", full: true },
          { path: "paso1.gatillo_personal", label: OPT_GATILLO_NEGOCIOS, type: "checkbox", full: true },
          { path: "paso1.gatillo_prensa", label: "Prensa/medios de comunicación", type: "checkbox", full: true },
          { path: "paso1.gatillo_otro", label: "Otro", type: "checkbox", full: true },
          { path: "paso1.gatillo_alerta_otro", label: "Indique cuál (Otro)", type: "text", full: true, required: true,
            showIf: function (doc) { return obtener(doc, "paso1.gatillo_otro") === true; } },
          { path: "paso1.periodo_analisis_desde", label: "Período de análisis — Desde (DD-MM-AAAA)", type: "text", required: true,
            validate: function (v) { return !v || validarFecha(v, "-"); }, errMsg: "Formato esperado: DD-MM-AAAA." },
          { path: "paso1.periodo_analisis_hasta", label: "Hasta (DD-MM-AAAA)", type: "text", required: true,
            validate: function (v) { return !v || validarFecha(v, "-"); }, errMsg: "Formato esperado: DD-MM-AAAA." },
        ],
      },
      { titulo: "Paso 2 — Identificación del(los) reportado(s)", campos: identidadFieldsChile("paso2") },
      // Los vinculados usan los MISMOS campos de identidad, uno por persona: el
      // modal los pide con el prefijo de cada uno ("vinculados.0", "vinculados.1"…).
      { titulo: "Vinculados — Personas vinculadas al reportado", vinculados: true,
        camposPorVinculado: identidadFieldsChile },
      {
        titulo: "Paso 3 — Adjuntar archivos en formato digital",
        campos: [
          // En el portal cada archivo se sube con su descripción (obligatoria); los archivos son opcionales.
          { path: "paso3.descripcion", label: "Descripción del archivo", type: "text", full: true },
        ],
      },
      { titulo: "Anexo A — Señales de alerta evaluadas", reglas: true },
    ];
  }

  RosModal.registrarEsquema("Chile|ROS", schemaChile);
})();
