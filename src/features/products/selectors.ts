import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "../../app/store";
import type { Product } from "../../types";
import { productsAdapter } from "./productsSlice";

export const productSelectors = productsAdapter.getSelectors<RootState>((s) => s.products);

export const selectAllProducts = productSelectors.selectAll;
export const selectProductById = productSelectors.selectById;
export const selectProductEntities = productSelectors.selectEntities;

export const selectFavorites = createSelector([selectAllProducts], (products) => products.filter((p) => p.favorite));

export const selectLowStock = createSelector([selectAllProducts], (products) =>
  products.filter((p) => p.stock <= p.minStock).sort((a, b) => a.stock / (a.minStock || 1) - b.stock / (b.minStock || 1)),
);

export const selectInventoryValue = createSelector([selectAllProducts], (products) =>
  products.reduce(
    (acc, p) => ({
      cost: acc.cost + Math.max(0, p.stock) * p.cost,
      retail: acc.retail + Math.max(0, p.stock) * p.price,
    }),
    { cost: 0, retail: 0 },
  ),
);

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Busca por nombre (sin importar tildes) o por código de barras exacto o parcial. */
export function searchProducts(products: Product[], query: string): Product[] {
  const q = normalize(query.trim());
  if (!q) return products;
  const words = q.split(/\s+/);
  return products.filter((p) => {
    if (p.barcode?.includes(q)) return true;
    const name = normalize(`${p.name} ${p.category}`);
    return words.every((w) => name.includes(w));
  });
}

export function findByBarcode(products: Product[], code: string): Product | undefined {
  const clean = code.trim();
  return clean ? products.find((p) => p.barcode === clean) : undefined;
}

/** Margen sobre el precio de venta, en porcentaje. */
export function marginPct(p: Pick<Product, "price" | "cost">): number {
  return p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 100) : 0;
}
