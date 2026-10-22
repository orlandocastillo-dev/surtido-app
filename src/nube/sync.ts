import type { SupabaseClient } from "@supabase/supabase-js";
import { claveNube, loadState } from "../app/persistence";
import { emptyBusinessState, nubeReemplazado, type AppStore, type BusinessState } from "../app/store";
import { nubeEstado, nubeRecibido, type Recibido } from "../features/nube/nubeSlice";
import { compactar, observarCambios, type Op } from "./cambios";
import { desde, type FilaCliente, type FilaFiado, type FilaProducto, type FilaTienda, type FilaTurno, type FilaVenta } from "./esquema";

const CADA = 15_000;
const PAGINA = 1000;
// Se pide un poco antes del último cambio visto, por si una transacción terminó tarde
const SOLAPE_MS = 5_000;

type Tabla = "productos" | "clientes" | "fiado" | "ventas" | "turnos";
const TABLAS: Tabla[] = ["productos", "clientes", "fiado", "ventas", "turnos"];

// Mantiene la copia del equipo y la base al día, en las dos direcciones
export class Sincronizador {
  private cola: Op[];
  private cursor: string | null;
  private enviando = false;
  private vueltas = 0;
  private reloj: ReturnType<typeof setInterval> | null = null;
  private readonly claveCola: string;
  private readonly claveCursor: string;
  private readonly db: SupabaseClient;
  private readonly tiendaId: string;
  private readonly store: AppStore;

  constructor(db: SupabaseClient, tiendaId: string, store: AppStore) {
    this.db = db;
    this.tiendaId = tiendaId;
    this.store = store;
    this.claveCola = `surtido:pendientes:${tiendaId}`;
    this.claveCursor = `surtido:cursor:${tiendaId}`;
    this.cola = leerJSON<Op[]>(this.claveCola) ?? [];
    this.cursor = leer(this.claveCursor);
  }

  /** Pone en pantalla la copia que había en este equipo (al instante, también sin internet). */
  abrirCopia(): boolean {
    const copia = loadState(claveNube(this.tiendaId));
    const { auth: _a, ...negocio } = copia ?? { auth: null, ...emptyBusinessState() };
    void _a;
    this.store.dispatch(nubeReemplazado(negocio as BusinessState));
    return !!copia;
  }

  /** La copia del equipo trae también a los usuarios de la tienda, para poder entrar sin internet. */
  usuariosDeLaCopia() {
    return loadState(claveNube(this.tiendaId))?.auth.users ?? [];
  }

  /** Empieza a sincronizar: sube lo pendiente, baja la tienda y repite cada 15 segundos. */
  async arrancar(): Promise<void> {
    observarCambios(this.store.getState, this.tiendaId, (ops) => this.encolar(ops));
    this.avisar();
    await this.empujar();
    if (this.cola.length === 0) await this.cargarTodo();
    this.reloj = setInterval(() => void this.ciclo(), CADA);
    window.addEventListener("online", this.alVolver);
    document.addEventListener("visibilitychange", this.alVolver);
  }

  detener() {
    observarCambios(this.store.getState, null);
    if (this.reloj) clearInterval(this.reloj);
    window.removeEventListener("online", this.alVolver);
    document.removeEventListener("visibilitychange", this.alVolver);
  }

  private alVolver = () => {
    if (document.visibilityState !== "hidden") void this.ciclo();
  };

  /** Sube lo pendiente y, si quedó todo arriba, baja lo nuevo. */
  async ciclo() {
    await this.empujar();
    if (this.cola.length) return;
    // Cada 5 minutos se baja todo: así también se ven los productos que otro equipo borró.
    if (++this.vueltas % 20 === 0) await this.cargarTodo();
    else await this.traerCambios();
  }

  encolar(ops: Op[]) {
    this.cola = compactar([...this.cola, ...ops]);
    guardar(this.claveCola, JSON.stringify(this.cola));
    this.avisar();
    // Se sube enseguida; si no hay internet, queda para el próximo intento.
    queueMicrotask(() => void this.empujar());
  }

  // Envía la cola en orden
  async empujar(): Promise<void> {
    if (this.enviando) return;
    this.enviando = true;
    try {
      while (this.cola.length) {
        const op = this.cola[0];
        const r = await this.enviar(op);
        if (r === "sin-conexion") {
          this.avisar({ enLinea: false });
          return;
        }
        this.cola = this.cola.slice(1);
        guardar(this.claveCola, JSON.stringify(this.cola));
        if (r !== "ok") this.avisar({ error: r });
      }
      this.avisar({ enLinea: true, ultimaSincronizacion: new Date().toISOString() });
    } finally {
      this.enviando = false;
    }
  }

  /** "ok", "sin-conexion" o el mensaje de un error que no se arregla reintentando (se descarta la operación). */
  private async enviar(op: Op): Promise<"ok" | "sin-conexion" | string> {
    let res: { error: { message?: string; code?: string } | null };
    try {
      switch (op.k) {
        case "insertar":
          res = await this.db.from(op.tabla).upsert(op.fila, { onConflict: "tienda_id,id", ignoreDuplicates: true });
          break;
        case "cambiar":
          res = await this.db.from(op.tabla).update(op.cambios).eq("tienda_id", this.tiendaId).eq("id", op.id);
          break;
        case "borrar":
          res = await this.db.from(op.tabla).delete().eq("tienda_id", this.tiendaId).eq("id", op.id);
          break;
        case "stock":
          res = await this.db.rpc("ajustar_stock", { producto: op.id, delta: op.delta });
          break;
        case "tienda":
          res = await this.db.from("tiendas").update(op.cambios).eq("id", this.tiendaId);
          break;
        case "reemplazar":
          res = await this.db.rpc("reemplazar_tienda", { datos: op.datos });
          if (!res.error) this.cursor = null;
          break;
      }
    } catch {
      return "sin-conexion";
    }
    if (!res.error) return "ok";
    const msg = `${res.error.code ?? ""} ${res.error.message ?? ""}`;
    if (/fetch|network|Failed|timeout|503|502|504/i.test(msg)) return "sin-conexion";
    if (/JWT|token|42501|permission|row-level/i.test(msg)) return "Un cambio no se guardó porque tu usuario no tiene permiso para hacerlo.";
    return "Un cambio no se pudo guardar en la nube.";
  }

