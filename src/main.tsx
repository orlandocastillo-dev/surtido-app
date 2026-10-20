import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "./styles/app.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { createHashRouter, Navigate, RouterProvider } from "react-router";
import { loadState, persist } from "./app/persistence";
import { makeStore } from "./app/store";
import { RequireAuth, RequirePermission } from "./components/Guards";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import { Entrar, Registro } from "./pages/Acceso";
import { Ajustes } from "./pages/Ajustes";
import { Caja } from "./pages/Caja";
import { Cliente } from "./pages/Cliente";
import { Fiado } from "./pages/Fiado";
import { Inventario } from "./pages/Inventario";
import { Reportes } from "./pages/Reportes";
import { Vender } from "./pages/Vender";

// Primera vez: el estado arranca vacío y la app pide crear la tienda (con opción de datos de ejemplo).
const store = makeStore(loadState());
persist(store);

// HashRouter: funciona en cualquier hosting estático (GitHub Pages, Netlify) sin configurar redirecciones.
const router = createHashRouter([
  { path: "/entrar", element: <Entrar /> },
  { path: "/registro", element: <Registro /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Vender /> },
      { path: "inventario", element: <Inventario /> },
      { path: "fiado", element: <Fiado /> },
      { path: "fiado/:id", element: <Cliente /> },
      { path: "caja", element: <Caja /> },
      {
        path: "reportes",
        element: (
          <RequirePermission permission="reportes">
            <Reportes />
          </RequirePermission>
        ),
      },
      { path: "ajustes", element: <Ajustes /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  </StrictMode>,
);
