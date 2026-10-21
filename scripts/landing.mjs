// Pone la página de presentación en la raíz del sitio; la app queda en /app/ (ver "build" en package.json).
import { cpSync, existsSync } from "node:fs";

if (!existsSync("dist/app/index.html")) {
  console.error("Primero hay que compilar la app (vite build --outDir dist/app).");
  process.exit(1);
}
cpSync("landing", "dist", { recursive: true });
console.log("Landing copiada en dist/, app en dist/app/");
