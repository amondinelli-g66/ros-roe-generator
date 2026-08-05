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

  // Listas taxativas de la UIAF (espejo de core/paises/colombia/enums.py).
  var TIPO_ID_NATURAL = [
    "Cédula de ciudadanía", "Pasaporte", "Tarjeta de identidad",
    "Registro civil de nacimiento", "Tarjeta de extranjería",
    "Cédula de extranjería", "Documento de identidad extranjero",
  ];
  var TEMATICAS = [
    "Concierto para delinquir", "Contrabando", "Contrabando hidrocarburos",
    "Corrupción", "Delitos contra el sistema financiero",
    "Delitos contra la administración pública", "Enriquecimiento ilícito",
    "Exportaciones ficticias", "Extorsión", "Financiamiento del terrorismo",
    "Fraude aduanero", "Importaciones ficticias", "Minería ilegal",
    "Operaciones con activos virtuales", "Secuestro extorsivo",
    "Tráfico de emigrantes", "Tráfico de estupefacientes", "Tráfico de menores",
    "Tráfico de personas",
  ];
  var MONEDAS = ["pesos", "dólar", "euro", "libra", "bolívar", "bolívar fuerte", "otro tipo"];

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
          { path: "persona_natural.tipo_identificacion", label: "Tipo identificación", type: "select", options: TIPO_ID_NATURAL },
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
        { path: "detalle.tematica", label: "Temática (delito fuente)", type: "select", full: true, options: TEMATICAS },
        { path: "detalle.senales_alerta", label: "Señales de alerta (máx. 200 caracteres cada una)", type: "bloques", full: true,
          maxPorBloque: 200 },
        { path: "detalle.valor_transaccion", label: "Valor de la transacción (sin puntos ni comas)", type: "text",
          validate: function (v) { return !v || /^\d+$/.test(String(v)); }, errMsg: "Solo dígitos, sin puntos ni comas." },
        { path: "detalle.moneda", label: "Moneda", type: "select", options: MONEDAS },
        { path: "detalle.notifico_autoridad", label: "¿Notificó a otra autoridad?", type: "checkbox" },
        { path: "detalle.personas_solicitadas", label: "¿Las personas fueron solicitadas por alguna entidad competente?", type: "checkbox" },
        { path: "detalle.documentos_soporte", label: "¿Documentos de soporte de la operación sospechosa?", type: "checkbox" },
      ],
    });

    secciones.push({ titulo: "Anexo A — Señales de alerta evaluadas", reglas: true });
    return secciones;
  }

  RosModal.registrarEsquema("Colombia|ROS", schemaColombia);
})();
