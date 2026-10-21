import type { Customer, LedgerEntry, Product, Sale, Shift } from "../types";

/** Filas de las tablas de Supabase (español, snake_case). Los numeric llegan como texto o número. */
type Num = number | string;
export interface FilaProducto { id: string; nombre: string; codigo: string | null; categoria: Product["category"]; precio: Num; costo: Num; stock: Num; minimo: Num; unidad: Product["unit"]; favorito: boolean; actualizado_en?: string }
export interface FilaCliente { id: string; nombre: string; telefono: string; cupo: Num; creado_en: string; actualizado_en?: string }
export interface FilaFiado { id: string; cliente_id: string; tipo: LedgerEntry["kind"]; monto: Num; creado_en: string; venta_id: string | null; metodo: LedgerEntry["method"] | null; turno_id: string | null; nota: string | null; actualizado_en?: string }
export interface FilaVenta { id: string; numero: number; creada_en: string; items: Sale["items"]; total: Num; metodo: Sale["method"]; efectivo_recibido: Num | null; cliente_id: string | null; turno_id: string | null; vendedor_id: string | null; anulada: boolean; actualizado_en?: string }
export interface FilaTurno { id: string; abierto_en: string; base: Num; cerrado_en: string | null; contado: Num | null; esperado: Num | null; actualizado_en?: string }
export interface FilaTienda { id: string; nombre: string; cobrar_cupo: boolean; actualizado_en?: string }
export interface FilaMiembro { user_id: string; nombre: string; rol: "dueño" | "vendedor"; usuario: string; creado_en: string }

const n = (v: Num | null | undefined) => (v === null || v === undefined ? undefined : Number(v));
const iso = (v: string) => new Date(v).toISOString();
/** Quita las llaves con valor undefined para que los objetos comparen igual que los de la app. */
function limpio<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export const desde = {
  producto: (f: FilaProducto): Product =>
    limpio({ id: f.id, name: f.nombre, barcode: f.codigo ?? undefined, category: f.categoria, price: Number(f.precio), cost: Number(f.costo), stock: Number(f.stock), minStock: Number(f.minimo), unit: f.unidad, favorite: !!f.favorito }),
  cliente: (f: FilaCliente): Customer => ({ id: f.id, name: f.nombre, phone: f.telefono ?? "", creditLimit: Number(f.cupo), createdAt: iso(f.creado_en) }),
  fiado: (f: FilaFiado): LedgerEntry =>
    limpio({ id: f.id, customerId: f.cliente_id, kind: f.tipo, amount: Number(f.monto), createdAt: iso(f.creado_en), saleId: f.venta_id ?? undefined, method: f.metodo ?? undefined, shiftId: f.turno_id ?? undefined, note: f.nota ?? undefined }),
  venta: (f: FilaVenta): Sale =>
    limpio({
      id: f.id,
      number: f.numero,
      createdAt: iso(f.creada_en),
      items: f.items.map((i) => ({ ...i, quantity: Number(i.quantity), price: Number(i.price), cost: Number(i.cost) })),
      total: Number(f.total),
      method: f.metodo,
      cashReceived: n(f.efectivo_recibido),
      customerId: f.cliente_id ?? undefined,
      shiftId: f.turno_id ?? undefined,
      sellerId: f.vendedor_id ?? undefined,
      voided: f.anulada ? true : undefined,
    }),
  turno: (f: FilaTurno): Shift =>
    limpio({ id: f.id, openedAt: iso(f.abierto_en), openingCash: Number(f.base), closedAt: f.cerrado_en ? iso(f.cerrado_en) : undefined, countedCash: n(f.contado), expectedCash: n(f.esperado) }),
};

export const hacia = {
  producto: (p: Product, tienda_id: string) => ({ tienda_id, id: p.id, ...camposProducto(p), stock: p.stock }),
  cliente: (c: Customer, tienda_id: string) => ({ tienda_id, id: c.id, nombre: c.name, telefono: c.phone, cupo: c.creditLimit, creado_en: c.createdAt }),
  fiado: (e: LedgerEntry, tienda_id: string) => ({
    tienda_id,
    id: e.id,
    cliente_id: e.customerId,
    tipo: e.kind,
    monto: e.amount,
    creado_en: e.createdAt,
    venta_id: e.saleId ?? null,
    metodo: e.method ?? null,
    turno_id: e.shiftId ?? null,
    nota: e.note ?? null,
  }),
  venta: (s: Sale, tienda_id: string) => ({
    tienda_id,
    id: s.id,
    numero: s.number,
    creada_en: s.createdAt,
    items: s.items,
    total: s.total,
    metodo: s.method,
    efectivo_recibido: s.cashReceived ?? null,
    cliente_id: s.customerId ?? null,
    turno_id: s.shiftId ?? null,
    // Las ventas de la tienda de ejemplo traen vendedores inventados ("usr_..."): solo se manda un id real.
    vendedor_id: s.sellerId && UUID.test(s.sellerId) ? s.sellerId : null,
    anulada: !!s.voided,
  }),
  turno: (s: Shift, tienda_id: string) => ({
    tienda_id,
    id: s.id,
    abierto_en: s.openedAt,
    base: s.openingCash,
    cerrado_en: s.closedAt ?? null,
    contado: s.countedCash ?? null,
    esperado: s.expectedCash ?? null,
  }),
};

/** Lo que el dueño edita de un producto (todo menos las existencias, que van con ajustar_stock). */
export function camposProducto(p: Product) {
  return { nombre: p.name, codigo: p.barcode || null, categoria: p.category, precio: p.price, costo: p.cost, minimo: p.minStock, unidad: p.unit, favorito: p.favorite };
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
