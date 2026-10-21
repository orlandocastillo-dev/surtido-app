import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Provider } from "react-redux";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { makeStore, nubeSesion, type AppStore } from "../src/app/store";
import { RequireAuth } from "../src/components/Guards";
import { Layout } from "../src/components/Layout";
import { ToastProvider } from "../src/components/Toast";
import { stockAdjusted } from "../src/features/products/productsSlice";
import { nubeConectada } from "../src/features/nube/nubeSlice";
import { saleRecorded } from "../src/features/sales/actions";
import { compactar, diferencias, type Op } from "../src/nube/cambios";
import { usarClientePrueba } from "../src/nube/cliente";
import { iniciarNube, reiniciarConexion } from "../src/nube/conexion";
import { correoParaEntrar } from "../src/nube/cuenta";
import { desde, hacia } from "../src/nube/esquema";
import { Sincronizador } from "../src/nube/sync";
import { Entrar, Registro } from "../src/pages/Acceso";
import { Ajustes } from "../src/pages/Ajustes";
import { Vender } from "../src/pages/Vender";
import type { Sale } from "../src/types";
import { clienteFalso, nuevaBase, type Base } from "./fakeSupabase";
import { leche, testStore, tomate } from "./helpers";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://prueba.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "llave-publica");
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  usarClientePrueba(null);
  reiniciarConexion();
});

const venta = (id: string, number: number, quantity: number, sellerId: string): Sale => ({
  id,
  number,
  createdAt: new Date().toISOString(),
  items: [{ productId: "leche", name: leche.name, unit: "und", quantity, price: 4200, cost: 3450 }],
  total: 4200 * quantity,
  method: "efectivo",
  sellerId,
});

/** Un dueño con su tienda creada en la base, y un "equipo" (store) conectado a ella. */
async function dueñoConTienda(b: Base) {
  const c = clienteFalso(b);
  const db = c.cliente as unknown as SupabaseClient;
  const { data } = await c.cliente.auth.signUp({ email: "rosa@correo.co", password: "clave-segura-1" });
  const uid = data!.user!.id;
  const tienda = (await c.cliente.rpc("crear_tienda", { nombre_tienda: "Doña Rosa", mi_nombre: "Rosa", mi_usuario: "rosa@correo.co" })).data as string;
  return { c, db, uid, tienda };
}

async function equipo(db: SupabaseClient, tienda: string, uid: string) {
  const store = makeStore();
  const s = new Sincronizador(db, tienda, store);
  s.abrirCopia();
  store.dispatch(nubeSesion({ users: [], sessionUserId: uid }));
  store.dispatch(nubeConectada({ tiendaId: tienda }));
  await s.arrancar();
  return { store, s };
}

