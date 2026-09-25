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
 *     excluyentes: se muestra la que el doc marque como "aplica". Esa
 *     decisión la toma el backend al generar el documento (no es reactiva
 *     dentro del modal, igual que natural/jurídica en Colombia).
 *   - La sección 4 repite el lugar de los hechos con los sufijos 1, 2 y 3
 *     (aquí "Primera/Segunda/Tercera operación"): se usa el campo `subgrupos`,
 *     que muestra el primero y va revelando los siguientes con un botón; al
 *     llegar al tercero, el mismo botón revela "Domicilios adicionales" para la
 *     cuarta dirección en adelante.
 *
 * Campos obligatorios/opcionales y condicionales: transcritos de
 * "formato ROS Argentina.txt" (Obligatorio/Opcional/Condicional de cada
 * campo). `required` bloquea la descarga si el campo está vacío;
 * `requiredTrue` es para checkboxes que DEBEN quedar tildados (no alcanza con
 * que tengan un valor). Un campo condicional usa `showIf` — el motor
 * (modal.js) ya excluye los campos ocultos de la validación, así que
 * `required` + `showIf` alcanza para expresar "obligatorio solo si se
 * cumple la condición".
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

  var DELITOS_PRECEDENTES = [
    "Tráfico y comercialización ilícita de estupefacientes (ley 23.737)",
    "Contrabando de armas y contrabando de estupefacientes (ley 22.415)",
    "Asociación ilícita", "Fraude contra la administración pública",
    "Prostitución de menores", "Pornografía infantil", "Extorsión", "Trata de personas",
    "Narcotráfico", "Cohecho", "Tráfico de influencias",
    "Malversación de caudales públicos", "Exacciones ilegales",
    "Enriquecimiento ilícito de funcionarios y empleados", "Evasión simple",
    "Evasión agravada", "Aprovechamiento indebido de los subsidios",
    "Obtención fraudulenta de beneficios fiscales", "Apropiación indebida de tributos",
    "Contrabando de cereales y oleaginosas", "Contrabando de alimentos",
    "Asociación ilícita fiscal",
    "Delitos ambientales y/o tráfico de fauna y vida silvestre",
    "Trata de personas y explotación laboral", "Robo y/o tráfico de obras de arte",
    "Robo y/o tráfico de objetos y/o documentos históricos",
    "Tráfico de Residuos peligrosos",
    "Fabricación, tráfico o contrabando de armas químicas y/o de destrucción masiva",
    "Defraudaciones y/o estafas", "Fraudes al comercio y a la industria",
    "Delitos contra el orden económico y/o financiero", "Desabastecimiento",
    "Delitos cometidos por asociaciones ilícitas (artículo 210 del Código Penal) organizadas para cometer delitos por fines políticos o raciales",
    "Colocación de activos en el exterior sin declarar",
    "Intermediación financiera no autorizada",
    "Suministro o utilización de información financiera privilegiada", "Usura",
    "Quiebras fraudulentas",
    "Falseamiento u ocultación de balances, memorias u otros documentos de contabilidad",
    "Libramiento numerosos de cheques sin fondos", "Fraudes bursátiles",
    "Especulación con valores negociables para hacer subir o bajar los precios o simular liquidez valiéndose de noticias falsas y/o simuladas",
    "Empleados y funcionarios de instituciones financieras o bursátiles que recibieran dinero y/ u otros beneficios económicos como condición para celebrar operaciones crediticias",
    "Delitos que afecten la ley de cambios",
    "Delitos que afecten la ley de defensa de la competencia",
  ];

  var PARAISOS_FISCALES = [
    "Ninguno/a", "ANGUILA (Territorio no autónomo del Reino Unido)",
    "ANTIGUA Y BARBUDA (Estado independiente)",
    "ANTILLAS HOLANDESAS (Territorio de Países Bajos)",
    "ARUBA (Territorio de Países Bajos)", "ASCENCION",
    "COMUNIDAD DE LAS BAHAMAS (Estado independiente)", "BARBADOS (Estado independiente)",
    "BELICE (Estado independiente)", "BERMUDAS (Territorio no autónomo del Reino Unido)",
    "BRUNEI DARUSSALAM (Estado independiente)", "CAMPIONE D'ITALIA",
    "COLONIA DE GIBRALTAR", "EL COMMONWEALTH DE DOMINICA (Estado Asociado)",
    "EMIRATOS ARABES UNIDOS (Estado independiente)",
    "ESTADO DE BAHREIN (Estado independiente)",
    "ESTADO ASOCIADO DE GRANADA (Estado independiente)",
    "ESTADO LIBRE ASOCIADO DE PUERTO RICO (Estado asociado a los EEUU)",
    "ESTADO DE KUWAIT (Estado independiente)", "ESTADO DE QATAR (Estado independiente)",
    "FEDERACION DE SAN CRISTOBAL (Islas Saint Kitts and Nevis: Independientes)",
    "LUXEMBURGO (Régimen Aplicable a las Sociedades Holding)", "GROENLANDIA",
    "GUAM (Territorio no autónomo de los EEUU)", "HONK KONG (Territorio de China)",
    "ISLAS AZORES",
    "ISLAS DEL CANAL (Guernesey, Jersey, Alderney, Isla de Great Stark, Herm, Little Sark, Brechou, Jethou Lihou)",
    "ISLAS CAIMAN (Territorio no autónomo del Reino Unido)", "ISLA CHRISTMAS",
    "ISLA DE COCOS O KEELING",
    "ISLAS DE COOK (Territorio autónomo asociado a Nueva Zelanda)",
    "ISLA DE MAN (Territorio del Reino Unido)", "ISLA DE NORFOLK",
    "ISLAS TURKAS E ISLAS CAICOS (Territorio no autónomo del Reino Unido)",
    "ISLAS PACIFICO", "ISLAS SALOMON", "ISLA DE SAN PEDRO Y MIGUELON", "ISLA QESHM",
    "ISLAS VIRGENES BRITANICAS (Territorio no autónomo del Reino Unido)",
    "ISLAS VIRGENES DE ESTADOS UNIDOS DE AMERICA", "KIRIBATI", "LABUAN", "MACAO",
    "MADEIRA (Territorio de Portugal)",
    "MONTSERRAT (Territorio no autónomo del Reino Unido)", "NIUE", "PATAU", "PITCAIRN",
    "POLINESIA FRANCESA (Territorio de Ultramar de Francia)",
    "PRINCIPADO DEL VALLE DE ANDORRA",
    "PRINCIPADO DE LIECHTENSTEIN (Estado independiente)", "PRINCIPADO DE MONACO",
    "REGIMEN APLICABLE A LAS SOCIEDADES ANONIMAS FINANCIERAS (regidas por la ley 11.073 del 24 de junio de 1948 de la República Oriental del Uruguay)",
    "REINO DE TONGA (Estado independiente)", "REINO HACHEMITA DE JORDANIA",
    "REINO DE SWAZILANDIA (Estado independiente)", "REPUBLICA DE ALBANIA",
    "REPUBLICA DE ANGOLA", "REPUBLICA DE CABO VERDE (Estado independiente)",
    "REPUBLICA DE CHIPRE (Estado independiente)",
    "REPUBLICA DE DJIBUTI (Estado independiente)",
    "REPUBLICA COOPERATIVA DE GUYANA (Estado independiente)",
    "REPUBLICA DE PANAMA (Estado independiente)", "REPUBLICA DE TRINIDAD Y TOBAGO",
    "REPUBLICA DE LIBERIA (Estado independiente)",
    "REPUBLICA DE SEYCHELLES (Estado independiente)", "REPUBLICA DE MAURICIO",
    "REPUBLICA TUNECINA", "REPUBLICA DE MALDIVAS (Estado independiente)",
    "REPUBLICA DE LAS ISLAS MARSHALL (Estado independiente)",
    "REPUBLICA DE NAURU (Estado independiente)",
    "REPUBLICA DEMOCRATICA SOCIALISTA DE SRI LANKA (Estado independiente)",
    "REPUBLICA DE VANUATU", "REPUBLICA DEL YEMEN",
    "REPUBLICA DE MALTA (Estado independiente)", "SANTA ELENA", "SANTA LUCIA",
    "SAN VICENTE Y LAS GRANADINAS (Estado independiente)",
    "SAMOA AMERICANA (Territorio no autónomo de los EEUU)", "SAMOA OCCIDENTAL",
    "SERENISIMA REPUBLICA DE SAN MARINO (Estado independiente)", "SULTANATO DE OMAN",
    "ARCHIPIELAGO DE SVALBARD", "TUVALU", "TRISTAN DA CUNHA", "TRIESTE (Italia)",
    "TOKELAU", "ZONA LIBRE DE OSTRAVA (ciudad de la antigua Checoeslovaquia)",
  ];

  var TRIPLE_FRONTERA = [
    "Ninguno/a", "PUERTO IGUAZÚ", "EL DORADO", "PUERTO VICTORIA", "PUERTO ESPERANZA",
    "PUERTO WANDA", "PUERTO LIBERTAD", "COLONIA DELICIA", "COMANDANTE ANDRESITO",
    "BERNARDO DE IRIGOYEN",
  ];

  var PRODUCTOS = [
    "ACUERDOS FIDUCIARIOS", "APORTES DE CAPITAL", "ASISTENCIA", "BANCA ELECTRÓNICA",
    "CAJA DE AHORROS", "CAJA DE SEGURIDAD", "CANCELACIÓN ANTICIPADA DE CRÉDITOS",
    "CANCELACIÓN ANTICIPADA PÓLIZA DE SEGURO", "CANCELACIÓN DE HIPOTECA",
    "CARTA DE CRÉDITO DE IMPORTACIÓN", "CAUCIONES DE TÍTULOS PÚBLICOS",
    "CERTIFICACIÓN DE FIRMA", "CESIÓN DE DERECHOS", "CESIÓN DE DERECHOS DE FIDEICOMISOS",
    "CHEQUES", "COBRANZAS PÓLIZAS DE SEGUROS", "COBRO DE GIROS", "COMERCIO EXTERIOR",
    "COMPRA DE ORO", "COMPRA EN SUBASTA", "COMPRA/VENTA DE BONOS JUDICIALES",
    "COMPRA/VENTA DE INMUEBLES", "COMPRA/VENTA DE PAQUETE ACCIONARIO",
    "COMPRA/VENTA DE RODADOS", "COMPRA/VENTA DE TÍTULOS PÚBLICOS",
    "COMPRA/VENTA TARJETAS TELEFÓNICAS", "COMPRA/VENTA VALORES NEGOCIABLES",
    "COMPRA/VENTA DE MONEDA EXTRANJERA", "COMPRA/VENTA DE FÁBRICAS Y/O EMPRESAS",
    "CONSTATACIÓN DE INTIMACIÓN DE PAGO", "CONVENIO CANCELACIÓN DEUDA Y PAGO",
    "CONVENIO DÉBITO AUTOMÁTICO", "CUENTA COMITENTE", "CUENTA CORRIENTE",
    "CUENTA CUSTODIA", "CUENTA TÍTULOS", "DONACIÓN", "EGRESO DE DÓLARES NO DECLARADOS",
    "ESCRITURAS DE PODERES", "ESCRITURAS PROTOCOLARES", "FONDO COMÚN DE INVERSIÓN",
    "IMPORTACIONES", "INGRESO DE DIVISAS", "INGRESOS NO DECLARADOS",
    "INVERSIONES DE PORTAFOLIO EN EL EXTERIOR", "LIBERACIÓN DE HIPOTECA", "MUTUOS",
    "OPERACIONES BURSATILES", "ORDEN DE PAGO", "P.PRENDARIO", "PAGARÉ", "PAGARÉ EXTERIOR",
    "PAGO A PROVEEDORES", "PF REPROGRAMADO", "PLAZO FIJO", "PREMIO DE BINGO",
    "PREMIO DE CASINOS", "PRÉSTAMO HIPOTECARIO", "PRÉSTAMO PERSONAL", "PRÉSTAMO PRENDARIO",
    "PRÉSTAMOS DEL EXTERIOR", "RECAUDACIONES", "RECONOCIMIENTO DEUDA Y CESIÓN DERECHOS",
    "REMESAS DE FONDOS", "REPATRIACIONES INVERSIONES DE RESIDENTES", "RESCATE DE PÓLIZAS",
    "RETIROS EN EFECTIVO", "SEGURO DE CAPITALIZACIÓN", "SEGURO DE VIDA",
    "SEGURO RESPONSABILIDAD CIVIL PROFESIONAL", "SEGUROS ACCIDENTES PERSONALES",
    "SEGUROS DE RETIRO", "SERVICIOS DE RED", "TARJETAS DE CREDITO", "TENENCIA ACCIONARIA",
    "TENENCIA DE MONEDA EXTRANJERA", "TÍTULOS COOPERATIVOS DE CAPITALIZACIÓN",
    "TÍTULOS PÚBLICOS", "TRANFERENCIA", "TRANSFERENCIA DE DOMINIOS",
    "TRANSFERENCIA TENTADA DESDE EL EXTERIOR", "TRANSFERENCIAS BANCARIAS DE FONDOS",
    "TRANSFERENCIAS DE FONDOS", "TRASLADOS DE CAUDALES", "VENTA DE ACCIONES",
    "VENTA DE ORO", "OTROS",
  ];

  var MONEDAS = [
    "Peso Argentino", "Bolívar Venezolano", "Corona Checa", "Corona Danesa",
    "Corona Noruega", "Corona Sueca", "Dinar Serbia", "Dólar Australiano",
    "Dólar Canadiense", "Dólar Estadounidense", "Euro (Unidad Monetaria Europea)",
    "Florín (Antillas Holandesas)", "Franco Suizo", "Guaraní Paraguayo", "Libra Esterlina",
    "Nuevo Sol Peruano", "Peso Boliviano", "Peso Chileno", "Peso Colombiano",
    "Peso Mexicano", "Peso Uruguayo", "Rand Sudafricano", "Real (Brasil)",
    "Shekel (Israel)", "Yen (Japón)", "Yuan (Rep. Pop. de China)", "Otro/a",
  ];

  // Catálogo de países para nacionalidad, país de residencia y el "País" del
  // cargo PEP: no es una lista taxativa de la UIF (no hay valores exactos que
  // verificar contra el formulario), solo nombres de países en español para
  // el desplegable. Espejo de core/paises/argentina/enums.py PAISES_MUNDO
  // (mismo orden, mismos nombres — el backend ya traduce nacionalidad ahí).
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
  // Montos: la UIF no admite puntos ni comas (ni miles ni decimales) — si hay
  // centavos, se redondean al entero más cercano antes de completar el campo.
  var esMontoEntero = soloDigitos;
  var ERR_MONTO = "Solo dígitos, sin puntos ni comas (si hay centavos, redondee al entero más cercano).";
  var esPorcentaje = function (v) {
    if (!v) return true;
    var s = String(v).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return false;
    var n = Number(s);
    return n >= 0 && n <= 100;
  };
  var ERR_PORCENTAJE = "Debe ser un número entre 0 y 100.";

  // --- Monto en letras: espejo en JS de monto_en_letras() del backend -------
  // (core/paises/argentina/ros/fields.py) — el campo se recalcula en vivo acá
  // porque el analista puede corregir "Monto reportado en pesos argentinos" en
  // el modal, y el texto en letras tiene que seguir ese cambio sin volver a
  // generar el documento. Escala LARGA (la del español): 10^6 es "millón" y
  // 10^12 es "billón"; 10^9 no es una escala propia, es "mil millones".
  var UNIDADES_LETRAS = [
    "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho",
    "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis",
    "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós",
    "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete",
    "veintiocho", "veintinueve",
  ];
  var DECENAS_LETRAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
  var CENTENAS_LETRAS = [
    "", "ciento", "doscientos", "trescientos", "cuatrocientos",
    "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos",
  ];

  function centenasEnLetras(n) {
    if (n < 30) return UNIDADES_LETRAS[n];
    if (n < 100) {
      var d = Math.floor(n / 10), u = n % 10;
      return DECENAS_LETRAS[d] + (u ? " y " + UNIDADES_LETRAS[u] : "");
    }
    if (n === 100) return "cien";
    var c = Math.floor(n / 100), resto = n % 100;
    return CENTENAS_LETRAS[c] + (resto ? " " + centenasEnLetras(resto) : "");
  }

  function apocopar(texto) {
    if (texto === "uno") return "un";
    if (texto === "veintiuno") return "veintiún";
    if (texto.slice(-4) === " uno") return texto.slice(0, -4) + " un";
    if (texto.slice(-10) === " veintiuno") return texto.slice(0, -10) + " veintiún";
    return texto;
  }

  function milesEnLetras(n) {
    if (n < 1000) return centenasEnLetras(n);
    var miles = Math.floor(n / 1000), resto = n % 1000;
    var prefijo = miles === 1 ? "mil" : apocopar(centenasEnLetras(miles)) + " mil";
    return prefijo + (resto ? " " + centenasEnLetras(resto) : "");
  }

  function montoEnLetras(valor) {
    if (valor === "" || valor == null) return "";
    var n = Math.round(Number(valor));
    if (!isFinite(n) || isNaN(n) || n < 0) return "";
    var moneda = n === 1 ? "peso argentino" : "pesos argentinos";
    if (n === 0) return "cero " + moneda;

    var partes = [];
    var billones = Math.floor(n / 1e12), resto = n % 1e12;
    if (billones) partes.push(apocopar(milesEnLetras(billones)) + " " + (billones === 1 ? "billón" : "billones"));
    var millones = Math.floor(resto / 1e6);
    resto = resto % 1e6;
    if (millones) partes.push(apocopar(milesEnLetras(millones)) + " " + (millones === 1 ? "millón" : "millones"));
    if (resto) partes.push(milesEnLetras(resto));

    var texto = apocopar(partes.join(" ").trim());
    return (texto + " " + moneda).trim();
  }

  // "Monto en letras" no lo edita la persona (queda disabled en el modal, ver
  // camposArgentina más abajo): lo recalcula el código cada vez que cambia
  // "Monto reportado en pesos argentinos".
  function actualizarMontoLetras(doc) {
    var letras = montoEnLetras(obtener(doc, "operaciones.monto_pesos"));
    if (!doc.operaciones) doc.operaciones = {};
    doc.operaciones.monto_letras = letras;
    var input = document.getElementById("f_operaciones.monto_letras");
    if (input) input.value = letras;
  }

  // Campos de domicilio y de vínculos: los comparten las dos variantes de la
  // sección 3, así que se arman a partir del prefijo del bloque.
  function camposDomicilio(base) {
    return [
      { grupoTitulo: "Datos de contacto y residencia" },
      { path: base + ".calle", label: "Calle", type: "text", required: true },
      { path: base + ".nro", label: "Nro", type: "text", required: true,
        validate: soloDigitos, errMsg: ERR_DIGITOS },
      { path: base + ".piso", label: "Piso", type: "text" },
      { path: base + ".departamento", label: "Departamento", type: "text" },
      { path: base + ".localidad", label: "Localidad", type: "text", required: true },
      { path: base + ".codigo_postal", label: "Código postal", type: "text" },
      { path: base + ".provincia", label: "Provincia", type: "select", options: PROVINCIAS,
        required: true },
      // reservaEspacio: mantiene su lugar junto a "Provincia" aunque no aplique,
      // para que "País" quede siempre en la fila de abajo (no se corre según si
      // se eligió "Otro/a" en provincia).
      { path: base + ".provincia_otro", label: "Otro (provincia)", type: "text", required: true,
        reservaEspacio: true,
        showIf: function (doc) { return obtener(doc, base + ".provincia") === "Otro/a"; } },
      { path: base + ".pais", label: "País", type: "select", options: PAISES_MUNDO,
        required: true },
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
      { path: base + ".paraiso_fiscal", label: "Relacionada con paraíso fiscal", type: "select",
        options: PARAISOS_FISCALES, full: true, required: true },
      { path: base + ".triple_frontera", label: "Relacionada con triple frontera", type: "select",
        options: TRIPLE_FRONTERA, full: true, required: true },
      // No es obligatorio: se puede reportar a alguien que NO es cliente
      // (se desmarca la casilla).
      { path: base + ".es_cliente", label: "El reportado es cliente", type: "checkbox" },
      { path: base + ".es_pep", label: "Es PEP", type: "checkbox" },
      { path: base + ".relacion_hecho", label: "Relación con el hecho reportado", type: "select",
        options: RELACION_HECHO, required: true },
      { path: base + ".actividad", label: "Actividad", type: "text", required: true },
      // Cargo y dependencia solo se piden (y son obligatorios) si es PEP; país
      // y "desempeña actualmente" son opcionales aun siendo PEP.
      { grupoTitulo: "Datos del cargo (obligatorios por ser PEP)", showIf: esPep },
      { path: base + ".cargo", label: "Cargo", type: "text", required: true, showIf: esPep },
      { path: base + ".dependencia", label: "Dependencia", type: "text", required: true, showIf: esPep },
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
            type: "select", options: SI_NO, required: true },
          // reservaEspacio: mantiene su lugar junto a "Exteriorización..." aunque
          // no aplique, para que "Operación" y "Conoce delito precedente" queden
          // siempre en la fila de abajo (no se corren según el valor de Ley 26860).
          { path: "datos_ros.tipo_instrumento", label: "Tipo de instrumento", type: "select",
            options: ["CEDIN", "BAADE", "PADE"], required: true, reservaEspacio: true,
            showIf: function (doc) { return obtener(doc, "datos_ros.exteriorizacion_voluntaria") === "SI"; } },
          { path: "datos_ros.operacion", label: "Operación", type: "select",
            options: ["Realizada", "Tentada"], required: true },
          { path: "datos_ros.conoce_delito_precedente", label: "Conoce existencia de posible delito precedente",
            type: "select", options: SI_NO, required: true },
        ],
      },
      {
        titulo: "2 — Delito precedente",
        // Sección entera dependiente: solo aplica si el analista marcó que
        // conoce un delito precedente (si cambia de opinión, se oculta de
        // nuevo con todo y título).
        showIf: function (doc) { return obtener(doc, "datos_ros.conoce_delito_precedente") === "SI"; },
        campos: [
          { path: "delito_precedente.delito", label: "Delito", type: "select",
            options: DELITOS_PRECEDENTES, full: true, required: true },
          { path: "delito_precedente.fuente_informacion", label: "Fuente de la información", type: "select",
            full: true, options: FUENTE_INFORMACION, required: true },
          // Obligatorios solo si fuente_informacion = "Artículo Periodístico".
          { path: "delito_precedente.fuente_articulo", label: "Fuente del artículo", type: "select",
            options: FUENTE_ARTICULO, required: true, showIf: esArticuloPeriodistico },
          { path: "delito_precedente.fecha_articulo", label: "Fecha del artículo (DD/MM/AAAA)", type: "text",
            validate: esFechaUIF, errMsg: ERR_FECHA, required: true, showIf: esArticuloPeriodistico },
          { path: "delito_precedente.detalle_origen_articulo", label: "Detalle origen del artículo",
            type: "textarea", full: true, required: true, showIf: esArticuloPeriodistico },
        ],
      },
    ];

    // --- Sección 3: una sola variante, la que el backend marcó como "aplica" ---
    // (decisión tomada UNA vez al generar el documento, según la nacionalidad
    // consultada en la BD — no cambia si el analista edita el campo acá).
    if (obtener(doc, "persona_fisica.aplica")) {
      secciones.push({
        titulo: "3 — Datos de la persona física",
        campos: [
          { grupoTitulo: "Información personal" },
          { path: "persona_fisica.apellido", label: "Apellido", type: "text", required: true },
          { path: "persona_fisica.segundo_apellido", label: "Segundo apellido", type: "text" },
          { path: "persona_fisica.nombre", label: "Nombre", type: "text", required: true },
          { path: "persona_fisica.segundo_nombre", label: "Segundo nombre", type: "text" },
          { path: "persona_fisica.fecha_nacimiento", label: "Fecha de nacimiento (DD/MM/AAAA)", type: "text",
            validate: esFechaUIF, errMsg: ERR_FECHA, required: true },
          { path: "persona_fisica.nacionalidad", label: "Nacionalidad", type: "select",
            options: PAISES_MUNDO, required: true },
          { path: "persona_fisica.sexo", label: "Sexo", type: "select", options: SEXO, required: true },
          { path: "persona_fisica.estado_civil", label: "Estado civil", type: "select",
            options: ESTADO_CIVIL, required: true },
          { grupoTitulo: "Identificación" },
          { path: "persona_fisica.tipo_documento", label: "Tipo documento", type: "select",
            options: TIPO_DOCUMENTO, required: true },
          { path: "persona_fisica.numero_documento", label: "Número documento", type: "text", required: true },
          { path: "persona_fisica.cuit_cdi", label: "CUIT / CDI (XX-XXXXXXXX-X)", type: "text", required: true,
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
        { path: "persona_fisica_extranjera.apellido", label: "Apellido", type: "text", required: true },
        { path: "persona_fisica_extranjera.nombre", label: "Nombre", type: "text", required: true },
        { path: "persona_fisica_extranjera.fecha_nacimiento", label: "Fecha de nacimiento (DD/MM/AAAA)",
          type: "text", validate: esFechaUIF, errMsg: ERR_FECHA, required: true },
        { path: "persona_fisica_extranjera.nacionalidad", label: "Nacionalidad", type: "select",
          options: PAISES_MUNDO, required: true },
        { path: "persona_fisica_extranjera.estado_civil", label: "Estado civil", type: "select",
          options: ["Ninguno/a"].concat(ESTADO_CIVIL), required: true },
        { grupoTitulo: "Identificación" },
        { path: "persona_fisica_extranjera.tipo_identificador_tributario",
          label: "Tipo identificador tributario", type: "text", required: true },
        { path: "persona_fisica_extranjera.numero_identificacion_tributaria",
          label: "Número identificación tributaria", type: "text", required: true },
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
          validate: esFechaUIF, errMsg: ERR_FECHA, required: true },
        { path: "operaciones.fin", label: "Fin de la operación reportada (DD/MM/AAAA)", type: "text",
          validate: esFechaUIF, errMsg: ERR_FECHA, required: true },

        // Lugares donde se producen los hechos: hasta tres, y de ahí en adelante
        // el texto libre de domicilios adicionales.
        {
          type: "subgrupos", path: "operaciones.lugares", max: 3,
          etiquetaBase: "Operación",
          textoAgregar: "+ Agregar otra operación",
          textoExtra: "+ Agregar más direcciones",
          subcampos: [
            { campo: "localidad", label: "Localidad", type: "text", required: true },
            { campo: "provincia", label: "Provincia", type: "select", options: PROVINCIAS, required: true },
            // reservaEspacio: mantiene su lugar junto a "Provincia" aunque no
            // aplique, para que "País donde se producen los hechos" quede
            // siempre en la fila de abajo.
            { campo: "provincia_otro", label: "Otro (provincia)", type: "text", required: true,
              reservaEspacio: true,
              // showIf de subgrupo: recibe (doc, rutaDelItem), no solo (doc),
              // porque mira OTRO campo de ese MISMO ítem repetido.
              showIf: function (doc, rutaItem) { return obtener(doc, rutaItem + ".provincia") === "Otro/a"; } },
            { campo: "pais", label: "País donde se producen los hechos", type: "select",
              options: PAISES_MUNDO, required: true },
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
          type: "select", options: PARAISOS_FISCALES, full: true, required: true },
        { path: "operaciones.triple_frontera", label: "Operación relacionada con triple frontera",
          type: "select", options: TRIPLE_FRONTERA, full: true, required: true },
        { path: "operaciones.tipo_inusualidad", label: "Tipo de inusualidad", type: "text", required: true },
        { path: "operaciones.relacion_producto", label: "Relación del producto con el hecho reportado",
          type: "select", options: RELACION_PRODUCTO, required: true },

        { grupoTitulo: "Producto" },
        { path: "operaciones.producto", label: "Producto donde se registró la inusualidad", type: "select",
          options: PRODUCTOS, required: true },
        { path: "operaciones.otro_producto", label: "Otro producto", type: "text", required: true,
          showIf: function (doc) { return obtener(doc, "operaciones.producto") === "OTROS"; } },
        { path: "operaciones.numero_identificacion", label: "Número de identificación", type: "text",
          required: true },
        { path: "operaciones.moneda_origen", label: "Moneda de origen del producto", type: "select",
          options: MONEDAS, required: true },
        { path: "operaciones.moneda_otro", label: "Otro (moneda)", type: "text", required: true,
          showIf: function (doc) { return obtener(doc, "operaciones.moneda_origen") === "Otro/a"; } },
        { path: "operaciones.monto_moneda_origen", label: "Monto reportado en moneda de origen", type: "text",
          required: true, validate: esMontoEntero, errMsg: ERR_MONTO },
        { path: "operaciones.monto_pesos", label: "Monto reportado en pesos argentinos", type: "text",
          required: true, validate: esMontoEntero, errMsg: ERR_MONTO,
          alCambiar: actualizarMontoLetras },
        { path: "operaciones.monto_letras", label: "Monto en letras", type: "textarea", full: true,
          required: true, disabledIf: function () { return true; } },

        { grupoTitulo: "Efectivo y moneda virtual" },
        { path: "operaciones.existe_efectivo_o_virtual",
          label: "Existe porcentaje operado en efectivo o moneda virtual", type: "select", options: SI_NO,
          required: true },
        { path: "operaciones.porcentaje_efectivo", label: "Porcentaje en efectivo", type: "text",
          validate: esPorcentaje, errMsg: ERR_PORCENTAJE,
          showIf: function (doc) { return obtener(doc, "operaciones.existe_efectivo_o_virtual") === "SI"; } },
        { path: "operaciones.porcentaje_virtual", label: "Porcentaje en moneda virtual", type: "text",
          validate: esPorcentaje, errMsg: ERR_PORCENTAJE,
          showIf: function (doc) { return obtener(doc, "operaciones.existe_efectivo_o_virtual") === "SI"; } },

        { grupoTitulo: "Descripciones" },
        { path: "operaciones.descripcion_operatoria", label: "Descripción de la operatoria",
          type: "textarea", full: true, required: true },
        { path: "operaciones.descripcion_analisis",
          label: "Descripción del análisis efectuado por el sujeto obligado", type: "textarea", full: true,
          required: true },
        { path: "operaciones.documentacion_respaldo",
          label: "Informe de documentación de respaldo que posee", type: "textarea", full: true,
          required: true },
        { path: "operaciones.conclusiones", label: "Informe de conclusiones para emitir reporte",
          type: "textarea", full: true, required: true },
      ],
    });

    secciones.push({ titulo: "Anexo A — Señales de alerta evaluadas", reglas: true });
    return secciones;
  }

  RosModal.registrarEsquema("Argentina|ROS", schemaArgentina);
})();
