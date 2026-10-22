import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { nubeDisponible } from "../nube/cliente";
import { CLAVE_MINIMA_NUBE, cambiarMiClave, correoParaEntrar, crearCuentaDueno, entrar as entrarNube, recuperarClave, reenviarConfirmacion, verificarCodigo } from "../nube/cuenta";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { selectCurrentUser, selectHasAccount } from "../features/auth/selectors";
import { Icon } from "../components/Icon";
import { PasswordInput } from "../components/PasswordInput";
import { DEMO_LOGIN, enterDemo, login, MIN_PASSWORD, registerStore, type RegisterInput } from "../features/auth/thunks";

const NOTA_LOCAL = "Tus datos se guardan en este dispositivo y funcionan sin internet.";
const NOTA_NUBE = "Tu tienda queda guardada en la nube y en este equipo: sigue funcionando sin internet.";

function AuthShell({ title, subtitle, children, footer, note }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode; note?: string }) {
  return (
    <main className="auth">
      {/* La app vive en /app/ y la presentación en la raíz; en el archivo portátil no hay a dónde volver. */}
      {location.protocol !== "file:" && (
        <a className="auth__back" href="../">
          <Icon name="atras" size={18} /> Volver a la página de Surtido
        </a>
      )}
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
      <p className="auth__note">{note ?? (nubeDisponible() ? NOTA_NUBE : NOTA_LOCAL)}</p>
      {location.protocol !== "file:" && (
        <p className="auth__legal">
          <a href="../privacidad.html">Privacidad</a> · <a href="../terminos.html">Términos</a>
        </p>
      )}
    </main>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  type,
  ...input
}: { id: string; label: string; error?: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const shared = {
    id,
    name: id,
    "aria-invalid": !!error,
    "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
    ...input,
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {type === "password" ? <PasswordInput {...shared} /> : <input type={type} {...shared} />}
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
  if (nubeDisponible()) return <EntrarNube />;
  return <EntrarLocal />;
}

function EntrarLocal() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector(selectCurrentUser);
  const hasAccount = useAppSelector(selectHasAccount);
  const storeName = useAppSelector((s) => s.settings.storeName);
  const hasDemo = useAppSelector((s) => s.auth.users.some((u) => u.login === DEMO_LOGIN));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        <Field id="clave" label="Contraseña" type="password" autoComplete="current-password" required />
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
  if (nubeDisponible()) return <RegistroNube />;
  return <RegistroLocal />;
}

function RegistroLocal() {
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

// Con Supabase: la tienda y sus usuarios viven en la nube

/** Mientras la app abre la tienda después de entrar. */
function useAbriendo() {
  const user = useAppSelector(selectCurrentUser);
  const iniciando = useAppSelector((s) => s.nube.estado === "iniciando");
  const errorNube = useAppSelector((s) => s.nube.error);
  return { user, iniciando, errorNube };
}

/** Segundos que faltan, bajando de uno en uno (0 cuando no hay bloqueo). */
function useCuentaRegresiva(segundos: number | undefined): number {
  const [falta, setFalta] = useState(0);
  useEffect(() => setFalta(segundos ?? 0), [segundos]);
  useEffect(() => {
    if (falta <= 0) return;
    const t = setTimeout(() => setFalta((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [falta]);
  return falta;
}

const reloj = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function EntrarNube() {
  const navigate = useNavigate();
  const { user, iniciando, errorNube } = useAbriendo();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bloqueo, setBloqueo] = useState<number | undefined>();
  const espera = useCuentaRegresiva(bloqueo);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError(null);
    const result = await entrarNube(String(data.get("usuario")), String(data.get("clave")));
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      setBloqueo(result.bloqueo);
      if (result.bloqueo) {
        const campo = form.elements.namedItem("clave") as HTMLInputElement | null;
        if (campo) campo.value = "";
      }
    }
    // Si entra bien, la app abre la tienda sola (src/nube/conexion.ts) y esta pantalla redirige.
  };
  const abriendo = busy || iniciando;

  return (
    <AuthShell
      title="Entrar"
      subtitle="Con tu correo o tu celular."
      footer={
        <>
          ¿Aún no tienes tienda? <Link to="/registro">Créala gratis</Link>
        </>
      }
    >
      <form className="form" onSubmit={submit} noValidate>
        <Field id="usuario" label="Correo o celular" autoComplete="username" inputMode="email" autoFocus required />
        <Field id="clave" label="Contraseña" type="password" autoComplete="current-password" required />
        {(error || errorNube) && (
          <p className="form-error" role="alert">
            {error ?? errorNube}
          </p>
        )}
        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={abriendo || espera > 0}>
          {espera > 0 ? `Intenta de nuevo en ${reloj(espera)}` : iniciando ? "Abriendo tu tienda…" : busy ? "Entrando…" : "Entrar"}
        </button>
        <p className="muted small center">
          <button type="button" className="link" onClick={() => navigate("/recuperar")}>
            ¿Olvidaste la contraseña?
          </button>
          <br />
          Si eres vendedor, pídele al dueño que te ponga una nueva.
        </p>
      </form>
      <DemoButton onError={setError} />
    </AuthShell>
  );
}

function RegistroNube() {
  const { user, iniciando } = useAbriendo();
  const hasLocalData = useAppSelector((s) => s.nube.modo === "local" && !s.auth.users.some((u) => u.login === DEMO_LOGIN) && (s.products.ids.length > 0 || s.sales.list.length > 0));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [start, setStart] = useState<RegisterInput["start"]>(hasLocalData ? "conservar" : "ejemplo");
  const [confirmar, setConfirmar] = useState<string | null>(null);

  if (user) return <Navigate to="/" replace />;
  if (confirmar) return <ConfirmarCorreo email={confirmar} />;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const tienda = String(data.get("tienda")).trim();
    const nombre = String(data.get("nombre")).trim();
    if (tienda.length < 3) return setErrors({ storeName: "Escribe el nombre de la tienda." });
    if (nombre.length < 3) return setErrors({ name: "Escribe tu nombre." });
    if (data.get("clave") !== data.get("clave2")) return setErrors({ clave2: "Las contraseñas no coinciden." });
    setBusy(true);
    setErrors({});
    const result = await crearCuentaDueno(String(data.get("usuario")), String(data.get("clave")), { tienda, nombre, inicio: start }, data.get("acepta") === "si");
    setBusy(false);
    if (!result.ok) return setErrors({ [result.field ?? "general"]: result.message });
    if (result.confirmar) setConfirmar(String(data.get("usuario")).trim().toLowerCase());
  };

  const options: { id: RegisterInput["start"]; title: string; text: string }[] = [
    ...(hasLocalData ? [{ id: "conservar" as const, title: "Subir lo que tengo aquí", text: "Los productos y ventas de este dispositivo pasan a la nube." }] : []),
    { id: "ejemplo", title: "Tienda de ejemplo", text: "32 productos, clientes y una semana de ventas para explorar." },
    { id: "vacio", title: "Empezar en blanco", text: "Sin productos ni ventas. Para usarla de verdad." },
  ];

  return (
    <AuthShell
      title="Crea tu tienda"
      subtitle="Serás el dueño. Después agregas a tus vendedores, cada uno con su usuario, y todos ven la misma tienda."
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
        <Field id="usuario" label="Tu correo" type="email" autoComplete="email" inputMode="email" error={errors.login} hint="Con este correo entras y recuperas la contraseña." />
        <div className="field-row">
          <Field id="clave" label="Contraseña" type="password" autoComplete="new-password" error={errors.password} hint={`Mínimo ${CLAVE_MINIMA_NUBE} caracteres.`} />
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

        <label className="acepto">
          <input type="checkbox" name="acepta" value="si" aria-invalid={!!errors.acepta} aria-describedby={errors.acepta ? "acepta-error" : undefined} />
          <span>
            Acepto los{" "}
            <a href="../terminos.html" target="_blank" rel="noopener">
              Términos
            </a>{" "}
            y autorizo el tratamiento de mis datos según la{" "}
            <a href="../privacidad.html" target="_blank" rel="noopener">
              Política de privacidad
            </a>
            .
          </span>
        </label>
        {errors.acepta && (
          <p className="form-error" id="acepta-error" role="alert">
            {errors.acepta}
          </p>
        )}
        {errors.general && (
          <p className="form-error" role="alert">
            {errors.general}
          </p>
        )}
        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={busy || iniciando}>
          {iniciando ? "Preparando tu tienda…" : busy ? "Creando…" : "Crear mi tienda"}
        </button>
      </form>
    </AuthShell>
  );
}

function ConfirmarCorreo({ email }: { email: string }) {
  const [espera, setEspera] = useState(60);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  return (
    <AuthShell title="Confirma tu correo" subtitle="Ya casi." footer={<Link to="/entrar">Ya lo confirmé, quiero entrar</Link>}>
      <div className="auth__mensaje">
        <span className="auth__icono" aria-hidden="true">
          <Icon name="check" size={26} />
        </span>
        <p>
          Te enviamos un código de 6 dígitos a <strong>{email}</strong>. Escríbelo aquí, o toca el botón del correo desde cualquier celular o computador. Tu tienda se crea sola con lo que elegiste.
        </p>
        <CodigoCorreo email={email} tipo="signup" boton="Confirmar" />
        <p className="muted small">Si no te llega en un par de minutos, revisa la carpeta de spam.</p>
        {aviso && <p className="muted small">{aviso}</p>}
        <button
          type="button"
          className="btn btn--block"
          disabled={espera > 0}
          onClick={async () => {
            const r = await reenviarConfirmacion(email);
            setAviso(r.ok ? "Listo, te lo enviamos otra vez." : r.message);
            setEspera(60);
          }}
        >
          {espera > 0 ? `Reenviar en ${espera} s` : "Reenviar el correo"}
        </button>
      </div>
    </AuthShell>
  );
}

export function Recuperar() {
  const [enviado, setEnviado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (enviado) {
    return (
      <AuthShell title="Revisa tu correo" subtitle="Te mandamos un enlace." footer={<Link to="/entrar">Volver a entrar</Link>}>
        <div className="auth__mensaje">
          <p>
            Si hay una tienda con <strong>{enviado}</strong>, te llegará un enlace para poner una contraseña nueva. Ábrelo en este mismo celular o computador. Puede tardar un par de minutos; mira también en spam.
          </p>
          <TengoCodigo email={enviado} />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="¿Olvidaste la contraseña?" subtitle="Escribe el correo con el que creaste la tienda." footer={<Link to="/entrar">Volver a entrar</Link>}>
      <form
        className="form"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const email = String(new FormData(e.currentTarget).get("correo"));
          setBusy(true);
          const r = await recuperarClave(email);
          setBusy(false);
          if (r.ok) setEnviado(email.trim().toLowerCase());
          else setError(r.message);
        }}
      >
        <Field id="correo" label="Correo" type="email" autoComplete="email" inputMode="email" error={error ?? undefined} autoFocus />
        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={busy}>
          {busy ? "Enviando…" : "Enviar enlace"}
        </button>
        <p className="muted small center">Los vendedores no reciben correo: el dueño les cambia la contraseña desde Ajustes.</p>
      </form>
    </AuthShell>
  );
}

// El código que llega por correo
function CodigoCorreo({ email, tipo, boton }: { email: string; tipo: "signup" | "recovery"; boton: string }) {
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="form codigo-form"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await verificarCodigo(email, codigo, tipo);
        if (!r.ok) {
          setError(r.message);
          setBusy(false);
        }
      }}
    >
      <Field
        id="codigo"
        label="Código"
        className="codigo"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={10}
        placeholder="000000"
        value={codigo}
        onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
        error={error}
        autoFocus
      />
      <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={busy || codigo.length < 6}>
        {busy ? "Revisando…" : boton}
      </button>
    </form>
  );
}

