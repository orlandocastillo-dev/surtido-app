import { NavLink, Outlet } from "react-router";
import { useAppSelector } from "../app/hooks";
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
          <svg className="brand__mark" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M5 12h22l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" />
            <path d="M11 12V9a5 5 0 0 1 10 0v3" fill="none" />
          </svg>
          <div>
            <p className="brand__name">surtido</p>
            <p className="brand__store">{storeName}</p>
          </div>
        </div>
        <div className="topbar__right">
          <NavLink to="/caja" className={`shift-pill ${shift ? "is-open" : ""}`}>
            {shift ? "Caja abierta" : "Caja cerrada"}
          </NavLink>
          <NavLink to="/ajustes" className="user-chip" aria-label={`${user?.name ?? ""}, ${user?.role ?? ""}. Ajustes y cuenta`}>
            <span className="user-chip__avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="user-chip__name">{user?.name.split(" ")[0]}</span>
          </NavLink>
        </div>
      </header>

      <nav className="tabbar" aria-label="Principal" style={{ gridTemplateColumns: `repeat(${nav.length}, 1fr)` }}>
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
