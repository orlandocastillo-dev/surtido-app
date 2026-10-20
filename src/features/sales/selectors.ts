import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "../../app/store";
import { dayKey, lastNDays } from "../../lib/dates";
import { lineAmount } from "../../lib/money";
import type { PaymentMethod, Sale } from "../../types";

export const selectSales = (s: RootState) => s.sales.list;

export const selectValidSales = createSelector([selectSales], (sales) => sales.filter((s) => !s.voided));

export function saleProfit(sale: Sale): number {
  return sale.items.reduce((acc, i) => acc + Math.round((i.price - i.cost) * i.quantity), 0);
}

export interface DaySummary {
  day: string;
  total: number;
  profit: number;
  count: number;
}

export function summarizeDay(sales: Sale[], day: string): DaySummary {
  const ofDay = sales.filter((s) => dayKey(s.createdAt) === day);
  return {
    day,
    total: ofDay.reduce((a, s) => a + s.total, 0),
    profit: ofDay.reduce((a, s) => a + saleProfit(s), 0),
    count: ofDay.length,
  };
}

export function lastDaysSummary(sales: Sale[], days: number, now = new Date()): DaySummary[] {
  return lastNDays(days, now).map((d) => summarizeDay(sales, d));
}

export function byMethod(sales: Sale[]): Record<PaymentMethod, number> {
  const out: Record<PaymentMethod, number> = { efectivo: 0, nequi: 0, daviplata: 0, tarjeta: 0, fiado: 0 };
  for (const s of sales) out[s.method] += s.total;
  return out;
}

export interface TopProduct {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
  profit: number;
}

export function topProducts(sales: Sale[], limit = 5): TopProduct[] {
  const map = new Map<string, TopProduct>();
  for (const s of sales) {
    for (const i of s.items) {
      const row = map.get(i.productId) ?? { productId: i.productId, name: i.name, quantity: 0, revenue: 0, profit: 0 };
      row.quantity += i.quantity;
      row.revenue += lineAmount(i.price, i.quantity, i.unit);
      row.profit += Math.round((i.price - i.cost) * i.quantity);
      map.set(i.productId, row);
    }
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

export function salesInRange(sales: Sale[], days: number, now = new Date()): Sale[] {
  const keys = new Set(lastNDays(days, now));
  return sales.filter((s) => keys.has(dayKey(s.createdAt)));
}
