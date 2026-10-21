import { useRef, useState, type FormEvent } from "react";
import { PasswordInput } from "../components/PasswordInput";
import { useStore } from "react-redux";
import { useNavigate } from "react-router";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { parseBackup, serializeBackup } from "../app/persistence";
import { dataReplaced, emptyBusinessState, type RootState } from "../app/store";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { useToast } from "../components/toast-context";
import { PageHeader } from "../components/ui";
import { createSeedState } from "../data/seed";
import { loggedOut, userRemoved, type Role } from "../features/auth/authSlice";
import { selectCan, selectCurrentUser, selectUsers } from "../features/auth/selectors";
import { addUser, changePassword, MIN_PASSWORD } from "../features/auth/thunks";
import { settingsUpdated } from "../features/settings/settingsSlice";
import { downloadFile } from "../lib/csv";
import { dayKey } from "../lib/dates";
import { refrescarMiembros, sincronizarAhora } from "../nube/conexion";
import { CLAVE_MINIMA_NUBE, cambiarClaveDe, cambiarMiClave, correoParaEntrar, crearVendedor, quitarVendedor, salir } from "../nube/cuenta";

export function Ajustes() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const toast = useToast();
  const store = useStore<RootState>();
  const settings = useAppSelector((s) => s.settings);
  const user = useAppSelector(selectCurrentUser);
  const can = useAppSelector(selectCan);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<"ejemplo" | "vacio" | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const enNube = useAppSelector((s) => s.nube.modo === "nube");

  if (!user) return null;
  const isOwner = can("ajustes");

  return (
    <div className="page page--narrow">
      <PageHeader title={isOwner ? "Ajustes" : "Mi cuenta"} />

      <section className="card account">
        <div className="account__who">
          <span className="user-chip__avatar user-chip__avatar--lg" aria-hidden="true">
            {user.name
              .split(" ")
              .slice(0, 2)
              .map((w) => w[0]?.toUpperCase())
              .join("")}
          </span>
          <div>
            <p className="account__name">{user.name}</p>
            <p className="muted small">
              {user.role === "dueño" ? "Dueño" : "Vendedor"}, entra con {user.login}
            </p>
          </div>
        </div>
        <div className="row-actions">
          <button type="button" className="btn" onClick={() => setChangingPassword(true)}>
            Cambiar contraseña
          </button>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              // En la nube se cierra la sesión de Supabase y la app vuelve sola a la pantalla de entrar.
              if (enNube) return void (await salir());
              dispatch(loggedOut());
              navigate("/entrar", { replace: true });
            }}
          >
            <Icon name="salir" size={18} /> Cerrar sesión
          </button>
        </div>
      </section>

      {enNube && <EstadoNube />}

      {isOwner && (
        <>
          <section className="card form">
            <h2 className="section-title">Tienda</h2>
            <div className="field">
              <label htmlFor="tienda">Nombre de la tienda</label>
              <input id="tienda" value={settings.storeName} onChange={(e) => dispatch(settingsUpdated({ storeName: e.target.value }))} />
              <p className="muted small">Aparece en los recordatorios de fiado por WhatsApp.</p>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.enforceCreditLimit}
                onChange={(e) => dispatch(settingsUpdated({ enforceCreditLimit: e.target.checked }))}
              />
              Avisar antes de fiar por encima del cupo de un cliente
            </label>
          </section>

          <UsersSection />

          <section className="card">
            <h2 className="section-title">Copia de seguridad</h2>
            <p className="muted">
              {enNube
                ? "Tu tienda está guardada en la nube: si cambias de celular, solo entras con tu usuario. Igual puedes descargar una copia para tus archivos."
                : "Los datos se guardan en este navegador. Descarga una copia de vez en cuando para no perder nada si cambias de celular o borras el historial."}{" "}
              La copia no incluye las contraseñas.
            </p>
            <div className="row-actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  downloadFile(`surtido-copia-${dayKey(new Date())}.json`, serializeBackup(store.getState()), "application/json");
                  toast("Copia descargada");
                }}
              >
                Descargar copia
              </button>
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                Restaurar copia
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    dispatch(dataReplaced(parseBackup(await file.text())));
                    toast("Copia restaurada");
                  } catch (err) {
                    toast(err instanceof Error ? err.message : "No se pudo leer el archivo.", "error");
                  }
                }}
              />
            </div>
          </section>

          <section className="card">
            <h2 className="section-title">Empezar de nuevo</h2>
            <p className="muted small">Los usuarios y contraseñas se conservan.</p>
            <div className="row-actions">
              <button type="button" className="btn" onClick={() => setConfirm("ejemplo")}>
                Cargar tienda de ejemplo
              </button>
              <button type="button" className="btn btn--danger" onClick={() => setConfirm("vacio")}>
                Borrar datos y empezar en blanco
              </button>
            </div>
          </section>
        </>
      )}

      <p className="muted small center">Surtido 1.1. Proyecto de portafolio de Orlando Castillo.</p>

      <PasswordDialog open={changingPassword} onClose={() => setChangingPassword(false)} />

      <Modal
        title={confirm === "vacio" ? "¿Borrar todos los datos?" : "¿Cargar la tienda de ejemplo?"}
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setConfirm(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                const next = confirm === "vacio" ? { ...emptyBusinessState(), settings } : { ...createSeedState(), settings };
                dispatch(dataReplaced(next));
                toast(confirm === "vacio" ? "Datos borrados" : "Tienda de ejemplo cargada");
                setConfirm(null);
              }}
            >
              {confirm === "vacio" ? "Borrar todo" : "Cargar ejemplo"}
            </button>
          </>
        }
      >
        <p>Se reemplazan los productos, ventas, clientes y cierres de caja actuales. Descarga una copia antes si los quieres conservar.</p>
      </Modal>
    </div>
  );
}

