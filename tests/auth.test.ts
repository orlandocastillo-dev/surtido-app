import { describe, expect, it } from "vitest";
import { serializeBackup } from "../src/app/persistence";
import { makeStore } from "../src/app/store";
import { loggedOut, userRemoved } from "../src/features/auth/authSlice";
import { selectCan, selectCurrentUser } from "../src/features/auth/selectors";
import { addUser, changePassword, enterDemo, login, registerStore } from "../src/features/auth/thunks";
import { itemAdded } from "../src/features/cart/cartSlice";
import { checkout } from "../src/features/sales/checkout";
import { hashPassword, newSalt, verifyPassword } from "../src/lib/crypto";

const owner = { storeName: "Tienda Doña Rosa", name: "Rosa Pérez", login: "Rosa@Correo.com ", password: "tienda123", start: "ejemplo" as const };

describe("contraseñas", () => {
  it("el hash verifica la contraseña correcta y rechaza las demás", async () => {
    const salt = newSalt();
    const hash = await hashPassword("secreta1", salt);
    expect(hash).not.toContain("secreta1");
    expect(await verifyPassword("secreta1", salt, hash)).toBe(true);
    expect(await verifyPassword("Secreta1", salt, hash)).toBe(false);
  });

  it("la misma contraseña con distinta sal da hashes distintos", async () => {
    expect(await hashPassword("abc123", newSalt())).not.toBe(await hashPassword("abc123", newSalt()));
  });
});

describe("registro e inicio de sesión", () => {
  it("crea la tienda con su dueño, carga el ejemplo y deja la sesión abierta", async () => {
    const store = makeStore();
    expect(await store.dispatch(registerStore(owner))).toEqual({ ok: true });
    const state = store.getState();
    expect(selectCurrentUser(state)).toMatchObject({ name: "Rosa Pérez", role: "dueño", login: "rosa@correo.com" });
    expect(state.settings.storeName).toBe("Tienda Doña Rosa");
    expect(state.products.ids.length).toBeGreaterThan(20);
  });

  it("valida los datos del registro", async () => {
    const store = makeStore();
    expect(await store.dispatch(registerStore({ ...owner, login: "rosa" }))).toMatchObject({ ok: false, field: "login" });
    expect(await store.dispatch(registerStore({ ...owner, password: "123" }))).toMatchObject({ ok: false, field: "password" });
  });

  it("no permite registrar una segunda tienda en el mismo dispositivo", async () => {
    const store = makeStore();
    await store.dispatch(registerStore(owner));
    expect((await store.dispatch(registerStore(owner))).ok).toBe(false);
  });

  it("entra con correo sin importar mayúsculas y rechaza contraseñas incorrectas", async () => {
    const store = makeStore();
    await store.dispatch(registerStore(owner));
    store.dispatch(loggedOut());
    expect(await store.dispatch(login("ROSA@correo.com", "otra"))).toMatchObject({ ok: false });
    expect(selectCurrentUser(store.getState())).toBeNull();
    expect(await store.dispatch(login("ROSA@correo.com", "tienda123"))).toEqual({ ok: true });
  });

  it("el mismo mensaje de error si el usuario no existe", async () => {
    const store = makeStore();
    await store.dispatch(registerStore(owner));
    const a = await store.dispatch(login("nadie@correo.com", "tienda123"));
    const b = await store.dispatch(login("rosa@correo.com", "mala123"));
    expect(a).toEqual(b);
  });

  it("cambia la contraseña solo si la actual es correcta", async () => {
    const store = makeStore();
    await store.dispatch(registerStore(owner));
    expect((await store.dispatch(changePassword("mala", "nueva123"))).ok).toBe(false);
    expect((await store.dispatch(changePassword("tienda123", "nueva123"))).ok).toBe(true);
    store.dispatch(loggedOut());
    expect((await store.dispatch(login("rosa@correo.com", "nueva123"))).ok).toBe(true);
  });
});

describe("roles", () => {
  it("el dueño crea vendedores que no ven reportes ni anulan ventas", async () => {
    const store = makeStore();
    await store.dispatch(registerStore(owner));
    expect(await store.dispatch(addUser("Juan", "3005550199", "juan123", "vendedor"))).toEqual({ ok: true });
    expect((await store.dispatch(addUser("Otro", "3005550199", "otro123", "vendedor"))).ok).toBe(false); // repetido

    store.dispatch(loggedOut());
    await store.dispatch(login("3005550199", "juan123"));
    const can = selectCan(store.getState());
    expect(can("reportes")).toBe(false);
    expect(can("anularVentas")).toBe(false);

    // Un vendedor no puede crear usuarios.
    expect((await store.dispatch(addUser("X", "x@x.co", "xxxxxx", "dueño"))).ok).toBe(false);
  });

  it("cada venta queda a nombre de quien la registró", async () => {
    const store = makeStore();
    await store.dispatch(registerStore({ ...owner, start: "ejemplo" }));
    const productId = store.getState().products.ids[0] as string;
    store.dispatch(itemAdded({ productId }));
    const result = store.dispatch(checkout());
    expect(result.ok && result.sale.sellerId).toBe(store.getState().auth.sessionUserId);
  });

  it("no se puede quitar al único dueño", async () => {
    const store = makeStore();
    await store.dispatch(registerStore(owner));
    const id = store.getState().auth.users[0].id;
    store.dispatch(userRemoved(id));
    expect(store.getState().auth.users).toHaveLength(1);
  });
});

describe("copia de seguridad", () => {
  it("no incluye cuentas ni contraseñas", async () => {
    const store = makeStore();
    await store.dispatch(registerStore(owner));
    const backup = serializeBackup(store.getState());
    expect(backup).not.toContain("passwordHash");
    expect(backup).not.toContain("rosa@correo.com");
  });
});

describe("tienda de ejemplo", () => {
  it("entra sin registrarse y vuelve a la misma cuenta después de cerrar sesión", async () => {
    const store = makeStore();
    expect(await store.dispatch(enterDemo())).toEqual({ ok: true });
    const first = selectCurrentUser(store.getState());
    expect(first).toMatchObject({ role: "dueño" });
    expect(store.getState().products.ids.length).toBeGreaterThan(20);
    store.dispatch(loggedOut());
    expect(await store.dispatch(enterDemo())).toEqual({ ok: true });
    expect(selectCurrentUser(store.getState())?.id).toBe(first?.id);
  });

  it("no pisa una tienda real que ya tiene cuenta", async () => {
    const store = makeStore();
    await store.dispatch(registerStore(owner));
    store.dispatch(loggedOut());
    expect(await store.dispatch(enterDemo())).toMatchObject({ ok: false });
  });
});
