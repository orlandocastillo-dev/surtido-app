import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "../../app/store";
import type { LedgerEntry } from "../../types";
import { customersAdapter } from "./customersSlice";

const customerSelectors = customersAdapter.getSelectors<RootState>((s) => s.customers);

export const selectAllCustomers = customerSelectors.selectAll;
export const selectCustomerById = customerSelectors.selectById;
export const selectLedger = (s: RootState) => s.customers.ledger;

export function signedAmount(e: LedgerEntry): number {
  return e.kind === "cargo" ? e.amount : -e.amount;
}

/** Saldo de cada cliente: suma de cargos menos abonos y anulaciones. */
export const selectBalances = createSelector([selectLedger], (ledger) => {
  const balances: Record<string, number> = {};
  for (const e of ledger) balances[e.customerId] = (balances[e.customerId] ?? 0) + signedAmount(e);
  return balances;
});

export const selectCustomersWithBalance = createSelector(
  [selectAllCustomers, selectBalances, selectLedger],
  (customers, balances, ledger) =>
    customers
      .map((c) => {
        const entries = ledger.filter((e) => e.customerId === c.id);
        const lastCharge = entries.filter((e) => e.kind === "cargo").at(-1);
        const lastPayment = entries.filter((e) => e.kind === "abono").at(-1);
        return {
          ...c,
          balance: balances[c.id] ?? 0,
          lastChargeAt: lastCharge?.createdAt,
          lastPaymentAt: lastPayment?.createdAt,
        };
      })
      .sort((a, b) => b.balance - a.balance),
);

export const selectTotalReceivable = createSelector([selectBalances], (balances) =>
  Object.values(balances).reduce((acc, b) => acc + Math.max(0, b), 0),
);

export const selectCustomerLedger = createSelector(
  [selectLedger, (_: RootState, customerId: string) => customerId],
  (ledger, customerId) =>
    ledger
      .filter((e) => e.customerId === customerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
);
