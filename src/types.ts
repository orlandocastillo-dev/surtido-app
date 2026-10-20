export type Unit = "und" | "kg";

export type Category =
  | "Lácteos"
  | "Panadería"
  | "Granos y despensa"
  | "Bebidas"
  | "Aseo"
  | "Snacks"
  | "Frutas y verduras"
  | "Otros";

export interface Product {
  id: string;
  name: string;
  barcode?: string;
  category: Category;
  /** Precio de venta en pesos. Para productos por peso, precio por kilo. */
  price: number;
  /** Costo de compra al proveedor, para calcular la ganancia. */
  cost: number;
  stock: number;
  /** Cuando el stock baja de este número se sugiere pedir. */
  minStock: number;
  unit: Unit;
  favorite: boolean;
}

export type PaymentMethod = "efectivo" | "nequi" | "daviplata" | "tarjeta" | "fiado";

export interface SaleItem {
  productId: string;
  /** Se guardan nombre, precio y costo del momento de la venta: si el producto cambia después, la venta no. */
  name: string;
  unit: Unit;
  quantity: number;
  price: number;
  cost: number;
}

export interface Sale {
  id: string;
  number: number;
  createdAt: string;
  items: SaleItem[];
  total: number;
  method: PaymentMethod;
  cashReceived?: number;
  customerId?: string;
  shiftId?: string;
  /** Usuario que registró la venta. */
  sellerId?: string;
  voided?: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  creditLimit: number;
  createdAt: string;
}

export type LedgerKind = "cargo" | "abono" | "anulacion";

/** Movimiento del cuaderno de fiado: cargos suman a la deuda, abonos y anulaciones restan. */
export interface LedgerEntry {
  id: string;
  customerId: string;
  kind: LedgerKind;
  amount: number;
  createdAt: string;
  saleId?: string;
  method?: Exclude<PaymentMethod, "fiado">;
  shiftId?: string;
  note?: string;
}

export interface Shift {
  id: string;
  openedAt: string;
  openingCash: number;
  closedAt?: string;
  countedCash?: number;
  expectedCash?: number;
}

export interface CartLine {
  productId: string;
  quantity: number;
}
