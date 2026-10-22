// Surtido: interacciones de la landing

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const formatCOP = (value) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })
    .format(value)
    .replace(/ /g, "");

// Menú móvil
function initMenu() {
  const toggle = document.querySelector("[data-menu-toggle]");
  const menu = document.getElementById("menu");
  if (!toggle || !menu) return;

  const setOpen = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.querySelector(".sr-only").textContent = open ? "Cerrar menú" : "Abrir menú";
    menu.classList.toggle("is-open", open);
  };

  toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));

  // Cerrar al elegir un enlace, con Escape o al pasar a escritorio.
  menu.addEventListener("click", (e) => {
    if (e.target.closest("a")) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menu.classList.contains("is-open")) {
      setOpen(false);
      toggle.focus();
    }
  });
  window.matchMedia("(min-width: 821px)").addEventListener("change", (e) => e.matches && setOpen(false));
}

// Borde de la barra al hacer scroll
function initNavShadow() {
  const nav = document.querySelector("[data-nav]");
  if (!nav) return;
  const update = () => nav.classList.toggle("is-scrolled", window.scrollY > 4);
  update();
  window.addEventListener("scroll", update, { passive: true });
}

// Tema claro / oscuro
function initTheme() {
  const button = document.querySelector("[data-theme-toggle]");
  if (!button) return;
  const root = document.documentElement;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

  const current = () => root.dataset.theme || (systemDark.matches ? "dark" : "light");
  const sync = () => {
    const dark = current() === "dark";
    root.dataset.theme = current();
    button.setAttribute("aria-label", dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro");
  };

  button.addEventListener("click", () => {
    root.dataset.theme = current() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("surtido-tema", root.dataset.theme);
    } catch {
      /* Almacenamiento no disponible: el cambio dura solo esta visita. */
    }
    sync();
  });

  sync();
}

// Pestañas accesibles (patrón WAI-ARIA)
function initTabs() {
  document.querySelectorAll("[data-tabs]").forEach((container) => {
    const tabs = [...container.querySelectorAll('[role="tab"]')];

    const select = (tab, focus = true) => {
      tabs.forEach((t) => {
        const selected = t === tab;
        t.setAttribute("aria-selected", String(selected));
        t.tabIndex = selected ? 0 : -1;
        document.getElementById(t.getAttribute("aria-controls")).hidden = !selected;
      });
      if (focus) tab.focus();
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => select(tab, false));
      tab.addEventListener("keydown", (e) => {
        const keys = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 };
        if (!(e.key in keys)) return;
        e.preventDefault();
        select(tabs[(keys[e.key] + tabs.length) % tabs.length]);
      });
    });
  });
}

// Precios mensual / anual
function initBilling() {
  const buttons = document.querySelectorAll("[data-billing]");
  if (!buttons.length) return;

  const apply = (period) => {
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.billing === period)));
    document.querySelectorAll("[data-price]").forEach((el) => {
      el.textContent = formatCOP(Number(el.dataset[period]));
    });
    document.querySelectorAll("[data-period]").forEach((el) => {
      el.textContent = period === "anual" ? "al mes, pago anual" : "al mes";
    });
  };

  buttons.forEach((b) => b.addEventListener("click", () => apply(b.dataset.billing)));
}

// Acordeón de preguntas
function initAccordion() {
  document.querySelectorAll("[data-accordion]").forEach((list) => {
    list.addEventListener("click", (e) => {
      const button = e.target.closest("button[aria-controls]");
      if (!button) return;
      const open = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!open));
      document.getElementById(button.getAttribute("aria-controls")).hidden = open;
    });
  });
}

// Animación del total en el teléfono del hero
function initHeroTotal() {
  const total = document.querySelector("[data-total]");
  if (!total || prefersReducedMotion) return;

  const target = Number(total.dataset.value);
  const start = 500; // coincide con el inicio de la animación CSS de las líneas
  const duration = 1800;
  total.textContent = formatCOP(0);

  setTimeout(() => {
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      // Redondeado a $100, como se ve en una caja registradora.
      total.textContent = formatCOP(Math.round((target * eased) / 100) * 100);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, start);
}

// Año del pie de página
function initYear() {
  const el = document.querySelector("[data-year]");
  if (el) el.textContent = String(new Date().getFullYear());
}

initMenu();
initNavShadow();
initTheme();
initTabs();
initBilling();
initAccordion();
initHeroTotal();
initYear();
