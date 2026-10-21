-- Surtido: tiendas con dueño y vendedores, y los datos de cada tienda en Supabase.
-- Toda fila lleva el tienda_id. Las políticas RLS dejan ver los datos solo a los miembros de esa tienda
-- y reservan para el dueño lo mismo que la app: editar productos, anular ventas, cambiar la tienda.


-- ---------------------------------------------------------------------------
-- Tiendas y miembros
-- ---------------------------------------------------------------------------

create table public.tiendas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(nombre) between 2 and 80),
  -- Pedir confirmación antes de fiar por encima del cupo de un cliente.
  cobrar_cupo boolean not null default true,
  creada_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.miembros (
  tienda_id uuid not null references public.tiendas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  nombre text not null check (length(nombre) between 2 and 80),
  rol text not null check (rol in ('dueño', 'vendedor')),
  -- Con qué entra: su correo o su celular.
  usuario text not null,
  creado_en timestamptz not null default now(),
  primary key (tienda_id, user_id),
  -- Una persona pertenece a una sola tienda.
  unique (user_id)
);

-- La tienda de quien está conectado, y si es dueño. Security definer para que las políticas
-- puedan consultar miembros sin caer en recursión de RLS.
create or replace function public.mi_tienda()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tienda_id from public.miembros where user_id = auth.uid()
$$;

create or replace function public.soy_dueno()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.miembros where user_id = auth.uid() and rol = 'dueño')
$$;

-- ---------------------------------------------------------------------------
-- Datos de la tienda
-- ---------------------------------------------------------------------------

create table public.productos (
  tienda_id uuid not null default public.mi_tienda() references public.tiendas (id) on delete cascade,
  id text not null,
  nombre text not null check (length(nombre) between 1 and 120),
  codigo text,
  categoria text not null,
  precio numeric(12, 2) not null check (precio >= 0),
  costo numeric(12, 2) not null default 0 check (costo >= 0),
  -- Con decimales para lo que se vende por peso (kg).
  stock numeric(12, 3) not null default 0,
  minimo numeric(12, 3) not null default 0,
  unidad text not null check (unidad in ('und', 'kg')),
  favorito boolean not null default false,
  actualizado_en timestamptz not null default now(),
  primary key (tienda_id, id)
);

create table public.clientes (
  tienda_id uuid not null default public.mi_tienda() references public.tiendas (id) on delete cascade,
  id text not null,
  nombre text not null check (length(nombre) between 1 and 120),
  telefono text not null default '',
  cupo numeric(12, 2) not null default 0 check (cupo >= 0),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  primary key (tienda_id, id)
);

create table public.turnos (
  tienda_id uuid not null default public.mi_tienda() references public.tiendas (id) on delete cascade,
  id text not null,
  abierto_en timestamptz not null,
  base numeric(12, 2) not null default 0,
  cerrado_en timestamptz,
  contado numeric(12, 2),
  esperado numeric(12, 2),
  actualizado_en timestamptz not null default now(),
  primary key (tienda_id, id)
);

create table public.ventas (
  tienda_id uuid not null default public.mi_tienda() references public.tiendas (id) on delete cascade,
  id text not null,
  numero integer not null,
  creada_en timestamptz not null,
  -- Nombre, precio y costo de cada producto en el momento de la venta.
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  total numeric(12, 2) not null check (total >= 0),
  metodo text not null check (metodo in ('efectivo', 'nequi', 'daviplata', 'tarjeta', 'fiado')),
  efectivo_recibido numeric(12, 2),
  cliente_id text,
  turno_id text,
  vendedor_id uuid references auth.users (id) on delete set null,
  anulada boolean not null default false,
  actualizado_en timestamptz not null default now(),
  primary key (tienda_id, id)
);
create index ventas_por_fecha on public.ventas (tienda_id, creada_en desc);

