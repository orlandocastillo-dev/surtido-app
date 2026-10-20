import type { AppStore, BusinessState, RootState } from "./store";

const KEY = "surtido:estado";
const VERSION = 1;

interface Saved {
  version: number;
  savedAt: string;
  state: RootState;
}

export function loadState(): RootState | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const saved = JSON.parse(raw) as Saved;
    if (saved.version !== VERSION) return undefined;
    // Datos guardados antes de que existieran las cuentas: se agregan vacías y se pide crear la cuenta.
    return { ...saved.state, auth: saved.state.auth ?? { users: [], sessionUserId: null } };
  } catch {
    return undefined;
  }
}

export function serialize(state: RootState): string {
  const saved: Saved = { version: VERSION, savedAt: new Date().toISOString(), state };
  return JSON.stringify(saved);
}

/** La copia de seguridad lleva los datos del negocio, nunca las cuentas ni sus contraseñas. */
export function serializeBackup(state: RootState): string {
  return serialize({ ...state, auth: { users: [], sessionUserId: null } });
}

export function parseBackup(text: string): BusinessState {
  const data = JSON.parse(text) as Partial<Saved>;
  if (data.version !== VERSION || !data.state?.products || !data.state.sales) {
    throw new Error("El archivo no es una copia de seguridad válida de Surtido.");
  }
  const { auth: _auth, ...business } = data.state;
  void _auth;
  return business;
}

/**
 * Guarda el estado en el navegador para que la tienda funcione sin internet.
 * Se agrupan los cambios cada 400 ms para no escribir en cada tecla.
 */
export function persist(store: AppStore): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    try {
      localStorage.setItem(KEY, serialize(store.getState()));
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
