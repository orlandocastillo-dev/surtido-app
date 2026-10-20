import { useMemo, useState } from "react";
import { useAppSelector } from "../app/hooks";
import { Icon } from "../components/Icon";
import { EmptyState, Money, PageHeader, Stat } from "../components/ui";
import { selectUsers } from "../features/auth/selectors";
import { selectLowStock } from "../features/products/selectors";
import { byMethod, lastDaysSummary, salesInRange, selectValidSales, topProducts } from "../features/sales/selectors";
import { toCSV, downloadFile } from "../lib/csv";
import { dayKey, formatDateTime, weekdayLabel } from "../lib/dates";
import { formatCOP, formatQuantity, lineAmount } from "../lib/money";
import type { PaymentMethod } from "../types";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  nequi: "Nequi",
  daviplata: "Daviplata",
  tarjeta: "Tarjeta",
  fiado: "Fiado",
};

export function Reportes() {
  const sales = useAppSelector(selectValidSales);
  const lowStock = useAppSelector(selectLowStock);
  const users = useAppSelector(selectUsers);
  const [range, setRange] = useState<1 | 7>(7);
  // Se fija al abrir la pantalla: los cálculos no cambian solos mientras se miran.
  const [now] = useState(() => new Date());

  const data = useMemo(() => {
    const inRange = salesInRange(sales, range, now);
    const total = inRange.reduce((a, s) => a + s.total, 0);
    const profit = inRange.reduce((a, s) => a + s.items.reduce((p, i) => p + Math.round((i.price - i.cost) * i.quantity), 0), 0);
    const days = lastDaysSummary(sales, 7, now);
    const prevWeek = salesInRange(sales, 14, now)
      .filter((s) => !days.some((d) => d.day === dayKey(s.createdAt)))
      .reduce((a, s) => a + s.total, 0);
    return {
      inRange,
      total,
      profit,
      count: inRange.length,
      days,
      methods: byMethod(inRange),
      top: topProducts(inRange, 6),
      prevWeek,
    };
  }, [sales, range, now]);

  const maxDay = Math.max(1, ...data.days.map((d) => d.total));
  const today = dayKey(now);

  const exportCSV = () => {
    const rows: (string | number)[][] = [["Venta", "Fecha", "Forma de pago", "Producto", "Cantidad", "Precio", "Subtotal", "Ganancia"]];
    for (const s of data.inRange) {
      for (const i of s.items) {
        rows.push([s.number, formatDateTime(s.createdAt), METHOD_LABEL[s.method], i.name, i.quantity, i.price, lineAmount(i.price, i.quantity, i.unit), Math.round((i.price - i.cost) * i.quantity)]);
      }
    }
    downloadFile(`ventas-${range === 1 ? "hoy" : "7-dias"}-${today}.csv`, toCSV(rows));
  };

  return (
    <div className="page">
      <PageHeader
        title="Reportes"
        actions={
          <>
            <div className="segmented" role="group" aria-label="Periodo">
              <button type="button" aria-pressed={range === 1} onClick={() => setRange(1)}>
                Hoy
              </button>
              <button type="button" aria-pressed={range === 7} onClick={() => setRange(7)}>
                7 días
              </button>
            </div>
            <button type="button" className="btn" onClick={exportCSV} disabled={data.count === 0}>
              <Icon name="descargar" size={18} /> Excel
            </button>
          </>
        }
      />

      <div className="stats">
        <Stat label="Vendido" value={<Money value={data.total} />} note={`${data.count} ventas`} />
        <Stat
          label="Ganancia"
          value={<Money value={data.profit} />}
          note={data.total ? `${Math.round((data.profit / data.total) * 100)} % de lo vendido` : undefined}
          tone="good"
        />
        <Stat label="Venta promedio" value={<Money value={data.count ? Math.round(data.total / data.count) : 0} />} />
      </div>

      <section className="card">
        <div className="card__head">
          <h2 className="section-title">Ventas de los últimos 7 días</h2>
          {data.prevWeek > 0 && (
            <p className="muted small">
              {(() => {
                const week = data.days.reduce((a, d) => a + d.total, 0);
                const pct = Math.round(((week - data.prevWeek) / data.prevWeek) * 100);
                return `${pct >= 0 ? "+" : ""}${pct} % frente a la semana anterior`;
              })()}
            </p>
          )}
        </div>
        <div className="chart" role="img" aria-label={data.days.map((d) => `${weekdayLabel(d.day)}: ${formatCOP(d.total)}`).join(", ")}>
          {data.days.map((d) => (
            <div key={d.day} className={`chart__col ${d.day === today ? "is-today" : ""}`} title={`${formatCOP(d.total)}, ganancia ${formatCOP(d.profit)}`}>
              <span className="chart__value">{d.total >= 1000 ? `${Math.round(d.total / 1000)}k` : d.total}</span>
              <span className="chart__bar" style={{ height: `${(d.total / maxDay) * 100}%` }} />
              <span className="chart__label">{d.day === today ? "hoy" : weekdayLabel(d.day)}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <h2 className="section-title">Cómo te pagaron</h2>
          <ul className="bars">
            {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
              <li key={m}>
                <span>{METHOD_LABEL[m]}</span>
                <span className="bars__track">
                  <span style={{ width: `${data.total ? (data.methods[m] / data.total) * 100 : 0}%` }} />
                </span>
                <Money value={data.methods[m]} />
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2 className="section-title">Lo que más se vende</h2>
          {data.top.length === 0 ? (
            <EmptyState title="Sin ventas en este periodo" />
          ) : (
            <ol className="top">
              {data.top.map((t) => (
                <li key={t.productId}>
                  <span>{t.name}</span>
                  <span className="muted small">{formatQuantity(Math.round(t.quantity * 100) / 100, Number.isInteger(t.quantity) ? "und" : "kg")}</span>
                  <Money value={t.revenue} />
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {users.length > 1 && (
        <section className="card">
          <h2 className="section-title">Por vendedor</h2>
          <ul className="bars">
            {users.map((u) => {
              const sold = data.inRange.filter((s) => s.sellerId === u.id).reduce((a, s) => a + s.total, 0);
              return (
                <li key={u.id}>
                  <span>{u.name.split(" ")[0]}</span>
                  <span className="bars__track">
                    <span style={{ width: `${data.total ? (sold / data.total) * 100 : 0}%` }} />
                  </span>
                  <Money value={sold} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {lowStock.length > 0 && (
        <section className="card">
          <h2 className="section-title">Por pedir</h2>
          <p className="muted">{lowStock.map((p) => p.name).join(", ")}.</p>
        </section>
      )}
    </div>
  );
}
