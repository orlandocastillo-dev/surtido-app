import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";
import { emptyBusinessState, nubeSesion, type AppStore, type BusinessState } from "../app/store";
import { createSeedState } from "../data/seed";
import { nubeConectada, nubeEstado, nubeIniciando, nubeLista } from "../features/nube/nubeSlice";
import { datosParaReemplazar } from "./cambios";
import { nube, nubeDisponible } from "./cliente";
import { cargarMiembros, crearTienda, miMembresia, type Pendiente } from "./cuenta";
import { Sincronizador } from "./sync";

let store: AppStore;
let sinc: Sincronizador | null = null;
let conectado: string | null = null;
let conectando: Promise<void> | null = null;

const recordar = (uid: string, tienda: string) => {
  try {
    localStorage.setItem(`surtido:tienda-de:${uid}`, tienda);
  } catch {
    // modo privado
  }
};
const recordada = (uid: string) => {
  try {
    return localStorage.getItem(`surtido:tienda-de:${uid}`);
  } catch {
    return null;
  }
};

/**
 * Al abrir la app con Supabase configurado: revisa si hay una sesión guardada y, si la hay,
 * abre esa tienda. Mientras tanto la app muestra una pantalla de carga en vez del login.
 */
export async function iniciarNube(s: AppStore) {
  store = s;
  if (!nubeDisponible()) return;
  store.dispatch(nubeIniciando());
  try {
    const db = await nube();
    db.auth.onAuthStateChange((evento, sesion) => {
      // Supabase pide no hacer otras llamadas dentro de este aviso: se atiende en el siguiente ciclo.
      setTimeout(() => void manejar(db, evento, sesion), 0);
    });
  } catch {
    store.dispatch(nubeLista());
  }
}

async function manejar(db: SupabaseClient, evento: AuthChangeEvent, sesion: Session | null) {
  if (evento === "PASSWORD_RECOVERY") window.location.hash = "#/nueva-clave";
  if (!sesion) {
    if (conectado) {
      // Se cerró la sesión: se vuelve a la copia sin cuenta de este equipo.
      sinc?.detener();
      window.location.reload();
      return;
    }
    store.dispatch(nubeLista());
    return;
  }
  if (conectado === sesion.user.id) return;
  conectando ??= conectar(db, sesion).finally(() => (conectando = null));
  await conectando;
}

async function conectar(db: SupabaseClient, sesion: Session) {
  const uid = sesion.user.id;
  store.dispatch(nubeIniciando());
  let tiendaId: string | null = null;
  try {
    const m = await miMembresia(db, uid);
    if (m) tiendaId = m.tienda_id;
    else {
      // Cuenta nueva que acaba de confirmar el correo: se crea su tienda con lo que eligió al registrarse.
      const p = sesion.user.user_metadata?.tienda_pendiente as Pendiente | undefined;
      if (!p) {
        store.dispatch(nubeEstado({ error: "Tu usuario no pertenece a ninguna tienda. Pídele al dueño que te agregue." }));
        await db.auth.signOut({ scope: "local" });
        store.dispatch(nubeLista());
        return;
      }
      tiendaId = await prepararTiendaNueva(db, p, sesion.user.email ?? "");
    }
  } catch {
    // Sin internet: si este equipo ya conocía la tienda, se abre su copia y se sincroniza después.
    tiendaId = recordada(uid);
    if (!tiendaId) {
      store.dispatch(nubeEstado({ error: "No hay internet para abrir tu tienda. Inténtalo cuando vuelva la conexión.", enLinea: false }));
      store.dispatch(nubeLista());
      return;
    }
  }

  recordar(uid, tiendaId);
  conectado = uid;
  sinc = new Sincronizador(db, tiendaId, store);
  sinc.abrirCopia();
  const usuarios = await cargarMiembros(db).catch(() => sinc!.usuariosDeLaCopia());
  store.dispatch(nubeSesion({ users: usuarios, sessionUserId: uid }));
  store.dispatch(nubeConectada({ tiendaId }));
  await sinc.arrancar();
}

/** Crea la tienda del dueño y la llena según lo que eligió: ejemplo, en blanco o lo que ya tenía. */
async function prepararTiendaNueva(db: SupabaseClient, p: Pendiente, email: string): Promise<string> {
  const tiendaId = await crearTienda(db, p.tienda, p.nombre, email);
  const actual = store.getState();
  const base: BusinessState =
    p.inicio === "ejemplo"
      ? (({ auth: _a, nube: _n, ...b }) => (void _a, void _n, b))(createSeedState())
      : p.inicio === "conservar" && actual.nube.modo === "local"
        ? (({ auth: _a, nube: _n, ...b }) => (void _a, void _n, b))(actual)
        : emptyBusinessState();
  const datos = datosParaReemplazar({ ...base, settings: { ...base.settings, storeName: p.tienda.trim() } });
  const { error } = await db.rpc("reemplazar_tienda", { datos });
  if (error) throw error;
  await db.auth.updateUser({ data: { tienda_pendiente: null } });
  return tiendaId;
}

/** Vuelve a leer los usuarios de la tienda (después de agregar o quitar un vendedor). */
export async function refrescarMiembros() {
  const db = await nube();
  const usuarios = await cargarMiembros(db);
  store.dispatch(nubeSesion({ users: usuarios, sessionUserId: store.getState().auth.sessionUserId }));
}

/** Fuerza una sincronización (botón "Sincronizar ahora"). */
export const sincronizarAhora = () => sinc?.ciclo();

/** Solo para pruebas. */
export function reiniciarConexion() {
  sinc?.detener();
  sinc = null;
  conectado = null;
  conectando = null;
}
