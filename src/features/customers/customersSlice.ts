import { createEntityAdapter, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { newId } from "../../lib/id";
import type { Customer, LedgerEntry } from "../../types";
import { saleRecorded, saleVoided } from "../sales/actions";

export const customersAdapter = createEntityAdapter<Customer>({
  sortComparer: (a, b) => a.name.localeCompare(b.name, "es"),
});

const initialState = customersAdapter.getInitialState({ ledger: [] as LedgerEntry[] });

const customersSlice = createSlice({
  name: "customers",
  initialState,
  reducers: {
    customerAdded: customersAdapter.addOne,
    customerUpdated: customersAdapter.updateOne,
    paymentRecorded(state, action: PayloadAction<LedgerEntry>) {
      state.ledger.push(action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(saleRecorded, (state, { payload: sale }) => {
        if (sale.method !== "fiado" || !sale.customerId) return;
        state.ledger.push({
          id: newId("mov"),
          customerId: sale.customerId,
          kind: "cargo",
          amount: sale.total,
          createdAt: sale.createdAt,
          saleId: sale.id,
        });
      })
      .addCase(saleVoided, (state, { payload: sale }) => {
        if (sale.method !== "fiado" || !sale.customerId) return;
        state.ledger.push({
          id: newId("mov"),
          customerId: sale.customerId,
          kind: "anulacion",
          amount: sale.total,
          createdAt: new Date().toISOString(),
          saleId: sale.id,
          note: `Venta #${sale.number} anulada`,
        });
      });
  },
});

export const { customerAdded, customerUpdated, paymentRecorded } = customersSlice.actions;
export default customersSlice.reducer;
