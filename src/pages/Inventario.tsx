import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { selectCan } from "../features/auth/selectors";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { useToast } from "../components/toast-context";
import { EmptyState, Money, MoneyInput, PageHeader, Stat } from "../components/ui";
import { favoriteToggled, productAdded, productRemoved, productUpdated, stockAdjusted } from "../features/products/productsSlice";
import {
  marginPct,
  searchProducts,
  selectAllProducts,
  selectInventoryValue,
  selectLowStock,
} from "../features/products/selectors";
import { CATEGORIES, suggestedOrder } from "../features/products/catalog";
import { newId } from "../lib/id";
import { formatCOP, formatQuantity } from "../lib/money";
import type { Category, Product, Unit } from "../types";

export function Inventario() {
  const dispatch = useAppDispatch();
  const toast = useToast();
  const products = useAppSelector(selectAllProducts);
  const lowStock = useAppSelector(selectLowStock);
  const value = useAppSelector(selectInventoryValue);
  const [params, setParams] = useSearchParams();
  const canEdit = useAppSelector(selectCan)("editarProductos");

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "todas">("todas");
  const [onlyLow, setOnlyLow] = useState(false);
  const [editing, setEditing] = useState<Product | "nuevo" | null>(params.get("nuevo") && canEdit ? "nuevo" : null);
  const [restocking, setRestocking] = useState<Product | null>(null);
  const [ordering, setOrdering] = useState(false);

  const visible = useMemo(() => {
    let list = searchProducts(products, query);
    if (category !== "todas") list = list.filter((p) => p.category === category);
    if (onlyLow) list = list.filter((p) => p.stock <= p.minStock);
    return list;
  }, [products, query, category, onlyLow]);

  const orderText =
    "Pedido para la tienda:\n" + lowStock.map((p) => `- ${p.name}: ${formatQuantity(suggestedOrder(p), p.unit)}`).join("\n");

  return (
    <div className="page">
      <PageHeader
        title="Inventario"
        subtitle={`${products.length} productos`}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setOrdering(true)} disabled={lowStock.length === 0}>
              Pedido sugerido
            </button>
            {canEdit && (
              <button type="button" className="btn btn--primary" onClick={() => setEditing("nuevo")}>
                <Icon name="mas" size={18} /> Nuevo producto
              </button>
            )}
          </>
        }
      />

      <div className="stats">
        <Stat
          label="Por pedir"
          value={lowStock.length}
          note={lowStock.length ? "productos en el mínimo o por debajo" : "todo con buen surtido"}
          tone={lowStock.length ? "warn" : "good"}
        />
        <Stat label="Inventario a costo" value={<Money value={value.cost} />} note="lo que te costó la mercancía" />
        <Stat label="Inventario a precio de venta" value={<Money value={value.retail} />} note={`ganancia posible ${formatCOP(value.retail - value.cost)}`} />
      </div>

      <div className="toolbar">
        <div className="search search--compact">
          <Icon name="buscar" />
          <label htmlFor="buscar-inv" className="sr-only">
            Buscar en inventario
          </label>
          <input id="buscar-inv" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar" />
        </div>
        <label className="sr-only" htmlFor="categoria">
          Categoría
        </label>
        <select id="categoria" value={category} onChange={(e) => setCategory(e.target.value as Category | "todas")}>
          <option value="todas">Todas las categorías</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="toggle">
          <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} />
          Solo por pedir
        </label>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="No hay productos con esos filtros" />
      ) : (
        <ul className="inventory">
          {visible.map((p) => {
            const low = p.stock <= p.minStock;
            const fill = Math.min(100, (Math.max(0, p.stock) / Math.max(1, p.minStock * 2)) * 100);
            return (
              <li key={p.id} className="inv-row">
                <button
                  type="button"
                  className={`star ${p.favorite ? "is-on" : ""}`}
                  onClick={() => dispatch(favoriteToggled(p.id))}
                  aria-pressed={p.favorite}
                  aria-label={p.favorite ? `Quitar ${p.name} de los de siempre` : `Agregar ${p.name} a los de siempre`}
                >
                  <Icon name="estrella" size={18} filled={p.favorite} />
                </button>
                <div className="inv-row__main">
                  <p className="inv-row__name">{p.name}</p>
                  <p className="muted small">
                    {p.category}
                    {p.barcode ? `, código ${p.barcode}` : ""}
                  </p>
                </div>
                <div className="inv-row__price">
                  <Money value={p.price} />
                  <span className="muted small">margen {marginPct(p)} %</span>
                </div>
                <div className={`inv-row__stock ${low ? "is-low" : ""}`}>
                  <span>{formatQuantity(p.stock, p.unit)}</span>
                  <span className="meter" aria-hidden="true">
                    <span style={{ width: `${fill}%` }} />
                  </span>
                  <span className="small">{low ? "Pedir" : `mín. ${p.minStock}`}</span>
                </div>
                <div className="inv-row__actions">
                  <button type="button" className="btn btn--small" onClick={() => setRestocking(p)}>
                    Entrada
                  </button>
                  {canEdit && (
                    <button type="button" className="icon-btn" onClick={() => setEditing(p)} aria-label={`Editar ${p.name}`}>
                      <Icon name="editar" size={18} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ProductForm
        product={editing === "nuevo" ? null : editing}
        open={editing !== null}
        onClose={() => {
          setEditing(null);
          if (params.get("nuevo")) setParams({});
        }}
        onSave={(product, isNew) => {
          if (isNew) dispatch(productAdded(product));
          else dispatch(productUpdated({ id: product.id, changes: product }));
          toast(isNew ? `${product.name} creado` : "Cambios guardados");
          setEditing(null);
        }}
        onDelete={(product) => {
          dispatch(productRemoved(product.id));
          toast(`${product.name} eliminado`);
          setEditing(null);
        }}
      />

      <RestockDialog
        product={restocking}
        onClose={() => setRestocking(null)}
        onSave={(delta) => {
          if (restocking) {
            dispatch(stockAdjusted({ id: restocking.id, delta }));
            toast(`${restocking.name}: ${delta > 0 ? "+" : ""}${formatQuantity(delta, restocking.unit)}`);
          }
          setRestocking(null);
        }}
      />

      <Modal
        title="Pedido sugerido"
        open={ordering}
        onClose={() => setOrdering(false)}
        footer={
          <>
            <button
              type="button"
              className="btn"
              onClick={() => {
                navigator.clipboard?.writeText(orderText);
                toast("Pedido copiado");
              }}
            >
              Copiar
            </button>
            <a
              className="btn btn--primary"
              href={`https://wa.me/?text=${encodeURIComponent(orderText)}`}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="whatsapp" size={18} /> Enviar al proveedor
            </a>
          </>
        }
      >
        <p className="muted">Para dejar cada producto en el doble de su mínimo.</p>
        <ul className="order-list">
          {lowStock.map((p) => (
            <li key={p.id}>
              <span>{p.name}</span>
              <strong>{formatQuantity(suggestedOrder(p), p.unit)}</strong>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}

function emptyProduct(): Product {
  return {
    id: newId("prod"),
    name: "",
    category: "Granos y despensa",
    price: 0,
    cost: 0,
    stock: 0,
    minStock: 5,
    unit: "und",
    favorite: false,
  };
}

function ProductForm({
  product,
  open,
  onClose,
  onSave,
  onDelete,
}: {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  onSave: (p: Product, isNew: boolean) => void;
  onDelete: (p: Product) => void;
}) {
  return (
    <Modal title={product ? "Editar producto" : "Nuevo producto"} open={open} onClose={onClose}>
      {/* La key reinicia el formulario cada vez que se abre con otro producto. */}
      {open && <ProductFormBody key={product?.id ?? "nuevo"} product={product} onSave={onSave} onDelete={onDelete} onCancel={onClose} />}
    </Modal>
  );
}

function ProductFormBody({
  product,
  onSave,
  onDelete,
  onCancel,
}: {
  product: Product | null;
  onSave: (p: Product, isNew: boolean) => void;
  onDelete: (p: Product) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Product>(product ?? emptyProduct());
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Product>(key: K, value: Product[K]) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.name.trim().length < 2) return setError("Escribe el nombre del producto.");
        if (draft.price <= 0) return setError("El precio de venta debe ser mayor que cero.");
        if (draft.cost > draft.price) return setError("El costo es mayor que el precio: venderías a pérdida.");
        onSave({ ...draft, name: draft.name.trim(), barcode: draft.barcode?.trim() || undefined }, !product);
      }}
    >
      <div className="field">
        <label htmlFor="p-nombre">Nombre</label>
        <input id="p-nombre" value={draft.name} onChange={(e) => set("name", e.target.value)} autoFocus placeholder="Ej.: Arroz 500 g" />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="p-cat">Categoría</label>
          <select id="p-cat" value={draft.category} onChange={(e) => set("category", e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="p-unidad">Se vende por</label>
          <select id="p-unidad" value={draft.unit} onChange={(e) => set("unit", e.target.value as Unit)}>
            <option value="und">Unidad</option>
            <option value="kg">Kilo</option>
          </select>
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="p-precio">Precio de venta{draft.unit === "kg" ? " por kilo" : ""}</label>
          <MoneyInput id="p-precio" value={draft.price} onChange={(v) => set("price", v)} />
        </div>
        <div className="field">
          <label htmlFor="p-costo">Costo</label>
          <MoneyInput id="p-costo" value={draft.cost} onChange={(v) => set("cost", v)} />
        </div>
      </div>
      {draft.price > 0 && <p className="muted small">Margen: {marginPct(draft)} %, ganas {formatCOP(draft.price - draft.cost)} por {draft.unit === "kg" ? "kilo" : "unidad"}.</p>}
      <div className="field-row">
        <div className="field">
          <label htmlFor="p-stock">Existencias</label>
          <input id="p-stock" inputMode="decimal" value={draft.stock} onChange={(e) => set("stock", Number(e.target.value.replace(",", ".")) || 0)} />
        </div>
        <div className="field">
          <label htmlFor="p-min">Mínimo para pedir</label>
          <input id="p-min" inputMode="decimal" value={draft.minStock} onChange={(e) => set("minStock", Number(e.target.value.replace(",", ".")) || 0)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="p-codigo">Código de barras (opcional)</label>
        <input id="p-codigo" inputMode="numeric" value={draft.barcode ?? ""} onChange={(e) => set("barcode", e.target.value)} />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        {product && (
          <button type="button" className="btn btn--danger" onClick={() => onDelete(product)}>
            <Icon name="basura" size={18} /> Eliminar
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primary">
          {product ? "Guardar cambios" : "Crear producto"}
        </button>
      </div>
    </form>
  );
}

function RestockDialog({ product, onClose, onSave }: { product: Product | null; onClose: () => void; onSave: (delta: number) => void }) {
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<"entrada" | "salida">("entrada");
  const qty = Number(value.replace(",", ".")) || 0;
  const close = () => {
    setValue("");
    setMode("entrada");
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
          disabled={qty <= 0}
          onClick={() => {
            onSave(mode === "entrada" ? qty : -qty);
            setValue("");
          }}
        >
          {mode === "entrada" ? "Registrar entrada" : "Registrar salida"}
        </button>
      }
    >
      {product && (
        <>
          <p className="muted">Hay {formatQuantity(product.stock, product.unit)} en existencia.</p>
          <div className="segmented" role="group" aria-label="Tipo de movimiento">
            <button type="button" aria-pressed={mode === "entrada"} onClick={() => setMode("entrada")}>
              Llegó mercancía
            </button>
            <button type="button" aria-pressed={mode === "salida"} onClick={() => setMode("salida")}>
              Pérdida o daño
            </button>
          </div>
          <div className="field">
            <label htmlFor="cantidad-mov">Cantidad ({product.unit === "kg" ? "kilos" : "unidades"})</label>
            <input id="cantidad-mov" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          </div>
          {qty > 0 && (
            <p className="muted small">
              Quedarán {formatQuantity(Math.round((product.stock + (mode === "entrada" ? qty : -qty)) * 1000) / 1000, product.unit)}.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}

