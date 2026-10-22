// Función de Supabase (Deno) para que el dueño administre a sus vendedores

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Los vendedores que entran con celular usan un correo interno: nunca se le envía nada. */
export const DOMINIO_VENDEDORES = "vendedores.surtido.app";
const CLAVE_MINIMA = 8;

function respuesta(status: number, cuerpo: Record<string, unknown>) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function correoDe(usuario: string): string | null {
  const u = usuario.trim().toLowerCase().replace(/\s+/g, "");
  if (/^3\d{9}$/.test(u)) return `${u}@${DOMINIO_VENDEDORES}`;
  if (/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(u)) return u;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return respuesta(405, { error: "Método no permitido" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // 1. ¿Quién llama? Se valida el token de su sesión.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: quien, error: errQuien } = await admin.auth.getUser(token);
  if (errQuien || !quien.user) return respuesta(401, { error: "Tu sesión expiró. Vuelve a entrar." });

  // 2. Tiene que ser dueño de una tienda.
  const { data: yo } = await admin.from("miembros").select("tienda_id, rol").eq("user_id", quien.user.id).maybeSingle();
  if (!yo || yo.rol !== "dueño") return respuesta(403, { error: "Solo el dueño puede administrar usuarios." });

  let cuerpo: Record<string, string>;
  try {
    cuerpo = await req.json();
  } catch {
    return respuesta(400, { error: "Petición inválida." });
  }

  // El usuario sobre el que se actúa debe ser de la misma tienda.
  async function deMiTienda(userId: string) {
    const { data } = await admin.from("miembros").select("rol").eq("tienda_id", yo!.tienda_id).eq("user_id", userId).maybeSingle();
    return data;
  }

  if (cuerpo.accion === "crear") {
    const nombre = (cuerpo.nombre ?? "").trim();
    const usuario = (cuerpo.usuario ?? "").trim().toLowerCase().replace(/\s+/g, "");
    const rol = cuerpo.rol === "dueño" ? "dueño" : "vendedor";
    const email = correoDe(usuario);
    if (nombre.length < 2) return respuesta(400, { error: "Escribe el nombre.", campo: "name" });
    if (!email) return respuesta(400, { error: "Usa un correo o un celular de 10 dígitos.", campo: "login" });
    if ((cuerpo.clave ?? "").length < CLAVE_MINIMA) return respuesta(400, { error: `La contraseña debe tener al menos ${CLAVE_MINIMA} caracteres.`, campo: "password" });

    const { data: creado, error } = await admin.auth.admin.createUser({
      email,
      password: cuerpo.clave,
      email_confirm: true,
      user_metadata: { nombre },
    });
    if (error || !creado.user) {
      const ya = /already|registered|exists/i.test(error?.message ?? "");
      return respuesta(ya ? 409 : 400, { error: ya ? "Ya hay un usuario con ese correo o celular." : "No se pudo crear el usuario.", campo: "login" });
    }
    const { error: errMiembro } = await admin.from("miembros").insert({ tienda_id: yo.tienda_id, user_id: creado.user.id, nombre, rol, usuario });
    if (errMiembro) {
      await admin.auth.admin.deleteUser(creado.user.id);
      return respuesta(400, { error: "No se pudo agregar a la tienda." });
    }
    return respuesta(200, { user_id: creado.user.id });
  }

  if (cuerpo.accion === "clave") {
    if (!(await deMiTienda(cuerpo.user_id))) return respuesta(404, { error: "Ese usuario no es de tu tienda." });
    if ((cuerpo.clave ?? "").length < CLAVE_MINIMA) return respuesta(400, { error: `La contraseña debe tener al menos ${CLAVE_MINIMA} caracteres.`, campo: "password" });
    const { error } = await admin.auth.admin.updateUserById(cuerpo.user_id, { password: cuerpo.clave });
    return error ? respuesta(400, { error: "No se pudo cambiar la contraseña." }) : respuesta(200, { ok: true });
  }

  if (cuerpo.accion === "eliminar") {
    const objetivo = await deMiTienda(cuerpo.user_id);
    if (!objetivo) return respuesta(404, { error: "Ese usuario no es de tu tienda." });
    if (cuerpo.user_id === quien.user.id) return respuesta(400, { error: "No te puedes quitar a ti mismo." });
    if (objetivo.rol === "dueño") {
      const { count } = await admin.from("miembros").select("user_id", { count: "exact", head: true }).eq("tienda_id", yo.tienda_id).eq("rol", "dueño");
      if ((count ?? 0) <= 1) return respuesta(400, { error: "La tienda no se puede quedar sin dueño." });
    }
    // Borrar el usuario borra también su fila en miembros (on delete cascade)
    const { error } = await admin.auth.admin.deleteUser(cuerpo.user_id);
    return error ? respuesta(400, { error: "No se pudo quitar el acceso." }) : respuesta(200, { ok: true });
  }

  return respuesta(400, { error: "Acción desconocida." });
});
