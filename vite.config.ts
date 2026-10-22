import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { viteSingleFile } from "vite-plugin-singlefile";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  // Modo "portable": toda la app en un solo index.html que se abre con doble clic (file://)
  const portable = mode === "portable";

  return {
    // Rutas relativas: el build funciona en GitHub Pages, Netlify o abriéndolo desde una subcarpeta.
    base: "./",
    plugins: [
      react(),
      portable
        ? viteSingleFile()
        : VitePWA({
            registerType: "autoUpdate",
            includeAssets: ["favicon.svg"],
            manifest: {
              name: "Surtido: ventas, inventario y fiado",
              short_name: "Surtido",
              description: "La app de la tienda de barrio. Funciona sin internet.",
              lang: "es-CO",
              theme_color: "#0b6e4f",
              background_color: "#f2f5f3",
              display: "standalone",
              start_url: ".",
              icons: [
                { src: "icon-192.png", sizes: "192x192", type: "image/png" },
                { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
              ],
            },
            workbox: { globPatterns: ["**/*.{js,css,html,svg,png,woff2}"] },
          }),
    ],
    build: portable
      ? { outDir: "portable", emptyOutDir: true, copyPublicDir: false }
      : undefined,
    test: {
      environment: "jsdom",
      setupFiles: ["./tests/setup.ts"],
      include: ["tests/**/*.test.{ts,tsx}"],
    },
  };
});
