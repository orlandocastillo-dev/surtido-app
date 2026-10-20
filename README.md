# Surtido: app de punto de venta para tiendas de barrio

Aplicación web para el tendero: registra ventas en segundos, descuenta el inventario, lleva el **fiado** de los clientes, cuadra la **caja** al final del día y muestra **reportes** de ventas y ganancia. Funciona en el celular y en el computador, y **sigue funcionando sin internet**.

Es la app real detrás de la landing del proyecto 03 (Surtido).

![Vender en escritorio](docs/captura-vender.png)

| Vender en el celular | Cobro | Fiado |
| --- | --- | --- |
| ![](docs/captura-movil-vender.png) | ![](docs/captura-movil-cobro.png) | ![](docs/captura-movil-fiado.png) |

## Funcionalidades

**Vender**
- "Los de siempre": botones grandes para los productos que más se venden.
- Búsqueda sin tildes, por nombre, categoría o código de barras.
- Lector de códigos: un lector USB escribe el código en el buscador y presiona Enter; en Android también se puede usar la **cámara** (API nativa `BarcodeDetector`).
- Productos por peso: se venden **por valor** ("deme $2.000 de tomate") o por gramos, redondeados a $50.
- Pago en efectivo con billetes sugeridos y cálculo del cambio, Nequi, Daviplata, tarjeta o fiado.
- Aviso cuando el inventario no alcanza y cuando un cliente supera su cupo de fiado.

**Inventario**
- Precio, costo, margen, existencias y mínimo por producto.
- Entradas de mercancía y salidas por pérdida o daño.
- Productos por pedir y **pedido sugerido** listo para enviar al proveedor por WhatsApp.
- Valor del inventario a costo y a precio de venta.

**Fiado**
- El cuaderno de cada cliente: cargos, abonos y anulaciones con fecha y productos.
- Cupo por cliente y barra de uso.
- **Recordatorio de cobro por WhatsApp** con el mensaje ya redactado.

**Caja**
- Apertura con base, efectivo esperado (base + ventas y abonos en efectivo) y cierre con conteo: muestra si sobra o falta.
- Ventas del turno con opción de **anular**, que devuelve los productos al inventario y descuenta la deuda si era fiada.
- Historial de cierres.

**Reportes**
- Vendido, ganancia y venta promedio de hoy o de los últimos 7 días, con comparación frente a la semana anterior.
- Gráfico de ventas por día, formas de pago y productos más vendidos.
- Exportación a **Excel (CSV)** para el contador.

**Cuentas y roles**
- Registro de la tienda con su dueño e inicio de sesión con correo o celular y contraseña.
- Contraseñas guardadas con **PBKDF2 + sal** (Web Crypto), nunca en texto plano. La copia de seguridad no las incluye.
- Roles: el **dueño** administra todo y crea **vendedores**; el vendedor vende, fía y maneja caja, pero no ve reportes, no edita precios ni anula ventas.
- Cada venta queda a nombre de quien la registró, con reporte de ventas por vendedor.

**Ajustes**
- Copia de seguridad descargable y restauración.
- Tienda de ejemplo con una semana de ventas para explorar la app, o empezar en blanco.

## Stack

| Área | Herramienta |
| --- | --- |
| Interfaz | React 19 + TypeScript estricto |
| Estado | **Redux Toolkit** (slices, `createEntityAdapter`, `createSelector`, thunks) + React Redux |
| Rutas | React Router 7 (`HashRouter`, funciona en cualquier hosting estático) |
| Build | Vite 8 |
| Sin conexión | PWA con service worker (vite-plugin-pwa) + estado persistido en `localStorage` |
| Pruebas | Vitest + Testing Library (38 pruebas) |
| Calidad | oxlint, `tsc`, GitHub Actions |

## Arquitectura del estado

```
src/
├── app/
│   ├── store.ts          # configureStore, tipos RootState / AppDispatch / AppThunk
│   ├── hooks.ts          # useAppDispatch / useAppSelector tipados
│   └── persistence.ts    # guardado en localStorage, copia de seguridad
├── features/
│   ├── auth/             # usuarios, sesión, roles y permisos (thunks async con Web Crypto)
│   ├── products/         # entityAdapter, stock, favoritos, selectores de inventario
│   ├── cart/             # venta en curso, forma de pago, cambio
│   ├── sales/            # acciones compartidas, checkout (thunk), anulación, reportes
│   ├── customers/        # clientes + libro de movimientos del fiado, saldos
│   ├── cash/             # turnos de caja y cuadre
│   └── settings/
├── pages/                # Acceso (entrar/registro), Vender, Inventario, Fiado, Cliente, Caja, Reportes, Ajustes
├── components/           # Layout, Modal (<dialog> nativo), Toast, Scanner, UI
├── lib/                  # dinero, fechas en hora de Colombia, WhatsApp, CSV
└── data/seed.ts          # tienda de ejemplo generada a través de los mismos reducers
```

Decisiones que vale la pena explicar en una entrevista:

- **Una venta es una sola acción** (`sales/recorded`) que escuchan cuatro slices con `extraReducers`: inventario descuenta, ventas guarda, fiado suma la deuda y el carrito se vacía. Ningún slice conoce a los otros y la operación es atómica.
- **La venta guarda una copia del precio y el costo** del momento. Si mañana sube la leche, los reportes de ayer no cambian.
- **El saldo del fiado no se guarda, se calcula** a partir del libro de movimientos con un selector memoizado. Así nunca se descuadra.
- **El checkout es un thunk que devuelve un resultado tipado** (`ok` o el motivo del error), en vez de lanzar excepciones. La interfaz decide qué mostrar.
- **Los datos de ejemplo se generan despachando acciones reales** con una semilla fija: si el modelo cambia, el ejemplo sigue siendo coherente.
- **Rutas protegidas**: sin sesión, la app redirige a entrar o a crear la tienda; las pantallas del dueño validan el permiso, no solo esconden el botón.
- Dinero en enteros de pesos. Lo vendido por peso se redondea a $50 porque en Colombia casi no circulan monedas menores.

## Cómo correrlo

Requiere Node.js 20 o superior. En Windows con PowerShell usa `npm.cmd` si `npm` da error de scripts deshabilitados.

```bash
npm install
npm run dev       # http://localhost:5173
npm test
npm run build     # genera dist/, lista para publicar
```

La primera vez pide **crear la tienda**: nombre, tu usuario (correo o celular) y una contraseña. Ahí eliges si empezar con la tienda de ejemplo o en blanco.

Para generar la versión portátil que usa la landing (un solo `index.html` que abre con doble clic):

```bash
npm run build:portable   # escribe en ../03-landing-html-css-js-surtido/app/
```

## Publicarla

`npm run build` genera la carpeta `dist/`, que se puede subir tal cual a Netlify (arrastrar y soltar), Vercel o GitHub Pages. Desde el celular, el navegador ofrece **"Agregar a la pantalla de inicio"** y queda como una app más.

## Próximos pasos

- Sincronización entre dispositivos con Supabase (varios vendedores, una sola caja).
- Facturación electrónica DIAN para el plan Minimercado.
- Recibo por WhatsApp al cliente.

---

Proyecto de portafolio de Orlando Castillo. La tienda, los clientes y las ventas de ejemplo son ficticios.
