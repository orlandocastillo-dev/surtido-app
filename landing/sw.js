// Antes la app vivía en la raíz y dejó un service worker que guarda la versión vieja.
// Este lo reemplaza, se da de baja y recarga las pestañas para que muestren la página nueva.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Solo el caché de la raíz: el de la app en /app/ es otro y se queda.
      const oldCache = `workbox-precache-v2-${self.registration.scope}`;
      await self.registration.unregister();
      await caches.delete(oldCache);
      const windows = await self.clients.matchAll({ type: "window" });
      for (const w of windows) w.navigate(new URL("/", w.url).href);
    })(),
  );
});
