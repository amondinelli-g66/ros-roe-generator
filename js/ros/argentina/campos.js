/* =============================================================================
 * js/ros/argentina/campos.js — esquema de campos del ROS de Argentina (UIF).
 *
 * Espejo exacto de core.paises.argentina.ros.fields y de su plantilla Jinja2
 * (fields.py + ros_argentina_template.html). Las listas de opciones son
 * TAXATIVAS de la UIF (espejo de core/paises/argentina/enums.py): no se agregan
 * ni se traducen valores acá.
 *
 * Dos particularidades del formulario, que también decide el backend:
 *   - La sección 3 tiene DOS variantes (persona física / persona física
 *     extranjera) según la NACIONALIDAD del reportado, y son mutuamente
 *     excluyentes: se muestra la que el doc marque como "aplica".
 *   - La sección 4 repite el lugar de los hechos con los sufijos 1, 2 y 3
 *     (aquí "Primera/Segunda/Tercera operación"): se usa el campo `subgrupos`,
 *     que muestra el primero y va revelando los siguientes con un botón; al
 *     llegar al tercero, el mismo botón revela "Domicilios adicionales" para la
 *     cuarta dirección en adelante.
 *
 * Se registra a sí mismo con la clave del documento, así que basta con cargarlo
 * en index.html para que el modal lo encuentre.
 * ========================================================================== */
