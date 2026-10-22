import type { AppThunk } from "../../app/store";
import { newId } from "../../lib/id";
import type { Sale } from "../../types";
import { selectCart, selectCartLines, selectCartTotal } from "../cart/selectors";
import { selectBalances, selectCustomerById } from "../customers/selectors";
import { saleRecorded, saleVoided } from "./actions";

export type CheckoutResult =
  | { ok: true; sale: Sale; change: number }
  | { ok: false; reason: "vacio" | "sin_cliente" | "efectivo_insuficiente" | "cupo_excedido"; message: string };

// Cierra la venta del carrito
export function checkout(options: { allowOverLimit?: boolean; now?: Date } = {}): AppThunk<CheckoutResult> {
  return (dispatch, getState) => {
    const state = getState();
    const cart = selectCart(state);
    const lines = selectCartLines(state);
    const total = selectCartTotal(state);

    if (lines.length === 0) {
      return { ok: false, reason: "vacio", message: "Agrega al menos un producto." };
    }

    if (cart.method === "efectivo" && cart.cashReceived > 0 && cart.cashReceived < total) {
      return { ok: false, reason: "efectivo_insuficiente", message: "El efectivo recibido es menor que el total." };
    }

    if (cart.method === "fiado") {
      if (!cart.customerId) {
        return { ok: false, reason: "sin_cliente", message: "Elige a quién le fías." };
      }
      const customer = selectCustomerById(state, cart.customerId);
      const balance = selectBalances(state)[cart.customerId] ?? 0;
      if (
        customer &&
        state.settings.enforceCreditLimit &&
        !options.allowOverLimit &&
        balance + total > customer.creditLimit
      ) {
        return {
          ok: false,
          reason: "cupo_excedido",
          message: `${customer.name} quedaría debiendo más de su cupo.`,
        };
      }
    }

    const sale: Sale = {
      id: newId("venta"),
      number: state.sales.nextNumber,
      createdAt: (options.now ?? new Date()).toISOString(),
      items: lines.map((l) => ({
        productId: l.product.id,
        name: l.product.name,
        unit: l.product.unit,
        quantity: l.quantity,
        price: l.product.price,
        cost: l.product.cost,
      })),
      total,
      method: cart.method,
      cashReceived: cart.method === "efectivo" && cart.cashReceived > 0 ? cart.cashReceived : undefined,
      customerId: cart.method === "fiado" ? (cart.customerId ?? undefined) : undefined,
      shiftId: state.cash.currentShiftId ?? undefined,
      sellerId: state.auth.sessionUserId ?? undefined,
    };

    const change = sale.cashReceived ? sale.cashReceived - total : 0;
    dispatch(saleRecorded(sale));
    return { ok: true, sale, change: Math.max(0, Math.round(change / 50) * 50) };
  };
}

export function voidSale(saleId: string): AppThunk<boolean> {
  return (dispatch, getState) => {
    const sale = getState().sales.list.find((s) => s.id === saleId);
    if (!sale || sale.voided) return false;
    dispatch(saleVoided(sale));
    return true;
  };
}