/** Por si el correo trae un código en vez de (o además de) el enlace. */
function TengoCodigo({ email }: { email: string }) {
  const [abierto, setAbierto] = useState(false);
  if (!abierto)
    return (
      <button type="button" className="link" onClick={() => setAbierto(true)}>
        ¿Te llegó un código? Escríbelo aquí
      </button>
    );
  return <CodigoCorreo email={email} tipo="recovery" boton="Seguir" />;
}

/** Se abre con el código o el enlace del correo de recuperación. */
export function NuevaClave() {
  const navigate = useNavigate();
  const user = useAppSelector(selectCurrentUser);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  return (
    <AuthShell title="Contraseña nueva" subtitle="Escríbela dos veces." footer={<Link to="/entrar">Cancelar</Link>}>
      <form
        className="form"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          if (data.get("nueva") !== data.get("nueva2")) return setErrors({ nueva2: "Las contraseñas no coinciden." });
          setBusy(true);
          const r = await cambiarMiClave(correoParaEntrar(user?.login ?? "") ?? "", null, String(data.get("nueva")));
          setBusy(false);
          if (r.ok) navigate("/", { replace: true });
          else setErrors({ [r.field === "next" ? "nueva" : "general"]: r.message });
        }}
      >
        <Field id="nueva" label="Contraseña nueva" type="password" autoComplete="new-password" error={errors.nueva} hint={`Mínimo ${CLAVE_MINIMA_NUBE} caracteres.`} autoFocus />
        <Field id="nueva2" label="Repítela" type="password" autoComplete="new-password" error={errors.nueva2} />
        {errors.general && (
          <p className="form-error" role="alert">
            {errors.general}
          </p>
        )}
        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={busy || !user}>
          {!user ? "Abriendo el enlace…" : busy ? "Guardando…" : "Guardar contraseña"}
        </button>
      </form>
    </AuthShell>
  );
}
