import { NavLink, Outlet, useNavigate } from "react-router";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { loggedOut } from "../features/auth/authSlice";
import { salir } from "../nube/cuenta";
import { selectCan, selectCurrentUser } from "../features/auth/selectors";
import { selectCartCount } from "../features/cart/selectors";
import { selectCurrentShift } from "../features/cash/selectors";
import { selectLowStock } from "../features/products/selectors";
import { Icon, type IconName } from "./Icon";

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: "Vender", icon: "vender" },
  { to: "/inventario", label: "Inventario", icon: "inventario" },
  { to: "/fiado", label: "Fiado", icon: "fiado" },
  { to: "/caja", label: "Caja", icon: "caja" },
  { to: "/reportes", label: "Reportes", icon: "reportes" },
];

export function Layout() {
  const storeName = useAppSelector((s) => s.settings.storeName);
  const cartCount = useAppSelector(selectCartCount);
  const lowStock = useAppSelector(selectLowStock).length;
  const shift = useAppSelector(selectCurrentShift);
  const user = useAppSelector(selectCurrentUser);
  const can = useAppSelector(selectCan);
  const nube = useAppSelector((s) => s.nube);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const cerrarSesion = async () => {
    // En la nube se cierra la sesión de Supabase y la app vuelve sola a la pantalla de entrar.
    if (nube.modo === "nube") return void (await salir());
    dispatch(loggedOut());
    navigate("/entrar", { replace: true });
  };
  const nav = NAV.filter((item) => item.to !== "/reportes" || can("reportes"));
  const initials = (user?.name ?? "")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  const badge = (to: string) => {
    if (to === "/" && cartCount > 0) return cartCount;
    if (to === "/inventario" && lowStock > 0) return lowStock;
    return null;
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div>
            <p className="brand__name" aria-label="Surti2">
              Surti<span className="brand__dos" aria-hidden="true">2</span>
            </p>
            <p className="brand__store">{storeName}</p>
          </div>
        </div>
        <div className="topbar__right">
          {nube.modo === "nube" && (!nube.enLinea || nube.pendientes > 0) && (
            <NavLink to="/ajustes" className={`sync-pill ${nube.enLinea ? "is-uploading" : "is-offline"}`} title="Estado de la nube">
              {nube.enLinea ? `Subiendo ${nube.pendientes}` : nube.pendientes ? `Sin internet, ${nube.pendientes} por subir` : "Sin internet"}
            </NavLink>
          )}
          <NavLink to="/caja" className={`shift-pill ${shift ? "is-open" : ""}`}>
            {shift ? "Caja abierta" : "Caja cerrada"}
          </NavLink>
          <NavLink to="/ajustes" className="user-chip" aria-label={`${user?.name ?? ""}, ${user?.role ?? ""}. Ajustes y cuenta`}>
            <span className="user-chip__avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="user-chip__name">{user?.name.split(" ")[0]}</span>
          </NavLink>
          <button type="button" className="logout-btn" onClick={() => void cerrarSesion()} aria-label="Cerrar sesión" title="Cerrar sesión">
            <Icon name="salir" size={18} />
            <span>Salir</span>
          </button>
        </div>
      </header>

      <nav className="tabbar" aria-label="Principal" style={{ gridTemplateColumns: `repeat(${nav.length}, 1fr)` }}>
        <div className="tabbar__marca" aria-hidden="true">
          <p className="brand__name">
            Surti<span className="brand__dos">2</span>
          </p>
          <p className="brand__store">{storeName}</p>
        </div>
        {nav.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === "/"} className="tabbar__item">
            <span className="tabbar__icon">
              <Icon name={item.icon} size={22} />
              {badge(item.to) !== null && <span className="tabbar__badge">{badge(item.to)}</span>}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main className="main" id="contenido">
        <Outlet />
      </main>
    </div>
  );
}
