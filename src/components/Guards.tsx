import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAppSelector } from "../app/hooks";
import { selectCan, selectCurrentUser, selectHasAccount, type Permission } from "../features/auth/selectors";
import { EmptyState } from "./ui";

/** Sin sesión no se entra a la app: primero se crea la tienda o se inicia sesión. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAppSelector(selectCurrentUser);
  const hasAccount = useAppSelector(selectHasAccount);
  const location = useLocation();
  if (!user) return <Navigate to={hasAccount ? "/entrar" : "/registro"} replace state={{ from: location.pathname }} />;
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
