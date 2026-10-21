import { createAction, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Customer, LedgerEntry, Product, Sale, Shift } from "../../types";

/**
 * Dónde viven los datos.
 * - "local": la tienda de ejemplo o la app sin Supabase configurado. Todo en el navegador.
 * - "nube": la tienda tiene cuenta en Supabase. Se trabaja igual sin internet y los cambios suben solos.
 */
export interface NubeState {
  modo: "local" | "nube";
  /** "iniciando" mientras se revisa si hay sesión guardada; la app espera para no mostrar el login de más. */
  estado: "iniciando" | "listo";
  tiendaId: string | null;
  /** Cambios hechos en este equipo que todavía no llegan a la base. */
  pendientes: number;
  enLinea: boolean;
  ultimaSincronizacion: string | null;
  error: string | null;
}

const initialState: NubeState = { modo: "local", estado: "listo", tiendaId: null, pendientes: 0, enLinea: true, ultimaSincronizacion: null, error: null };

const nubeSlice = createSlice({
  name: "nube",
  initialState,
  reducers: {
    nubeIniciando(state) {
      state.estado = "iniciando";
    },
    nubeLista(state) {
      state.estado = "listo";
    },
    nubeConectada(state, action: PayloadAction<{ tiendaId: string }>) {
      Object.assign(state, { modo: "nube", estado: "listo", tiendaId: action.payload.tiendaId, error: null });
    },
    nubeDesconectada() {
      return initialState;
    },
    nubeEstado(state, action: PayloadAction<Partial<Pick<NubeState, "pendientes" | "enLinea" | "ultimaSincronizacion" | "error">>>) {
      Object.assign(state, action.payload);
    },
  },
});

export const { nubeIniciando, nubeLista, nubeConectada, nubeDesconectada, nubeEstado } = nubeSlice.actions;
export default nubeSlice.reducer;

/** Filas que llegaron de la base (de otro equipo o del primer arranque). Se mezclan sin crear cambios nuevos. */
export interface Recibido {
  productos?: Product[];
  clientes?: Customer[];
  fiado?: LedgerEntry[];
  ventas?: Sale[];
  turnos?: Shift[];
  tienda?: { storeName: string; enforceCreditLimit: boolean };
}
export const nubeRecibido = createAction<Recibido>("nube/recibido");

/** Las acciones que vienen de la base: la sincronización no las vuelve a subir. */
export const esDeLaNube = (type: string) => type.startsWith("nube/");
