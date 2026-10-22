// Corre antes de pintar la página (sin defer)

// Si el botón del correo abrió la presentación en vez de la app, se pasa a la app con el mismo enlace.
if (/[?&](token_hash|code|error_description)=/.test(location.search)) location.replace("app/" + location.search);

// Aplica el tema guardado antes de pintar para evitar el parpadeo.
try {
  const t = localStorage.getItem("surtido-tema");
  if (t) document.documentElement.dataset.theme = t;
} catch {}