-- Cuaderno de fiado: cargos suman a la deuda, abonos y anulaciones restan.
create table public.fiado (
  tienda_id uuid not null default public.mi_tienda() references public.tiendas (id) on delete cascade,
  id text not null,
  cliente_id text not null,
  tipo text not null check (tipo in ('cargo', 'abono', 'anulacion')),
  monto numeric(12, 2) not null check (monto > 0),
  creado_en timestamptz not null,
  venta_id text,
  metodo text check (metodo in ('efectivo', 'nequi', 'daviplata', 'tarjeta')),
  turno_id text,
  nota text,
  actualizado_en timestamptz not null default now(),
  primary key (tienda_id, id),
  foreign key (tienda_id, cliente_id) references public.clientes (tienda_id, id) on delete cascade
);

-- actualizado_en se mueve solo en cada cambio: así cada equipo pide "lo que cambió desde la última vez".
create or replace function public.tocar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger tocar before update on public.tiendas for each row execute function public.tocar();
create trigger tocar before update on public.productos for each row execute function public.tocar();
create trigger tocar before update on public.clientes for each row execute function public.tocar();
create trigger tocar before update on public.turnos for each row execute function public.tocar();
create trigger tocar before update on public.ventas for each row execute function public.tocar();

create index productos_cambios on public.productos (tienda_id, actualizado_en);
create index clientes_cambios on public.clientes (tienda_id, actualizado_en);
create index turnos_cambios on public.turnos (tienda_id, actualizado_en);
create index ventas_cambios on public.ventas (tienda_id, actualizado_en);
create index fiado_cambios on public.fiado (tienda_id, actualizado_en);

-- El vendedor puede marcar favoritos, pero precio, costo y nombre solo los cambia el dueño.
-- Las existencias nunca se sobrescriben: se suman o restan con ajustar_stock, así dos equipos
-- vendiendo al tiempo no se pisan.
create or replace function public.proteger_producto()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stock is distinct from old.stock and coalesce(current_setting('surtido.ajuste', true), '') <> 'si' then
    raise exception 'Las existencias se cambian con ajustar_stock' using errcode = '42501';
  end if;
  if not public.soy_dueno() and (
    new.nombre, new.codigo, new.categoria, new.precio, new.costo, new.minimo, new.unidad
  ) is distinct from (
    old.nombre, old.codigo, old.categoria, old.precio, old.costo, old.minimo, old.unidad
  ) then
    raise exception 'Solo el dueño puede editar productos' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger proteger before update on public.productos for each row execute function public.proteger_producto();

-- ---------------------------------------------------------------------------
-- Seguridad (RLS)
-- ---------------------------------------------------------------------------

alter table public.tiendas enable row level security;
alter table public.miembros enable row level security;
alter table public.productos enable row level security;
alter table public.clientes enable row level security;
alter table public.turnos enable row level security;
alter table public.ventas enable row level security;
alter table public.fiado enable row level security;

create policy "miembros ven su tienda" on public.tiendas for select to authenticated using (id = (select public.mi_tienda()));
create policy "el dueño la cambia" on public.tiendas for update to authenticated
  using (id = (select public.mi_tienda()) and (select public.soy_dueno())) with check (id = (select public.mi_tienda()));

-- Los miembros solo se crean, cambian o quitan con las funciones de abajo y la función de vendedores.
create policy "miembros ven a su equipo" on public.miembros for select to authenticated using (tienda_id = (select public.mi_tienda()));

create policy "ver" on public.productos for select to authenticated using (tienda_id = (select public.mi_tienda()));
create policy "crear: dueño" on public.productos for insert to authenticated with check (tienda_id = (select public.mi_tienda()) and (select public.soy_dueno()));
create policy "cambiar: miembros (el trigger limita al vendedor)" on public.productos for update to authenticated
  using (tienda_id = (select public.mi_tienda())) with check (tienda_id = (select public.mi_tienda()));
create policy "borrar: dueño" on public.productos for delete to authenticated using (tienda_id = (select public.mi_tienda()) and (select public.soy_dueno()));

