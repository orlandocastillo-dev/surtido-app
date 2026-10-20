import type { ReactNode } from "react";
import { formatCOP } from "../lib/money";
import { Icon } from "./Icon";

export function Money({ value, className }: { value: number; className?: string }) {
  return <span className={`money ${className ?? ""}`}>{formatCOP(value)}</span>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </header>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {children}
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <div className="stepper" role="group" aria-label={`Cantidad de ${label}`}>
      <button type="button" onClick={() => onChange(value - 1)} aria-label={`Quitar una unidad de ${label}`}>
        <Icon name="menos" size={16} />
      </button>
      <span aria-live="polite">{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} aria-label={`Agregar una unidad de ${label}`}>
        <Icon name="mas" size={16} />
      </button>
    </div>
  );
}

export function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: "warn" | "bad" | "good" }) {
  return (
    <div className={`stat ${tone ? `stat--${tone}` : ""}`}>
      <p className="stat__label">{label}</p>
      <p className="stat__value">{value}</p>
      {note && <p className="stat__note">{note}</p>}
    </div>
  );
}

export function MoneyInput({
  id,
  value,
  onChange,
  autoFocus,
}: {
  id: string;
  value: number;
  onChange: (value: number) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="money-input">
      <span aria-hidden="true">$</span>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        value={value ? value.toLocaleString("es-CO") : ""}
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")) || 0)}
        placeholder="0"
      />
    </div>
  );
}
