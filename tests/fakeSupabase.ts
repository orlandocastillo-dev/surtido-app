/**
 * Supabase falso en memoria con lo que usa Surtido: auth, tablas filtradas por tienda (como RLS),
 * las funciones crear_tienda, reemplazar_tienda y ajustar_stock, y la función de servidor "vendedores".
 * Varias "pestañas" (clientes) pueden compartir la misma base para probar dos equipos a la vez.
 */
type Fila = Record<string, unknown>;
type Evento = "INITIAL_SESSION" | "SIGNED_IN" | "SIGNED_OUT" | "USER_UPDATED" | "PASSWORD_RECOVERY";

export interface Base {
  usuarios: { id: string; email: string; clave: string; confirmado: boolean; meta: Record<string, unknown> }[];
  tablas: Record<string, Fila[]>;
  offline: boolean;
  llamadas: string[];
  reloj: number;
}

export function nuevaBase(): Base {
  return {
    usuarios: [],
    tablas: { tiendas: [], miembros: [], productos: [], clientes: [], fiado: [], ventas: [], turnos: [] },
    offline: false,
    llamadas: [],
    reloj: Date.parse("2026-10-21T12:00:00Z"),
  };
}

const ahora = (b: Base) => new Date((b.reloj += 1000)).toISOString();

