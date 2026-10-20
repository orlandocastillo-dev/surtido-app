import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "../../app/store";
import { byMethod } from "../sales/selectors";

export const selectCash = (s: RootState) => s.cash;

export const selectCurrentShift = createSelector([selectCash], (cash) =>
  cash.currentShiftId ? (cash.shifts.find((s) => s.id === cash.currentShiftId) ?? null) : null,
);

export interface ShiftSummary {
  openingCash: number;
  cashSales: number;
  cashPayments: number;
  /** Lo que debería haber en el cajón: base + ventas en efectivo + abonos en efectivo. */
  expectedCash: number;
  salesCount: number;
  totalSales: number;
  byMethod: ReturnType<typeof byMethod>;
}

function computeShiftSummary(
  cash: RootState["cash"],
  salesList: RootState["sales"]["list"],
  ledger: RootState["customers"]["ledger"],
  shiftId: string,
): ShiftSummary | null {
  const shift = cash.shifts.find((s) => s.id === shiftId);
  if (!shift) return null;
  const sales = salesList.filter((s) => s.shiftId === shiftId && !s.voided);
  const methods = byMethod(sales);
  const cashPayments = ledger
    .filter((e) => e.shiftId === shiftId && e.kind === "abono" && e.method === "efectivo")
    .reduce((a, e) => a + e.amount, 0);

  return {
    openingCash: shift.openingCash,
    cashSales: methods.efectivo,
    cashPayments,
    expectedCash: shift.openingCash + methods.efectivo + cashPayments,
    salesCount: sales.length,
    totalSales: sales.reduce((a, s) => a + s.total, 0),
    byMethod: methods,
  };
}

export function summarizeShift(state: RootState, shiftId: string): ShiftSummary | null {
  return computeShiftSummary(state.cash, state.sales.list, state.customers.ledger, shiftId);
}

export const selectCurrentShiftSummary = createSelector(
  [selectCash, (s: RootState) => s.sales.list, (s: RootState) => s.customers.ledger],
  (cash, sales, ledger) => (cash.currentShiftId ? computeShiftSummary(cash, sales, ledger, cash.currentShiftId) : null),
);

export const selectCurrentShiftSales = createSelector([selectCash, (s: RootState) => s.sales.list], (cash, sales) =>
  cash.currentShiftId ? sales.filter((x) => x.shiftId === cash.currentShiftId).reverse() : [],
);

export const selectClosedShifts = createSelector([selectCash], (cash) =>
  cash.shifts.filter((s) => s.closedAt).sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? "")),
);