describe("sincronización con la base", () => {
  it("lo que se vende en un equipo aparece en el otro, y las existencias se descuentan sin pisarse", async () => {
    const b = nuevaBase();
    const { db, uid, tienda } = await dueñoConTienda(b);
    const a = await equipo(db, tienda, uid);

    // El dueño crea los productos desde el equipo A.
    const local = testStore().getState();
    a.store.dispatch({ type: "app/dataReplaced", payload: { ...local, auth: undefined, nube: undefined } });
    await waitFor(() => expect(b.tablas.productos).toHaveLength(2));

    // Otro celular de la misma tienda.
    const c2 = clienteFalso(b);
    await c2.cliente.auth.signInWithPassword({ email: "rosa@correo.co", password: "clave-segura-1" });
    const bEquipo = await equipo(c2.cliente as unknown as SupabaseClient, tienda, uid);
    expect(bEquipo.store.getState().products.entities.leche.stock).toBe(10);

    // Los dos venden leche casi al mismo tiempo.
    a.store.dispatch(saleRecorded(venta("v-a", 1, 2, uid)));
    bEquipo.store.dispatch(saleRecorded(venta("v-b", 2, 3, uid)));
    await waitFor(() => expect(b.tablas.ventas).toHaveLength(2));
    await waitFor(() => expect(Number(b.tablas.productos.find((p) => p.id === "leche")!.stock)).toBe(5));

    await a.s.ciclo();
    await bEquipo.s.ciclo();
    expect(a.store.getState().sales.list.map((s) => s.id).sort()).toEqual(["v-a", "v-b"]);
    expect(bEquipo.store.getState().sales.list.map((s) => s.id).sort()).toEqual(["v-a", "v-b"]);
    expect(a.store.getState().products.entities.leche.stock).toBe(5);
    expect(bEquipo.store.getState().products.entities.leche.stock).toBe(5);
    a.s.detener();
    bEquipo.s.detener();
  });

  it("sin internet guarda los cambios en el equipo y los sube al volver la conexión", async () => {
    const b = nuevaBase();
    const { db, uid, tienda } = await dueñoConTienda(b);
    const a = await equipo(db, tienda, uid);
    a.store.dispatch({ type: "app/dataReplaced", payload: { ...testStore().getState(), auth: undefined, nube: undefined } });
    await waitFor(() => expect(b.tablas.productos).toHaveLength(2));

    b.offline = true;
    a.store.dispatch(saleRecorded(venta("v-1", 1, 1, uid)));
    a.store.dispatch(stockAdjusted({ id: "tomate", delta: 2.5 }));
    await waitFor(() => expect(a.store.getState().nube.enLinea).toBe(false));
    expect(a.store.getState().nube.pendientes).toBe(3); // venta, existencias de leche y de tomate
    expect(JSON.parse(localStorage.getItem(`surtido:pendientes:${tienda}`)!)).toHaveLength(3);
    // La venta se ve en el equipo aunque no haya internet.
    expect(a.store.getState().sales.list).toHaveLength(1);

    b.offline = false;
    await a.s.ciclo();
    expect(a.store.getState().nube.pendientes).toBe(0);
    expect(b.tablas.ventas).toHaveLength(1);
    expect(Number(b.tablas.productos.find((p) => p.id === "tomate")!.stock)).toBe(7.5);
    a.s.detener();
  });

  it("al abrir otra vez sin internet muestra la copia del equipo", async () => {
    const b = nuevaBase();
    const { db, uid, tienda } = await dueñoConTienda(b);
    const a = await equipo(db, tienda, uid);
    a.store.dispatch({ type: "app/dataReplaced", payload: { ...testStore().getState(), auth: undefined, nube: undefined } });
    await waitFor(() => expect(b.tablas.productos).toHaveLength(2));
    a.s.detener();
    // La app guarda la copia de la tienda en el navegador (persistencia).
    const { serialize } = await import("../src/app/persistence");
    const { nube: _n, ...resto } = a.store.getState();
    void _n;
    localStorage.setItem(`surtido:nube:${tienda}`, serialize(resto));

    b.offline = true;
    const otra = makeStore();
    new Sincronizador(db, tienda, otra).abrirCopia();
    expect(otra.getState().products.ids).toEqual(["leche", "tomate"]);
  });
});

