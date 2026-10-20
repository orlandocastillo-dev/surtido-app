import { combineReducers, configureStore, createAction, type ThunkAction, type UnknownAction } from "@reduxjs/toolkit";
import authReducer from "../features/auth/authSlice";
import cartReducer from "../features/cart/cartSlice";
import cashReducer from "../features/cash/cashSlice";
import customersReducer from "../features/customers/customersSlice";
import productsReducer from "../features/products/productsSlice";
import salesReducer from "../features/sales/salesSlice";
import settingsReducer from "../features/settings/settingsSlice";

const slices = combineReducers({
  auth: authReducer,
  products: productsReducer,
  cart: cartReducer,
  sales: salesReducer,
  customers: customersReducer,
  cash: cashReducer,
  settings: settingsReducer,
});

export type RootState = ReturnType<typeof slices>;
/** Los datos del negocio, sin las cuentas de usuario. */
export type BusinessState = Omit<RootState, "auth">;

/**
 * Reemplaza los datos del negocio (copia de seguridad, tienda de ejemplo o empezar en blanco).
 * Las cuentas y la sesión se conservan: restaurar una copia nunca deja a nadie por fuera.
 */
export const dataReplaced = createAction<BusinessState>("app/dataReplaced");

const rootReducer = (state: RootState | undefined, action: UnknownAction): RootState => {
  if (dataReplaced.match(action)) {
    const { auth: _ignored, ...business } = action.payload as RootState;
    void _ignored;
    return { ...slices(undefined, { type: "@@init" }), ...business, auth: state?.auth ?? slices(undefined, { type: "@@init" }).auth };
  }
  return slices(state, action);
};

export function makeStore(preloadedState?: RootState) {
  return configureStore({ reducer: rootReducer, preloadedState });
}

export function emptyBusinessState(): BusinessState {
  const { auth: _auth, ...business } = slices(undefined, { type: "@@init" });
  void _auth;
  return business;
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore["dispatch"];
export type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;
