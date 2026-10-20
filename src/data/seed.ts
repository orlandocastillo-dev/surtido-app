import { makeStore, type RootState } from "../app/store";
import { shiftClosed, shiftOpened } from "../features/cash/cashSlice";
import { summarizeShift } from "../features/cash/selectors";
import { selectBalances } from "../features/customers/selectors";
import { customerAdded, paymentRecorded } from "../features/customers/customersSlice";
import { productAdded, productUpdated } from "../features/products/productsSlice";
import { saleRecorded } from "../features/sales/actions";
import { lineAmount } from "../lib/money";
import type { Category, Customer, PaymentMethod, Product, Sale, Unit } from "../types";

type Row = [name: string, category: Category, price: number, cost: number, stock: number, minStock: number, unit?: Unit, favorite?: boolean];

const CATALOGO: Row[] = [
  ["Leche entera 1 L", "Lácteos", 4200, 3450, 24, 12, "und", true],
  ["Huevo AA", "Lácteos", 650, 520, 180, 60, "und", true],
  ["Queso costeño", "Lácteos", 22000, 17500, 2.3, 1.5, "kg"],
  ["Pan tajado 500 g", "Panadería", 6900, 5600, 8, 6, "und", true],
  ["Pan blandito", "Panadería", 500, 300, 40, 20, "und", true],
  ["Bollo limpio", "Panadería", 1500, 1000, 15, 10, "und"],
  ["Arroz 500 g", "Granos y despensa", 2900, 2350, 30, 15, "und", true],
  ["Aceite 1 L", "Granos y despensa", 11500, 9600, 3, 6],
  ["Azúcar a granel", "Granos y despensa", 4800, 3900, 18.5, 5, "kg"],
  ["Panela 500 g", "Granos y despensa", 3200, 2500, 45, 10, "und", true],
  ["Café molido 250 g", "Granos y despensa", 11800, 9700, 14, 6],
  ["Chocolate de mesa 250 g", "Granos y despensa", 7400, 6000, 10, 5],
  ["Lentejas 500 g", "Granos y despensa", 3900, 3100, 20, 8],
  ["Fríjol cargamanto 500 g", "Granos y despensa", 7800, 6400, 9, 6],
  ["Pasta spaghetti 250 g", "Granos y despensa", 2300, 1750, 26, 10],
  ["Atún en lata 160 g", "Granos y despensa", 6500, 5300, 12, 6],
  ["Gaseosa 400 ml", "Bebidas", 2500, 1800, 5, 24, "und", true],
  ["Gaseosa 1,5 L", "Bebidas", 5200, 4100, 14, 8],
  ["Agua 600 ml", "Bebidas", 1800, 1100, 30, 12],
  ["Jugo en caja 200 ml", "Bebidas", 1500, 1050, 22, 12],
  ["Cerveza lata 330 ml", "Bebidas", 3300, 2600, 48, 24, "und", true],
  ["Papas fritas 45 g", "Snacks", 2200, 1600, 25, 10],
  ["Galletas de soda x3", "Snacks", 1600, 1150, 18, 10],
  ["Chocolatina", "Snacks", 1200, 850, 40, 15],
  ["Jabón de baño", "Aseo", 3500, 2700, 12, 6],
  ["Detergente en polvo 500 g", "Aseo", 5900, 4800, 7, 6],
  ["Papel higiénico x4", "Aseo", 6800, 5500, 2, 6],
  ["Crema dental 90 g", "Aseo", 5400, 4300, 9, 5],
  ["Tomate", "Frutas y verduras", 4500, 3200, 6.4, 3, "kg"],
  ["Cebolla cabezona", "Frutas y verduras", 3800, 2700, 4.2, 3, "kg"],
  ["Plátano maduro", "Frutas y verduras", 1200, 850, 22, 10],
  ["Limón", "Frutas y verduras", 400, 250, 60, 20],
];

const CLIENTES: [name: string, phone: string, limit: number][] = [
  ["Marta Pérez", "300 555 0141", 150000],
  ["Hernando Ríos", "301 555 0172", 80000],
  ["Yesenia Barrios", "315 555 0119", 120000],
  ["Carlos Mendoza", "320 555 0163", 60000],
  ["Luz Dary Ortega", "310 555 0187", 100000],
];

/** Generador pseudoaleatorio con semilla: los datos de ejemplo salen iguales en cada instalación. */
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fecha a una hora de Colombia (UTC-5) del día que está `daysAgo` días antes de `now`. */
function atColombiaTime(now: Date, daysAgo: number, hour: number, minute: number): Date {
  const local = new Date(now.getTime() - 5 * 3600000);
  local.setUTCDate(local.getUTCDate() - daysAgo);
  local.setUTCHours(hour, minute, 0, 0);
  return new Date(local.getTime() + 5 * 3600000);
}

