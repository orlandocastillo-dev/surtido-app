import { combineReducers, configureStore, createAction, type ThunkAction, type UnknownAction } from "@reduxjs/toolkit";
import authReducer from "../features/auth/authSlice";
import cartReducer from "../features/cart/cartSlice";
import cashReducer from "../features/cash/cashSlice";
import customersReducer from "../features/customers/customersSlice";
import productsReducer from "../features/products/productsSlice";
import salesReducer from "../features/sales/salesSlice";
import settingsReducer from "../features/settings/settingsSlice";
import nubeReducer, { nubeRecibido, type Recibido } from "../features/nube/nubeSlice";
import { customersAdapter } from "../features/customers/customersSlice";
import { productsAdapter } from "../features/products/productsSlice";
import type { AuthState } from "../features/auth/authSlice";
import { cambiosMiddleware } from "../nube/cambios";

const slices = combineReducers({
  auth: authReducer,
  products: productsReducer,
  cart: cartReducer,
  sales: salesReducer,
  customers: customersReducer,
  cash: cashReducer,
  settings: settingsReducer,
  nube: nubeReducer,
});

export type RootState = ReturnType<typeof slices>;
/** Los datos del negocio, sin las cuentas de usuario ni el estado de la conexión. */
export type BusinessState = Omit<RootState, "auth" | "nube">;

/**
 * Reemplaza los datos del negocio (copia de seguridad, tienda de ejemplo o empezar en blanco).
 * Las cuentas y la sesión se conservan: restaurar una copia nunca deja a nadie por fuera.
 */
export const dataReplaced = createAction<BusinessState>("app/dataReplaced");

/** Igual que dataReplaced, pero con lo que llegó de la base: no se vuelve a subir. */
export const nubeReemplazado = createAction<BusinessState>("nube/reemplazado");

/** Los usuarios de la tienda (miembros en Supabase) y quién tiene la sesión abierta. */
export const nubeSesion = createAction<AuthState>("nube/sesion");

const rootReducer = (state: RootState | undefined, action: UnknownAction): RootState => {
  if (dataReplaced.match(action) || nubeReemplazado.match(action)) {
    const { auth: _a, nube: _n, ...business } = action.payload as RootState;
    void _a;
    void _n;
    const vacio = slices(undefined, { type: "@@init" });
    return { ...vacio, ...business, auth: state?.auth ?? vacio.auth, nube: state?.nube ?? vacio.nube };
  }
  if (nubeSesion.match(action) && state) return { ...state, auth: action.payload };
  if (nubeRecibido.match(action) && state) return mezclar(state, action.payload);
  return slices(state, action);
};

/** Mete en el estado las filas que llegaron de la base, reemplazando las que tengan el mismo id. */
function mezclar(state: RootState, r: Recibido): RootState {
  const porId = <T extends { id: string }>(lista: T[], nuevos: T[] = []) => {
    if (!nuevos.length) return lista;
    const m = new Map(lista.map((x) => [x.id, x]));
    for (const x of nuevos) m.set(x.id, x);
    return [...m.values()];
  };
  const sales = r.ventas?.length ? porId(state.sales.list, r.ventas).sort((a, b) => a.number - b.number || a.createdAt.localeCompare(b.createdAt)) : state.sales.list;
  const shifts = r.turnos?.length ? porId(state.cash.shifts, r.turnos).sort((a, b) => a.openedAt.localeCompare(b.openedAt)) : state.cash.shifts;
  const abierto = [...shifts].reverse().find((s) => !s.closedAt);
  return {
    ...state,
    products: r.productos?.length ? productsAdapter.upsertMany(state.products, r.productos) : state.products,
    customers: {
      ...(r.clientes?.length ? customersAdapter.upsertMany(state.customers, r.clientes) : state.customers),
      ledger: r.fiado?.length ? porId(state.customers.ledger, r.fiado).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : state.customers.ledger,
    },
    sales: { list: sales, nextNumber: Math.max(state.sales.nextNumber, ...sales.map((s) => s.number + 1)) },
    cash: r.turnos?.length ? { shifts, currentShiftId: abierto?.id ?? null } : state.cash,
    settings: r.tienda ? { ...state.settings, ...r.tienda } : state.settings,
  };
}

export function makeStore(preloadedState?: RootState) {
  return configureStore({
    reducer: rootReducer,
    preloadedState,
    // Con una tienda en la nube, cada cambio se anota para subirlo (ver src/nube/cambios.ts).
    middleware: (getDefault) => getDefault().concat(cambiosMiddleware),
  });
}

export function emptyBusinessState(): BusinessState {
  const { auth: _auth, nube: _nube, ...business } = slices(undefined, { type: "@@init" });
  void _auth;
  void _nube;
  return business;
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore["dispatch"];
export type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;
