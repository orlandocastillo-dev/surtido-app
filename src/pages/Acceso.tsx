import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { selectCurrentUser, selectHasAccount } from "../features/auth/selectors";
import { DEMO_LOGIN, enterDemo, login, MIN_PASSWORD, registerStore, type RegisterInput } from "../features/auth/thunks";

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <main className="auth">
      <section className="auth__card">
        <div className="auth__brand">
          <svg className="brand__mark" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M5 12h22l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" />
            <path d="M11 12V9a5 5 0 0 1 10 0v3" fill="none" />
          </svg>
          surtido
        </div>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
        {children}
        <p className="auth__footer">{footer}</p>
      </section>
      <p className="auth__note">Tus datos se guardan en este dispositivo y funcionan sin internet.</p>
    </main>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  ...input
}: { id: string; label: string; error?: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={id} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} {...input} />
      {error ? (
        <p className="form-error" id={`${id}-error`}>
          {error}
        </p>
      ) : (
        hint && (
          <p className="muted small" id={`${id}-hint`}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}

/** Atajo para quien llega a ver la demo: entra a la tienda de ejemplo sin crear cuenta. */
function DemoButton({ onError, top = false }: { onError: (message: string) => void; top?: boolean }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  return (
    <div className={`auth__demo ${top ? "auth__demo--top" : ""}`}>
      <span>{top ? "o crea la tuya" : "o"}</span>
      <button
        type="button"
        className="btn btn--block btn--lg"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const result = await dispatch(enterDemo());
          setBusy(false);
          if (result.ok) navigate("/", { replace: true });
          else onError(result.message);
        }}
      >
        {busy ? "Abriendo…" : "Probar con la tienda de ejemplo"}
      </button>
    </div>
  );
}

export function Entrar() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector(selectCurrentUser);
  const hasAccount = useAppSelector(selectHasAccount);
  const storeName = useAppSelector((s) => s.settings.storeName);
  const hasDemo = useAppSelector((s) => s.auth.users.some((u) => u.login === DEMO_LOGIN));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (user) return <Navigate to="/" replace />;
  if (!hasAccount) return <Navigate to="/registro" replace />;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    const result = await dispatch(login(String(data.get("usuario")), String(data.get("clave"))));
    setBusy(false);
    if (result.ok) navigate("/", { replace: true });
    else setError(result.message);
  };

  return (
    <AuthShell
      title="Entrar"
      subtitle={`Tienda ${storeName}`}
      footer={
        <>
          ¿Olvidaste la contraseña? Pídele al dueño de la tienda que te cree una nueva desde Ajustes.
        </>
      }
    >
      <form className="form" onSubmit={submit} noValidate>
        <Field id="usuario" label="Correo o celular" autoComplete="username" inputMode="email" autoFocus required />
        <Field id="clave" label="Contraseña" type={showPassword ? "text" : "password"} autoComplete="current-password" required />
        <label className="toggle small">
          <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
          Mostrar contraseña
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={busy}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
      {hasDemo && <DemoButton onError={setError} />}
    </AuthShell>
  );
}

export function Registro() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const hasAccount = useAppSelector(selectHasAccount);
  const hasData = useAppSelector((s) => s.products.ids.length > 0 || s.sales.list.length > 0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [start, setStart] = useState<RegisterInput["start"]>(hasData ? "conservar" : "ejemplo");

  if (hasAccount) return <Navigate to="/entrar" replace />;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    if (data.get("clave") !== data.get("clave2")) {
      setErrors({ clave2: "Las contraseñas no coinciden." });
      return;
    }
    setBusy(true);
    const result = await dispatch(
      registerStore({
        storeName: String(data.get("tienda")),
        name: String(data.get("nombre")),
        login: String(data.get("usuario")),
        password: String(data.get("clave")),
        start,
      }),
    );
    setBusy(false);
    if (result.ok) navigate("/", { replace: true });
    else setErrors({ [result.field ?? "general"]: result.message });
  };

  const options: { id: RegisterInput["start"]; title: string; text: string }[] = [
    ...(hasData ? [{ id: "conservar" as const, title: "Conservar mis datos", text: "Sigue con los productos y ventas que ya tienes en este dispositivo." }] : []),
    { id: "ejemplo", title: "Tienda de ejemplo", text: "32 productos, clientes y una semana de ventas para explorar." },
    { id: "vacio", title: "Empezar en blanco", text: "Sin productos ni ventas. Para usarla de verdad." },
  ];

  return (
    <AuthShell
      title="Crea tu tienda"
      subtitle="Serás el dueño: después puedes agregar vendedores con su propio usuario."
      footer={
        <>
          Gratis, sin tarjeta. <Link to="/entrar">Ya tengo cuenta</Link>
        </>
      }
    >
      <DemoButton top onError={(message) => setErrors({ general: message })} />
      <form className="form" onSubmit={submit} noValidate>
        <Field id="tienda" label="Nombre de la tienda" placeholder="Tienda Doña Rosa" error={errors.storeName} autoFocus />
        <Field id="nombre" label="Tu nombre" autoComplete="name" error={errors.name} />
        <Field id="usuario" label="Correo o celular" autoComplete="username" inputMode="email" error={errors.login} hint="Con esto vas a entrar." />
        <div className="field-row">
          <Field id="clave" label="Contraseña" type="password" autoComplete="new-password" error={errors.password} hint={`Mínimo ${MIN_PASSWORD} caracteres.`} />
          <Field id="clave2" label="Repítela" type="password" autoComplete="new-password" error={errors.clave2} />
        </div>

        <fieldset className="field start-options">
          <legend>¿Cómo quieres empezar?</legend>
          {options.map((o) => (
            <label key={o.id} className={`option ${start === o.id ? "is-active" : ""}`}>
              <input type="radio" name="inicio" value={o.id} checked={start === o.id} onChange={() => setStart(o.id)} />
              <span>
                <strong>{o.title}</strong>
                <span className="muted small">{o.text}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {errors.general && (
          <p className="form-error" role="alert">
            {errors.general}
          </p>
        )}
        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={busy}>
          {busy ? "Creando…" : "Crear mi tienda"}
        </button>
      </form>
    </AuthShell>
  );
}
