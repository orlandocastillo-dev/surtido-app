import { describe, expect, it } from "vitest";
import { createSeedState } from "../src/data/seed";
import { searchProducts } from "../src/features/products/selectors";
import { selectBalances } from "../src/features/customers/selectors";
import { changeFor, formatCOP, lineAmount, quickCashOptions } from "../src/lib/money";
import { toWhatsAppNumber, whatsAppLink } from "../src/lib/whatsapp";
import { leche, tomate } from "./helpers";

describe("dinero", () => {
  it("formatea pesos colombianos", () => {
    expect(formatCOP(1234567)).toBe("$1.234.567");
  });

  it("redondea lo vendido por peso a $50", () => {
    expect(lineAmount(4500, 0.444, "kg")).toBe(2000);
    expect(lineAmount(4200, 3, "und")).toBe(12600);
  });

  it("el cambio nunca es negativo", () => {
    expect(changeFor(10000, 8000)).toBe(0);
    expect(changeFor(18620, 20000)).toBe(1400);
  });

  it("sugiere billetes mayores al total", () => {
    const options = quickCashOptions(18600);
    expect(options[0]).toBe(19000);
    expect(options).toContain(20000);
    expect(options.every((o) => o >= 18600)).toBe(true);
  });
});

describe("búsqueda", () => {
  it("ignora tildes y busca por código", () => {
    expect(searchProducts([leche, tomate], "LECHE").map((p) => p.id)).toEqual(["leche"]);
    expect(searchProducts([leche, tomate], "verduras").map((p) => p.id)).toEqual(["tomate"]);
    expect(searchProducts([leche, tomate], "7700000").map((p) => p.id)).toEqual(["leche"]);
  });
});

describe("WhatsApp", () => {
  it("convierte celulares colombianos al formato internacional", () => {
    expect(toWhatsAppNumber("300 555 0141")).toBe("573005550141");
    expect(toWhatsAppNumber("+57 300 555 0141")).toBe("573005550141");
    expect(toWhatsAppNumber("6015550182")).toBeNull();
  });

  it("arma el enlace con el mensaje codificado", () => {
    expect(whatsAppLink("3005550141", "Hola Marta")).toBe("https://wa.me/573005550141?text=Hola%20Marta");
  });
});

describe("datos de ejemplo", () => {
  const state = createSeedState(new Date("2026-10-19T20:00:00Z"));

  it("son coherentes: ventas numeradas en orden y sin saldos negativos", () => {
    const numbers = state.sales.list.map((s) => s.number);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(state.sales.nextNumber).toBe(numbers.length + 1);
    const balances = selectBalances(state);
    expect(Object.values(balances).every((b) => b >= 0)).toBe(true);
  });

  it("dejan la caja de hoy abierta y los días anteriores cerrados", () => {
    expect(state.cash.currentShiftId).toBe("turno_0");
    expect(state.cash.shifts.filter((s) => s.closedAt)).toHaveLength(6);
  });

  it("son iguales en cada instalación", () => {
    const again = createSeedState(new Date("2026-10-19T20:00:00Z"));
    expect(again.sales.list.length).toBe(state.sales.list.length);
  });
});
