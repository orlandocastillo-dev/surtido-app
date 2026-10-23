// Surti2: la venta de la portada, menú del celular, preguntas que se abren y el año del pie

const nav = document.querySelector(".nav");
const burger = document.querySelector("[data-menu-toggle]");
if (nav && burger) {
  const cerrar = () => {
    nav.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
  };
  burger.addEventListener("click", () => {
    const abierto = nav.classList.toggle("is-open");
    burger.setAttribute("aria-expanded", String(abierto));
  });
  nav.querySelectorAll(".nav__links a").forEach((a) => a.addEventListener("click", cerrar));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cerrar();
  });
}

document.querySelectorAll("[data-accordion] button[aria-controls]").forEach((boton) => {
  boton.addEventListener("click", () => {
    const abierto = boton.getAttribute("aria-expanded") === "true";
    boton.setAttribute("aria-expanded", String(!abierto));
    document.getElementById(boton.getAttribute("aria-controls")).hidden = abierto;
  });
});

document.querySelectorAll("[data-year]").forEach((el) => {
  el.textContent = String(new Date().getFullYear());
});

// La venta de la portada: se agregan los productos uno por uno, se elige Nequi y se cobra.
// Corre una vez al abrir; después queda la venta completa y un botón para verla otra vez.
const venta = document.querySelector("[data-venta]");
if (venta) {
  const lineas = [...venta.querySelectorAll(".venta__lineas li")];
  const totales = venta.querySelectorAll("[data-total]");
  const repetir = document.querySelector("[data-repetir]");
  const pesos = (n) => "$" + Math.round(n).toLocaleString("es-CO");
  let pendientes = [];

  const luego = (ms, fn) => pendientes.push(setTimeout(fn, ms));

  // El total sube contando, como en la pantalla de la caja
  let mostrado = 0;
  function contar(hasta) {
    const desde = mostrado;
    const inicio = performance.now();
    const paso = (t) => {
      const k = Math.min(1, (t - inicio) / 350);
      mostrado = desde + (hasta - desde) * k;
      totales.forEach((el) => (el.textContent = pesos(mostrado)));
      if (k < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }

  function armar() {
    pendientes.forEach(clearTimeout);
    pendientes = [];
    venta.classList.remove("is-lista", "is-pagando", "is-cobrando", "is-hecha");
    lineas.forEach((li) => li.classList.remove("is-dentro", "is-nueva"));
    mostrado = 0;
    totales.forEach((el) => (el.textContent = pesos(0)));
    repetir.hidden = true;

    let suma = 0;
    let t = 500;
    lineas.forEach((li) => {
      luego(t, () => {
        li.classList.add("is-dentro", "is-nueva");
        suma += Number(li.dataset.valor);
        contar(suma);
      });
      luego(t + 550, () => li.classList.remove("is-nueva"));
      t += 750;
    });
    luego(t + 200, () => venta.classList.add("is-pagando"));
    luego(t + 1100, () => venta.classList.add("is-cobrando"));
    luego(t + 1300, () => {
      venta.classList.remove("is-cobrando");
      venta.classList.add("is-hecha");
    });
    luego(t + 4300, () => {
      venta.classList.remove("is-hecha");
      venta.classList.add("is-lista");
      repetir.hidden = false;
    });
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    venta.classList.add("is-lista");
  } else {
    repetir.addEventListener("click", armar);
    armar();
  }
}
