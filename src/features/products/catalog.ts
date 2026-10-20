import type { Category, Product } from "../../types";

export const CATEGORIES: Category[] = [
  "Lácteos",
  "Panadería",
  "Granos y despensa",
  "Bebidas",
  "Aseo",
  "Snacks",
  "Frutas y verduras",
  "Otros",
];

/** Cantidad sugerida para el pedido: lo necesario para llegar al doble del mínimo. */
export function suggestedOrder(p: Pick<Product, "stock" | "minStock">): number {
  return Math.max(1, Math.ceil(p.minStock * 2 - p.stock));
}
