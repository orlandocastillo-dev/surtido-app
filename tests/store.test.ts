import { describe, expect, it } from "vitest";
import { parseBackup, serialize } from "../src/app/persistence";
import { cashReceivedSet, customerSet, itemAdded, lineRemoved, methodSet, quantitySet } from "../src/features/cart/cartSlice";
import { selectCartTotal, selectChange } from "../src/features/cart/selectors";
import { shiftClosed, shiftOpened } from "../src/features/cash/cashSlice";
import { selectCurrentShiftSummary } from "../src/features/cash/selectors";
import { paymentRecorded } from "../src/features/customers/customersSlice";
import { selectBalances } from "../src/features/customers/selectors";
import { selectLowStock } from "../src/features/products/selectors";
import { checkout, voidSale } from "../src/features/sales/checkout";
import { testStore } from "./helpers";

describe("carrito", () => {
  it("suma cantidades del mismo producto y calcula el total", () => {
    const store = testStore();
    store.dispatch(itemAdded({ productId: "leche" }));
    store.dispatch(itemAdded({ productId: "leche" }));
    store.dispatch(itemAdded({ productId: "tomate", quantity: 0.5 }));
    expect(store.getState().cart.lines).toHaveLength(2);
    // 2 × 4.200 + 0,5 kg × 4.500 = 8.400 + 2.250
    expect(selectCartTotal(store.getState())).toBe(10650);
  });

  it("cantidad en cero o quitar elimina la línea", () => {
    const store = testStore();
    store.dispatch(itemAdded({ productId: "leche" }));
    store.dispatch(itemAdded({ productId: "tomate", quantity: 1 }));
    store.dispatch(quantitySet({ productId: "leche", quantity: 0 }));
    store.dispatch(lineRemoved("tomate"));
    expect(store.getState().cart.lines).toEqual([]);
  });

  it("calcula el cambio redondeado a $50", () => {
    const store = testStore();
    store.dispatch(itemAdded({ productId: "tomate", quantity: 0.444 })); // $1.998 -> $2.000
    store.dispatch(cashReceivedSet(5000));
    expect(selectCartTotal(store.getState())).toBe(2000);
    expect(selectChange(store.getState())).toBe(3000);
  });
});

