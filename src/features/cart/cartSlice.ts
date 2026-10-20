import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { CartLine, PaymentMethod } from "../../types";
import { saleRecorded } from "../sales/actions";

export interface CartState {
  lines: CartLine[];
  method: PaymentMethod;
  customerId: string | null;
  cashReceived: number;
}

const initialState: CartState = {
  lines: [],
  method: "efectivo",
  customerId: null,
  cashReceived: 0,
};

const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    itemAdded(state, action: PayloadAction<{ productId: string; quantity?: number }>) {
      const { productId, quantity = 1 } = action.payload;
      const line = state.lines.find((l) => l.productId === productId);
      if (line) line.quantity = round3(line.quantity + quantity);
      else state.lines.unshift({ productId, quantity });
    },
    quantitySet(state, action: PayloadAction<{ productId: string; quantity: number }>) {
      const { productId, quantity } = action.payload;
      if (quantity <= 0) {
        state.lines = state.lines.filter((l) => l.productId !== productId);
        return;
      }
      const line = state.lines.find((l) => l.productId === productId);
      if (line) line.quantity = round3(quantity);
    },
    lineRemoved(state, action: PayloadAction<string>) {
      state.lines = state.lines.filter((l) => l.productId !== action.payload);
    },
    methodSet(state, action: PayloadAction<PaymentMethod>) {
      state.method = action.payload;
      if (action.payload !== "fiado") state.customerId = null;
      if (action.payload !== "efectivo") state.cashReceived = 0;
    },
    customerSet(state, action: PayloadAction<string | null>) {
      state.customerId = action.payload;
    },
    cashReceivedSet(state, action: PayloadAction<number>) {
      state.cashReceived = Math.max(0, action.payload);
    },
    cartCleared: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(saleRecorded, () => initialState);
  },
});

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export const { itemAdded, quantitySet, lineRemoved, methodSet, customerSet, cashReceivedSet, cartCleared } =
  cartSlice.actions;
export default cartSlice.reducer;
