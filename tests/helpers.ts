import { makeStore } from "../src/app/store";
import { customerAdded } from "../src/features/customers/customersSlice";
import { productAdded } from "../src/features/products/productsSlice";
import type { Product } from "../src/types";

export const leche: Product = {
  id: "leche", name: "Leche entera 1 L", category: "Lácteos", price: 4200, cost: 3450,
  stock: 10, minStock: 4, unit: "und", favorite: true, barcode: "7700000000011",
};
export const tomate: Product = {
  id: "tomate", name: "Tomate", category: "Frutas y verduras", price: 4500, cost: 3200,
  stock: 5, minStock: 2, unit: "kg", favorite: false,
};

/** Tienda mínima para las pruebas: dos productos y una clienta con cupo de $50.000. */
export function testStore() {
  const store = makeStore();
  store.dispatch(productAdded(leche));
  store.dispatch(productAdded(tomate));
  store.dispatch(customerAdded({ id: "marta", name: "Marta Pérez", phone: "300 555 0141", creditLimit: 50000, createdAt: "2026-10-01T00:00:00Z" }));
  return store;
}
