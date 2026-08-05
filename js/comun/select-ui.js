/* =============================================================================
 * select-ui.js — reemplaza la LISTA desplegable nativa de cada <select> por una
 * propia (mismo aspecto que el resto del formulario: naranja en foco/hover, radio
 * de 12px, etc). El menú nativo del navegador/SO no se puede skinnear de forma
 * consistente entre plataformas (Windows/mac/Chrome/Firefox difieren y varios no
 * aceptan CSS en absoluto sobre esa lista) — por eso se construye una lista propia.
 *
 * El <select> original NUNCA se quita del DOM: queda oculto (opacity:0) como única
 * fuente de verdad de su valor. Todo el código existente (app.js, ros-modal.js) que
 * lee `.value` o escucha "change" sigue funcionando sin cambios, porque la lista
 * propia solo hace `select.value = ...` + `dispatchEvent(change)`.
 *
 * Se aplica automáticamente a TODO <select> presente al cargar y a cualquiera que
 * aparezca después (usa un MutationObserver), así que cubre por igual los 2
 * desplegables fijos del ROE de Chile y los que arma dinámicamente el modal de
 * revisión del ROS.
 * ========================================================================== */
(function () {
  "use strict";

  var ENHANCED = new WeakSet();
  var openWrap = null;

  function textoOpcion(opt) { return opt ? (opt.textContent || "") : ""; }

  function cerrar(wrap) {
    if (!wrap) return;
    wrap.classList.remove("open");
    var lb = wrap.querySelector(".sel-listbox");
    if (lb) lb.hidden = true;
    var disp = wrap.querySelector(".sel-display");
    if (disp) disp.setAttribute("aria-expanded", "false");
    if (openWrap === wrap) openWrap = null;
  }

  function cerrarTodos() { if (openWrap) cerrar(openWrap); }

  function sincronizar(wrap) {
    var select = wrap.querySelector("select");
    var disp = wrap.querySelector(".sel-display");
    var texto = wrap.querySelector(".sel-display-text");
    var sel = select.selectedOptions && select.selectedOptions[0];
    texto.textContent = textoOpcion(sel);
    disp.classList.toggle("placeholder", !!sel && !sel.value && select.options.length > 0);
    disp.classList.toggle("disabled", select.disabled);
    disp.setAttribute("aria-disabled", select.disabled ? "true" : "false");
    disp.tabIndex = select.disabled ? -1 : 0;
  }

  function marcarActiva(lb, li) {
    Array.prototype.forEach.call(lb.querySelectorAll(".sel-opt"), function (x) {
      x.classList.remove("active");
    });
    if (li) li.classList.add("active");
  }

  function construirListbox(wrap) {
    var select = wrap.querySelector("select");
    var lb = wrap.querySelector(".sel-listbox");
    lb.innerHTML = "";
    Array.prototype.forEach.call(select.options, function (opt, i) {
      var li = document.createElement("li");
      li.setAttribute("role", "option");
      li.className = "sel-opt" + (opt.selected ? " selected" : "");
      li.textContent = textoOpcion(opt);
      li.addEventListener("click", function () {
        select.selectedIndex = i;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        sincronizar(wrap);
        cerrar(wrap);
        wrap.querySelector(".sel-display").focus();
      });
      lb.appendChild(li);
    });
  }

  function abrir(wrap) {
    var select = wrap.querySelector("select");
    if (select.disabled) return;
    cerrarTodos();
    construirListbox(wrap);
    var lb = wrap.querySelector(".sel-listbox");
    lb.hidden = false;
    wrap.classList.add("open");
    wrap.querySelector(".sel-display").setAttribute("aria-expanded", "true");
    openWrap = wrap;
    var activa = lb.querySelector(".sel-opt.selected") || lb.querySelector(".sel-opt");
    if (activa) {
      marcarActiva(lb, activa);
      activa.scrollIntoView({ block: "nearest" });
    }
  }

  function moverActiva(wrap, delta) {
    var lb = wrap.querySelector(".sel-listbox");
    var items = Array.prototype.slice.call(lb.querySelectorAll(".sel-opt"));
    if (!items.length) return;
    var actual = items.findIndex(function (x) { return x.classList.contains("active"); });
    var next = items[Math.min(items.length - 1, Math.max(0, (actual === -1 ? 0 : actual) + delta))];
    marcarActiva(lb, next);
    next.scrollIntoView({ block: "nearest" });
  }

  function elegirActiva(wrap) {
    var activa = wrap.querySelector(".sel-opt.active");
    if (activa) activa.click();
  }

  function enhance(select) {
    if (!select || select.tagName !== "SELECT" || ENHANCED.has(select)) return;
    ENHANCED.add(select);

    // El select original queda oculto pero funcional: sigue siendo el valor real
    // (name/value participan en FormData igual que antes) y accesible solo por su
    // rol de almacenamiento, no de interacción (por eso tabIndex=-1 + aria-hidden).
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");

    var wrap = document.createElement("span");
    wrap.className = "sel-wrap";
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);

    var disp = document.createElement("div");
    disp.className = "sel-display";
    disp.setAttribute("role", "combobox");
    disp.setAttribute("aria-haspopup", "listbox");
    disp.setAttribute("aria-expanded", "false");
    disp.innerHTML =
      '<span class="sel-display-text"></span>' +
      '<svg class="sel-chevron" viewBox="0 0 12 8" aria-hidden="true">' +
      '<path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round"/></svg>';
    wrap.appendChild(disp);

    var lb = document.createElement("ul");
    lb.className = "sel-listbox";
    lb.setAttribute("role", "listbox");
    lb.hidden = true;
    wrap.appendChild(lb);

    sincronizar(wrap);

    disp.addEventListener("click", function () {
      if (select.disabled) return;
      if (wrap.classList.contains("open")) cerrar(wrap); else abrir(wrap);
    });
    disp.addEventListener("keydown", function (e) {
      if (select.disabled) return;
      if (!wrap.classList.contains("open")) {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          abrir(wrap);
        }
        return;
      }
      if (e.key === "ArrowDown") { e.preventDefault(); moverActiva(wrap, 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); moverActiva(wrap, -1); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); elegirActiva(wrap); }
      else if (e.key === "Escape") { e.preventDefault(); cerrar(wrap); disp.focus(); }
      else if (e.key === "Tab") { cerrar(wrap); }
    });

    // El select puede cambiar de opciones/estado por código externo (p. ej. al
    // repoblar año/trimestre del ROE) sin pasar por nuestra lista: se reobserva
    // directamente el <select> para no perder esos cambios.
    var mo = new MutationObserver(function () {
      sincronizar(wrap);
      if (wrap.classList.contains("open")) construirListbox(wrap);
    });
    mo.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
    select.addEventListener("change", function () { sincronizar(wrap); });
  }

  function enhanceAll(root) {
    if (!root || !root.querySelectorAll) return;
    Array.prototype.forEach.call(root.querySelectorAll("select"), enhance);
  }

  document.addEventListener("click", function (e) {
    if (openWrap && !openWrap.contains(e.target)) cerrar(openWrap);
  });

  document.addEventListener("DOMContentLoaded", function () { enhanceAll(document); });

  // Cubre los <select> agregados después (formulario ROE de Chile ya presente en
  // el HTML, pero el modal de revisión los crea dinámicamente cada vez que abre).
  new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      Array.prototype.forEach.call(m.addedNodes, function (node) {
        if (node.nodeType !== 1) return;
        if (node.tagName === "SELECT") enhance(node);
        else enhanceAll(node);
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