function UsersSection() {
  const dispatch = useAppDispatch();
  const toast = useToast();
  const users = useAppSelector(selectUsers);
  const me = useAppSelector(selectCurrentUser);
  const enNube = useAppSelector((s) => s.nube.modo === "nube");
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<{ id: string; name: string } | null>(null);

  return (
    <section className="card">
      <div className="card__head">
        <h2 className="section-title">Usuarios</h2>
        <button type="button" className="btn btn--small" onClick={() => setAdding(true)}>
          <Icon name="mas" size={16} /> Agregar vendedor
        </button>
      </div>
      <p className="muted small">
        Los vendedores pueden vender, fiar, recibir abonos y abrir o cerrar caja. No ven reportes, no editan precios ni anulan
        ventas.
      </p>
      <ul className="users">
        {users.map((u) => (
          <li key={u.id}>
            <div>
              <p className="users__name">
                {u.name} {u.id === me?.id && <span className="muted small">(tú)</span>}
              </p>
              <p className="muted small">
                {u.role === "dueño" ? "Dueño" : "Vendedor"}, {u.login}
              </p>
            </div>
            {u.id !== me?.id && (
              <span className="users__actions">
                {enNube && (
                  <button type="button" className="link small" onClick={() => setResetting({ id: u.id, name: u.name })}>
                    Nueva contraseña
                  </button>
                )}
                <button
                  type="button"
                  className="link small"
                  onClick={async () => {
                    if (enNube) {
                      const r = await quitarVendedor(u.id);
                      if (!r.ok) return toast(r.message, "error");
                      await refrescarMiembros().catch(() => undefined);
                    } else dispatch(userRemoved(u.id));
                    toast(`${u.name} ya no tiene acceso`);
                  }}
                >
                  Quitar acceso
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <Modal title="Nuevo usuario" open={adding} onClose={() => setAdding(false)}>
        {adding && <NewUserForm onDone={() => setAdding(false)} />}
      </Modal>
      <Modal title={`Nueva contraseña para ${resetting?.name ?? ""}`} open={!!resetting} onClose={() => setResetting(null)}>
        {resetting && (
          <form
            className="form"
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              const clave = String(new FormData(e.currentTarget).get("clave"));
              const r = await cambiarClaveDe(resetting.id, clave);
              if (!r.ok) return toast(r.message, "error");
              toast(`Listo. Dale la contraseña nueva a ${resetting.name}.`);
              setResetting(null);
            }}
          >
            <div className="field">
              <label htmlFor="rc-clave">Contraseña nueva</label>
              <input id="rc-clave" name="clave" type="text" autoComplete="off" autoFocus />
              <p className="muted small">Mínimo {CLAVE_MINIMA_NUBE} caracteres. Con esto la persona vuelve a entrar.</p>
            </div>
            <button type="submit" className="btn btn--primary btn--block">
              Cambiar contraseña
            </button>
          </form>
        )}
      </Modal>
    </section>
  );
}

function NewUserForm({ onDone }: { onDone: () => void }) {
  const dispatch = useAppDispatch();
  const toast = useToast();
  const enNube = useAppSelector((s) => s.nube.modo === "nube");
  const [role, setRole] = useState<Role>("vendedor");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get("nombre"));
    setBusy(true);
    // En la nube el usuario lo crea una función del servidor (necesita la llave de servicio).
    const result = enNube
      ? await crearVendedor(name, String(data.get("usuario")), String(data.get("clave")), role)
      : await dispatch(addUser(name, String(data.get("usuario")), String(data.get("clave")), role));
    if (result.ok && enNube) await refrescarMiembros().catch(() => undefined);
    setBusy(false);
    if (result.ok) {
      toast(`${name} puede entrar con su usuario`);
      onDone();
    } else setError(result.message);
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="nu-nombre">Nombre</label>
        <input id="nu-nombre" name="nombre" autoFocus />
      </div>
      <div className="field">
        <label htmlFor="nu-usuario">Correo o celular</label>
        <input id="nu-usuario" name="usuario" inputMode="email" autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="nu-clave">Contraseña inicial</label>
        <input id="nu-clave" name="clave" type="text" autoComplete="off" />
        <p className="muted small">Mínimo {enNube ? CLAVE_MINIMA_NUBE : MIN_PASSWORD} caracteres. La persona la puede cambiar después.</p>
      </div>
      <div className="segmented" role="group" aria-label="Rol">
        <button type="button" aria-pressed={role === "vendedor"} onClick={() => setRole("vendedor")}>
          Vendedor
        </button>
        <button type="button" aria-pressed={role === "dueño"} onClick={() => setRole("dueño")}>
          Dueño
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <span className="spacer" />
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? "Creando…" : "Crear usuario"}
        </button>
      </div>
    </form>
  );
}

function PasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const toast = useToast();
  const enNube = useAppSelector((s) => s.nube.modo === "nube");
  const me = useAppSelector(selectCurrentUser);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      title="Cambiar contraseña"
      open={open}
      onClose={() => {
        setError(null);
        onClose();
      }}
    >
      {open && (
        <form
          className="form"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            if (data.get("nueva") !== data.get("nueva2")) return setError("Las contraseñas nuevas no coinciden.");
            const result = enNube
              ? await cambiarMiClave(correoParaEntrar(me?.login ?? "") ?? "", String(data.get("actual")), String(data.get("nueva")))
              : await dispatch(changePassword(String(data.get("actual")), String(data.get("nueva"))));
            if (result.ok) {
              toast("Contraseña actualizada");
              onClose();
            } else setError(result.message);
          }}
        >
          <div className="field">
            <label htmlFor="pw-actual">Contraseña actual</label>
            <PasswordInput id="pw-actual" name="actual" autoComplete="current-password" autoFocus />
          </div>
          <div className="field">
            <label htmlFor="pw-nueva">Nueva contraseña</label>
            <PasswordInput id="pw-nueva" name="nueva" autoComplete="new-password" />
          </div>
          <div className="field">
            <label htmlFor="pw-nueva2">Repite la nueva</label>
            <PasswordInput id="pw-nueva2" name="nueva2" autoComplete="new-password" />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn--primary btn--block">
            Guardar contraseña
          </button>
        </form>
      )}
    </Modal>
  );
}

/** Si la tienda está al día con la nube, o cuántos cambios faltan por subir. */
function EstadoNube() {
  const nube = useAppSelector((s) => s.nube);
  const [busy, setBusy] = useState(false);
  const hace = nube.ultimaSincronizacion ? new Date(nube.ultimaSincronizacion).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" }) : null;
  const texto = !nube.enLinea
    ? `Sin internet. ${nube.pendientes ? `${nube.pendientes} ${nube.pendientes === 1 ? "cambio queda" : "cambios quedan"} en este equipo y suben solos al volver la conexión.` : "Puedes seguir vendiendo normal."}`
    : nube.pendientes
      ? `Subiendo ${nube.pendientes} ${nube.pendientes === 1 ? "cambio" : "cambios"}…`
      : `Todo guardado en la nube${hace ? ` (${hace})` : ""}. Los demás equipos de la tienda ven lo mismo.`;
  return (
    <section className="card nube-estado" data-estado={!nube.enLinea ? "sin-internet" : nube.pendientes ? "subiendo" : "al-dia"}>
      <div>
        <h2 className="section-title">Nube</h2>
        <p className="muted small" role="status">
          {texto}
        </p>
        {nube.error && <p className="form-error small">{nube.error}</p>}
      </div>
      <button
        type="button"
        className="btn btn--small"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await sincronizarAhora();
          setBusy(false);
        }}
      >
        {busy ? "Sincronizando…" : "Sincronizar ahora"}
      </button>
    </section>
  );
}