export function createSeedState(now = new Date()): RootState {
  const store = makeStore();
  const { dispatch } = store;
  const rand = mulberry32(20261019);
  const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];

  const products: Product[] = CATALOGO.map(([name, category, price, cost, , minStock, unit = "und", favorite = false], i) => ({
    id: `prod_${String(i + 1).padStart(2, "0")}`,
    name,
    category,
    price,
    cost,
    stock: 999,
    minStock,
    unit,
    favorite,
    barcode: unit === "kg" ? undefined : `77090010${String(i + 1).padStart(4, "0")}${(i * 7) % 10}`,
  }));
  products.forEach((p) => dispatch(productAdded(p)));

  const customers: Customer[] = CLIENTES.map(([name, phone, creditLimit], i) => ({
    id: `cli_${i + 1}`,
    name,
    phone,
    creditLimit,
    createdAt: atColombiaTime(now, 40, 9, 0).toISOString(),
  }));
  customers.forEach((c) => dispatch(customerAdded(c)));

  // Los productos más vendidos aparecen con más frecuencia en las ventas de ejemplo.
  const weighted = products.flatMap((p) => (p.favorite ? [p, p, p, p] : [p]));
  const methods: PaymentMethod[] = [
    ...Array<PaymentMethod>(11).fill("efectivo"),
    ...Array<PaymentMethod>(5).fill("nequi"),
    "daviplata",
    "tarjeta",
    "fiado",
    "fiado",
  ];

  let number = 1;
  const nowLocalHour = (now.getUTCHours() + 19) % 24;

  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const openedAt = atColombiaTime(now, daysAgo, 6, 30);
    if (openedAt > now) continue;
    const shiftId = `turno_${daysAgo}`;
    dispatch(shiftOpened({ id: shiftId, openingCash: 100000, openedAt: openedAt.toISOString() }));

    const lastHour = daysAgo === 0 ? Math.min(21, nowLocalHour) : 21;
    const salesToday = daysAgo === 0 ? Math.max(3, Math.round((lastHour - 6) * 2.2)) : 24 + Math.floor(rand() * 14);
    const isWeekendBoost = [1, 2].includes(daysAgo) ? 8 : 0;

    const times = Array.from({ length: salesToday + isWeekendBoost }, () => {
      const hour = 7 + Math.floor(rand() * Math.max(1, lastHour - 7));
      return atColombiaTime(now, daysAgo, hour, Math.floor(rand() * 60));
    })
      .filter((t) => t <= now)
      .sort((a, b) => a.getTime() - b.getTime());

    for (const createdAt of times) {
      const itemCount = 1 + Math.floor(rand() * 4);
      const items = new Map<string, Sale["items"][number]>();
      for (let k = 0; k < itemCount; k++) {
        const p = pick(weighted);
        const quantity = p.unit === "kg" ? Math.round((0.25 + rand()) * 4) / 4 : 1 + Math.floor(rand() * (p.price < 1000 ? 6 : 2));
        const existing = items.get(p.id);
        if (existing) existing.quantity += quantity;
        else items.set(p.id, { productId: p.id, name: p.name, unit: p.unit, quantity, price: p.price, cost: p.cost });
      }
      const saleItems = [...items.values()];
      const total = saleItems.reduce((a, i) => a + lineAmount(i.price, i.quantity, i.unit), 0);
      const method = pick(methods);

      dispatch(
        saleRecorded({
          id: `venta_${number}`,
          number,
          createdAt: createdAt.toISOString(),
          items: saleItems,
          total,
          method,
          customerId: method === "fiado" ? pick(customers).id : undefined,
          cashReceived: method === "efectivo" ? Math.ceil(total / 10000) * 10000 : undefined,
          shiftId,
        }),
      );
      number++;
    }

    // Algunos clientes abonan durante la semana (nunca más de lo que deben).
    if (daysAgo > 0 && daysAgo % 2 === 0) {
      const customer = pick(customers);
      const balance = selectBalances(store.getState())[customer.id] ?? 0;
      const amount = Math.min(20000, Math.floor(balance / 1000) * 1000);
      if (amount > 0) {
        dispatch(
          paymentRecorded({
            id: `abono_${daysAgo}`,
            customerId: customer.id,
            kind: "abono",
            amount,
            method: "efectivo",
            createdAt: atColombiaTime(now, daysAgo, 18, 15).toISOString(),
            shiftId,
          }),
        );
      }
    }

    if (daysAgo > 0) {
      const summary = summarizeShift(store.getState(), shiftId)!;
      const difference = [0, 0, 0, -500, 1000, -2000][Math.floor(rand() * 6)];
      dispatch(
        shiftClosed({
          expectedCash: summary.expectedCash,
          countedCash: summary.expectedCash + difference,
          closedAt: atColombiaTime(now, daysAgo, 21, 10).toISOString(),
        }),
      );
    }
  }

  // Deja el inventario en niveles realistas, con algunos productos por pedir.
  CATALOGO.forEach(([, , , , stock], i) => dispatch(productUpdated({ id: products[i].id, changes: { stock } })));

  return store.getState();
}
