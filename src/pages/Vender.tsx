import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { Scanner } from "../components/Scanner";
import { scannerSupported } from "../lib/scanner";
import { useToast } from "../components/toast-context";
import { EmptyState, Money, MoneyInput, Stepper } from "../components/ui";
import {
  cashReceivedSet,
  cartCleared,
  customerSet,
  itemAdded,
  lineRemoved,
  methodSet,
  quantitySet,
} from "../features/cart/cartSlice";
import { selectCart, selectCartLines, selectCartTotal, selectChange, selectStockWarnings } from "../features/cart/selectors";
import { selectCurrentShift } from "../features/cash/selectors";
import { selectBalances, selectAllCustomers } from "../features/customers/selectors";
import { findByBarcode, searchProducts, selectAllProducts, selectFavorites } from "../features/products/selectors";
import { checkout, type CheckoutResult } from "../features/sales/checkout";
import { formatCOP, formatQuantity, lineAmount, quickCashOptions } from "../lib/money";
import type { PaymentMethod, Product } from "../types";

const METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "efectivo", label: "Efectivo" },
  { id: "nequi", label: "Nequi" },
  { id: "daviplata", label: "Daviplata" },
  { id: "tarjeta", label: "Tarjeta" },
  { id: "fiado", label: "Fiado" },
];

