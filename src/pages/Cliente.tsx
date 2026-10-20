import { useState } from "react";
import { Link, useParams } from "react-router";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { useToast } from "../components/toast-context";
import { EmptyState, Money, MoneyInput, Stat } from "../components/ui";
import { customerUpdated, paymentRecorded } from "../features/customers/customersSlice";
import { selectBalances, selectCustomerById, selectCustomerLedger } from "../features/customers/selectors";
import { formatDateTime } from "../lib/dates";
import { newId } from "../lib/id";
import { formatCOP } from "../lib/money";
import { reminderMessage, whatsAppLink } from "../lib/whatsapp";
import type { LedgerEntry, PaymentMethod } from "../types";
import { CustomerDialog } from "./Fiado";

const KIND_LABEL: Record<LedgerEntry["kind"], string> = { cargo: "Fiado", abono: "Abono", anulacion: "Anulación" };

export function Cliente() {
  const { id = "" } = useParams();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const customer = useAppSelector((s) => selectCustomerById(s, id));
  const ledger = useAppSelector((s) => selectCustomerLedger(s, id));
  const balance = useAppSelector(selectBalances)[id] ?? 0;
  const storeName = useAppSelector((s) => s.settings.storeName);
  const shiftId = useAppSelector((s) => s.cash.currentShiftId);
  const sales = useAppSelector((s) => s.sales.list);
  const [paying, setPaying] = useState(false);
  const [editing, setEditing] = useState(false);

  if (!customer) {
    return (
      <div className="page">
        <EmptyState title="Este cliente no existe">
          <Link to="/fiado" className="btn">
            Volver al fiado
          </Link>
        </EmptyState>
      </div>
    );
  }

  const link = balance > 0 ? whatsAppLink(customer.phone, reminderMessage(customer.name, balance, storeName)) : null;
  const available = Math.max(0, customer.creditLimit - balance);

  return (
    <div className="page">
      <Link to="/fiado" className="back">
        <Icon name="atras" size={18} /> Fiado
      </Link>
      <header className="page-head">
        <div>
          <h1>{customer.name}</h1>
          <p className="muted">{customer.phone || "Sin celular"}</p>
        </div>
        <div className="page-head__actions">
          <button type="button" className="btn" onClick={() => setEditing(true)}>
            <Icon name="editar" size={18} /> Editar
          </button>
          {link && (
            <a className="btn" href={link} target="_blank" rel="noreferrer">
              <Icon name="whatsapp" size={18} /> Recordar
            </a>
          )}
          <button type="button" className="btn btn--primary" onClick={() => setPaying(true)} disabled={balance <= 0}>
            Registrar abono
          </button>
        </div>
      </header>

      <div className="stats">
        <Stat label="Debe" value={<Money value={balance} />} tone={balance > customer.creditLimit ? "bad" : undefined} />
        <Stat label="Cupo disponible" value={<Money value={available} />} note={`de ${formatCOP(customer.creditLimit)}`} />
      </div>

      <h2 className="section-title">Movimientos</h2>
      {ledger.length === 0 ? (
        <EmptyState title="Sin movimientos todavía" />
      ) : (
        <ul className="movements">
          {ledger.map((e) => {
            const sale = e.saleId ? sales.find((s) => s.id === e.saleId) : undefined;
            return (
              <li key={e.id} className={`movement movement--${e.kind}`}>
                <div>
                  <p className="movement__title">
                    {KIND_LABEL[e.kind]}
                    {sale && e.kind === "cargo" ? `, venta #${sale.number}` : ""}
                    {e.method ? ` en ${e.method}` : ""}
                  </p>
                  <p className="muted small">
                    {formatDateTime(e.createdAt)}
                    {sale && e.kind === "cargo" ? `: ${sale.items.map((i) => i.name).join(", ")}` : ""}
                    {e.note ? `: ${e.note}` : ""}
                  </p>
                </div>
                <span className="movement__amount">
                  {e.kind === "cargo" ? "+" : "−"}
                  {formatCOP(e.amount)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <PaymentDialog
        open={paying}
        balance={balance}
        onClose={() => setPaying(false)}
        onSave={(amount, method) => {
          dispatch(
            paymentRecorded({
              id: newId("abono"),
              customerId: customer.id,
              kind: "abono",
              amount,
              method,
              createdAt: new Date().toISOString(),
              shiftId: shiftId ?? undefined,
            }),
          );
          toast(`Abono de ${formatCOP(amount)} registrado`);
          setPaying(false);
        }}
      />

      <CustomerDialog
        open={editing}
        initial={customer}
        onClose={() => setEditing(false)}
        onSave={(name, phone, creditLimit) => {
          dispatch(customerUpdated({ id: customer.id, changes: { name, phone, creditLimit } }));
          toast("Cliente actualizado");
          setEditing(false);
        }}
      />
    </div>
  );
}

function PaymentDialog({
  open,
  balance,
  onClose,
  onSave,
}: {
  open: boolean;
  balance: number;
  onClose: () => void;
  onSave: (amount: number, method: Exclude<PaymentMethod, "fiado">) => void;
}) {
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<Exclude<PaymentMethod, "fiado">>("efectivo");
  const valid = amount > 0 && amount <= balance;

  return (
    <Modal
      title="Registrar abono"
      open={open}
      onClose={() => {
        setAmount(0);
        onClose();
      }}
      footer={
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={!valid}
          onClick={() => {
            onSave(amount, method);
            setAmount(0);
          }}
        >
          Registrar {amount > 0 ? formatCOP(amount) : "abono"}
        </button>
      }
    >
      <p className="muted">Debe {formatCOP(balance)}.</p>
      <div className="field">
        <label htmlFor="abono">Valor</label>
        <MoneyInput id="abono" value={amount} onChange={setAmount} autoFocus />
        <div className="cash__quick">
          <button type="button" className="chip" onClick={() => setAmount(balance)}>
            Todo ({formatCOP(balance)})
          </button>
          {[10000, 20000, 50000]
            .filter((v) => v < balance)
            .map((v) => (
              <button key={v} type="button" className="chip" onClick={() => setAmount(v)}>
                {formatCOP(v)}
              </button>
            ))}
        </div>
        {amount > balance && <p className="form-error">El abono es mayor que la deuda.</p>}
      </div>
      <div className="segmented" role="group" aria-label="Medio de pago">
        {(["efectivo", "nequi", "daviplata"] as const).map((m) => (
          <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)}>
            {m[0].toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>
    </Modal>
  );
}
