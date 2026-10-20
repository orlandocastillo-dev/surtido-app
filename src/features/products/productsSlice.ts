import { createEntityAdapter, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Product } from "../../types";
import { saleRecorded, saleVoided } from "../sales/actions";

export const productsAdapter = createEntityAdapter<Product>({
  sortComparer: (a, b) => a.name.localeCompare(b.name, "es"),
});

const productsSlice = createSlice({
  name: "products",
  initialState: productsAdapter.getInitialState(),
  reducers: {
    productAdded: productsAdapter.addOne,
    productUpdated: productsAdapter.updateOne,
    productRemoved: productsAdapter.removeOne,
    /** Entrada de mercancía (delta positivo) o ajuste por pérdida o conteo (negativo). */
    stockAdjusted(state, action: PayloadAction<{ id: string; delta: number }>) {
      const product = state.entities[action.payload.id];
      if (product) product.stock = round3(product.stock + action.payload.delta);
    },
    favoriteToggled(state, action: PayloadAction<string>) {
      const product = state.entities[action.payload];
      if (product) product.favorite = !product.favorite;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(saleRecorded, (state, { payload }) => {
        for (const item of payload.items) {
          const product = state.entities[item.productId];
          if (product) product.stock = round3(product.stock - item.quantity);
        }
      })
      .addCase(saleVoided, (state, { payload }) => {
        for (const item of payload.items) {
          const product = state.entities[item.productId];
          if (product) product.stock = round3(product.stock + item.quantity);
        }
      });
  },
});

/** Evita errores de coma flotante al vender por peso (0.1 + 0.2 = 0.30000000000000004). */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export const { productAdded, productUpdated, productRemoved, stockAdjusted, favoriteToggled } = productsSlice.actions;
export default productsSlice.reducer;