create policy "miembros" on public.clientes for all to authenticated
  using (tienda_id = (select public.mi_tienda())) with check (tienda_id = (select public.mi_tienda()));
create policy "miembros" on public.turnos for all to authenticated
  using (tienda_id = (select public.mi_tienda())) with check (tienda_id = (select public.mi_tienda()));

create policy "ver" on public.ventas for select to authenticated using (tienda_id = (select public.mi_tienda()));
-- Cada venta queda a nombre de quien la registró.
create policy "vender" on public.ventas for insert to authenticated
  with check (tienda_id = (select public.mi_tienda()) and (vendedor_id = (select auth.uid()) or (select public.soy_dueno())));
-- Anular (o corregir) una venta es solo del dueño.
create policy "anular: dueño" on public.ventas for update to authenticated
  using (tienda_id = (select public.mi_tienda()) and (select public.soy_dueno())) with check (tienda_id = (select public.mi_tienda()));

create policy "ver" on public.fiado for select to authenticated using (tienda_id = (select public.mi_tienda()));
create policy "anotar" on public.fiado for insert to authenticated with check (tienda_id = (select public.mi_tienda()));
-- El cuaderno no se edita ni se borra: para corregir se anota una anulación.

revoke all on public.tiendas, public.miembros, public.productos, public.clientes, public.turnos, public.ventas, public.fiado from anon;

-- ---------------------------------------------------------------------------
-- Funciones que llama la app
-- ---------------------------------------------------------------------------

