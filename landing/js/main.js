// Surti2: menú del celular, preguntas que se abren y el año del pie

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