describe("qué se sube por cada cambio", () => {
  it("las existencias van como suma o resta, no como valor final", () => {
    const antes = testStore().getState();
    const s = testStore();
    s.dispatch(saleRecorded(venta("v", 1, 3, "u")));
    const ops = diferencias(antes, s.getState(), "t1");
    expect(ops).toContainEqual({ k: "stock", id: "leche", delta: -3 });
    expect(ops.find((o) => o.k === "insertar" && o.tabla === "ventas")).toBeTruthy();
    // El precio no cambió: no se manda ningún "cambiar" de productos.
    expect(ops.some((o) => o.k === "cambiar" && o.tabla === "productos")).toBe(false);
  });

  it("junta cambios seguidos para no mandar una petición por cada tecla o cada unidad", () => {
    const ops: Op[] = [
      { k: "stock", id: "leche", delta: -1 },
      { k: "stock", id: "leche", delta: -1 },
      { k: "stock", id: "leche", delta: -0.5 },
      { k: "tienda", cambios: { nombre: "D" } },
      { k: "tienda", cambios: { nombre: "Do" } },
      { k: "tienda", cambios: { nombre: "Doña" } },
      { k: "insertar", tabla: "clientes", fila: { id: "c1", nombre: "Ana" } },
      { k: "cambiar", tabla: "clientes", id: "c1", cambios: { nombre: "Ana María" } },
    ];
    expect(compactar(ops)).toEqual([
      { k: "stock", id: "leche", delta: -2.5 },
      { k: "tienda", cambios: { nombre: "Doña" } },
      { k: "insertar", tabla: "clientes", fila: { id: "c1", nombre: "Ana María" } },
    ]);
  });

  it("reemplazar los datos descarta lo pendiente de antes", () => {
    expect(compactar([{ k: "stock", id: "x", delta: 1 }, { k: "reemplazar", datos: {} }])).toEqual([{ k: "reemplazar", datos: {} }]);
  });

  it("las filas de la base y los tipos de la app van y vuelven sin perder nada", () => {
    for (const p of [leche, tomate]) expect(desde.producto(hacia.producto(p, "t") as never)).toEqual(p);
    const v = venta("v", 7, 2, "11111111-1111-1111-1111-111111111111");
    expect(desde.venta({ ...(hacia.venta(v, "t") as never), total: "8400.00" })).toEqual(v);
    // Las ventas de la tienda de ejemplo traen vendedores inventados: no se mandan.
    expect(hacia.venta(venta("v", 1, 1, "usr_demo"), "t").vendedor_id).toBeNull();
  });

  it("el vendedor entra con su celular o con su correo", () => {
    expect(correoParaEntrar("300 111 2233")).toBe("3001112233@vendedores.surtido.app");
    expect(correoParaEntrar("Rosa@Correo.co")).toBe("rosa@correo.co");
    expect(correoParaEntrar("rosa")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// La app completa con la nube
// ---------------------------------------------------------------------------

function montar(b: Base, opciones: { confirmarCorreo?: boolean } = {}) {
  const c = clienteFalso(b, opciones);
  usarClientePrueba(c.cliente as unknown as SupabaseClient);
  const store: AppStore = makeStore();
  void iniciarNube(store);
  const router = createMemoryRouter(
    [
      { path: "/entrar", element: <Entrar /> },
      { path: "/registro", element: <Registro /> },
      {
        path: "/",
        element: (
          <RequireAuth>
            <Layout />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <Vender /> },
          { path: "ajustes", element: <Ajustes /> },
        ],
      },
    ],
    { initialEntries: ["/"] },
  );
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>,
  );
  return { c, store, router };
}

const escribir = async (etiqueta: string | RegExp, texto: string) => {
  const campo = screen.getByLabelText(etiqueta);
  await userEvent.clear(campo);
  await userEvent.type(campo, texto);
};

describe("la app con cuentas en la nube", () => {
  it("sin sesión pide entrar (no crear una tienda local)", async () => {
    montar(nuevaBase());
    expect(await screen.findByRole("heading", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Créala gratis" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Probar con la tienda de ejemplo" })).toBeInTheDocument();
  });

  it("crear la tienda con datos de ejemplo la deja en la nube y abre la app", async () => {
    const b = nuevaBase();
    const { router, store } = montar(b);
    await screen.findByRole("heading", { name: "Entrar" });
    await router.navigate("/registro");
    await screen.findByLabelText("Nombre de la tienda");
    await escribir("Nombre de la tienda", "Tienda La Esquina");
    await escribir("Tu nombre", "Rosa Méndez");
    await escribir("Tu correo", "rosa@correo.co");
    await escribir(/^Contraseña/, "clave-segura-1");
    await escribir("Repítela", "clave-segura-1");
    await userEvent.click(screen.getByRole("button", { name: "Crear mi tienda" }));

    await waitFor(() => expect(store.getState().nube.modo).toBe("nube"), { timeout: 3000 });
    expect(b.tablas.tiendas).toHaveLength(1);
    expect(b.tablas.tiendas[0].nombre).toBe("Tienda La Esquina");
    expect(b.tablas.productos.length).toBe(32);
    expect(b.tablas.miembros[0]).toMatchObject({ rol: "dueño", nombre: "Rosa Méndez" });
    await waitFor(() => expect(store.getState().products.ids).toHaveLength(32));
    expect(store.getState().auth.users[0].name).toBe("Rosa Méndez");
  });

  it("con confirmación de correo, la tienda se crea al abrir el enlace", async () => {
    const b = nuevaBase();
    const { router, store, c } = montar(b, { confirmarCorreo: true });
    await screen.findByRole("heading", { name: "Entrar" });
    await router.navigate("/registro");
    await screen.findByLabelText("Nombre de la tienda");
    await escribir("Nombre de la tienda", "Tienda La Esquina");
    await escribir("Tu nombre", "Rosa Méndez");
    await escribir("Tu correo", "rosa@correo.co");
    await escribir(/^Contraseña/, "clave-segura-1");
    await escribir("Repítela", "clave-segura-1");
    await userEvent.click(screen.getByRole("radio", { name: /Empezar en blanco/ }));
    await userEvent.click(screen.getByRole("button", { name: "Crear mi tienda" }));
    expect(await screen.findByRole("heading", { name: "Confirma tu correo" })).toBeInTheDocument();
    expect(b.tablas.tiendas).toHaveLength(0);

    c.confirmar("rosa@correo.co");
    await waitFor(() => expect(store.getState().nube.modo).toBe("nube"), { timeout: 3000 });
    expect(b.tablas.tiendas).toHaveLength(1);
    expect(b.tablas.productos).toHaveLength(0);
  });

  it("el dueño crea un vendedor y el vendedor entra con su celular", async () => {
    const b = nuevaBase();
    const { router, store } = montar(b);
    await screen.findByRole("heading", { name: "Entrar" });
    await router.navigate("/registro");
    await screen.findByLabelText("Nombre de la tienda");
    await escribir("Nombre de la tienda", "Tienda La Esquina");
    await escribir("Tu nombre", "Rosa Méndez");
    await escribir("Tu correo", "rosa@correo.co");
    await escribir(/^Contraseña/, "clave-segura-1");
    await escribir("Repítela", "clave-segura-1");
    await userEvent.click(screen.getByRole("radio", { name: /Empezar en blanco/ }));
    await userEvent.click(screen.getByRole("button", { name: "Crear mi tienda" }));
    await waitFor(() => expect(store.getState().nube.modo).toBe("nube"), { timeout: 3000 });

    await router.navigate("/ajustes");
    await userEvent.click(await screen.findByRole("button", { name: /Agregar vendedor/ }));
    const dialogo = await screen.findByRole("dialog", { name: "Nuevo usuario" });
    await userEvent.type(within(dialogo).getByLabelText("Nombre"), "Carlos Ruiz");
    await userEvent.type(within(dialogo).getByLabelText("Correo o celular"), "3001112233");
    await userEvent.type(within(dialogo).getByLabelText("Contraseña inicial"), "carlos-2026");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Crear usuario" }));
    await waitFor(() => expect(store.getState().auth.users.map((u) => u.name)).toContain("Carlos Ruiz"));
    expect(b.usuarios.some((u) => u.email === "3001112233@vendedores.surtido.app")).toBe(true);

    // El vendedor entra desde otro equipo con su celular.
    const otro = clienteFalso(b);
    const r = await otro.cliente.auth.signInWithPassword({ email: correoParaEntrar("300 111 2233")!, password: "carlos-2026" });
    expect(r.error).toBeNull();
  });

  it("la tienda de ejemplo sigue funcionando sin cuenta", async () => {
    const { store } = montar(nuevaBase());
    await userEvent.click(await screen.findByRole("button", { name: "Probar con la tienda de ejemplo" }));
    await waitFor(() => expect(store.getState().auth.sessionUserId).not.toBeNull());
    expect(store.getState().nube.modo).toBe("local");
  });
});