export function clienteFalso(b: Base, opciones: { confirmarCorreo?: boolean } = {}) {
  let sesion: { user: { id: string; email: string; user_metadata: Record<string, unknown> } } | null = null;
  const oyentes = new Set<(e: Evento, s: typeof sesion) => void>();
  const avisar = (e: Evento) => oyentes.forEach((f) => f(e, sesion));
  const abrir = (u: Base["usuarios"][number]) => (sesion = { user: { id: u.id, email: u.email, user_metadata: { ...u.meta } } });
  const uid = () => sesion?.user.id ?? null;
  const miTienda = () => b.tablas.miembros.find((m) => m.user_id === uid())?.tienda_id as string | undefined;
  const soyDueno = () => b.tablas.miembros.some((m) => m.user_id === uid() && m.rol === "dueño");
  const sinRed = () => ({ data: null, error: { message: "TypeError: Failed to fetch" } });
  const err = (code: string, message: string) => ({ data: null, error: { code, message } });

  function consulta(tabla: string) {
    const filtros: ((f: Fila) => boolean)[] = [];
    let modo: "select" | "update" | "delete" = "select";
    let cambios: Fila = {};
    let rango: [number, number] | null = null;
    let uno: "single" | "maybe" | null = null;
    const ejecutar = () => {
      if (b.offline) return sinRed();
      if (!uid()) return err("42501", "permission denied");
      const t = miTienda();
      const visible = (f: Fila) => (tabla === "tiendas" ? f.id === t : f.tienda_id === t) && filtros.every((x) => x(f));
      if (modo === "update") {
        b.llamadas.push(`update:${tabla}`);
        if (tabla === "ventas" && !soyDueno()) return { data: [], error: null };
        for (const f of b.tablas[tabla].filter(visible)) Object.assign(f, cambios, { actualizado_en: ahora(b) });
        return { data: null, error: null };
      }
      if (modo === "delete") {
        b.llamadas.push(`delete:${tabla}`);
        b.tablas[tabla] = b.tablas[tabla].filter((f) => !visible(f));
        return { data: null, error: null };
      }
      let filas = structuredClone(b.tablas[tabla].filter(visible));
      if (rango) filas = filas.slice(rango[0], rango[1] + 1);
      if (uno) return { data: filas[0] ?? null, error: uno === "single" && !filas[0] ? { message: "no rows" } : null };
      return { data: filas, error: null };
    };
    const q = {
      select: () => q,
      order: () => q,
      range: (a: number, c: number) => ((rango = [a, c]), q),
      eq: (k: string, v: unknown) => (filtros.push((f) => f[k] === v), q),
      gte: (k: string, v: string) => (filtros.push((f) => String(f[k]) >= v), q),
      single: () => ((uno = "single"), q),
      maybeSingle: () => ((uno = "maybe"), q),
      update: (c: Fila) => ((modo = "update"), (cambios = c), q),
      delete: () => ((modo = "delete"), q),
      upsert: async (filas: Fila | Fila[]) => {
        if (b.offline) return sinRed();
        b.llamadas.push(`upsert:${tabla}`);
        const t = miTienda();
        for (const f of Array.isArray(filas) ? filas : [filas]) {
          if (f.tienda_id !== t) return err("42501", "new row violates row-level security policy");
          if (tabla === "ventas" && f.vendedor_id !== uid() && !soyDueno()) return err("42501", "new row violates row-level security policy");
          if (b.tablas[tabla].some((x) => x.tienda_id === t && x.id === f.id)) continue;
          b.tablas[tabla].push({ ...f, actualizado_en: ahora(b) });
        }
        return { data: null, error: null };
      },
      then: (ok: (r: unknown) => unknown, mal?: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(ok, mal),
    };
    return q;
  }

  const cliente = {
    auth: {
      getSession: async () => ({ data: { session: sesion } }),
      onAuthStateChange(cb: (e: Evento, s: typeof sesion) => void) {
        oyentes.add(cb);
        queueMicrotask(() => cb("INITIAL_SESSION", sesion));
        return { data: { subscription: { unsubscribe: () => oyentes.delete(cb) } } };
      },
      async signUp({ email, password, options }: { email: string; password: string; options?: { data?: Record<string, unknown> } }) {
        if (b.offline) return sinRed();
        if (b.usuarios.some((u) => u.email === email)) return err("user_already_exists", "User already registered");
        const u = { id: crypto.randomUUID(), email, clave: password, confirmado: !opciones.confirmarCorreo, meta: { ...options?.data } };
        b.usuarios.push(u);
        if (opciones.confirmarCorreo) return { data: { user: { id: u.id, identities: [{}] }, session: null }, error: null };
        abrir(u);
        avisar("SIGNED_IN");
        return { data: { user: { id: u.id, identities: [{}] }, session: sesion }, error: null };
      },
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        if (b.offline) return sinRed();
        const u = b.usuarios.find((x) => x.email === email && x.clave === password);
        if (!u) return err("invalid_credentials", "Invalid login credentials");
        const otro = sesion?.user.id !== u.id;
        abrir(u);
        if (otro) avisar("SIGNED_IN");
        return { data: { session: sesion }, error: null };
      },
      async signOut() {
        sesion = null;
        avisar("SIGNED_OUT");
        return { error: null };
      },
      async updateUser(c: { password?: string; data?: Record<string, unknown> }) {
        const u = b.usuarios.find((x) => x.id === uid());
        if (!u) return err("no_session", "no session");
        if (c.password) u.clave = c.password;
        if (c.data) Object.assign(u.meta, c.data);
        abrir(u);
        return { data: { user: sesion!.user }, error: null };
      },
      /** En las pruebas el código del correo es siempre 123456. */
      async verifyOtp(p: { email?: string; token?: string; token_hash?: string; type: string }) {
        const u = b.usuarios.find((x) => x.email === p.email);
        if (!u || p.token !== "123456") return err("otp_expired", "Token has expired or is invalid");
        u.confirmado = true;
        abrir(u);
        avisar(p.type === "recovery" ? "PASSWORD_RECOVERY" : "SIGNED_IN");
        return { data: { session: sesion }, error: null };
      },
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      resend: async () => ({ data: {}, error: null }),
    },
    from: consulta,
    async rpc(nombre: string, args: Record<string, unknown>) {
      if (b.offline) return sinRed();
      b.llamadas.push(`rpc:${nombre}`);
      if (!uid()) return err("42501", "Hace falta iniciar sesión");
      if (nombre === "crear_tienda") {
        if (miTienda()) return err("23505", "Ya tienes una tienda");
        const id = crypto.randomUUID();
        b.tablas.tiendas.push({ id, nombre: args.nombre_tienda, cobrar_cupo: true, actualizado_en: ahora(b) });
        b.tablas.miembros.push({ tienda_id: id, user_id: uid(), nombre: args.mi_nombre, rol: "dueño", usuario: args.mi_usuario, creado_en: ahora(b) });
        return { data: id, error: null };
      }
      const t = miTienda()!;
      if (nombre === "ajustar_stock") {
        const p = b.tablas.productos.find((x) => x.tienda_id === t && x.id === args.producto);
        if (p) Object.assign(p, { stock: Math.round((Number(p.stock) + Number(args.delta)) * 1000) / 1000, actualizado_en: ahora(b) });
        return { data: p?.stock ?? null, error: null };
      }
      if (nombre === "reemplazar_tienda") {
        if (!soyDueno()) return err("42501", "Solo el dueño");
        const d = args.datos as Record<string, Fila[] & Fila>;
        for (const k of ["productos", "clientes", "fiado", "ventas", "turnos"]) b.tablas[k] = b.tablas[k].filter((f) => f.tienda_id !== t);
        const sello = () => ({ tienda_id: t, actualizado_en: ahora(b) });
        for (const p of d.products) b.tablas.productos.push({ ...sello(), id: p.id, nombre: p.name, codigo: p.barcode ?? null, categoria: p.category, precio: p.price, costo: p.cost, stock: p.stock, minimo: p.minStock, unidad: p.unit, favorito: p.favorite });
        for (const c of d.customers) b.tablas.clientes.push({ ...sello(), id: c.id, nombre: c.name, telefono: c.phone, cupo: c.creditLimit, creado_en: c.createdAt });
        for (const s of d.shifts) b.tablas.turnos.push({ ...sello(), id: s.id, abierto_en: s.openedAt, base: s.openingCash, cerrado_en: s.closedAt ?? null, contado: s.countedCash ?? null, esperado: s.expectedCash ?? null });
        for (const v of d.sales) b.tablas.ventas.push({ ...sello(), id: v.id, numero: v.number, creada_en: v.createdAt, items: v.items, total: v.total, metodo: v.method, efectivo_recibido: v.cashReceived ?? null, cliente_id: v.customerId ?? null, turno_id: v.shiftId ?? null, vendedor_id: null, anulada: !!v.voided });
        for (const f of d.ledger) b.tablas.fiado.push({ ...sello(), id: f.id, cliente_id: f.customerId, tipo: f.kind, monto: f.amount, creado_en: f.createdAt, venta_id: f.saleId ?? null, metodo: f.method ?? null, turno_id: f.shiftId ?? null, nota: f.note ?? null });
        const tienda = b.tablas.tiendas.find((x) => x.id === t)!;
        const s = d.settings as unknown as { storeName: string; enforceCreditLimit: boolean };
        Object.assign(tienda, { nombre: s.storeName, cobrar_cupo: s.enforceCreditLimit, actualizado_en: ahora(b) });
        return { data: null, error: null };
      }
      return err("PGRST202", "no existe");
    },
    functions: {
      async invoke(nombre: string, { body }: { body: Record<string, string> }) {
        if (b.offline) return { data: null, error: { message: "Failed to fetch" } };
        b.llamadas.push(`fn:${nombre}:${body.accion}`);
        if (!soyDueno()) return { data: null, error: { message: "403", context: new Response(JSON.stringify({ error: "Solo el dueño puede administrar usuarios." }), { status: 403 }) } };
        const t = miTienda();
        if (body.accion === "crear") {
          const email = /^3\d{9}$/.test(body.usuario) ? `${body.usuario}@vendedores.surtido.app` : body.usuario;
          if (b.usuarios.some((u) => u.email === email)) return { data: null, error: { message: "409", context: new Response(JSON.stringify({ error: "Ya hay un usuario con ese correo o celular.", campo: "login" }), { status: 409 }) } };
          const u = { id: crypto.randomUUID(), email, clave: body.clave, confirmado: true, meta: { nombre: body.nombre } };
          b.usuarios.push(u);
          b.tablas.miembros.push({ tienda_id: t, user_id: u.id, nombre: body.nombre, rol: body.rol, usuario: body.usuario, creado_en: ahora(b) });
          return { data: { user_id: u.id }, error: null };
        }
        if (body.accion === "clave") {
          b.usuarios.find((u) => u.id === body.user_id)!.clave = body.clave;
          return { data: { ok: true }, error: null };
        }
        if (body.accion === "eliminar") {
          b.usuarios = b.usuarios.filter((u) => u.id !== body.user_id);
          b.tablas.miembros = b.tablas.miembros.filter((m) => m.user_id !== body.user_id);
          return { data: { ok: true }, error: null };
        }
        return { data: null, error: { message: "400" } };
      },
    },
  };

  return {
    cliente,
    /** Simula abrir el enlace de confirmación del correo. */
    confirmar(email: string) {
      const u = b.usuarios.find((x) => x.email === email)!;
      u.confirmado = true;
      abrir(u);
      avisar("SIGNED_IN");
    },
    entrarComo(email: string) {
      abrir(b.usuarios.find((x) => x.email === email)!);
      avisar("SIGNED_IN");
    },
  };
}
