import { createSlice } from "@reduxjs/toolkit";
import type { Sale } from "../../types";
import { saleRecorded, saleVoided } from "./actions";

export interface SalesState {
  list: Sale[];
  nextNumber: number;
}

const initialState: SalesState = { list: [], nextNumber: 1 };

const salesSlice = createSlice({
  name: "sales",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(saleRecorded, (state, { payload }) => {
        state.list.push(payload);
        state.nextNumber = Math.max(state.nextNumber, payload.number + 1);
      })
      .addCase(saleVoided, (state, { payload }) => {
        const sale = state.list.find((s) => s.id === payload.id);
        if (sale) sale.voided = true;
      });
  },
});

export default salesSlice.reducer;
