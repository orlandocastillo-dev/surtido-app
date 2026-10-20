const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/** $12.500 (sin espacio entre el signo y el número, como se escribe en los recibos). */
export function formatCOP(value: number): string {
  return cop.format(Math.round(value)).replace(/\s/g, "");
}

/** En Colombia casi no circulan monedas de menos de $50: el cambio se redondea a ese múltiplo. */
export function roundTo50(value: number): number {
  return Math.round(value / 50) * 50;
}

/**
 * Valor de una línea de venta. Lo vendido por peso se redondea a $50:
 * "deme $2.000 de tomate" debe cobrar $2.000, no $1.998.
 */
export function lineAmount(price: number, quantity: number, unit: "und" | "kg"): number {
  const raw = price * quantity;
  return unit === "kg" ? roundTo50(raw) : Math.round(raw);
}

export function changeFor(total: number, received: number): number {
  return Math.max(0, roundTo50(received - total));
}

/** Billetes sugeridos para cobrar rápido: el total redondeado hacia arriba a denominaciones comunes. */
export function quickCashOptions(total: number): number[] {
  if (total <= 0) return [];
  const bills = [2000, 5000, 10000, 20000, 50000, 100000];
  const options = new Set<number>([roundUp(total, 1000)]);
  for (const bill of bills) {
    if (bill >= total) options.add(bill);
    const multiple = roundUp(total, bill);
    if (multiple > total && multiple <= total + 100000) options.add(multiple);
  }
  return [...options].sort((a, b) => a - b).slice(0, 4);
}

function roundUp(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

export function parseMoney(input: string): number {
  const digits = input.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

export function formatQuantity(quantity: number, unit: "und" | "kg"): string {
  if (unit === "kg") return `${quantity.toLocaleString("es-CO", { maximumFractionDigits: 3 })} kg`;
  return `${quantity} und.`;
}