  /** Baja toda la tienda (primer arranque en este equipo o después de reemplazar los datos). */
  async cargarTodo(): Promise<void> {
    try {
      const [[productos, clientes, fiado, ventas, turnos], tienda] = await Promise.all([
        Promise.all(TABLAS.map((t) => this.todas(t))),
        this.db.from("tiendas").select("*").eq("id", this.tiendaId).single(),
      ]);
      if (tienda.error) throw tienda.error;
      const negocio: BusinessState = {
        ...emptyBusinessState(),
        settings: {
          ...emptyBusinessState().settings,
          storeName: (tienda.data as FilaTienda | null)?.nombre ?? emptyBusinessState().settings.storeName,
          enforceCreditLimit: (tienda.data as FilaTienda | null)?.cobrar_cupo ?? true,
        },
      };
      this.store.dispatch(nubeReemplazado({ ...negocio, cart: this.store.getState().cart }));
      this.store.dispatch(nubeRecibido(this.convertir({ productos, clientes, fiado, ventas, turnos })));
      this.moverCursor([productos, clientes, fiado, ventas, turnos].flat() as { actualizado_en?: string }[]);
      this.avisar({ enLinea: true, ultimaSincronizacion: new Date().toISOString(), error: null });
    } catch {
      this.avisar({ enLinea: false });
    }
  }

  /** Baja solo lo que cambió desde la última vez. */
  async traerCambios(): Promise<void> {
    if (!this.cursor) return this.cargarTodo();
    const desdeCuando = new Date(new Date(this.cursor).getTime() - SOLAPE_MS).toISOString();
    try {
      const filas = await Promise.all(TABLAS.map((t) => this.todas(t, desdeCuando)));
      const { data: tienda } = await this.db.from("tiendas").select("*").eq("id", this.tiendaId).gte("actualizado_en", desdeCuando).maybeSingle();
      const [productos, clientes, fiado, ventas, turnos] = filas;
      const recibido = this.convertir({ productos, clientes, fiado, ventas, turnos });
      if (tienda) recibido.tienda = { storeName: (tienda as FilaTienda).nombre, enforceCreditLimit: (tienda as FilaTienda).cobrar_cupo };
      if (filas.some((f) => f.length) || tienda) this.store.dispatch(nubeRecibido(recibido));
      this.moverCursor(filas.flat() as { actualizado_en?: string }[]);
      this.avisar({ enLinea: true, ultimaSincronizacion: new Date().toISOString() });
    } catch {
      this.avisar({ enLinea: false });
    }
  }

  private async todas(tabla: Tabla, cambiadoDesde?: string): Promise<unknown[]> {
    const filas: unknown[] = [];
    for (let i = 0; ; i += PAGINA) {
      let q = this.db.from(tabla).select("*").eq("tienda_id", this.tiendaId).order("actualizado_en", { ascending: true }).range(i, i + PAGINA - 1);
      if (cambiadoDesde) q = q.gte("actualizado_en", cambiadoDesde);
      const { data, error } = await q;
      if (error) throw error;
      filas.push(...(data ?? []));
      if (!data || data.length < PAGINA) return filas;
    }
  }

  private convertir(f: { productos: unknown[]; clientes: unknown[]; fiado: unknown[]; ventas: unknown[]; turnos: unknown[] }): Recibido {
    // Si hay ajustes de existencias que todavía no suben, se suman a lo que dice la base.
    const pendiente = new Map<string, number>();
    for (const op of this.cola) if (op.k === "stock") pendiente.set(op.id, (pendiente.get(op.id) ?? 0) + op.delta);
    return {
      productos: (f.productos as FilaProducto[]).map((p) => {
        const prod = desde.producto(p);
        return pendiente.has(prod.id) ? { ...prod, stock: Math.round((prod.stock + pendiente.get(prod.id)!) * 1000) / 1000 } : prod;
      }),
      clientes: (f.clientes as FilaCliente[]).map(desde.cliente),
      fiado: (f.fiado as FilaFiado[]).map(desde.fiado),
      ventas: (f.ventas as FilaVenta[]).map(desde.venta),
      turnos: (f.turnos as FilaTurno[]).map(desde.turno),
    };
  }

  private moverCursor(filas: { actualizado_en?: string }[]) {
    for (const f of filas) if (f.actualizado_en && (!this.cursor || f.actualizado_en > this.cursor)) this.cursor = f.actualizado_en;
    if (this.cursor) guardar(this.claveCursor, this.cursor);
  }

  private avisar(extra: Parameters<typeof nubeEstado>[0] = {}) {
    this.store.dispatch(nubeEstado({ pendientes: this.cola.length, ...extra }));
  }

  get pendientes() {
    return this.cola.length;
  }
}

function leer(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function leerJSON<T>(k: string): T | null {
  try {
    const v = leer(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function guardar(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    // Sin espacio: la cola sigue en memoria mientras la pestaña esté abierta.
  }
}
