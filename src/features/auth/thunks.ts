import { dataReplaced, emptyBusinessState, type AppThunk, type BusinessState } from "../../app/store";
import { createSeedState } from "../../data/seed";
import { hashPassword, newSalt, verifyPassword } from "../../lib/crypto";
import { newId } from "../../lib/id";
import { settingsUpdated } from "../settings/settingsSlice";
import { loggedIn, passwordChanged, userCreated, type Role, type User } from "./authSlice";

export type AuthResult = { ok: true } | { ok: false; field?: string; message: string };

export const MIN_PASSWORD = 6;

export function normalizeLogin(login: string): string {
  return login.trim().toLowerCase().replace(/\s+/g, "");
}

function validLogin(login: string): boolean {
  // Correo electrónico o celular colombiano de 10 dígitos.
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(login) || /^3\d{9}$/.test(login);
}

async function buildUser(name: string, login: string, password: string, role: Role): Promise<User> {
  const salt = newSalt();
  return {
    id: newId("usr"),
    name: name.trim(),
    login: normalizeLogin(login),
    role,
    salt,
    passwordHash: await hashPassword(password, salt),
    createdAt: new Date().toISOString(),
  };
}

export interface RegisterInput {
  storeName: string;
  name: string;
  login: string;
  password: string;
  start: "ejemplo" | "vacio" | "conservar";
}

/** Crea la tienda con su dueño, prepara los datos iniciales y deja la sesión abierta. */
export function registerStore(input: RegisterInput): AppThunk<Promise<AuthResult>> {
  return async (dispatch, getState) => {
    if (getState().auth.users.length > 0) {
      return { ok: false, message: "Esta tienda ya tiene una cuenta. Inicia sesión." };
    }
    if (input.storeName.trim().length < 3) return { ok: false, field: "storeName", message: "Escribe el nombre de la tienda." };
    if (input.name.trim().length < 3) return { ok: false, field: "name", message: "Escribe tu nombre." };
    if (!validLogin(normalizeLogin(input.login))) {
      return { ok: false, field: "login", message: "Usa un correo o un celular de 10 dígitos." };
    }
    if (input.password.length < MIN_PASSWORD) {
      return { ok: false, field: "password", message: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` };
    }

    const owner = await buildUser(input.name, input.login, input.password, "dueño");

    if (input.start !== "conservar") {
      const business: BusinessState = input.start === "ejemplo" ? createSeedState() : emptyBusinessState();
      dispatch(dataReplaced(business));
    }
    dispatch(settingsUpdated({ storeName: input.storeName.trim() }));
    dispatch(userCreated(owner));
    dispatch(loggedIn(owner.id));
    return { ok: true };
  };
}

export function login(loginName: string, password: string): AppThunk<Promise<AuthResult>> {
  return async (dispatch, getState) => {
    const user = getState().auth.users.find((u) => u.login === normalizeLogin(loginName));
    // Mismo mensaje si el usuario no existe o la contraseña falla: no se revela qué cuentas existen.
    const ok = user ? await verifyPassword(password, user.salt, user.passwordHash) : false;
    if (!user || !ok) return { ok: false, message: "Usuario o contraseña incorrectos." };
    dispatch(loggedIn(user.id));
    return { ok: true };
  };
}

export function addUser(name: string, loginName: string, password: string, role: Role): AppThunk<Promise<AuthResult>> {
  return async (dispatch, getState) => {
    const me = getState().auth.users.find((u) => u.id === getState().auth.sessionUserId);
    if (me?.role !== "dueño") return { ok: false, message: "Solo el dueño puede crear usuarios." };
    if (name.trim().length < 2) return { ok: false, field: "name", message: "Escribe el nombre." };
    const normalized = normalizeLogin(loginName);
    if (!validLogin(normalized)) return { ok: false, field: "login", message: "Usa un correo o un celular de 10 dígitos." };
    if (getState().auth.users.some((u) => u.login === normalized)) {
      return { ok: false, field: "login", message: "Ya hay un usuario con ese correo o celular." };
    }
    if (password.length < MIN_PASSWORD) {
      return { ok: false, field: "password", message: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` };
    }
    dispatch(userCreated(await buildUser(name, normalized, password, role)));
    return { ok: true };
  };
}

export function changePassword(current: string, next: string): AppThunk<Promise<AuthResult>> {
  return async (dispatch, getState) => {
    const user = getState().auth.users.find((u) => u.id === getState().auth.sessionUserId);
    if (!user) return { ok: false, message: "Tu sesión expiró." };
    if (!(await verifyPassword(current, user.salt, user.passwordHash))) {
      return { ok: false, field: "current", message: "La contraseña actual no es correcta." };
    }
    if (next.length < MIN_PASSWORD) {
      return { ok: false, field: "next", message: `La nueva contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` };
    }
    const salt = newSalt();
    dispatch(passwordChanged({ id: user.id, salt, passwordHash: await hashPassword(next, salt) }));
    return { ok: true };
  };
}

/** Cuenta de la tienda de ejemplo: para que quien visite la demo entre sin registrarse. */
export const DEMO_LOGIN = "demo@surtido.co";
export const DEMO_PASSWORD = "demo1234";

// Entra a la tienda de ejemplo
export function enterDemo(): AppThunk<Promise<AuthResult>> {
  return async (dispatch, getState) => {
    const existing = getState().auth.users.find((u) => u.login === DEMO_LOGIN);
    if (existing) {
      dispatch(loggedIn(existing.id));
      return { ok: true };
    }
    if (getState().auth.users.length > 0) return { ok: false, message: "Esta tienda ya tiene una cuenta. Inicia sesión." };
    return dispatch(registerStore({ storeName: "Doña Rosa", name: "Rosa Méndez", login: DEMO_LOGIN, password: DEMO_PASSWORD, start: "ejemplo" }));
  };
}
