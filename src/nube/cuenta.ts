import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Role, User } from "../features/auth/authSlice";
import { nube } from "./cliente";
import type { FilaMiembro } from "./esquema";

/** En la nube la contraseña pide un poco más que en el modo sin internet. */
export const CLAVE_MINIMA_NUBE = 8;

/** Los vendedores que entran con celular usan un correo interno (nunca se les envía nada). */
export const DOMINIO_VENDEDORES = "vendedores.surtido.app";

export type Resultado = { ok: true } | { ok: false; field?: string; message: string };

const esCorreo = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v);
const esCelular = (v: string) => /^3\d{9}$/.test(v);

/** "300 111 2233" → el correo interno del vendedor; un correo se deja igual. */
export function correoParaEntrar(usuario: string): string | null {
  const u = usuario.trim().toLowerCase().replace(/\s+/g, "");
  if (esCelular(u)) return `${u}@${DOMINIO_VENDEDORES}`;
  if (esCorreo(u)) return u;
  return null;
}

/** Errores de Supabase en palabras de tendero. */
export function mensaje(error: unknown): string {
  const e = error as { message?: string; code?: string; status?: number; context?: { status?: number } };
  const m = `${e?.code ?? ""} ${e?.message ?? ""}`;
  if (/invalid_credentials|Invalid login credentials/i.test(m)) return "Usuario o contraseña incorrectos.";
  if (/email_not_confirmed|Email not confirmed/i.test(m)) return "Todavía no has confirmado tu correo. Revisa tu bandeja de entrada (y la de spam).";
  if (/user_already_exists|already registered/i.test(m)) return "Ya hay una cuenta con ese correo. Entra con tu contraseña.";
  if (/weak_password|Password should/i.test(m)) return `La contraseña es muy débil. Usa al menos ${CLAVE_MINIMA_NUBE} caracteres, con letras y números.`;
  if (/same_password/i.test(m)) return "La nueva contraseña debe ser distinta de la anterior.";
  if (/rate limit|too many/i.test(m) || e?.status === 429) return "Hiciste muchos intentos seguidos. Espera un minuto.";
  if (/fetch|network|Failed to/i.test(m)) return "No hay internet. Revisa la conexión e inténtalo de nuevo.";
  return "Algo salió mal. Inténtalo de nuevo en un momento.";
}

export async function sesionActual(): Promise<Session | null> {
  const db = await nube();
  return (await db.auth.getSession()).data.session;
}

/** Datos que se guardan al crear la cuenta y se usan al confirmar el correo para crear la tienda. */
export interface Pendiente {
  tienda: string;
  nombre: string;
  inicio: "ejemplo" | "vacio" | "conservar";
}

export async function crearCuentaDueno(email: string, clave: string, p: Pendiente): Promise<Resultado & { confirmar?: boolean }> {
  const correo = email.trim().toLowerCase();
  if (!esCorreo(correo)) return { ok: false, field: "login", message: "Para la cuenta del dueño usa un correo: ahí te llega el enlace para confirmarla." };
  if (clave.length < CLAVE_MINIMA_NUBE) return { ok: false, field: "password", message: `La contraseña debe tener al menos ${CLAVE_MINIMA_NUBE} caracteres.` };
  try {
    const db = await nube();
    const { data, error } = await db.auth.signUp({
      email: correo,
      password: clave,
      options: { data: { nombre: p.nombre.trim(), tienda_pendiente: p }, emailRedirectTo: window.location.origin + window.location.pathname },
    });
    if (error) return { ok: false, message: mensaje(error) };
    if (data.user && data.user.identities?.length === 0) return { ok: false, field: "login", message: "Ya hay una cuenta con ese correo. Entra con tu contraseña." };
    return { ok: true, confirmar: !data.session };
  } catch (e) {
    return { ok: false, message: mensaje(e) };
  }
}

export async function entrar(usuario: string, clave: string): Promise<Resultado> {
  const email = correoParaEntrar(usuario);
  if (!email) return { ok: false, field: "usuario", message: "Escribe tu correo o tu celular de 10 dígitos." };
  try {
    const db = await nube();
    const { error } = await db.auth.signInWithPassword({ email, password: clave });
    return error ? { ok: false, message: mensaje(error) } : { ok: true };
  } catch (e) {
    return { ok: false, message: mensaje(e) };
  }
}

