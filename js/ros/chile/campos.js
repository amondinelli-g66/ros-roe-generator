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

  // Opciones del Portal de Entidades Reportantes de la UAF (Paso 2).
  var TIPOS_CALLE_UAF = ["Avenida", "Calle", "Pasaje", "Camino o ruta", "Otra"];
  var REGIONES_UAF = ["REGIÓN METROPOLITANA", "PRIMERA REGIÓN", "SEGUNDA REGIÓN", "TERCERA REGIÓN",
    "CUARTA REGIÓN", "QUINTA REGIÓN", "SEXTA REGIÓN", "SÉPTIMA REGIÓN", "OCTAVA REGIÓN",
    "NOVENA REGIÓN", "DÉCIMA REGIÓN", "DÉCIMA PRIMERA REGIÓN", "DÉCIMA SEGUNDA REGION",
    "DÉCIMA CUARTA REGIÓN", "DÉCIMA QUINTA REGIÓN", "DÉCIMA SEXTA REGIÓN", "SIN REGION"];
  var ACTIVIDADES_UAF = [
    "AGRICULTURA, GANADERÍA, CAZA Y SILVICULTURA", "PESCA", "EXPLOTACIÓN DE MINAS Y CANTERAS",
    "INDUSTRIAS MANUFACTURERAS NO METÁLICAS", "INDUSTRIAS MANUFACTURERAS METÁLICAS",
    "SUMINISTRO DE ELECTRICIDAD, GAS Y AGUA", "CONSTRUCCIÓN",
    "COMERCIO AL POR MAYOR Y MENOR; REP. VEHÍCULOS AUTOMOTORES/ENSERES DOMÉSTICOS",
    "HOTELES Y RESTAURANTES", "TRANSPORTE, ALMACENAMIENTO Y COMUNICACIONES", "INTERMEDIACIÓN FINANCIERA",
    "ACTIVIDADES INMOBILIARIAS, EMPRESARIALES Y DE ALQUILER",
    "ADMINISTRACIÓN PÚBLICA Y DEFENSA; PLANES DE SEGURIDAD SOCIAL, AFILIACIÓN OBLIGATORIA",
    "ENSEÑANZA", "SERVICIOS SOCIALES Y DE SALUD",
    "OTRAS ACTIVIDADES DE SERVICIOS COMUNITARIAS, SOCIALES Y PERSONALES",
    "CONSEJO DE ADMINISTRACIÓN DE EDIFICIOS Y CONDOMINIOS",
    "ORGANIZACIONES Y ÓRGANOS EXTRATERRITORIALES", "OTRA ACTIVIDAD ECONOMICA"];
  // Teléfono/móvil del portal: solo dígitos, máximo 12.
  var esTelefonoUAF = function (v) { return !v || /^[0-9]{1,12}$/.test(v); };

  // Los mismos campos de identidad sirven para el reportado (paso2) y para cada
  // vinculado (vinculados.<i>): por eso reciben el prefijo de la ruta.
  function identidadFieldsChile(prefix) {
    var esNatural = function (doc) { return obtener(doc, prefix + ".tipo_persona") === "Natural"; };
    var esJuridica = function (doc) { return obtener(doc, prefix + ".tipo_persona") === "Jurídica"; };
    var esNacional = function (doc) { return obtener(doc, prefix + ".tipo_identificacion") === "Nacional (RUN o RUT)"; };
    return [
      { path: prefix + ".esta_persona_es", label: "¿Esta persona es?", type: "select", options: ["Reportado", "Vinculado"] },
      // Campos emergentes del formulario UAF: la base no tiene el dato de CÓMO se
      // vincula esta persona con el reportado, así que los completa el analista.
      {
        path: prefix + ".tipo_vinculado", label: "Tipo vinculado", type: "select",
        options: ["Familiar", "Comercial", "Laboral", "Otra"],
        showIf: function (doc) { return obtener(doc, prefix + ".esta_persona_es") === "Vinculado"; },
        validate: function (v, doc) { return v !== "Familiar" || !esJuridica(doc); },
        errMsg: "Una persona jurídica no puede ser vinculado Familiar.",
      },
      {
        path: prefix + ".detalle_vinculacion", label: "Detalle vinculación", type: "text", full: true,
        showIf: function (doc) { return obtener(doc, prefix + ".tipo_vinculado") === "Otra"; },
      },
      { path: prefix + ".tipo_persona", label: "Tipo persona", type: "select", options: ["Natural", "Jurídica"] },
      { path: prefix + ".nombre_o_razon_social", label: "Nombre o razón social", type: "text", full: true },
      { path: prefix + ".apellido_paterno", label: "Apellido paterno", type: "text", showIf: esNatural },
      { path: prefix + ".apellido_materno", label: "Apellido materno", type: "text", showIf: esNatural },
      { path: prefix + ".tipo_identificacion", label: "Tipo identificación", type: "select", options: ["Nacional (RUN o RUT)", "Extranjera"] },
      {
        path: prefix + ".numero_id", label: "Número ID", type: "text",
        validate: function (v, doc) { return !v || !esNacional(doc) || validarRut(v); },
        errMsg: "No supera el dígito verificador (módulo 11). Revisa el RUT/RUN.",
      },
      { path: prefix + ".nacionalidad", label: "Nacionalidad (país como en el portal UAF, ej. CHILE)", type: "text", showIf: esNatural },
      { path: prefix + ".pais_residencia", label: "País de residencia", type: "text", showIf: esNatural },
      { path: prefix + ".pais_constitucion", label: "País de constitución (como en el portal UAF)", type: "text", showIf: esJuridica },
      { path: prefix + ".pais_funcionamiento", label: "País de funcionamiento", type: "text", showIf: esJuridica },
      { grupoTitulo: "Dirección" },
      {
        path: prefix + ".direccion.tipo_direccion", label: "Tipo dirección", type: "select", options: ["Conocida", "Desconocida"],
        validate: function (v, doc) { return v !== "Desconocida" || obtener(doc, prefix + ".esta_persona_es") !== "Reportado"; },
        errMsg: "El reportado no puede tener una dirección desconocida.",
      },
      { path: prefix + ".direccion.tipo_calle", label: "Tipo calle", type: "select", options: TIPOS_CALLE_UAF },
      { path: prefix + ".direccion.nombre_calle", label: "Nombre calle (MAYÚSCULAS)", type: "text", max: 50 },
      { path: prefix + ".direccion.numero", label: "N°", type: "text", max: 10 },
      { path: prefix + ".direccion.complemento", label: "Complemento", type: "text", max: 50 },
      { path: prefix + ".direccion.region", label: "Región", type: "select", options: REGIONES_UAF },
      { path: prefix + ".direccion.comuna", label: "Comuna", type: "text" },
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
        validate: function (v) { return v.every(function (a) { return ACTIVIDADES_UAF.indexOf(a) >= 0; }); },
        errMsg: "Elige al menos una actividad del listado UAF: " + ACTIVIDADES_UAF.join(" · "),
      },
      { path: prefix + ".informacion_adicional_actividad", label: "Información adicional de la actividad", type: "textarea", max: 500, full: true },
    ];
  }

  function schemaChile() {
    return [
      {
        titulo: "Paso 1 — Antecedentes de la(s) operación(es) sospechosa(s)",
        campos: [
          { path: "paso1.tipo_reporte", label: "Tipo de reporte", type: "select", options: ["Lavado de Activos", "Financiamiento del Terrorismo", "Ambos", "Sin Antecedentes"] },
          { path: "paso1.vinculado_reporte_anterior", label: "¿Vinculado a un reporte anterior?", type: "select", options: ["Sí", "No"] },
          {
            path: "paso1.referencia_ultimo_ros", label: "Referencia último ROS", type: "text", full: true,
            showIf: function (doc) { return obtener(doc, "paso1.vinculado_reporte_anterior") === "Sí"; },
          },
          { path: "paso1.reporte_corresponde_a", label: "El reporte corresponde a", type: "select", full: true,
            options: [OPT_TRANSACCION_PUNTUAL, OPT_CONJUNTO_OPERACIONES] },
          { path: "paso1.fecha_puntual", label: "Fecha (DD-MM-AAAA)", type: "text",
            validate: function (v) { return !v || validarFecha(v, "-"); }, errMsg: "Formato esperado: DD-MM-AAAA.",
            showIf: function (doc) { return obtener(doc, "paso1.reporte_corresponde_a") === OPT_TRANSACCION_PUNTUAL; } },
          { path: "paso1.desde", label: "Desde (DD-MM-AAAA)", type: "text",
            validate: function (v) { return !v || validarFecha(v, "-"); }, errMsg: "Formato esperado: DD-MM-AAAA.",
            showIf: function (doc) { return obtener(doc, "paso1.reporte_corresponde_a") === OPT_CONJUNTO_OPERACIONES; } },
          { path: "paso1.hasta", label: "Hasta (DD-MM-AAAA)", type: "text",
            validate: function (v) { return !v || validarFecha(v, "-"); }, errMsg: "Formato esperado: DD-MM-AAAA.",
            showIf: function (doc) { return obtener(doc, "paso1.reporte_corresponde_a") === OPT_CONJUNTO_OPERACIONES; } },
          { path: "paso1.cantidad_operaciones", label: "Cantidad de operaciones", type: "text",
            validate: function (v) { return !v || /^\d+$/.test(String(v)); }, errMsg: "Solo dígitos.",
            showIf: function (doc) { return obtener(doc, "paso1.reporte_corresponde_a") === OPT_CONJUNTO_OPERACIONES; } },
          { path: "paso1.monto", label: "Monto (CLP, entero sin puntos ni comas)", type: "text",
            validate: function (v) { return !v || /^\d+$/.test(String(v)); }, errMsg: "Solo dígitos, sin puntos ni comas." },
          { path: "paso1.productos", label: "Productos financieros/no financieros utilizados (uno por línea)", type: "list", full: true },
          { path: "paso1.texto_1", label: "1.- Descripción de los hechos en orden cronológico", type: "textarea", min: 250, max: 5000, full: true },
          { path: "paso1.texto_2", label: "2.- Qué se consideró sospechoso para enviar el ROS", type: "textarea", min: 250, max: 2000, full: true },
          // ¿Qué/Quién gatilló la alerta? En el portal UAF son casillas: se pueden marcar varias.
          { path: "paso1.gatillo_sistema", label: "Alerta automática del sistema informático de cumplimiento", type: "checkbox", full: true },
          { path: "paso1.gatillo_personal", label: OPT_GATILLO_NEGOCIOS, type: "checkbox", full: true },
          { path: "paso1.gatillo_prensa", label: "Prensa/medios de comunicación", type: "checkbox", full: true },
          { path: "paso1.gatillo_otro", label: "Otro", type: "checkbox", full: true },
          { path: "paso1.gatillo_alerta_otro", label: "Indique cuál (Otro)", type: "text", full: true,
            showIf: function (doc) { return obtener(doc, "paso1.gatillo_otro") === true; } },
          { path: "paso1.periodo_analisis_desde", label: "Período de análisis — Desde (DD-MM-AAAA)", type: "text",
            validate: function (v) { return !v || validarFecha(v, "-"); }, errMsg: "Formato esperado: DD-MM-AAAA." },
          { path: "paso1.periodo_analisis_hasta", label: "Hasta (DD-MM-AAAA)", type: "text",
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
