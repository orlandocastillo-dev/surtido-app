import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";
import { ToastProvider } from "../src/components/Toast";
import { Vender } from "../src/pages/Vender";
import { testStore } from "./helpers";

beforeAll(() => {
  // jsdom no implementa <dialog>: se simula lo mínimo.
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

function renderVender() {
  const store = testStore();
  render(
    <Provider store={store}>
      <ToastProvider>
        <MemoryRouter>
          <Vender />
        </MemoryRouter>
      </ToastProvider>
    </Provider>,
  );
  return store;
}

describe("pantalla Vender", () => {
  it("vende un producto favorito en efectivo y muestra el cambio", async () => {
    const user = userEvent.setup();
    const store = renderVender();

    await user.click(screen.getAllByRole("button", { name: /Leche entera 1 L/ })[0]);
    await user.click(screen.getByRole("button", { name: /Agregar una unidad de Leche/ }));

    const cart = screen.getByRole("complementary", { name: "Venta actual" });
    expect(within(cart).getAllByText("$8.400").length).toBeGreaterThan(0);

    await user.type(within(cart).getByLabelText("¿Con cuánto paga?"), "10000");
    await user.click(within(cart).getByRole("button", { name: /Cobrar/ }));

    expect(await screen.findByText("Venta #1 registrada")).toBeInTheDocument();
    expect(screen.getByText("$1.600")).toBeInTheDocument();
    expect(store.getState().products.entities.leche.stock).toBe(8);
  });

  it("agrega por código de barras al presionar Enter, como un lector USB", async () => {
    const user = userEvent.setup();
    const store = renderVender();
    const input = screen.getByLabelText("Buscar producto o código");
    await user.type(input, "7700000000011");
    fireEvent.submit(input.closest("form")!);
    expect(store.getState().cart.lines).toEqual([{ productId: "leche", quantity: 1 }]);
  });
});
