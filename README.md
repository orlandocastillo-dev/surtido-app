# Surti2

Punto de venta para tiendas de barrio: registrar ventas, llevar el inventario, el fiado de los clientes y cuadrar la caja desde el celular. Sigue funcionando cuando se va el internet.

En vivo: https://surtido-app-tan.vercel.app. En la raíz está la página de presentación y en `/app/` la app. "Probar con la tienda de ejemplo" entra sin registrarse.

![Vender en escritorio](docs/captura-vender.png)

| Vender en el celular | Cobro | Fiado |
| --- | --- | --- |
| ![](docs/captura-movil-vender.png) | ![](docs/captura-movil-cobro.png) | ![](docs/captura-movil-fiado.png) |

## Lo que hace

- Vender: botones para lo que más se vende, búsqueda por nombre o código de barras (lector USB o la cámara en Android) y productos por peso o por valor ("deme $2.000 de tomate").
- Cobrar en efectivo con el cambio calculado, Nequi, Daviplata, tarjeta o fiado.
- Inventario con costo, margen y mínimo, y un pedido sugerido para mandarle al proveedor por WhatsApp.
- El cuaderno del fiado de cada cliente, con cupo y recordatorio de cobro por WhatsApp.
- Caja por turnos: base, lo que debería haber y si sobra o falta al cerrar.
- Reportes de ventas y ganancia, y exportar a Excel (CSV) para el contador.

## La tienda en la nube

El dueño crea la tienda con su correo y agrega a sus vendedores desde Ajustes. Cada vendedor entra con su celular. Todos ven la misma tienda.

- Si se va el internet se sigue vendiendo: los cambios quedan en cola y suben solos cuando vuelve la señal.
- Si dos celulares venden lo mismo al tiempo, la base descuenta las dos ventas (las existencias se suman o restan, no se sobrescriben).
- Lo que puede hacer cada rol lo controla la base de datos (RLS y un trigger), no solo la pantalla. El vendedor no puede cambiar precios ni anular ventas.
- A los vendedores los crea una función del servidor (`supabase/functions/vendedores`), porque necesita la llave de servicio y esa nunca va al navegador.

Sin Supabase configurado, todo se guarda en el navegador como antes.

Para conectarla:

1. Crea un proyecto en [supabase.com](https://supabase.com) y corre los archivos de `supabase/migrations/` en el SQL Editor.
2. Despliega la función: `supabase functions deploy vendedores`.
3. En Authentication → URL Configuration pon la dirección de la app como Site URL y en Redirect URLs.
4. Copia `.env.example` como `.env.local` (o crea las variables en Vercel) con la URL y la llave anon.

## Con qué está hecha

React, TypeScript y Redux Toolkit. Una venta es una sola acción que escuchan el inventario, el fiado, las ventas y el carrito, así nunca queda a medias. La sincronización con Supabase es un middleware que compara el estado antes y después de cada acción y lo convierte en cambios para la base (`src/nube/`). Se instala como app (PWA) y tiene pruebas con Vitest.

## Correrla

```bash
npm install
npm run dev
npm test
npm run build
```

En Windows con PowerShell usa `npm.cmd` si `npm` da error. `npm run build:portable` genera un solo `index.html` que abre con doble clic.

La tienda, los clientes y las ventas de ejemplo son inventados.