(function () {
  "use strict";

  var RosModal = window.RosModal;
  var obtener = RosModal.obtener;
  var validarFecha = RosModal.validadores.validarFecha;
  var validarEmail = RosModal.validadores.validarEmail;

  // --- Listas taxativas de la UIF (espejo de core/paises/argentina/enums.py) --
  var SEXO = ["Masculino", "Femenino", "X"];
  var ESTADO_CIVIL = ["SOLTERO", "CASADO", "VIUDO", "UNION CIVIL", "UNION DE HECHO"];
  var TIPO_DOCUMENTO = [
    "Documento Nacional de Identidad", "Libreta de Enrolamiento", "Libreta Civica",
    "Cedula Mercosur", "Pasaporte", "Pasaporte EXT", "Documento EXT",
  ];
  var RELACION_HECHO = ["DIRECTA", "INDIRECTA", "INCUMPLIMIENTO DE LA DEBIDA DILIGENCIA"];
  var RELACION_PRODUCTO = ["Directa", "Indirecta"];
  var SI_NO = ["SI", "NO"];
  // UNA sola lista de provincias para el domicilio (sección 3) y el lugar de
  // los hechos (sección 4). CORREGIDO: la UIF nunca dice "Capital Federal" en
  // ninguna de las dos secciones, siempre "CABA" — era un error de
  // transcripción de la especificación, no una diferencia real del formulario.
  var PROVINCIAS = [
    "CABA", "Buenos Aires", "Catamarca", "Córdoba", "Corrientes", "Chaco", "Chubut",
    "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones",
    "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis", "Santa Cruz", "Santa Fé",
    "Santiago Del Estero", "Tucumán", "Tierra del Fuego", "Otro/a",
  ];
  var FUENTE_INFORMACION = ["Fuente Judicial", "Análisis propio del Sujeto Obligado", "Artículo Periodístico"];
  var FUENTE_ARTICULO = [
    "Internet", "TV", "Radio", "Periódicos", "Facebook o Twitter",
    "Medios Gráficos", "Otras Fuentes",
  ];
  // Catálogo de países para el select de "País" del cargo PEP: no es una lista
  // taxativa de la UIF (no hay valores exactos que verificar contra el
  // formulario), solo nombres de países en español para el desplegable.
  var PAISES_MUNDO = [
    "Afganistán", "Albania", "Alemania", "Andorra", "Angola", "Antigua y Barbuda",
    "Arabia Saudita", "Argelia", "Argentina", "Armenia", "Australia", "Austria",
    "Azerbaiyán", "Bahamas", "Bangladés", "Barbados", "Baréin", "Bélgica", "Belice",
    "Benín", "Bielorrusia", "Birmania", "Bolivia", "Bosnia y Herzegovina", "Botsuana",
    "Brasil", "Brunéi", "Bulgaria", "Burkina Faso", "Burundi", "Bután", "Cabo Verde",
    "Camboya", "Camerún", "Canadá", "Catar", "Chad", "Chile", "China", "Chipre",
    "Ciudad del Vaticano", "Colombia", "Comoras", "Corea del Norte", "Corea del Sur",
    "Costa de Marfil", "Costa Rica", "Croacia", "Cuba", "Dinamarca", "Dominica",
    "Ecuador", "Egipto", "El Salvador", "Emiratos Árabes Unidos", "Eritrea",
    "Eslovaquia", "Eslovenia", "España", "Estados Unidos", "Estonia", "Etiopía",
    "Filipinas", "Finlandia", "Fiyi", "Francia", "Gabón", "Gambia", "Georgia",
    "Ghana", "Granada", "Grecia", "Guatemala", "Guyana", "Guinea", "Guinea-Bisáu",
    "Guinea Ecuatorial", "Haití", "Honduras", "Hungría", "India", "Indonesia",
    "Irak", "Irán", "Irlanda", "Islandia", "Islas Marshall", "Islas Salomón",
    "Israel", "Italia", "Jamaica", "Japón", "Jordania", "Kazajistán", "Kenia",
    "Kirguistán", "Kiribati", "Kuwait", "Laos", "Lesoto", "Letonia", "Líbano",
    "Liberia", "Libia", "Liechtenstein", "Lituania", "Luxemburgo", "Macedonia del Norte",
    "Madagascar", "Malasia", "Malaui", "Maldivas", "Malí", "Malta", "Marruecos",
    "Mauricio", "Mauritania", "México", "Micronesia", "Moldavia", "Mónaco",
    "Mongolia", "Montenegro", "Mozambique", "Namibia", "Nauru", "Nepal", "Nicaragua",
    "Níger", "Nigeria", "Noruega", "Nueva Zelanda", "Omán", "Países Bajos",
    "Pakistán", "Palaos", "Panamá", "Papúa Nueva Guinea", "Paraguay", "Perú",
    "Polonia", "Portugal", "Reino Unido", "República Centroafricana",
    "República Checa", "República del Congo", "República Democrática del Congo",
    "República Dominicana", "Ruanda", "Rumania", "Rusia", "Samoa", "San Cristóbal y Nieves",
    "San Marino", "San Vicente y las Granadinas", "Santa Lucía", "Santo Tomé y Príncipe",
    "Senegal", "Serbia", "Seychelles", "Sierra Leona", "Singapur", "Siria",
    "Somalia", "Sri Lanka", "Suazilandia", "Sudáfrica", "Sudán", "Sudán del Sur",
    "Suecia", "Suiza", "Surinam", "Tailandia", "Tanzania", "Tayikistán",
    "Timor Oriental", "Togo", "Tonga", "Trinidad y Tobago", "Túnez", "Turkmenistán",
    "Turquía", "Tuvalu", "Ucrania", "Uganda", "Uruguay", "Uzbekistán", "Vanuatu",
    "Venezuela", "Vietnam", "Yemen", "Yibuti", "Zambia", "Zimbabue",
  ];

  function esArticuloPeriodistico(doc) {
    return obtener(doc, "delito_precedente.fuente_informacion") === "Artículo Periodístico";
  }

  function esFechaUIF(v) { return !v || validarFecha(v, "/"); }
  var ERR_FECHA = "Formato esperado: DD/MM/AAAA.";
  var soloDigitos = function (v) { return !v || /^\d+$/.test(String(v)); };
  var ERR_DIGITOS = "Solo dígitos.";

  // Campos de domicilio y de vínculos: los comparten las dos variantes de la
  // sección 3, así que se arman a partir del prefijo del bloque.
  function camposDomicilio(base) {
    return [
      { grupoTitulo: "Datos de contacto y residencia" },
      { path: base + ".calle", label: "Calle", type: "text" },
      { path: base + ".nro", label: "Nro", type: "text",
        validate: soloDigitos, errMsg: ERR_DIGITOS },
      { path: base + ".piso", label: "Piso", type: "text" },
      { path: base + ".departamento", label: "Departamento", type: "text" },
      { path: base + ".localidad", label: "Localidad", type: "text" },
      { path: base + ".codigo_postal", label: "Código postal", type: "text" },
      { path: base + ".provincia", label: "Provincia", type: "select", options: PROVINCIAS },
      { path: base + ".provincia_otro", label: "Otro (provincia)", type: "text" },
      { path: base + ".pais", label: "País", type: "text" },
      { path: base + ".email", label: "Email", type: "text",
        validate: function (v) { return !v || validarEmail(v); }, errMsg: "Email con formato inválido." },
      { path: base + ".prefijo", label: "Prefijo", type: "text",
        validate: soloDigitos, errMsg: ERR_DIGITOS },
      { path: base + ".telefono", label: "Teléfono", type: "text",
        validate: soloDigitos, errMsg: ERR_DIGITOS },
    ];
  }

  function camposVinculos(base) {
    var esPep = function (doc) { return !!obtener(doc, base + ".es_pep"); };
    return [
      { grupoTitulo: "Vínculos y perfil transaccional" },
      { path: base + ".paraiso_fiscal", label: "Relacionada con paraíso fiscal", type: "text", full: true },
      { path: base + ".triple_frontera", label: "Relacionada con triple frontera", type: "text", full: true },
      { path: base + ".es_cliente", label: "El reportado es cliente", type: "checkbox" },
      { path: base + ".es_pep", label: "Es PEP", type: "checkbox" },
      { path: base + ".relacion_hecho", label: "Relación con el hecho reportado", type: "select", options: RELACION_HECHO },
      { path: base + ".actividad", label: "Actividad", type: "text" },
      // Cargo y dependencia solo se piden (y son obligatorios) si es PEP.
      { grupoTitulo: "Datos del cargo (obligatorios por ser PEP)", showIf: esPep },
      { path: base + ".cargo", label: "Cargo", type: "text", showIf: esPep },
      { path: base + ".dependencia", label: "Dependencia", type: "text", showIf: esPep },
      { path: base + ".pais_pep", label: "País", type: "select", options: PAISES_MUNDO, showIf: esPep },
      { path: base + ".desempena_actualmente", label: "Desempeña actualmente", type: "checkbox", showIf: esPep },
    ];
  }

  function schemaArgentina(doc) {
    var secciones = [
      {
        titulo: "1 — Datos directos del ROS",
        campos: [
          { path: "datos_ros.exteriorizacion_voluntaria", label: "Exteriorización voluntaria Ley 26860",
            type: "select", options: SI_NO },
          { path: "datos_ros.tipo_instrumento", label: "Tipo de instrumento (solo si exteriorización = SI)",
            type: "select", options: ["CEDIN", "BAADE", "PADE"] },
          { path: "datos_ros.operacion", label: "Operación", type: "select", options: ["Realizada", "Tentada"] },
          { path: "datos_ros.conoce_delito_precedente", label: "Conoce existencia de posible delito precedente",
            type: "select", options: SI_NO },
        ],
      },
      {
        titulo: "2 — Delito precedente (solo si se conoce uno)",
        campos: [
          { path: "delito_precedente.delito", label: "Delito", type: "text", full: true },
          { path: "delito_precedente.fuente_informacion", label: "Fuente de la información", type: "select",
            full: true, options: FUENTE_INFORMACION },
          // Obligatorios solo si fuente_informacion = "Artículo Periodístico".
          { path: "delito_precedente.fuente_articulo", label: "Fuente del artículo", type: "select",
            options: FUENTE_ARTICULO, showIf: esArticuloPeriodistico },
          { path: "delito_precedente.fecha_articulo", label: "Fecha del artículo (DD/MM/AAAA)", type: "text",
            validate: esFechaUIF, errMsg: ERR_FECHA, showIf: esArticuloPeriodistico },
          { path: "delito_precedente.detalle_origen_articulo", label: "Detalle origen del artículo",
            type: "textarea", full: true, showIf: esArticuloPeriodistico },
        ],
      },
    ];

    // --- Sección 3: una sola variante, la que el backend marcó como "aplica" ---
    if (obtener(doc, "persona_fisica.aplica")) {
      secciones.push({
        titulo: "3 — Datos de la persona física",
        campos: [
          { grupoTitulo: "Información personal" },
          { path: "persona_fisica.apellido", label: "Apellido", type: "text" },
          { path: "persona_fisica.segundo_apellido", label: "Segundo apellido", type: "text" },
          { path: "persona_fisica.nombre", label: "Nombre", type: "text" },
          { path: "persona_fisica.segundo_nombre", label: "Segundo nombre", type: "text" },
          { path: "persona_fisica.fecha_nacimiento", label: "Fecha de nacimiento (DD/MM/AAAA)", type: "text",
            validate: esFechaUIF, errMsg: ERR_FECHA },
          { path: "persona_fisica.nacionalidad", label: "Nacionalidad", type: "text" },
          { path: "persona_fisica.sexo", label: "Sexo", type: "select", options: SEXO },
          { path: "persona_fisica.estado_civil", label: "Estado civil", type: "select", options: ESTADO_CIVIL },
          { grupoTitulo: "Identificación" },
          { path: "persona_fisica.tipo_documento", label: "Tipo documento", type: "select", options: TIPO_DOCUMENTO },
          { path: "persona_fisica.numero_documento", label: "Número documento", type: "text" },
          { path: "persona_fisica.cuit_cdi", label: "CUIT / CDI (XX-XXXXXXXX-X)", type: "text",
            validate: function (v) { return !v || /^\d{2}-\d{8}-\d$/.test(String(v)); },
            errMsg: "Formato esperado: XX-XXXXXXXX-X (11 dígitos)." },
        ].concat(camposDomicilio("persona_fisica"), camposVinculos("persona_fisica")),
      });
    } else {
      secciones.push({
        titulo: "3 — Datos de la persona física",
        avisoFijo: obtener(doc, "persona_fisica.mensaje"),
      });
    }

    if (obtener(doc, "persona_fisica_extranjera.aplica")) {
      var extranjera = [
        { grupoTitulo: "Información personal" },
        { path: "persona_fisica_extranjera.apellido", label: "Apellido", type: "text" },
        { path: "persona_fisica_extranjera.nombre", label: "Nombre", type: "text" },
        { path: "persona_fisica_extranjera.fecha_nacimiento", label: "Fecha de nacimiento (DD/MM/AAAA)",
          type: "text", validate: esFechaUIF, errMsg: ERR_FECHA },
        { path: "persona_fisica_extranjera.nacionalidad", label: "Nacionalidad", type: "text" },
        { path: "persona_fisica_extranjera.estado_civil", label: "Estado civil", type: "select",
          options: ["Ninguno/a"].concat(ESTADO_CIVIL) },
        { grupoTitulo: "Identificación" },
        { path: "persona_fisica_extranjera.tipo_identificador_tributario",
          label: "Tipo identificador tributario", type: "text" },
        { path: "persona_fisica_extranjera.numero_identificacion_tributaria",
          label: "Número identificación tributaria", type: "text" },
      ].concat(
        camposDomicilio("persona_fisica_extranjera"),
        camposVinculos("persona_fisica_extranjera")
      );
      secciones.push({ titulo: "3 — Datos de la persona física extranjera", campos: extranjera });
    } else {
      secciones.push({
        titulo: "3 — Datos de la persona física extranjera",
        avisoFijo: obtener(doc, "persona_fisica_extranjera.mensaje"),
      });
    }

    // --- Sección 4 ---
    secciones.push({
      titulo: "4 — Operaciones y productos",
      campos: [
        { path: "operaciones.inicio", label: "Inicio de la operación reportada (DD/MM/AAAA)", type: "text",
          validate: esFechaUIF, errMsg: ERR_FECHA },
        { path: "operaciones.fin", label: "Fin de la operación reportada (DD/MM/AAAA)", type: "text",
          validate: esFechaUIF, errMsg: ERR_FECHA },

        // Lugares donde se producen los hechos: hasta tres, y de ahí en adelante
        // el texto libre de domicilios adicionales.
        {
          type: "subgrupos", path: "operaciones.lugares", max: 3,
          etiquetaBase: "Operación",
          textoAgregar: "+ Agregar otra operación",
          textoExtra: "+ Agregar más direcciones",
          subcampos: [
            { campo: "localidad", label: "Localidad", type: "text" },
            { campo: "provincia", label: "Provincia", type: "select", options: PROVINCIAS },
            { campo: "provincia_otro", label: "Otro (provincia)", type: "text" },
            { campo: "pais", label: "País donde se producen los hechos", type: "text" },
            { campo: "es_zona_frontera", label: "Es zona de frontera", type: "checkbox" },
          ],
          extra: {
            path: "operaciones.domicilios_adicionales",
            label: "Domicilios adicionales (cuarta dirección en adelante)",
            type: "textarea",
          },
        },

        { grupoTitulo: "Perfil de la operación" },
        { path: "operaciones.paraiso_fiscal", label: "Operación relacionada con paraíso fiscal",
          type: "text", full: true },
        { path: "operaciones.triple_frontera", label: "Operación relacionada con triple frontera",
          type: "text", full: true },
        { path: "operaciones.tipo_inusualidad", label: "Tipo de inusualidad", type: "text" },
        { path: "operaciones.relacion_producto", label: "Relación del producto con el hecho reportado",
          type: "select", options: RELACION_PRODUCTO },

        { grupoTitulo: "Producto" },
        { path: "operaciones.producto", label: "Producto donde se registró la inusualidad", type: "text" },
        { path: "operaciones.otro_producto", label: "Otro producto (si el anterior es OTROS)", type: "text" },
        { path: "operaciones.numero_identificacion", label: "Número de identificación", type: "text" },
        { path: "operaciones.moneda_origen", label: "Moneda de origen del producto", type: "text" },
        { path: "operaciones.moneda_otro", label: "Otro (moneda)", type: "text" },
        { path: "operaciones.monto_moneda_origen", label: "Monto reportado en moneda de origen", type: "text" },
        { path: "operaciones.monto_pesos", label: "Monto reportado en pesos argentinos", type: "text" },
        { path: "operaciones.monto_letras", label: "Monto en letras", type: "textarea", full: true },

        { grupoTitulo: "Efectivo y moneda virtual" },
        { path: "operaciones.existe_efectivo_o_virtual",
          label: "Existe porcentaje operado en efectivo o moneda virtual", type: "select", options: SI_NO },
        { path: "operaciones.porcentaje_efectivo", label: "Porcentaje en efectivo", type: "text" },
        { path: "operaciones.porcentaje_virtual", label: "Porcentaje en moneda virtual", type: "text" },

        { grupoTitulo: "Señales y descripciones" },
        { path: "operaciones.senales_alerta", label: "Señales de alerta", type: "bloques", full: true,
          maxPorBloque: 300 },
        { path: "operaciones.descripcion_operatoria", label: "Descripción de la operatoria",
          type: "textarea", full: true },
        { path: "operaciones.descripcion_analisis",
          label: "Descripción del análisis efectuado por el sujeto obligado", type: "textarea", full: true },
        { path: "operaciones.documentacion_respaldo",
          label: "Informe de documentación de respaldo que posee", type: "textarea", full: true },
        { path: "operaciones.conclusiones", label: "Informe de conclusiones para emitir reporte",
          type: "textarea", full: true },
      ],
    });

    secciones.push({ titulo: "Anexo A — Señales de alerta evaluadas", reglas: true });
    return secciones;
  }

  RosModal.registrarEsquema("Argentina|ROS", schemaArgentina);
})();
