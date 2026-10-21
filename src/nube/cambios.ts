import type { Middleware } from "@reduxjs/toolkit";
import type { RootState } from "../app/store";
import { esDeLaNube } from "../features/nube/nubeSlice";
import { camposProducto, hacia } from "./esquema";

/**
 * Cada cambio de la tienda se convierte en una operación pendiente para la base.
 * Las existencias van como suma o resta (ajustar_stock), nunca como valor final:
 * si dos celulares venden la misma leche al tiempo, la base descuenta las dos ventas.
 */
export type Op =
  | { k: "insertar"; tabla: "productos" | "clientes" | "fiado" | "ventas" | "turnos"; fila: Record<string, unknown> }
  | { k: "cambiar"; tabla: "productos" | "clientes" | "ventas" | "turnos"; id: string; cambios: Record<string, unknown> }
  | { k: "borrar"; tabla: "productos"; id: string }
  | { k: "stock"; id: string; delta: number }
  | { k: "tienda"; cambios: Record<string, unknown> }
  | { k: "reemplazar"; datos: Record<string, unknown> };

type Observador = (ops: Op[]) => void;
/** Un observador por store (en las pruebas hay dos "equipos" en el mismo proceso). */
const observadores = new Map<() => unknown, { tiendaId: string; enviar: Observador }>();

/** Lo activa la sincronización al conectar una tienda; sin él (modo local) no se registra nada. */
export function observarCambios(getState: () => unknown, tiendaId: string | null, enviar?: Observador) {
  if (tiendaId && enviar) observadores.set(getState, { tiendaId, enviar });
  else observadores.delete(getState);
}

export const cambiosMiddleware: Middleware<object, RootState> = (api) => (next) => (action) => {
  const antes = api.getState();
  const resultado = next(action);
  const tipo = (action as { type?: string }).type ?? "";
  const observador = observadores.get(api.getState);
  if (!observador || antes.nube.modo !== "nube" || esDeLaNube(tipo)) return resultado;
  const despues = api.getState();
  if (tipo === "app/dataReplaced") {
    observador.enviar([{ k: "reemplazar", datos: datosParaReemplazar(despues) }]);
    return resultado;
  }
  const ops = diferencias(antes, despues, observador.tiendaId);
  if (ops.length) observador.enviar(ops);
  return resultado;
};

