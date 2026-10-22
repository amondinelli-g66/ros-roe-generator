/* =============================================================================
 * js/ros/colombia/campos.js — esquema de campos del ROS de Colombia.
 *
 * Espejo exacto de core.paises.colombia.ros.fields y de su plantilla Jinja2
 * (fields.py + ros_colombia_template.html). Las listas de opciones son TAXATIVAS
 * de la UIAF (espejo de core/paises/colombia/enums.py): no se agregan ni se
 * traducen valores acá.
 *
 * A diferencia de Chile, el esquema depende del doc que llegó del backend: se
 * muestra la sección de persona jurídica o la de persona natural según cuál
 * "aplica"; si no aplica, el backend manda el mensaje que se muestra en su lugar.
 * Por eso la fábrica recibe el doc. Colombia reporta un único ID: no tiene
 * sección de vinculados.
 *
 * Se registra a sí mismo con la clave del documento, así que basta con cargarlo
 * en index.html para que el modal lo encuentre.
 * ========================================================================== */
(function () {
  "use strict";

  var RosModal = window.RosModal;
  var obtener = RosModal.obtener;
  var validarFecha = RosModal.validadores.validarFecha;

  // Listas taxativas de la UIAF (espejo de core/paises/colombia/enums.py): textos
  // EXACTOS de SIREL, con sus erratas ("dolar", "ilicito"), y largos máximos del
  // formulario (verificados en vivo el 2026-10-20).
  var TIPO_ID_NATURAL = [
    "Cédula de ciudadanía", "Pasaporte", "Tarjeta de identidad",
    "Registro civil de nacimiento", "Tarjeta de extranjería",
    "Cédula de extranjería", "Documento de identificación extranjero",
  ];
  var TIPO_ID_REPRESENTANTE = [
    "Cédula de ciudadanía", "Pasaporte", "Tarjeta de extranjería",
    "Cédula de extranjería", "Documento de identificación extranjero",
  ];
  var TEMATICAS = [
    "Compraventa reiterada de un mismo inmueble (Carrusel)",
    "Concierto para delinquir", "Contrabando", "Contrabando hidrocarburos",
    "Delitos contra el sistema financiero",
    "Delitos contra la administración pública", "Enriquecimiento ilicito",
    "Exportaciones ficticias", "Extorsión", "Financiamiento de terrorismo",
    "Fraccionamiento y/o inusualidades en el manejo del efectivo (Notarías)",
    "Fraude aduanero", "Importaciones ficticias",
    "Inusualidades con Sociedades por Acciones Simplificadas (Notarías)",
    "Minería ilegal", "Operaciones con activos virtuales",
    "Operaciones fuera del Círculo Notarial", "PTEE Corrupción",
    "PTEE Soborno Transnacional", "PTEP SIGRIP", "Secuestro extorsivo",
    "Tráfico de emigrantes", "Tráfico de estupefacientes", "Tráfico de menores",
    "Tráfico de personas",
  ];
  var MONEDAS = ["pesos", "dolar", "euro", "libra", "bolivar", "bolivar fuerte", "otro tipo"];

  function schemaColombia(doc) {
    // ROI (operaciones intentadas): formulario "Operaciones Intentadas" de SIREL,
    // sin clase de reporte, señales de alerta ni casillas de verificación.
    var roi = obtener(doc, "tipo_reporte") === "INTENTADA";
    var general = [
      { path: "info_general.numero_reporte", label: "Número de reporte (AAAADDMMXXX; si se deja vacío, "
        + "lo asigna la hoja Seguimiento ROS al aprobar)", type: "text", max: 200 },
    ];
    if (!roi) {
      general.push({ path: "info_general.clase_reporte", label: "Clase de reporte", type: "select", required: true,
        options: ["Reporte Inicial", "Corrección a reporte anterior", "Adición a reporte anterior"] });
    }
    var secciones = [{ titulo: "1 — Información general del reporte", campos: general }];

    if (obtener(doc, "persona_juridica.aplica")) {
      secciones.push({
        titulo: "2 — Persona jurídica",
        campos: [
          { path: "persona_juridica.tipo_identificacion", label: "Tipo identificación", type: "select", required: true,
            options: ["NIT", "Sociedad extranjera sin NIT en Colombia"] },
          { path: "persona_juridica.numero_identificacion", label: "Nro. identificación", type: "text", max: 20, required: true },
          { path: "persona_juridica.razon_social", label: "Razón social (la UIAF admite 30 caracteres)", type: "text",
            full: true, max: 30, required: true },
          { path: "persona_juridica.rol", label: "Rol en la operación", type: "text", full: true, max: 100, required: true },
          { grupoTitulo: "Representante legal" },
          { path: "persona_juridica.representante.nombre", label: "Nombre", type: "text", max: 150, required: true },
          { path: "persona_juridica.representante.primer_apellido", label: "Primer apellido", type: "text", max: 50, required: true },
          { path: "persona_juridica.representante.segundo_apellido", label: "Segundo apellido", type: "text", max: 50 },
          { path: "persona_juridica.representante.tipo_identificacion", label: "Tipo identificación", type: "select",
            options: TIPO_ID_REPRESENTANTE, required: true },
          { path: "persona_juridica.representante.numero_identificacion", label: "Nro. identificación", type: "text",
            max: 20, required: true },
          { path: "persona_juridica.representante.pep", label: "Representante legal PEP", type: "select",
            options: ["SI", "NO"], required: true },
        ],
      });
    } else {
      secciones.push({ titulo: "2 — Persona jurídica", avisoFijo: obtener(doc, "persona_juridica.mensaje") });
    }

    if (obtener(doc, "persona_natural.aplica")) {
      secciones.push({
        titulo: "3 — Persona natural",
        campos: [
          { path: "persona_natural.tipo_identificacion", label: "Tipo identificación", type: "select",
            options: TIPO_ID_NATURAL, required: true },
          { path: "persona_natural.identificacion", label: "Identificación", type: "text", max: 20, required: true },
          { path: "persona_natural.nombres", label: "Nombres", type: "text", full: true, max: 150, required: true },
          { path: "persona_natural.primer_apellido", label: "Primer apellido", type: "text", max: 50, required: true },
          { path: "persona_natural.segundo_apellido", label: "Segundo apellido", type: "text", max: 50 },
          { path: "persona_natural.entidad", label: "Entidad", type: "select", options: ["No aplica"] },
          { path: "persona_natural.rol", label: "Rol en la operación", type: "text", max: 100, required: true },
          { path: "persona_natural.pep", label: "Persona PEP", type: "select", options: ["SI", "NO"], required: true },
        ],
      });
    } else {
      secciones.push({ titulo: "3 — Persona natural", avisoFijo: obtener(doc, "persona_natural.mensaje") });
    }

    var detalle = {
      titulo: "4 — Detalle",
      campos: [
        { path: "detalle.periodo_desde", label: "Período de análisis — Desde (DD-MM-AAAA)", type: "text", required: true,
          validate: function (v) { return !v || validarFecha(v, "-"); }, errMsg: "Formato esperado: DD-MM-AAAA." },
        { path: "detalle.periodo_hasta", label: "Hasta (DD-MM-AAAA)", type: "text", required: true,
          validate: function (v) { return !v || validarFecha(v, "-"); }, errMsg: "Formato esperado: DD-MM-AAAA." },
        { path: "detalle.descripcion", label: roi ? "Descripción de las operaciones intentadas"
          : "Descripción de la operación sospechosa", type: "textarea", full: true, required: true },
        { path: "detalle.tematica", label: "Temática (delito fuente)", type: "select", full: true, options: TEMATICAS,
          required: true },
        { path: "detalle.senales_alerta", label: "Señales de alerta (máx. 200 caracteres cada una)", type: "bloques", full: true,
          maxPorBloque: 200, required: true },
        { path: "detalle.valor_transaccion", label: "Valor de la transacción (sin puntos ni comas)", type: "text", required: true,
          validate: function (v) { return !v || /^\d+$/.test(String(v)); }, errMsg: "Solo dígitos, sin puntos ni comas." },
        { path: "detalle.moneda", label: "Moneda", type: "select", options: MONEDAS, required: true },
        { path: "detalle.notifico_autoridad", label: "¿Notificó a otra autoridad?", type: "checkbox" },
        { path: "detalle.personas_solicitadas", label: "¿Las personas fueron solicitadas por alguna entidad competente?", type: "checkbox" },
        { path: "detalle.documentos_soporte", label: "¿Documentos de soporte de la operación sospechosa? "
          + "(el robot adjunta el CSV de movimientos)", type: "checkbox" },
      ],
    };
    if (roi) {
      var fuera = ["detalle.senales_alerta", "detalle.notifico_autoridad", "detalle.personas_solicitadas",
        "detalle.documentos_soporte"];
      detalle.campos = detalle.campos.filter(function (c) { return fuera.indexOf(c.path) < 0; });
    }
    secciones.push(detalle);

    if (roi) {
      var it = obtener(doc, "intentadas") || {};
      var lineas = ["Intentos no concretados en el período: " + (it.total || 0)
        + " (USD " + Math.round(it.total_usd || 0).toLocaleString("es-CO") + ")."];
      (it.por_motivo || []).forEach(function (m) { lineas.push("• " + m.motivo + ": " + m.n); });
      if ((it.indicadores || []).length) {
        lineas.push("Indicadores de sospecha:");
        it.indicadores.forEach(function (s) { lineas.push("• " + s); });
      } else {
        lineas.push("Sin indicadores de sospecha automáticos: fundamentar el reporte en la descripción.");
      }
      lineas.push("El detalle de cada intento va en el PDF (Anexo A) y en el CSV del caso.");
      secciones.push({ titulo: "Anexo A — Operaciones intentadas", avisoFijo: lineas.join("\n") });
    } else {
      secciones.push({ titulo: "Anexo A — Señales de alerta evaluadas", reglas: true });
    }
    return secciones;
  }

  RosModal.registrarEsquema("Colombia|ROS", schemaColombia);
})();
