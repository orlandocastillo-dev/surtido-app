import { useState } from "react";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { selectCan } from "../features/auth/selectors";
import { Modal } from "../components/Modal";
import { useToast } from "../components/toast-context";
import { EmptyState, Money, MoneyInput, PageHeader, Stat } from "../components/ui";
import { shiftClosed, shiftOpened } from "../features/cash/cashSlice";
import {
  selectClosedShifts,
  selectCurrentShift,
  selectCurrentShiftSales,
  selectCurrentShiftSummary,
} from "../features/cash/selectors";
import { voidSale } from "../features/sales/checkout";
import { formatDateTime, formatTime } from "../lib/dates";
import { newId } from "../lib/id";
import { formatCOP } from "../lib/money";
import type { PaymentMethod, Sale } from "../types";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  nequi: "Nequi",
  daviplata: "Daviplata",
  tarjeta: "Tarjeta",
  fiado: "Fiado",
};

export function Caja() {
  const dispatch = useAppDispatch();
  const toast = useToast();
  const shift = useAppSelector(selectCurrentShift);
  const summary = useAppSelector(selectCurrentShiftSummary);
  const sales = useAppSelector(selectCurrentShiftSales);
  const history = useAppSelector(selectClosedShifts);
  const canVoid = useAppSelector(selectCan)("anularVentas");
  const [opening, setOpening] = useState(100000);
  const [counted, setCounted] = useState(0);
  const [closing, setClosing] = useState(false);
  const [voiding, setVoiding] = useState<Sale | null>(null);

  if (!shift || !summary) {
    return (
      <div className="page">
        <PageHeader title="Caja" subtitle="Abre la caja al empezar el día con el efectivo que hay en el cajón." />
        <form
          className="card form open-shift"
          onSubmit={(e) => {
            e.preventDefault();
            dispatch(shiftOpened({ id: newId("turno"), openingCash: opening, openedAt: new Date().toISOString() }));
            toast("Caja abierta");
          }}
        >
          <div className="field">
            <label htmlFor="base">Base en efectivo</label>
            <MoneyInput id="base" value={opening} onChange={setOpening} />
          </div>
          <button type="submit" className="btn btn--primary btn--lg">
            Abrir caja
          </button>
        </form>
        <ShiftHistory shifts={history} />
      </div>
    );
  }

  const difference = counted - summary.expectedCash;

  return (
    <div className="page">
      <PageHeader
        title="Caja abierta"
        subtitle={`Desde las ${formatTime(shift.openedAt)}, ${summary.salesCount} ventas`}
        actions={
          <button type="button" className="btn btn--primary" onClick={() => setClosing(true)}>
            Cerrar caja
          </button>
        }
      />

      <div className="stats">
        <Stat label="Debe haber en el cajón" value={<Money value={summary.expectedCash} />} note="base + ventas y abonos en efectivo" />
        <Stat label="Vendido en el turno" value={<Money value={summary.totalSales} />} />
      </div>

      <section className="card">
        <h2 className="section-title">Cómo entró la plata</h2>
        <dl className="breakdown">
          <div>
            <dt>Base</dt>
            <dd>
              <Money value={summary.openingCash} />
            </dd>
          </div>
          {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
            <div key={m}>
              <dt>Ventas en {METHOD_LABEL[m].toLowerCase()}</dt>
              <dd>
                <Money value={summary.byMethod[m]} />
              </dd>
            </div>
          ))}
          <div>
            <dt>Abonos de fiado en efectivo</dt>
            <dd>
              <Money value={summary.cashPayments} />
            </dd>
          </div>
        </dl>
      </section>

      <h2 className="section-title">Ventas del turno</h2>
      {sales.length === 0 ? (
        <EmptyState title="Todavía no hay ventas en este turno" />
      ) : (
        <ul className="sales-list">
          {sales.map((s) => (
            <li key={s.id} className={s.voided ? "is-voided" : ""}>
              <div>
                <p className="sales-list__title">
                  #{s.number} <span className="muted">{formatTime(s.createdAt)}</span>
                  {s.voided && <span className="tag">Anulada</span>}
                </p>
                <p className="muted small">
                  {METHOD_LABEL[s.method]}: {s.items.map((i) => i.name).join(", ")}
                </p>
              </div>
              <Money value={s.total} />
              {!s.voided && canVoid && (
                <button type="button" className="link small" onClick={() => setVoiding(s)}>
                  Anular
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        title="Cerrar caja"
        open={closing}
        onClose={() => setClosing(false)}
        footer={
          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={() => {
              dispatch(shiftClosed({ countedCash: counted, expectedCash: summary.expectedCash, closedAt: new Date().toISOString() }));
              toast(difference === 0 ? "Caja cerrada y cuadrada" : `Caja cerrada con diferencia de ${formatCOP(difference)}`);
              setClosing(false);
              setCounted(0);
            }}
          >
            Cerrar caja
          </button>
        }
      >
        <p>
          Debería haber <strong>{formatCOP(summary.expectedCash)}</strong> en el cajón.
        </p>
        <div className="field">
          <label htmlFor="contado">¿Cuánto contaste?</label>
          <MoneyInput id="contado" value={counted} onChange={setCounted} autoFocus />
        </div>
        {counted > 0 && (
          <p className={`diff ${difference === 0 ? "is-ok" : difference > 0 ? "is-over" : "is-short"}`}>
            {difference === 0
              ? "Cuadra exacto."
              : difference > 0
                ? `Sobran ${formatCOP(difference)}.`
                : `Faltan ${formatCOP(-difference)}.`}
          </p>
        )}
      </Modal>

      <Modal
        title={voiding ? `Anular venta #${voiding.number}` : ""}
        open={voiding !== null}
        onClose={() => setVoiding(null)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setVoiding(null)}>
              No anular
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                if (voiding && dispatch(voidSale(voiding.id))) toast(`Venta #${voiding.number} anulada`);
                setVoiding(null);
              }}
            >
              Anular venta
            </button>
          </>
        }
      >
        {voiding && (
          <p>
            Se devuelven los productos al inventario
            {voiding.method === "fiado" ? " y se descuenta de la deuda del cliente" : ""}. Total {formatCOP(voiding.total)}.
          </p>
        )}
      </Modal>

      <ShiftHistory shifts={history} />
    </div>
  );
}

function ShiftHistory({ shifts }: { shifts: ReturnType<typeof selectClosedShifts> }) {
  if (shifts.length === 0) return null;
  return (
    <>
      <h2 className="section-title">Cierres anteriores</h2>
      <ul className="shifts">
        {shifts.slice(0, 10).map((s) => {
          const diff = (s.countedCash ?? 0) - (s.expectedCash ?? 0);
          return (
            <li key={s.id}>
              <span>{formatDateTime(s.closedAt!)}</span>
              <Money value={s.countedCash ?? 0} />
              <span className={`diff ${diff === 0 ? "is-ok" : diff > 0 ? "is-over" : "is-short"}`}>
                {diff === 0 ? "Cuadró" : `${diff > 0 ? "+" : "−"}${formatCOP(Math.abs(diff))}`}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