/** El estado en el formato que espera reemplazar_tienda (los mismos nombres de la app). */
export function datosParaReemplazar(s: Pick<RootState, "products" | "customers" | "sales" | "cash" | "settings">) {
  return {
    products: Object.values(s.products.entities),
    customers: Object.values(s.customers.entities),
    ledger: s.customers.ledger,
    sales: s.sales.list,
    shifts: s.cash.shifts,
    settings: s.settings,
  };
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Compara el estado antes y después de una acción y arma las operaciones para la base. */
export function diferencias(a: RootState, b: RootState, tienda: string): Op[] {
  const ops: Op[] = [];

  // Productos
  if (a.products !== b.products) {
    for (const id of b.products.ids) {
      const p0 = a.products.entities[id];
      const p1 = b.products.entities[id];
      if (p0 === p1) continue;
      if (!p0) {
        ops.push({ k: "insertar", tabla: "productos", fila: hacia.producto(p1, tienda) });
        continue;
      }
      const c0 = camposProducto(p0);
      const c1 = camposProducto(p1);
      const cambios = Object.fromEntries(Object.entries(c1).filter(([k, v]) => !igual(v, c0[k as keyof typeof c0])));
      if (Object.keys(cambios).length) ops.push({ k: "cambiar", tabla: "productos", id, cambios });
      const delta = Math.round((p1.stock - p0.stock) * 1000) / 1000;
      if (delta !== 0) ops.push({ k: "stock", id, delta });
    }
    for (const id of a.products.ids) if (!b.products.entities[id]) ops.push({ k: "borrar", tabla: "productos", id });
  }

  // Clientes
  if (a.customers !== b.customers) {
    for (const id of b.customers.ids) {
      const c0 = a.customers.entities[id];
      const c1 = b.customers.entities[id];
      if (c0 === c1) continue;
      if (!c0) ops.push({ k: "insertar", tabla: "clientes", fila: hacia.cliente(c1, tienda) });
      else {
        const f1 = hacia.cliente(c1, tienda);
        ops.push({ k: "cambiar", tabla: "clientes", id, cambios: { nombre: f1.nombre, telefono: f1.telefono, cupo: f1.cupo } });
      }
    }
    // El cuaderno de fiado solo crece.
    if (a.customers.ledger !== b.customers.ledger) {
      const ya = new Set(a.customers.ledger.map((e) => e.id));
      for (const e of b.customers.ledger) if (!ya.has(e.id)) ops.push({ k: "insertar", tabla: "fiado", fila: hacia.fiado(e, tienda) });
    }
  }

  // Ventas (nuevas o anuladas)
  if (a.sales.list !== b.sales.list) {
    const previas = new Map(a.sales.list.map((s) => [s.id, s]));
    for (const s of b.sales.list) {
      const s0 = previas.get(s.id);
      if (!s0) ops.push({ k: "insertar", tabla: "ventas", fila: hacia.venta(s, tienda) });
      else if (s0 !== s && !!s0.voided !== !!s.voided) ops.push({ k: "cambiar", tabla: "ventas", id: s.id, cambios: { anulada: !!s.voided } });
    }
  }

  // Turnos de caja
  if (a.cash.shifts !== b.cash.shifts) {
    const previos = new Map(a.cash.shifts.map((s) => [s.id, s]));
    for (const s of b.cash.shifts) {
      const s0 = previos.get(s.id);
      if (!s0) ops.push({ k: "insertar", tabla: "turnos", fila: hacia.turno(s, tienda) });
      else if (s0 !== s) {
        const f = hacia.turno(s, tienda);
        ops.push({ k: "cambiar", tabla: "turnos", id: s.id, cambios: { base: f.base, cerrado_en: f.cerrado_en, contado: f.contado, esperado: f.esperado } });
      }
    }
  }

  // Datos de la tienda
  if (a.settings !== b.settings) {
    const cambios: Record<string, unknown> = {};
    if (a.settings.storeName !== b.settings.storeName) cambios.nombre = b.settings.storeName.trim() || a.settings.storeName;
    if (a.settings.enforceCreditLimit !== b.settings.enforceCreditLimit) cambios.cobrar_cupo = b.settings.enforceCreditLimit;
    if (Object.keys(cambios).length) ops.push({ k: "tienda", cambios });
  }

  return ops;
}

/**
 * Junta operaciones seguidas sobre la misma fila para no mandar 20 peticiones al escribir un nombre
 * o al vender 20 unidades una por una. Respeta el orden: un cliente se crea antes de su primer fiado.
 */
export function compactar(ops: Op[]): Op[] {
  const out: Op[] = [];
  for (const op of ops) {
    if (op.k === "reemplazar") {
      // Reemplazar todo deja sin sentido lo que estaba pendiente antes.
      out.length = 0;
      out.push(op);
      continue;
    }
    const ultimo = out[out.length - 1];
    if (ultimo && op.k === "cambiar" && ultimo.k === "cambiar" && ultimo.tabla === op.tabla && ultimo.id === op.id) {
      out[out.length - 1] = { ...ultimo, cambios: { ...ultimo.cambios, ...op.cambios } };
    } else if (ultimo && op.k === "tienda" && ultimo.k === "tienda") {
      out[out.length - 1] = { k: "tienda", cambios: { ...ultimo.cambios, ...op.cambios } };
    } else if (ultimo && op.k === "stock" && ultimo.k === "stock" && ultimo.id === op.id) {
      const delta = Math.round((ultimo.delta + op.delta) * 1000) / 1000;
      if (delta === 0) out.pop();
      else out[out.length - 1] = { k: "stock", id: op.id, delta };
    } else if (op.k === "cambiar") {
      // Si la fila se insertó antes y no ha subido, el cambio se mete en la inserción.
      const ins = out.findIndex((o) => o.k === "insertar" && o.tabla === op.tabla && o.fila.id === op.id);
      if (ins >= 0) out[ins] = { ...(out[ins] as Extract<Op, { k: "insertar" }>), fila: { ...(out[ins] as Extract<Op, { k: "insertar" }>).fila, ...op.cambios } };
      else out.push(op);
    } else out.push(op);
  }
  return out;
}