-- Crear la tienda: quien la crea queda como dueño.
create or replace function public.crear_tienda(nombre_tienda text, mi_nombre text, mi_usuario text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  nueva uuid;
begin
  if auth.uid() is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '42501';
  end if;
  if exists (select 1 from public.miembros where user_id = auth.uid()) then
    raise exception 'Ya tienes una tienda' using errcode = '23505';
  end if;
  insert into public.tiendas (nombre) values (trim(nombre_tienda)) returning id into nueva;
  insert into public.miembros (tienda_id, user_id, nombre, rol, usuario)
  values (nueva, auth.uid(), trim(mi_nombre), 'dueño', lower(trim(mi_usuario)));
  return nueva;
end;
$$;

-- Suma o resta existencias sin pisar lo que haya vendido otro equipo al mismo tiempo.
create or replace function public.ajustar_stock(producto text, delta numeric)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  nuevo numeric;
begin
  perform set_config('surtido.ajuste', 'si', true);
  update public.productos
     set stock = round(stock + delta, 3)
   where tienda_id = public.mi_tienda() and id = producto
  returning stock into nuevo;
  perform set_config('surtido.ajuste', '', true);
  return nuevo;
end;
$$;

-- Reemplaza todos los datos de la tienda en una transacción: tienda de ejemplo, empezar en blanco
-- o restaurar una copia de seguridad. Solo el dueño.
create or replace function public.reemplazar_tienda(datos jsonb)
returns void
language plpgsql
-- Definer porque el cuaderno de fiado y las ventas no se pueden borrar desde la app; aquí se borra
-- solo lo de la tienda de quien llama, y solo si es el dueño.
security definer
set search_path = ''
as $$
declare
  t uuid := public.mi_tienda();
begin
  if t is null or not public.soy_dueno() then
    raise exception 'Solo el dueño puede reemplazar los datos de la tienda' using errcode = '42501';
  end if;

  -- Para borrar productos y ventas hace falta saltarse la protección de existencias y de anulación.
  perform set_config('surtido.ajuste', 'si', true);

  delete from public.fiado where tienda_id = t;
  delete from public.ventas where tienda_id = t;
  delete from public.turnos where tienda_id = t;
  delete from public.clientes where tienda_id = t;
  delete from public.productos where tienda_id = t;

  insert into public.productos (tienda_id, id, nombre, codigo, categoria, precio, costo, stock, minimo, unidad, favorito)
  select t, p->>'id', p->>'name', nullif(p->>'barcode', ''), p->>'category', (p->>'price')::numeric, coalesce((p->>'cost')::numeric, 0),
         coalesce((p->>'stock')::numeric, 0), coalesce((p->>'minStock')::numeric, 0), p->>'unit', coalesce((p->>'favorite')::boolean, false)
  from jsonb_array_elements(coalesce(datos->'products', '[]')) p;

  insert into public.clientes (tienda_id, id, nombre, telefono, cupo, creado_en)
  select t, c->>'id', c->>'name', coalesce(c->>'phone', ''), coalesce((c->>'creditLimit')::numeric, 0), coalesce((c->>'createdAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(datos->'customers', '[]')) c;

  insert into public.turnos (tienda_id, id, abierto_en, base, cerrado_en, contado, esperado)
  select t, s->>'id', (s->>'openedAt')::timestamptz, coalesce((s->>'openingCash')::numeric, 0), (s->>'closedAt')::timestamptz,
         (s->>'countedCash')::numeric, (s->>'expectedCash')::numeric
  from jsonb_array_elements(coalesce(datos->'shifts', '[]')) s;

  insert into public.ventas (tienda_id, id, numero, creada_en, items, total, metodo, efectivo_recibido, cliente_id, turno_id, vendedor_id, anulada)
  select t, v->>'id', (v->>'number')::int, (v->>'createdAt')::timestamptz, v->'items', (v->>'total')::numeric, v->>'method',
         (v->>'cashReceived')::numeric, v->>'customerId', v->>'shiftId',
         -- Las ventas de ejemplo o de una copia pueden traer vendedores que no existen aquí.
         (select m.user_id from public.miembros m where m.tienda_id = t and m.user_id::text = v->>'sellerId'),
         coalesce((v->>'voided')::boolean, false)
  from jsonb_array_elements(coalesce(datos->'sales', '[]')) v;

  insert into public.fiado (tienda_id, id, cliente_id, tipo, monto, creado_en, venta_id, metodo, turno_id, nota)
  select t, f->>'id', f->>'customerId', f->>'kind', (f->>'amount')::numeric, (f->>'createdAt')::timestamptz,
         f->>'saleId', f->>'method', f->>'shiftId', f->>'note'
  from jsonb_array_elements(coalesce(datos->'ledger', '[]')) f
  where exists (select 1 from public.clientes c where c.tienda_id = t and c.id = f->>'customerId');

  if datos ? 'settings' then
    update public.tiendas
       set nombre = coalesce(nullif(trim(datos->'settings'->>'storeName'), ''), nombre),
           cobrar_cupo = coalesce((datos->'settings'->>'enforceCreditLimit')::boolean, cobrar_cupo)
     where id = t;
  end if;

  perform set_config('surtido.ajuste', '', true);
end;
$$;

-- Quitar a un vendedor de la tienda (su usuario deja de tener acceso). Solo el dueño, y nunca al último dueño.
create or replace function public.quitar_miembro(miembro uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t uuid := public.mi_tienda();
begin
  if not public.soy_dueno() then
    raise exception 'Solo el dueño puede quitar usuarios' using errcode = '42501';
  end if;
  if (select rol from public.miembros where tienda_id = t and user_id = miembro) = 'dueño'
     and (select count(*) from public.miembros where tienda_id = t and rol = 'dueño') = 1 then
    raise exception 'La tienda no se puede quedar sin dueño' using errcode = '42501';
  end if;
  delete from public.miembros where tienda_id = t and user_id = miembro;
end;
$$;

revoke all on function public.mi_tienda(), public.soy_dueno(), public.crear_tienda(text, text, text), public.ajustar_stock(text, numeric),
  public.reemplazar_tienda(jsonb), public.quitar_miembro(uuid) from public, anon;
grant execute on function public.mi_tienda(), public.soy_dueno(), public.crear_tienda(text, text, text), public.ajustar_stock(text, numeric),
  public.reemplazar_tienda(jsonb), public.quitar_miembro(uuid) to authenticated;
