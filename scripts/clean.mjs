// Vite solo vacía dist/app; esto limpia todo dist/ para que no queden archivos de builds anteriores.
import { rmSync } from "node:fs";
rmSync("dist", { recursive: true, force: true });