export function Vender() {
  const dispatch = useAppDispatch();
  const toast = useToast();
  const products = useAppSelector(selectAllProducts);
  const favorites = useAppSelector(selectFavorites);
  const shift = useAppSelector(selectCurrentShift);
  const lines = useAppSelector(selectCartLines);
  const total = useAppSelector(selectCartTotal);

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [weighing, setWeighing] = useState<Product | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [done, setDone] = useState<Extract<CheckoutResult, { ok: true }> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchProducts(products, deferredQuery).slice(0, 40), [products, deferredQuery]);

  const add = useCallback(
    (product: Product) => {
      if (product.unit === "kg") {
        setWeighing(product);
        return;
      }
      dispatch(itemAdded({ productId: product.id }));
    },
    [dispatch],
  );

  const addByCode = useCallback(
    (code: string) => {
      const product = findByBarcode(products, code);
      if (!product) {
        toast(`No hay ningún producto con el código ${code}`, "error");
        return false;
      }
      add(product);
      toast(`${product.name} agregado`);
      return true;
    },
    [products, add, toast],
  );

  return (
    <div className="sell">
      <section className="sell__catalog" aria-label="Productos">
        {!shift && (
          <p className="banner">
            La caja está cerrada. <Link to="/caja">Ábrela</Link> para llevar la cuenta del efectivo del día.
          </p>
        )}

        <form
          className="search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            // Los lectores de código USB escriben el número y envían Enter.
            if (/^\d{6,14}$/.test(query.trim())) {
              if (addByCode(query)) setQuery("");
            } else if (results.length === 1) {
              add(results[0]);
              setQuery("");
            }
          }}
        >
          <Icon name="buscar" />
          <label htmlFor="buscar-producto" className="sr-only">
            Buscar producto o código
          </label>
          <input
            ref={searchRef}
            id="buscar-producto"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar producto o escanear código"
            autoComplete="off"
          />
          {scannerSupported() && (
            <button type="button" className="icon-btn" onClick={() => setScanning(true)} aria-label="Escanear con la cámara">
              <Icon name="escanear" />
            </button>
          )}
        </form>

        {!query && favorites.length > 0 && (
          <>
            <h2 className="section-title">Los de siempre</h2>
            <div className="favorites">
              {favorites.map((p) => (
                <button key={p.id} type="button" className="fav" onClick={() => add(p)}>
                  <span className="fav__name">{p.name}</span>
                  <span className="fav__price">
                    {formatCOP(p.price)}
                    {p.unit === "kg" && "/kg"}
                  </span>
                </button>
              ))}
            </div>
            <h2 className="section-title">Todos los productos</h2>
          </>
        )}

        {results.length === 0 ? (
          <EmptyState title={`No encontramos "${query}"`}>
            <Link to="/inventario?nuevo=1" className="btn">
              Crear producto
            </Link>
          </EmptyState>
        ) : (
          <ul className="product-list">
            {results.map((p) => (
              <li key={p.id}>
                <button type="button" className="product-row" onClick={() => add(p)}>
                  <span className="product-row__name">
                    {p.name}
                    <span className={`product-row__stock ${p.stock <= p.minStock ? "is-low" : ""}`}>
                      {formatQuantity(p.stock, p.unit)}
                    </span>
                  </span>
                  <span className="product-row__price">
                    {formatCOP(p.price)}
                    {p.unit === "kg" && <small>/kg</small>}
                  </span>
                  <span className="product-row__add" aria-hidden="true">
                    <Icon name="mas" size={18} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button type="button" className="cart-bar" onClick={() => setCartOpen(true)} hidden={lines.length === 0}>
        <span>
          Ver venta <span className="cart-bar__count">{lines.length}</span>
        </span>
        <Money value={total} />
      </button>

      <CartPanel
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onDone={(result) => {
          setDone(result);
          setCartOpen(false);
        }}
      />

      <WeightDialog product={weighing} onClose={() => setWeighing(null)} />

      <Scanner
        open={scanning}
        onClose={() => setScanning(false)}
        onDetected={(code) => {
          setScanning(false);
          addByCode(code);
        }}
      />

      <Modal
        title={done ? `Venta #${done.sale.number} registrada` : ""}
        open={done !== null}
        onClose={() => {
          setDone(null);
          searchRef.current?.focus();
        }}
        footer={
          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={() => {
              setDone(null);
              searchRef.current?.focus();
            }}
          >
            Nueva venta
          </button>
        }
      >
        {done && (
          <div className="receipt">
            {done.sale.method === "efectivo" && done.sale.cashReceived ? (
              <p className="receipt__change">
                Cambio <Money value={done.change} />
              </p>
            ) : (
              <p className="receipt__change">
                <Money value={done.sale.total} />
              </p>
            )}
            <p className="muted">
              {METHODS.find((m) => m.id === done.sale.method)?.label}
              {done.sale.cashReceived ? `, recibido ${formatCOP(done.sale.cashReceived)}` : ""}
            </p>
            <ul className="receipt__items">
              {done.sale.items.map((i) => (
                <li key={i.productId}>
                  <span>
                    {formatQuantity(i.quantity, i.unit)} {i.name}
                  </span>
                  <Money value={lineAmount(i.price, i.quantity, i.unit)} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    </div>
  );
}

function CartPanel({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (result: Extract<CheckoutResult, { ok: true }>) => void;
}) {
  const dispatch = useAppDispatch();
  const toast = useToast();
  const cart = useAppSelector(selectCart);
  const lines = useAppSelector(selectCartLines);
  const total = useAppSelector(selectCartTotal);
  const change = useAppSelector(selectChange);
  const warnings = useAppSelector(selectStockWarnings);
  const customers = useAppSelector(selectAllCustomers);
  const balances = useAppSelector(selectBalances);
  const [overLimit, setOverLimit] = useState<string | null>(null);

  const charge = (allowOverLimit = false) => {
    const result = dispatch(checkout({ allowOverLimit }));
    if (result.ok) {
      setOverLimit(null);
      onDone(result);
    } else if (result.reason === "cupo_excedido") {
      setOverLimit(result.message);
    } else {
      toast(result.message, "error");
    }
  };

  const customer = customers.find((c) => c.id === cart.customerId);

  return (
    <aside className={`cart ${open ? "is-open" : ""}`} aria-label="Venta actual">
      <header className="cart__head">
        <button type="button" className="icon-btn cart__back" onClick={onClose} aria-label="Volver a productos">
          <Icon name="atras" />
        </button>
        <h2>Venta actual</h2>
        {lines.length > 0 && (
          <button type="button" className="link" onClick={() => dispatch(cartCleared())}>
            Vaciar
          </button>
        )}
      </header>

      {lines.length === 0 ? (
        <EmptyState title="Toca un producto para empezar la venta">
          <p className="muted small">También puedes escanear el código de barras.</p>
        </EmptyState>
      ) : (
        <>
          <ul className="cart__lines">
            {lines.map(({ product, quantity, subtotal }) => (
              <li key={product.id} className="cart-line">
                <div className="cart-line__info">
                  <p className="cart-line__name">{product.name}</p>
                  <p className="muted small">
                    {formatCOP(product.price)}
                    {product.unit === "kg" ? "/kg" : " c/u"}
                  </p>
                </div>
                {product.unit === "kg" ? (
                  <span className="cart-line__weight">{formatQuantity(quantity, "kg")}</span>
                ) : (
                  <Stepper
                    label={product.name}
                    value={quantity}
                    onChange={(q) => dispatch(quantitySet({ productId: product.id, quantity: q }))}
                  />
                )}
                <Money value={subtotal} className="cart-line__total" />
                <button
                  type="button"
                  className="icon-btn cart-line__remove"
                  onClick={() => dispatch(lineRemoved(product.id))}
                  aria-label={`Quitar ${product.name}`}
                >
                  <Icon name="cerrar" size={16} />
                </button>
              </li>
            ))}
          </ul>

          {warnings.length > 0 && (
            <p className="warning">
              <Icon name="alerta" size={16} /> Según el inventario no alcanza: {warnings.join(", ")}.
            </p>
          )}

          <div className="cart__total">
            <span>Total</span>
            <Money value={total} />
          </div>

          <fieldset className="methods">
            <legend className="sr-only">Forma de pago</legend>
            {METHODS.map((m) => (
              <label key={m.id} className={`chip ${cart.method === m.id ? "is-active" : ""}`}>
                <input
                  type="radio"
                  name="metodo"
                  value={m.id}
                  checked={cart.method === m.id}
                  onChange={() => dispatch(methodSet(m.id))}
                />
                {m.label}
              </label>
            ))}
          </fieldset>

          {cart.method === "efectivo" && (
            <div className="cash">
              <label htmlFor="recibido">¿Con cuánto paga?</label>
              <MoneyInput id="recibido" value={cart.cashReceived} onChange={(v) => dispatch(cashReceivedSet(v))} />
              <div className="cash__quick">
                {quickCashOptions(total).map((v) => (
                  <button key={v} type="button" className="chip" onClick={() => dispatch(cashReceivedSet(v))}>
                    {formatCOP(v)}
                  </button>
                ))}
              </div>
              {cart.cashReceived >= total && cart.cashReceived > 0 && (
                <p className="cash__change">
                  Cambio <Money value={change} />
                </p>
              )}
            </div>
          )}

          {cart.method === "fiado" && (
            <div className="cash">
              <label htmlFor="cliente-fiado">¿A quién le fías?</label>
              <select
                id="cliente-fiado"
                value={cart.customerId ?? ""}
                onChange={(e) => dispatch(customerSet(e.target.value || null))}
              >
                <option value="">Elegir cliente</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (debe {formatCOP(balances[c.id] ?? 0)})
                  </option>
                ))}
              </select>
              {customer && (
                <p className="muted small">
                  Cupo {formatCOP(customer.creditLimit)}. Quedaría debiendo{" "}
                  {formatCOP((balances[customer.id] ?? 0) + total)}.
                </p>
              )}
              <Link to="/fiado?nuevo=1" className="link small">
                Nuevo cliente
              </Link>
            </div>
          )}

          <button type="button" className="btn btn--primary btn--block btn--lg" onClick={() => charge()}>
            Cobrar <Money value={total} />
          </button>
        </>
      )}

      <Modal
        title="Supera el cupo"
        open={overLimit !== null}
        onClose={() => setOverLimit(null)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setOverLimit(null)}>
              Cancelar
            </button>
            <button type="button" className="btn btn--primary" onClick={() => charge(true)}>
              Fiar de todas formas
            </button>
          </>
        }
      >
        <p>{overLimit}</p>
      </Modal>
    </aside>
  );
}

/** Para productos por peso: se puede vender por kilos o por valor ("deme $2.000 de tomate"). */
function WeightDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const [mode, setMode] = useState<"valor" | "peso">("valor");
  const [amount, setAmount] = useState(0);
  const [grams, setGrams] = useState("");

  const kilos = product
    ? mode === "valor"
      ? Math.round((amount / product.price) * 1000) / 1000
      : (Number(grams.replace(/\D/g, "")) || 0) / 1000
    : 0;

  const close = () => {
    setAmount(0);
    setGrams("");
    onClose();
  };

  return (
    <Modal
      title={product ? product.name : ""}
      open={product !== null}
      onClose={close}
      footer={
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={kilos <= 0}
          onClick={() => {
            if (product && kilos > 0) dispatch(itemAdded({ productId: product.id, quantity: kilos }));
            close();
          }}
        >
          Agregar {kilos > 0 && product ? `${formatQuantity(kilos, "kg")} por ${formatCOP(Math.round(kilos * product.price))}` : ""}
        </button>
      }
    >
      {product && (
        <>
          <p className="muted">{formatCOP(product.price)} el kilo</p>
          <div className="segmented" role="group" aria-label="Vender por">
            <button type="button" aria-pressed={mode === "valor"} onClick={() => setMode("valor")}>
              Por valor
            </button>
            <button type="button" aria-pressed={mode === "peso"} onClick={() => setMode("peso")}>
              Por peso
            </button>
          </div>
          {mode === "valor" ? (
            <div className="field">
              <label htmlFor="valor-peso">¿Cuánto quiere llevar?</label>
              <MoneyInput id="valor-peso" value={amount} onChange={setAmount} autoFocus />
              <div className="cash__quick">
                {[1000, 2000, 3000, 5000].map((v) => (
                  <button key={v} type="button" className="chip" onClick={() => setAmount(v)}>
                    {formatCOP(v)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="gramos">Peso en gramos</label>
              <input id="gramos" inputMode="numeric" value={grams} onChange={(e) => setGrams(e.target.value)} placeholder="500" autoFocus />
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
