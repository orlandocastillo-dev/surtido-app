import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAppSelector } from "../app/hooks";
import { selectCan, selectCurrentUser, selectHasAccount, type Permission } from "../features/auth/selectors";
import { nubeDisponible } from "../nube/cliente";
import { EmptyState } from "./ui";

/** Sin sesión no se entra a la app: primero se crea la tienda o se inicia sesión. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAppSelector(selectCurrentUser);
  const hasAccount = useAppSelector(selectHasAccount);
  const iniciando = useAppSelector((s) => s.nube.estado === "iniciando");
  const location = useLocation();
  // Mientras se revisa si hay una sesión guardada, una pantalla de carga en vez del login.
  if (iniciando && !user) return <Abriendo />;
  // Con la nube, quien llega sin sesión va a entrar (desde ahí puede crear su tienda o ver el ejemplo).
  if (!user) return <Navigate to={hasAccount || nubeDisponible() ? "/entrar" : "/registro"} replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/** Pantallas solo para el dueño (reportes, ajustes). */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const can = useAppSelector(selectCan);
  if (!can(permission)) {
    return (
      <div className="page">
        <EmptyState title="Esta sección es solo para el dueño de la tienda">
          <p className="muted small">Pídele acceso si lo necesitas.</p>
        </EmptyState>
      </div>
    );
  }
  return <>{children}</>;
}

function Abriendo() {
  return (
    <main className="auth" aria-busy="true">
      <div className="auth__brand auth__brand--carga">
        Surti<span className="brand__dos" aria-hidden="true">2</span>
      </div>
      <p className="auth__note">Abriendo tu tienda…</p>
    </main>
  );
}
