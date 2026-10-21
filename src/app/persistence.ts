import type { AppStore, BusinessState, RootState } from "./store";

const KEY = "surtido:estado";
/** La copia en el equipo de una tienda con cuenta (para abrir rápido y trabajar sin internet). */
export const claveNube = (tiendaId: string) => `surtido:nube:${tiendaId}`;
const VERSION = 1;

/** Lo que se guarda: todo menos el estado de la conexión, que se arma al abrir. */
type Guardado = Omit<RootState, "nube">;

interface Saved {
  version: number;
  savedAt: string;
  state: Guardado & { nube?: unknown };
}

export function loadState(key = KEY): RootState | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const saved = JSON.parse(raw) as Saved;
    if (saved.version !== VERSION) return undefined;
    // Datos guardados antes de que existieran las cuentas: se agregan vacías y se pide crear la cuenta.
    const { nube: _nube, ...resto } = saved.state;
    void _nube;
    return { ...resto, auth: saved.state.auth ?? { users: [], sessionUserId: null } } as unknown as RootState;
  } catch {
    return undefined;
  }
}

export function serialize(state: Guardado): string {
  const saved: Saved = { version: VERSION, savedAt: new Date().toISOString(), state };
  return JSON.stringify(saved);
}

/** La copia de seguridad lleva los datos del negocio, nunca las cuentas ni sus contraseñas. */
export function serializeBackup(state: RootState): string {
  const { nube: _nube, ...resto } = state;
  void _nube;
  return serialize({ ...resto, auth: { users: [], sessionUserId: null } });
}

export function parseBackup(text: string): BusinessState {
  const data = JSON.parse(text) as Partial<Saved>;
  if (data.version !== VERSION || !data.state?.products || !data.state.sales) {
    throw new Error("El archivo no es una copia de seguridad válida de Surtido.");
  }
  const { auth: _auth, nube: _nube, ...business } = data.state;
  void _auth;
  void _nube;
  return business;
}

/**
 * Guarda el estado en el navegador para que la tienda funcione sin internet.
 * Se agrupan los cambios cada 400 ms para no escribir en cada tecla.
 */
export function persist(store: AppStore): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    const state = store.getState();
    // Mientras se revisa la sesión no se guarda nada, para no pisar ninguna de las dos copias.
    if (state.nube.estado === "iniciando") return;
    const key = state.nube.modo === "nube" && state.nube.tiendaId ? claveNube(state.nube.tiendaId) : KEY;
    try {
      const { nube: _nube, ...resto } = state;
      void _nube;
      localStorage.setItem(key, serialize(resto));
    } catch {
      // Almacenamiento lleno o bloqueado: la app sigue funcionando en memoria.
    }
  };
  const unsubscribe = store.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(save, 400);
  });
  window.addEventListener("pagehide", save);
  return () => {
    unsubscribe();
    window.removeEventListener("pagehide", save);
  };
}
