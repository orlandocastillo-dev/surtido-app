import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "../../app/store";
import { changeFor, lineAmount } from "../../lib/money";
import type { Product } from "../../types";
import { selectProductEntities } from "../products/selectors";

export interface DetailedLine {
  product: Product;
  quantity: number;
  subtotal: number;
}

export const selectCart = (s: RootState) => s.cart;

export const selectCartLines = createSelector([selectCart, selectProductEntities], (cart, products) =>
  cart.lines.flatMap<DetailedLine>((line) => {
    const product = products[line.productId];
    return product ? [{ product, quantity: line.quantity, subtotal: lineAmount(product.price, line.quantity, product.unit) }] : [];
  }),
);

export const selectCartTotal = createSelector([selectCartLines], (lines) =>
  lines.reduce((acc, l) => acc + l.subtotal, 0),
);

export const selectCartCount = createSelector([selectCartLines], (lines) =>
  lines.reduce((acc, l) => acc + (l.product.unit === "kg" ? 1 : l.quantity), 0),
);

export const selectChange = createSelector([selectCartTotal, selectCart], (total, cart) =>
  cart.method === "efectivo" && cart.cashReceived > 0 ? changeFor(total, cart.cashReceived) : 0,
);

/** Productos del carrito que quedarían con stock negativo: se avisa, pero no se bloquea la venta. */
export const selectStockWarnings = createSelector([selectCartLines], (lines) =>
  lines.filter((l) => l.quantity > l.product.stock).map((l) => l.product.name),
);