export async function recuperarClave(email: string): Promise<Resultado> {
  const correo = email.trim().toLowerCase();
  if (!esCorreo(correo)) return { ok: false, field: "correo", message: "Escribe el correo con el que creaste la tienda." };
  try {
    const db = await nube();
    const { error } = await db.auth.resetPasswordForEmail(correo, { redirectTo: window.location.origin + window.location.pathname });
    return error ? { ok: false, message: mensaje(error) } : { ok: true };
  } catch (e) {
    return { ok: false, message: mensaje(e) };
  }
}

export async function reenviarConfirmacion(email: string): Promise<Resultado> {
  try {
    const db = await nube();
    const { error } = await db.auth.resend({ type: "signup", email: email.trim().toLowerCase(), options: { emailRedirectTo: window.location.origin + window.location.pathname } });
    return error ? { ok: false, message: mensaje(error) } : { ok: true };
  } catch (e) {
    return { ok: false, message: mensaje(e) };
  }
}

/** Cambiar la propia contraseña: primero se comprueba la actual volviendo a entrar con ella. */
export async function cambiarMiClave(email: string, actual: string | null, nueva: string): Promise<Resultado> {
  if (nueva.length < CLAVE_MINIMA_NUBE) return { ok: false, field: "next", message: `La nueva contraseña debe tener al menos ${CLAVE_MINIMA_NUBE} caracteres.` };
  try {
    const db = await nube();
    if (actual !== null) {
      const { error } = await db.auth.signInWithPassword({ email, password: actual });
      if (error) return { ok: false, field: "current", message: "La contraseña actual no es correcta." };
    }
    const { error } = await db.auth.updateUser({ password: nueva });
    return error ? { ok: false, message: mensaje(error) } : { ok: true };
  } catch (e) {
    return { ok: false, message: mensaje(e) };
  }
}

export async function salir() {
  const db = await nube();
  await db.auth.signOut({ scope: "local" });
}

// ---------------------------------------------------------------------------
// Tienda y miembros
// ---------------------------------------------------------------------------

export async function miMembresia(db: SupabaseClient, userId: string): Promise<{ tienda_id: string; rol: Role } | null> {
  const { data, error } = await db.from("miembros").select("tienda_id, rol").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data as { tienda_id: string; rol: Role } | null;
}

export async function crearTienda(db: SupabaseClient, nombreTienda: string, miNombre: string, miUsuario: string): Promise<string> {
  const { data, error } = await db.rpc("crear_tienda", { nombre_tienda: nombreTienda, mi_nombre: miNombre, mi_usuario: miUsuario });
  if (error) throw error;
  return data as string;
}

/** Los miembros de la tienda, como usuarios de la app (sin contraseñas: esas las guarda Supabase). */
export async function cargarMiembros(db: SupabaseClient): Promise<User[]> {
  const { data, error } = await db.from("miembros").select("user_id, nombre, rol, usuario, creado_en").order("creado_en");
  if (error) throw error;
  return ((data ?? []) as FilaMiembro[]).map((m) => ({ id: m.user_id, name: m.nombre, login: m.usuario, role: m.rol, passwordHash: "", salt: "", createdAt: m.creado_en }));
}

/** Llama a la función de servidor que crea, cambia o quita vendedores (necesita la llave de servicio). */
async function vendedores(cuerpo: Record<string, string>): Promise<Resultado & { user_id?: string }> {
  try {
    const db = await nube();
    const { data, error } = await db.functions.invoke("vendedores", { body: cuerpo });
    if (error) {
      // El cuerpo de la respuesta trae el mensaje en español y el campo con el error.
      const ctx = (error as { context?: Response }).context;
      const detalle = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
      return { ok: false, field: detalle?.campo, message: detalle?.error ?? mensaje(error) };
    }
    return { ok: true, ...(data as { user_id?: string }) };
  } catch (e) {
    return { ok: false, message: mensaje(e) };
  }
}

export const crearVendedor = (nombre: string, usuario: string, clave: string, rol: Role) => vendedores({ accion: "crear", nombre, usuario, clave, rol });
export const cambiarClaveDe = (userId: string, clave: string) => vendedores({ accion: "clave", user_id: userId, clave });
export const quitarVendedor = (userId: string) => vendedores({ accion: "eliminar", user_id: userId });