describe("checkout", () => {
  it("registra la venta, descuenta inventario y vacía el carrito", () => {
    const store = testStore();
    store.dispatch(itemAdded({ productId: "leche", quantity: 3 }));
    store.dispatch(cashReceivedSet(20000));
    const result = store.dispatch(checkout({ now: new Date("2026-10-19T15:00:00Z") }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.change).toBe(7400);
    expect(result.sale).toMatchObject({ number: 1, total: 12600, method: "efectivo" });
    const state = store.getState();
    expect(state.products.entities.leche.stock).toBe(7);
    expect(state.cart.lines).toEqual([]);
    expect(state.sales.nextNumber).toBe(2);
  });

  it("no deja cobrar un carrito vacío ni con efectivo insuficiente", () => {
    const store = testStore();
    expect(store.dispatch(checkout())).toMatchObject({ ok: false, reason: "vacio" });
    store.dispatch(itemAdded({ productId: "leche" }));
    store.dispatch(cashReceivedSet(2000));
    expect(store.dispatch(checkout())).toMatchObject({ ok: false, reason: "efectivo_insuficiente" });
  });

  it("guarda el precio del momento: cambiar el producto después no altera la venta", () => {
    const store = testStore();
    store.dispatch(itemAdded({ productId: "leche" }));
    const result = store.dispatch(checkout());
    if (!result.ok) throw new Error("debía venderse");
    expect(result.sale.items[0]).toMatchObject({ name: "Leche entera 1 L", price: 4200, cost: 3450 });
  });
});

describe("fiado", () => {
  it("exige elegir cliente y suma la venta a su deuda", () => {
    const store = testStore();
    store.dispatch(itemAdded({ productId: "leche", quantity: 2 }));
    store.dispatch(methodSet("fiado"));
    expect(store.dispatch(checkout())).toMatchObject({ ok: false, reason: "sin_cliente" });

    store.dispatch(customerSet("marta"));
    expect(store.dispatch(checkout()).ok).toBe(true);
    expect(selectBalances(store.getState()).marta).toBe(8400);
  });

  it("frena la venta que supera el cupo, salvo que se confirme", () => {
    const store = testStore();
    store.dispatch(itemAdded({ productId: "leche", quantity: 13 })); // $54.600 > cupo de $50.000
    store.dispatch(methodSet("fiado"));
    store.dispatch(customerSet("marta"));
    expect(store.dispatch(checkout())).toMatchObject({ ok: false, reason: "cupo_excedido" });
    expect(store.dispatch(checkout({ allowOverLimit: true })).ok).toBe(true);
  });

  it("los abonos bajan el saldo", () => {
    const store = testStore();
    store.dispatch(itemAdded({ productId: "leche", quantity: 5 }));
    store.dispatch(methodSet("fiado"));
    store.dispatch(customerSet("marta"));
    store.dispatch(checkout());
    store.dispatch(paymentRecorded({ id: "a1", customerId: "marta", kind: "abono", amount: 10000, method: "efectivo", createdAt: new Date().toISOString() }));
    expect(selectBalances(store.getState()).marta).toBe(11000);
  });
});

describe("anular venta", () => {
  it("devuelve el inventario y descuenta la deuda si era fiada", () => {
    const store = testStore();
    store.dispatch(itemAdded({ productId: "leche", quantity: 2 }));
    store.dispatch(methodSet("fiado"));
    store.dispatch(customerSet("marta"));
    const result = store.dispatch(checkout());
    if (!result.ok) throw new Error("debía venderse");

    expect(store.dispatch(voidSale(result.sale.id))).toBe(true);
    const state = store.getState();
    expect(state.products.entities.leche.stock).toBe(10);
    expect(selectBalances(state).marta).toBe(0);
    expect(state.sales.list[0].voided).toBe(true);
    // No se puede anular dos veces.
    expect(store.dispatch(voidSale(result.sale.id))).toBe(false);
  });
});

describe("caja", () => {
  it("calcula el efectivo esperado con base, ventas en efectivo y abonos en efectivo", () => {
    const store = testStore();
    store.dispatch(shiftOpened({ id: "t1", openingCash: 100000, openedAt: new Date().toISOString() }));

    store.dispatch(itemAdded({ productId: "leche", quantity: 2 }));
    store.dispatch(checkout()); // 8.400 en efectivo

    store.dispatch(itemAdded({ productId: "leche" }));
    store.dispatch(methodSet("nequi"));
    store.dispatch(checkout()); // 4.200 por Nequi: no entra al cajón

    store.dispatch(paymentRecorded({ id: "a1", customerId: "marta", kind: "abono", amount: 5000, method: "efectivo", createdAt: new Date().toISOString(), shiftId: "t1" }));

    const summary = selectCurrentShiftSummary(store.getState())!;
    expect(summary.expectedCash).toBe(113400);
    expect(summary.byMethod.nequi).toBe(4200);
    expect(summary.salesCount).toBe(2);

    store.dispatch(shiftClosed({ countedCash: 113000, expectedCash: summary.expectedCash, closedAt: new Date().toISOString() }));
    expect(store.getState().cash.currentShiftId).toBeNull();
  });
});

describe("inventario", () => {
  it("marca por pedir lo que está en el mínimo o por debajo", () => {
    const store = testStore();
    store.dispatch(itemAdded({ productId: "leche", quantity: 7 }));
    store.dispatch(checkout());
    expect(selectLowStock(store.getState()).map((p) => p.id)).toEqual(["leche"]);
  });
});

describe("copia de seguridad", () => {
  it("se puede exportar y volver a leer", () => {
    const store = testStore();
    const restored = parseBackup(serialize(store.getState()));
    expect(restored.products.ids).toEqual(store.getState().products.ids);
  });

  it("rechaza archivos que no son de Surtido", () => {
    expect(() => parseBackup('{"hola": 1}')).toThrow(/copia de seguridad/);
  });
});
