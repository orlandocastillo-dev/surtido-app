import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { useToast } from "../components/toast-context";
import { EmptyState, Money, MoneyInput, PageHeader, Stat } from "../components/ui";
import { customerAdded } from "../features/customers/customersSlice";
import { selectCustomersWithBalance, selectTotalReceivable } from "../features/customers/selectors";
import { daysBetween } from "../lib/dates";
import { newId } from "../lib/id";
import { formatCOP } from "../lib/money";
import { toWhatsAppNumber } from "../lib/whatsapp";

export function Fiado() {
  const dispatch = useAppDispatch();
  const toast = useToast();
  const customers = useAppSelector(selectCustomersWithBalance);
  const receivable = useAppSelector(selectTotalReceivable);
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(params.get("nuevo") === "1");

  const debtors = customers.filter((c) => c.balance > 0);
  const overdue = debtors.filter((c) => c.lastChargeAt && daysBetween(c.lastPaymentAt ?? c.lastChargeAt) > 15);

  return (
    <div className="page">
      <PageHeader
        title="Fiado"
        subtitle="El cuaderno de lo que te deben, con abonos y recordatorios."
        actions={
          <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>
            <Icon name="mas" size={18} /> Nuevo cliente
          </button>
        }
      />

      <div className="stats">
        <Stat label="Por cobrar" value={<Money value={receivable} />} note={`${debtors.length} clientes con saldo`} />
        <Stat
          label="Sin abonar hace 15 días o más"
          value={overdue.length}
          tone={overdue.length ? "warn" : "good"}
          note={overdue.length ? overdue.map((c) => c.name.split(" ")[0]).join(", ") : "todos al día"}
        />
      </div>

      {customers.length === 0 ? (
        <EmptyState title="Aún no tienes clientes de fiado" />
      ) : (
        <ul className="ledger-list">
          {customers.map((c) => {
            const usage = c.creditLimit ? Math.min(100, (c.balance / c.creditLimit) * 100) : 0;
            return (
              <li key={c.id}>
                <Link to={`/fiado/${c.id}`} className="debtor">
                  <span className="debtor__avatar" aria-hidden="true">
                    {c.name
                      .split(" ")
                      .slice(0, 2)
                      .map((w) => w[0])
                      .join("")}
                  </span>
                  <span className="debtor__main">
                    <span className="debtor__name">{c.name}</span>
                    <span className="muted small">
                      {c.lastPaymentAt
                        ? `Último abono hace ${daysBetween(c.lastPaymentAt)} días`
                        : c.balance > 0
                          ? "Sin abonos todavía"
                          : "Sin deuda"}
                    </span>
                  </span>
                  <span className="debtor__balance">
                    <Money value={c.balance} className={c.balance > 0 ? "" : "muted"} />
                    <span className={`meter ${usage >= 90 ? "is-bad" : usage >= 70 ? "is-warn" : ""}`} aria-hidden="true">
                      <span style={{ width: `${usage}%` }} />
                    </span>
                    <span className="muted small">de {formatCOP(c.creditLimit)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <CustomerDialog
        open={adding}
        onClose={() => {
          setAdding(false);
          if (params.get("nuevo")) setParams({});
        }}
        onSave={(name, phone, creditLimit) => {
          dispatch(customerAdded({ id: newId("cli"), name, phone, creditLimit, createdAt: new Date().toISOString() }));
          toast(`${name} agregado al cuaderno`);
          setAdding(false);
        }}
      />
    </div>
  );
}

export function CustomerDialog({
  open,
  onClose,
  onSave,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, phone: string, creditLimit: number) => void;
  initial?: { name: string; phone: string; creditLimit: number };
}) {
  return (
    <Modal title={initial ? "Editar cliente" : "Nuevo cliente"} open={open} onClose={onClose}>
      {open && <CustomerForm initial={initial} onSave={onSave} onCancel={onClose} />}
    </Modal>
  );
}

function CustomerForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: { name: string; phone: string; creditLimit: number };
  onSave: (name: string, phone: string, creditLimit: number) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [limit, setLimit] = useState(initial?.creditLimit ?? 100000);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim().length < 3) return setError("Escribe el nombre del cliente.");
        if (phone && !toWhatsAppNumber(phone)) return setError("El celular debe tener 10 dígitos, por ejemplo 300 555 0141.");
        onSave(name.trim(), phone.trim(), limit);
      }}
    >
      <div className="field">
        <label htmlFor="c-nombre">Nombre</label>
        <input id="c-nombre" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label htmlFor="c-cel">Celular (para recordatorios por WhatsApp)</label>
        <input id="c-cel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="300 555 0141" />
      </div>
      <div className="field">
        <label htmlFor="c-cupo">Cupo máximo de fiado</label>
        <MoneyInput id="c-cupo" value={limit} onChange={setLimit} />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <span className="spacer" />
        <button type="button" className="btn" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primary">
          {initial ? "Guardar" : "Agregar cliente"}
        </button>
      </div>
    </form>
  );
}
